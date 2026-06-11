import { NextRequest, NextResponse } from "next/server";
import { getRoute, updateRouteElevation } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { fetchElevations } from "@/lib/elevation";

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

    return NextResponse.json(route);
  } catch (err) {
    return handleApiError(err);
  }
}
