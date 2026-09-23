/**
 * Verified redesigns that replace a stored route's track on first view —
 * no admin tap needed. Same mechanism as the existing gap/elevation
 * self-healing: read, notice, fix, persist once. Server-only.
 */
import girona from "@/data/hub-bundles/girona-rebuild.json";
import { replaceRouteTrack, getRoute } from "@/lib/db";

type Entry = Omit<Parameters<typeof replaceRouteTrack>[0], "country">;
const BY_KEY = new Map<string, Entry>((girona as Entry[]).map((e) => [`Spain|${e.name}`, e]));

type StoredRoute = NonNullable<Awaited<ReturnType<typeof getRoute>>>;

/** The corrected route when a verified redesign exists and is not yet applied; else the route as is. */
export async function withBundleCorrection(route: StoredRoute): Promise<StoredRoute> {
  const e = BY_KEY.get(`${route.country}|${route.name}`);
  if (!e) return route;
  if (Math.abs(Number(route.distance_km) - e.distance_km) < 0.3) return route; // already applied
  try {
    const n = await replaceRouteTrack({ ...e, country: route.country });
    if (n > 0) {
      console.log(JSON.stringify({ evt: "route_bundle_correction", route_id: route.id, name: route.name, km: e.distance_km }));
      return (await getRoute(route.id)) ?? route;
    }
  } catch (err) {
    console.error("[bundle-correction] failed:", err instanceof Error ? err.message : err);
  }
  return route;
}
