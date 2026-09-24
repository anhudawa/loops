import { NextRequest, NextResponse } from "next/server";
import { getLastBRouterFailure, rerouteWaypoints } from "@/lib/route-generator";
import { getUserBySession } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

/** Drag-to-edit reroutes are cheap (one BRouter call) but rate-limited
 * to keep the public routing endpoint healthy. */
const RATE_LIMIT_PER_MIN = 240; // a tap fires a leg and the closing leg; retries and re-snaps add more

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

  // Two pins on the same spot (a double tap; the start tapped again to close
  // the loop) are a 0 km leg, not a routing failure.
  const [a, b] = [waypoints[0], waypoints[waypoints.length - 1]];
  const sameSpotM = Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180));
  if (waypoints.length === 2 && sameSpotM < 25) {
    return NextResponse.json({
      data: {
        coordinates: [a, b], elevations: [], distance_km: 0, elevation_gain_m: 0, elevation_loss_m: 0, gpx_data: "", warnings: [],
        road_report: { known_pct: 100, road_class_pct: {}, surface: { paved_pct: 100, unpaved_pct: 0, unknown_pct: 0 }, main_road_pct: 0, fast_road_pct: 0, compromises: [], standard_met: true, summary: "Same spot — no riding on this leg." },
      },
    });
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
