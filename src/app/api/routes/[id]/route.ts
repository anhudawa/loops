import { NextRequest, NextResponse, after } from "next/server";
import { publicRoute } from "@/lib/public-route";
import { getRoute, updateRouteElevation, updateRouteGeometry, storeRouteRoadReport, recordEvent, ANALYTICS_EVENTS } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { fetchElevations } from "@/lib/elevation";
import { rerouteWaypoints, engineTrace } from "@/lib/route-generator";
import { traceRoadReport } from "@/lib/road-trace";
import { ROAD_RULES_VERSION } from "@/lib/road-segments";

export const maxDuration = 30;

/**
 * Self-healing elevation: many seeded GPX files carried no <ele> tags,
 * so their stored elevation is flat zeros — the profile and climbs built
 * from them were fiction. On first view we fetch real terrain elevation
 * (Open-Meteo), repair the stored route permanently, and serve truth.
 */
async function repairElevationIfFlat(route: NonNullable<Awaited<ReturnType<typeof getRoute>>>) {
  try {
    const coords: [number, number, number?][] = JSON.parse(route.coordinates);
    if (coords.length < 5) return route;
    const eles = coords.map((c) => c[2] ?? 0);
    const max = Math.max(...eles);
    const min = Math.min(...eles);
    // Real terrain varies; all-zero or near-constant elevation = missing data.
    if (max - min > 3 && route.elevation_gain_m > 0) return route;

    // Downsample for the elevation API, then assign back by index blocks.
    const MAX_PTS = 400;
    const step = Math.max(1, Math.floor(coords.length / MAX_PTS));
    const samplePts = coords.filter((_, i) => i % step === 0);
    const sampled = await fetchElevations(samplePts.map((c) => [c[0], c[1]] as [number, number]));
    if (!sampled || sampled.length !== samplePts.length) return route;

    let gain = 0;
    let loss = 0;
    const repaired = coords.map((c, i) => {
      const si = Math.min(Math.floor(i / step), sampled.length - 1);
      return [c[0], c[1], Math.round(sampled[si] * 10) / 10] as [number, number, number];
    });
    for (let i = 1; i < sampled.length; i++) {
      const d = sampled[i] - sampled[i - 1];
      if (d > 0) gain += d;
      else loss += -d;
    }
    const coordStr = JSON.stringify(repaired);
    await updateRouteElevation(route.id, coordStr, Math.round(gain), Math.round(loss));
    return {
      ...route,
      coordinates: coordStr,
      elevation_gain_m: Math.round(gain),
      elevation_loss_m: Math.round(loss),
    };
  } catch (err) {
    console.error("[routes] elevation repair failed:", err);
    return route; // serve as-is rather than fail the page
  }
}

function hav(a: number[], b: number[]): number {
  const R = 6371, r = Math.PI / 180;
  const dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Self-healing track gaps: a GPS dropout leaves consecutive points
 * kilometres apart (the Roadman spin had 4.3 km between Oldtown and
 * Rowlestown). The GPX then draws a straight line across fields and the
 * quality check scores the route 0. On first view each gap of 1–20 km is
 * filled with a real road route from our engine and the repaired track is
 * stored permanently. Fail-soft: any problem → serve as-is.
 */
async function repairGapsIfAny(route: NonNullable<Awaited<ReturnType<typeof getRoute>>>) {
  try {
    const coords: number[][] = JSON.parse(route.coordinates);
    const gaps: number[] = [];
    for (let i = 0; i + 1 < coords.length; i++) {
      const d = hav(coords[i], coords[i + 1]);
      if (d > 1 && d < 20) gaps.push(i);
    }
    if (gaps.length === 0 || gaps.length > 5) return route;
    const out: number[][] = [];
    let last = 0;
    for (const i of gaps) {
      out.push(...coords.slice(last, i + 1));
      const leg = await rerouteWaypoints(
        [[coords[i][0], coords[i][1]], [coords[i + 1][0], coords[i + 1][1]]],
        route.discipline as "road" | "gravel" | "mtb"
      );
      if (!leg || leg.coordinates.length < 2) return route; // can't heal honestly → leave it
      const inner = leg.coordinates.slice(1, -1).map((c, k) => {
        const e = leg.elevations[k + 1];
        return typeof e === "number" && !Number.isNaN(e) ? [c[0], c[1], Math.round(e * 10) / 10] : [c[0], c[1]];
      });
      out.push(...inner);
      last = i + 1;
    }
    out.push(...coords.slice(last));
    let dist = 0;
    for (let i = 1; i < out.length; i++) dist += hav(out[i - 1], out[i]);
    const coordStr = JSON.stringify(out);
    await updateRouteGeometry(route.id, coordStr, Math.round(dist * 10) / 10);
    console.log(JSON.stringify({ evt: "route_gap_healed", route_id: route.id, gaps: gaps.length, km: Math.round(dist * 10) / 10 }));
    return { ...route, coordinates: coordStr, distance_km: Math.round(dist * 10) / 10 };
  } catch (err) {
    console.error("[routes] gap repair failed:", err);
    return route;
  }
}

// Road report for routes we did not generate (uploads, imports, library):
// traced through our engine after the response, once, then persisted. The
// Trust Rule — every served route names its compromises — applied to the
// whole library, not just fresh generation.
const tracing = new Set<string>();
const traceFailedAt = new Map<string, number>();
const TRACE_RETRY_MS = 60 * 60 * 1000;
const TRACE_BUDGET_MS = 20_000;

function scheduleRoadTrace(route: NonNullable<Awaited<ReturnType<typeof getRoute>>>) {
  const stored = route.road_report as { rules_version?: number } | null | undefined;
  if ((stored && stored.rules_version === ROAD_RULES_VERSION) || !process.env.BROUTER_URL) return;
  if (tracing.has(route.id)) return;
  const failed = traceFailedAt.get(route.id);
  if (failed && Date.now() - failed < TRACE_RETRY_MS) return;
  tracing.add(route.id);
  after(async () => {
    const started = Date.now();
    try {
      const coords: [number, number][] = JSON.parse(route.coordinates).map((c: number[]) => [c[0], c[1]]);
      const discipline = route.discipline === "gravel" || route.discipline === "mtb" ? route.discipline : "road";
      const report = await traceRoadReport(coords, discipline, engineTrace, TRACE_BUDGET_MS);
      if (report) {
        await storeRouteRoadReport(route.id, report);
        console.log(JSON.stringify({ evt: "route_road_traced", route_id: route.id, standard_met: report.standard_met, compromises: report.compromises.length, ms: Date.now() - started }));
      } else {
        traceFailedAt.set(route.id, Date.now());
        console.log(JSON.stringify({ evt: "route_road_trace_unknown", route_id: route.id, ms: Date.now() - started }));
      }
    } catch (err) {
      traceFailedAt.set(route.id, Date.now());
      console.error("[routes/:id] road trace failed:", err instanceof Error ? err.message : err);
    } finally {
      tracing.delete(route.id);
    }
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let route = await getRoute(id);

    if (!route) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }

    route = await repairElevationIfFlat(route);
    route = await repairGapsIfAny(route);
    scheduleRoadTrace(route);

    // Funnel: route detail viewed (fire-and-forget, no PII).
    void recordEvent(ANALYTICS_EVENTS.ROUTE_VIEWED, {
      properties: { route_id: route.id, distance_km: route.distance_km, discipline: route.discipline, country: route.country },
    });

    return NextResponse.json(publicRoute(route as unknown as Record<string, unknown>));
  } catch (err) {
    return handleApiError(err);
  }
}
