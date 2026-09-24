/**
 * Verified redesigns that replace a stored route's track on first view —
 * no admin tap needed. Same mechanism as the existing gap/elevation
 * self-healing: read, notice, fix, persist once. Server-only.
 */
import girona from "@/data/hub-bundles/girona-rebuild.json";
// Library tracks a rider would read as broken (Cap Formentor stopping at
// the lighthouse, Rocacorba stopping on the summit): the ride as ridden,
// there and back, routed on our engine.
import library from "@/data/hub-bundles/library-corrections.json";
import { replaceRouteTrack, getRoute, getRoutesByName } from "@/lib/db";

type Entry = Omit<Parameters<typeof replaceRouteTrack>[0], "country">;
const BY_KEY = new Map<string, Entry>([
  ...(girona as Entry[]).map((e): [string, Entry] => [`Spain|${e.name}`, e]),
  ...(library as (Entry & { country: string })[]).map((e): [string, Entry] => [`${e.country}|${e.name}`, e]),
]);

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

/**
 * Apply every pending redesign now (daily cron, admin "measure"): a route
 * hidden as broken is never opened, so it would never be corrected on view.
 * Returns the names corrected.
 */
export async function applyBundleCorrections(): Promise<string[]> {
  const done: string[] = [];
  for (const key of BY_KEY.keys()) {
    const [country, name] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
    for (const { id } of await getRoutesByName(name, country)) {
      const r = await getRoute(id);
      if (!r) continue;
      const after = await withBundleCorrection(r);
      if (after !== r) done.push(name);
    }
  }
  return done;
}
