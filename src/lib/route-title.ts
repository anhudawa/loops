/**
 * Route titles a rider would write (owner, 2026-09-24): start, the far
 * point, end, distance — "Clontarf – Ashbourne – Clontarf · 117 km".
 * Replaces "Planned road route — 116.9 km" and a pasted prompt as a name.
 * Server-only (the bundled town list is ~0.8 MB).
 */
import { placeNear } from "./map-labels";
import { KNOWN_PLACES } from "./places-known";

const KM_PER_DEG = 111.32;
function km(a: [number, number], b: [number, number]): number {
  const dy = (b[0] - a[0]) * KM_PER_DEG, dx = (b[1] - a[1]) * KM_PER_DEG * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * The name for a point: a known place (our own list — Clontarf, Port de
 * Pollença… which the GeoNames town list lacks or ranks below a suburb)
 * within 2.5 km, else the best-ranked GeoNames town within `maxKm`.
 */
export function nameAt(p: [number, number], maxKm: number): string | null {
  let best: string | null = null, bd = 2.5;
  for (const k of KNOWN_PLACES) {
    const d = km(p, k.point);
    if (d < bd) { bd = d; best = k.name; }
  }
  return best ?? placeNear(p, maxKm);
}

/** A loop ends within this of its start. */
const LOOP_KM = 1.5;

/** Names a generator/planner gave a route before this existed (safe to replace). */
export const GENERIC_NAME = /^(?:planned|generated|edited)(?: (?:road|gravel|mtb))? (?:route|loop)(?: — [\d.]+ ?km| — [\d.]+km)?$|^generated [\d.]+ km route$|^planned (?:road|gravel|mtb) route — [\d.]+ km$/i;

export function isGenericName(name: string | null | undefined): boolean {
  return !name || GENERIC_NAME.test(name.trim());
}

/**
 * "Clontarf – Ashbourne – Clontarf · 117 km" (loop), "Bray – Roundwood – Wicklow · 48 km"
 * (A to B), "Clontarf loop · 25 km" when it never leaves town. `place`
 * is injectable for tests.
 */
export function autoTitle(
  coords: [number, number][],
  distanceKm: number,
  place: (p: [number, number], maxKm: number) => string | null = nameAt,
): string {
  const dist = `${Math.round(distanceKm)} km`;
  if (coords.length < 2) return `Ride · ${dist}`;
  const start = coords[0], end = coords[coords.length - 1];
  const isLoop = km(start, end) <= LOOP_KM;
  // The far point: for a loop, the point farthest from the start; for A to B, halfway along.
  let mid = coords[Math.floor(coords.length / 2)];
  if (isLoop) {
    let best = -1;
    for (const p of coords) { const d = km(start, p); if (d > best) { best = d; mid = p; } }
  }
  const a = place(start, 4);
  const m = place(mid, 6);
  const b = isLoop ? a : place(end, 4);
  if (!a && !m && !b) return `Ride · ${dist}`;
  if (isLoop && (!m || m === a)) return `${a ?? m} loop · ${dist}`;
  const parts = [a, m, b].filter((x, i, arr): x is string => !!x && x !== arr[i - 1]);
  return `${parts.join(" – ")} · ${dist}`;
}

/**
 * A stored route still carrying a generic name ("Planned road route —
 * 116.9 km") is shown with its auto title; `renamed` says the caller may
 * store it.
 */
export function withAutoTitle<T extends { name: string; coordinates: string; distance_km: number | string }>(route: T): T & { renamed?: boolean } {
  if (!isGenericName(route.name)) return route;
  try {
    const coords = (JSON.parse(route.coordinates) as number[][]).map((c) => [Number(c[0]), Number(c[1])] as [number, number]);
    return { ...route, name: autoTitle(coords, Number(route.distance_km)), renamed: true };
  } catch {
    return route;
  }
}
