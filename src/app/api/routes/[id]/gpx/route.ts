import { bookCheckIn } from "@/lib/ride-check-service";
import { NextRequest, NextResponse } from "next/server";
import { getRoute, getUserBySession, trackDownload, migrateDb, recordEvent, ANALYTICS_EVENTS } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { GPX_ACCESS } from "@/config/constants";
import { buildRouteGpx } from "@/lib/gpx";
import { describeCompromise, type Compromise } from "@/lib/road-segments";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Access per GPX_ACCESS (owner switch in config/constants.ts).
    const sessionToken = request.cookies.get("session")?.value;
    const user = sessionToken ? await getUserBySession(sessionToken).catch(() => undefined) : undefined;
    const viaRide = request.nextUrl.searchParams.get("via") === "ride";
    const open = GPX_ACCESS === "everyone" || (GPX_ACCESS === "ride-links" && viaRide);
    if (!user && !open) {
      return apiError("Sign in to download routes", "UNAUTHORIZED", 401);
    }

    const { id } = await params;
    const route = await getRoute(id);

    if (!route) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }

    // Track download
    try {
      await migrateDb();
      if (user) await trackDownload(uuidv4(), id, user.id);
    } catch {
      // Don't block the download if tracking fails
    }
    // Took the GPX → "did you ride it?" tomorrow: riders who are offered a
    // route rate it too, so a poor one stops being suggested.
    if (user) await bookCheckIn(id, user.id, route.created_by === user.id);

    // Funnel: GPX downloaded (fire-and-forget, no PII).
    void recordEvent(ANALYTICS_EVENTS.GPX_DOWNLOADED, {
      userId: user?.id ?? null,
      properties: { route_id: id, distance_km: route.distance_km, discipline: route.discipline, anonymous: !user, via: viaRide ? "ride" : "route" },
    });

    // Generate GPX from stored coordinates (may be [lat,lng] or [lat,lng,ele])
    const coordinates: number[][] = JSON.parse(route.coordinates);
    // A ride link's meeting point (?m=) names the start waypoint.
    const comps = ((route.road_report as { compromises?: Compromise[] } | null)?.compromises ?? [])
      .filter((c) => Array.isArray(c.at))
      .slice(0, 12)
      .map((c) => ({ at: c.at as [number, number], label: describeCompromise(c) }));
    const gpx = buildRouteGpx(route.name, route.description, coordinates, {
      warnings: comps,
      meetingPoint: request.nextUrl.searchParams.get("m"),
    });

    return new NextResponse(gpx, {
      headers: {
        "Content-Type": "application/gpx+xml",
        // ASCII fallback + UTF-8 name (was "Roadman%20Group%20Spin….gpx").
        "Content-Disposition": `attachment; filename="${(route.name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "loops-route")}.gpx"; filename*=UTF-8''${encodeURIComponent(route.name)}.gpx`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
