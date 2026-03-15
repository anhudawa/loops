import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession } from "@/lib/db";
import { getValidAccessToken, fetchActivity, fetchActivityStreams, mapStravaDiscipline } from "@/lib/strava-api";
import { calculateStats } from "@/lib/geo-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const activityId = Number(id);

  try {
    const [activity, streams] = await Promise.all([
      fetchActivity(accessToken, activityId),
      fetchActivityStreams(accessToken, activityId),
    ]);

    const coordinates: [number, number][] = streams.latlng?.data ?? [];
    const elevations: number[] = streams.altitude?.data ?? [];

    if (coordinates.length === 0) {
      return NextResponse.json(
        { error: "This activity has no GPS data.", code: "NO_GPS" },
        { status: 400 }
      );
    }

    const stats = calculateStats(coordinates, elevations);

    const data = {
      strava_activity_id: activity.id,
      name: activity.name,
      discipline: mapStravaDiscipline(activity.type),
      distance_km: Math.round(stats.distance_km * 10) / 10,
      elevation_gain_m: Math.round(stats.elevation_gain_m),
      elevation_loss_m: Math.round(stats.elevation_loss_m),
      coordinates,
      start_lat: coordinates[0][0],
      start_lng: coordinates[0][1],
    };

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
      { error: "Failed to fetch activity from Strava.", code: "STRAVA_ERROR" },
      { status: 502 }
    );
  }
}
