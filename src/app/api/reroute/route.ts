import { NextRequest, NextResponse } from "next/server";
import { rerouteWaypoints } from "@/lib/route-generator";
import { getUserBySession } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

/** Drag-to-edit reroutes are cheap (one BRouter call) but rate-limited
 * to keep the public routing endpoint healthy. */
const RATE_LIMIT_PER_MIN = 30;

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get("session")?.value;
  const user = sessionToken ? await getUserBySession(sessionToken).catch(() => null) : null;
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to edit routes", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const rl = checkRateLimit(`reroute:user:${user.id}`, RATE_LIMIT_PER_MIN, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many edits — give it a few seconds.", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  let waypoints: [number, number][];
  let discipline: "road" | "gravel" | "mtb";
  try {
    const body = await request.json();
    waypoints = body?.waypoints;
    discipline = ["road", "gravel", "mtb"].includes(body?.discipline) ? body.discipline : "road";
    if (
      !Array.isArray(waypoints) ||
      waypoints.length < 2 ||
      waypoints.length > 10 ||
      !waypoints.every(
        (w) =>
          Array.isArray(w) && w.length === 2 &&
          typeof w[0] === "number" && typeof w[1] === "number" &&
          w[0] >= -90 && w[0] <= 90 && w[1] >= -180 && w[1] <= 180
      )
    ) {
      throw new Error("bad waypoints");
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  try {
    const result = await rerouteWaypoints(waypoints, discipline);
    if (!result) {
      return NextResponse.json(
        { error: "Couldn't route between those points — try moving the pin to a road.", code: "REROUTE_FAILED" },
        { status: 422 }
      );
    }
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[reroute] error:", err);
    return NextResponse.json(
      { error: "Routing is busy — try again in a moment.", code: "INTERNAL_ERROR" },
      { status: 503 }
    );
  }
}
