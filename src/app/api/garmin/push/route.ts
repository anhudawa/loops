import { NextRequest, NextResponse } from "next/server";
import { pushCourse, isGarminEnabled, disciplineToGarminActivity } from "@/lib/garmin";
import { getUserBySession, getGarminTokens, deleteGarminTokens } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

/** Push a course to the rider's Garmin Connect account. */
export async function POST(request: NextRequest) {
  if (!isGarminEnabled()) {
    return NextResponse.json(
      { error: "Garmin sync is not configured yet.", code: "FEATURE_DISABLED" },
      { status: 503 }
    );
  }
  const sessionToken = request.cookies.get("session")?.value;
  const user = sessionToken ? await getUserBySession(sessionToken).catch(() => null) : null;
  if (!user) {
    return NextResponse.json({ error: "Sign in first", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const rl = checkRateLimit(`garmin-push:${user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many pushes — give it a minute.", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  const tokens = await getGarminTokens(user.id).catch(() => null);
  if (!tokens) {
    return NextResponse.json(
      { error: "Connect your Garmin account first.", code: "NOT_CONNECTED" },
      { status: 409 }
    );
  }

  let body: {
    name?: string;
    coordinates?: [number, number][];
    elevations?: number[];
    distance_km?: number;
    elevation_gain_m?: number;
    discipline?: string;
    course_points?: Array<{ lat: number; lng: number; name: string; type: string }>;
  };
  try {
    body = await request.json();
    if (
      !Array.isArray(body.coordinates) ||
      body.coordinates.length < 2 ||
      body.coordinates.length > 20000 ||
      typeof body.distance_km !== "number"
    ) {
      throw new Error("bad body");
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body", code: "INVALID_BODY" }, { status: 400 });
  }

  const result = await pushCourse(tokens.access_token, tokens.token_secret, {
    name: body.name || `LOOPS ${body.distance_km} km`,
    coordinates: body.coordinates,
    elevations: body.elevations,
    distanceMeters: body.distance_km * 1000,
    elevationGainMeters: body.elevation_gain_m ?? 0,
    activityType: disciplineToGarminActivity(body.discipline ?? "road"),
    coursePoints: body.course_points,
  });

  if (result.ok) {
    return NextResponse.json({ data: { pushed: true, courseId: result.courseId } });
  }
  if (result.status === 401 || result.status === 403) {
    // Token revoked on Garmin's side — clear it so the UI re-offers connect.
    await deleteGarminTokens(user.id).catch(() => {});
    return NextResponse.json(
      { error: "Garmin connection expired — reconnect and try again.", code: "NOT_CONNECTED" },
      { status: 409 }
    );
  }
  console.error("[garmin] push failed:", result.status, result.message);
  return NextResponse.json(
    { error: "Garmin didn't accept the course — try again shortly.", code: "PUSH_FAILED" },
    { status: 502 }
  );
}
