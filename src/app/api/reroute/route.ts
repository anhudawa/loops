import { NextRequest, NextResponse } from "next/server";
import { getLastBRouterFailure, rerouteWaypoints } from "@/lib/route-generator";
import { getUserBySession } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

/** Drag-to-edit reroutes are cheap (one BRouter call) but rate-limited
 * to keep the public routing endpoint healthy. */
const RATE_LIMIT_PER_MIN = 90; // a rider tapping out a loop fires two legs per tap

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
  let avoid: [number, number][][] = [];
  let arrive: [number, number][] = [];
  try {
    const body = await request.json();
    waypoints = body?.waypoints;
    // Roads the rest of the drawn route uses (bounded; malformed → ignored).
    if (Array.isArray(body?.avoid)) {
      avoid = (body.avoid as unknown[])
        .slice(0, 12)
        .filter((p): p is [number, number][] => Array.isArray(p))
        .map((p) => p.slice(0, 20000).filter((q): q is [number, number] =>
          Array.isArray(q) && typeof q[0] === "number" && typeof q[1] === "number" && Math.abs(q[0]) <= 90 && Math.abs(q[1]) <= 180))
        .filter((p) => p.length >= 2);
    }
    discipline = ["road", "gravel", "mtb"].includes(body?.discipline) ? body.discipline : "road";
    // The end of the leg arriving at the first waypoint (bounded).
    if (Array.isArray(body?.arrive)) {
      arrive = (body.arrive as unknown[]).slice(-200).filter((q): q is [number, number] =>
        Array.isArray(q) && typeof q[0] === "number" && typeof q[1] === "number" && Math.abs(q[0]) <= 90 && Math.abs(q[1]) <= 180);
    }
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
    const result = await rerouteWaypoints(waypoints, discipline, { avoid, arrive });
    // Engine busy or slow (not "no road"): a 503 the planner retries.
    if (!result && /timeout|watchdog|network|http:5/.test(getLastBRouterFailure())) {
      return NextResponse.json({ error: "Routing is busy — trying again.", code: "ENGINE_BUSY" }, { status: 503 });
    }
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
