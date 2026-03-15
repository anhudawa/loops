import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession, getRoutesByStravaActivityIds } from "@/lib/db";
import { getValidAccessToken, fetchActivities, isCyclingWithGps } from "@/lib/strava-api";

export async function GET(request: NextRequest) {
  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Strava not connected", code: "STRAVA_NOT_CONNECTED" }, { status: 400 });
  }

  const page = Number(request.nextUrl.searchParams.get("page")) || 1;

  try {
    const activities = await fetchActivities(accessToken, page, 30);
    const cyclingActivities = activities.filter(isCyclingWithGps);

    // Check which activities are already on LOOPS
    const activityIds = cyclingActivities.map((a) => a.id);
    const existing = await getRoutesByStravaActivityIds(activityIds);
    const existingIds = new Set(existing.map((r) => r.strava_activity_id));

    const data = cyclingActivities.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      date: a.start_date,
      distance_km: Math.round((a.distance / 1000) * 10) / 10,
      elevation_gain_m: Math.round(a.total_elevation_gain),
      polyline: a.map.summary_polyline,
      already_on_loops: existingIds.has(a.id),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "RATE_LIMITED") {
      return NextResponse.json(
        { error: "Too many imports. Try again in a few minutes.", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Strava is temporarily unavailable. Try again or upload a file instead.", code: "STRAVA_ERROR" },
      { status: 502 }
    );
  }
}
