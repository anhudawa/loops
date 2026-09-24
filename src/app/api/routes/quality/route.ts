import { NextRequest, NextResponse } from "next/server";
import { scoreRoute, scoreRouteGpsOnly, type Discipline } from "@/lib/route-quality";
import { getRoute, storeRouteQuality } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

/**
 * POST /api/routes/quality
 *
 * Score a stored route's quality using OSM data via the Overpass API.
 *
 * Body (JSON): { routeId: string, gpsOnly?: boolean }
 * Response:    { data: QualityScore }
 *
 * Stored routes only — raw coordinates are not accepted (this must not be a
 * free Overpass proxy). A verified score is stored and served from the
 * database for SCORE_TTL_DAYS; a failed attempt is not retried by this
 * instance for RETRY_AFTER_MS, so page views never hammer Overpass.
 */
const SCORE_TTL_DAYS = 30;
const RETRY_AFTER_MS = 60 * 60 * 1000;
const lastAttempt = new Map<string, number>();

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { routeId?: string; gpsOnly?: boolean };
    if (!body.routeId || typeof body.routeId !== "string") {
      return apiError("Provide routeId", "INVALID_INPUT", 400);
    }
    const route = await getRoute(body.routeId);
    if (!route) return apiError("Route not found", "NOT_FOUND", 404);

    const raw = JSON.parse(route.coordinates as string) as number[][];
    const coordinates = raw.map((c) => (c[2] !== undefined ? [c[0], c[1], c[2]] : [c[0], c[1]]) as [number, number, number?]);
    if (coordinates.length < 2) return apiError("Route has no track", "INVALID_INPUT", 400);
    const discipline = (route.discipline ?? "road") as Discipline;

    if (body.gpsOnly) return NextResponse.json({ data: scoreRouteGpsOnly(coordinates) });

    // A fresh stored score: serve it, no Overpass.
    const stored = route as unknown as { quality_score?: number | null; quality_breakdown?: unknown; quality_surface?: unknown; quality_scored_at?: string | Date | null };
    const scoredAt = stored.quality_scored_at ? new Date(stored.quality_scored_at).getTime() : 0;
    if (typeof stored.quality_score === "number" && stored.quality_score > 0 && Date.now() - scoredAt < SCORE_TTL_DAYS * 86_400_000) {
      return NextResponse.json({
        data: { total: stored.quality_score, breakdown: stored.quality_breakdown ?? {}, surface_breakdown: stored.quality_surface ?? undefined, confidence: 1, cached: true },
      });
    }
    const last = lastAttempt.get(route.id) ?? 0;
    if (Date.now() - last < RETRY_AFTER_MS) return apiError("Scoring recently attempted", "RETRY_LATER", 429);
    lastAttempt.set(route.id, Date.now());

    const result = await scoreRoute(coordinates, discipline);

    // Persist a genuinely-verified score so the next view is instant. Never
    // persist a "couldn't verify" 0 (the detail page hides those).
    if (result.total > 0 && (result.confidence ?? 0) > 0.3) {
      lastAttempt.delete(route.id);
      await storeRouteQuality(route.id, {
        total: result.total,
        breakdown: result.breakdown as unknown as Record<string, number>,
        surface_breakdown: result.surface_breakdown,
      }).catch(() => {});
    }
    return NextResponse.json({ data: result });
  } catch (err) {
    return handleApiError(err);
  }
}
