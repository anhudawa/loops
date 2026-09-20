import { NextRequest, NextResponse } from "next/server";
import { scoreRoute, scoreRouteGpsOnly, type Discipline } from "@/lib/route-quality";
import { getRoute, storeRouteQuality } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { DISCIPLINES } from "@/config/constants";

/**
 * POST /api/routes/quality
 *
 * Score a route's quality using OSM data via the Overpass API.
 *
 * Body (JSON):
 *   { routeId: string }                        – score an existing stored route
 *   { coordinates: [lat, lng, ele?][], discipline: string }  – score raw coordinates
 *
 * Optional:
 *   { gpsOnly: true }  – skip Overpass, return GPS quality score only (fast)
 *   { sampleIntervalMeters: number }  – metres between OSM sample points (default 200)
 *
 * Response:
 *   { data: QualityScore }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      routeId?: string;
      coordinates?: [number, number, number?][];
      discipline?: string;
      gpsOnly?: boolean;
      sampleIntervalMeters?: number;
    };

    let coordinates: [number, number, number?][];
    let discipline: Discipline;

    // ── Resolve input ──────────────────────────────────────────────────────────
    if (body.routeId) {
      const route = await getRoute(body.routeId);
      if (!route) return apiError("Route not found", "NOT_FOUND", 404);

      const raw = JSON.parse(route.coordinates as string) as number[][];
      coordinates = raw.map((c) => (c[2] !== undefined ? [c[0], c[1], c[2]] : [c[0], c[1]]) as [number, number, number?]);
      discipline = (route.discipline ?? "road") as Discipline;
    } else if (body.coordinates) {
      if (!Array.isArray(body.coordinates) || body.coordinates.length < 2) {
        return apiError("coordinates must be an array of at least 2 points", "INVALID_INPUT", 400);
      }
      coordinates = body.coordinates;
      discipline = DISCIPLINES.includes(body.discipline as Discipline)
        ? (body.discipline as Discipline)
        : "road";
    } else {
      return apiError("Provide either routeId or coordinates", "INVALID_INPUT", 400);
    }

    // ── Validate coordinate shape ──────────────────────────────────────────────
    for (const pt of coordinates) {
      if (!Array.isArray(pt) || pt.length < 2) {
        return apiError("Each coordinate must be [lat, lng] or [lat, lng, ele]", "INVALID_INPUT", 400);
      }
      if (typeof pt[0] !== "number" || typeof pt[1] !== "number") {
        return apiError("Coordinate values must be numbers", "INVALID_INPUT", 400);
      }
      if (pt[0] < -90 || pt[0] > 90 || pt[1] < -180 || pt[1] > 180) {
        return apiError("Coordinate out of valid range", "INVALID_INPUT", 400);
      }
    }

    // ── GPS-only fast path ─────────────────────────────────────────────────────
    if (body.gpsOnly) {
      const result = scoreRouteGpsOnly(coordinates);
      return NextResponse.json({ data: result });
    }

    // ── Full Overpass scoring ──────────────────────────────────────────────────
    const result = await scoreRoute(coordinates, discipline, {
      sampleIntervalMeters: body.sampleIntervalMeters,
    });

    // Self-heal: persist a genuinely-verified score on the stored route so the
    // next view is instant and doesn't depend on Overpass. Never persist a
    // "couldn't verify" 0 (that's what the detail page now hides).
    if (body.routeId && result.total > 0 && (result.confidence ?? 0) > 0.3) {
      void storeRouteQuality(body.routeId, {
        total: result.total,
        breakdown: result.breakdown as unknown as Record<string, number>,
        surface_breakdown: result.surface_breakdown,
      });
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    return handleApiError(err);
  }
}
