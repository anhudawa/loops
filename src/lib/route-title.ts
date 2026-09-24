/**
 * Route titles a rider would write (owner, 2026-09-24): start, the far
 * point, end, distance — "Clontarf – Ashbourne – Clontarf · 117 km".
 * Replaces "Planned road route — 116.9 km" and a pasted prompt as a name.
 * Server-only (the bundled town list is ~0.8 MB).
 */
import { placeNear } from "./map-labels";
import { KNOWN_PLACES } from "./places-known";
import { tidyRouteName } from "./public-route";
import { checkTrack } from "./track-shape";

/** A track riding this much of itself twice is not titled "… Loop". */
const NOT_A_LOOP_RETRACE_PCT = 30;

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

/** Words that say nothing about where a ride goes ("Sunday Social", "Flat long route"). */
const NOTHING_WORDS = new Set([
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "weekend", "weekday", "morning",
  "evening", "afternoon", "night", "day", "social", "club", "group", "spin", "ride", "rides", "route", "routes",
  "loop", "loops", "lap", "laps", "cycle", "cycling", "bike", "road", "roads", "flat", "hilly", "rolling", "long",
  "short", "big", "little", "small", "easy", "hard", "quick", "fast", "slow", "steady", "gentle", "classic", "the",
  "a", "an", "my", "our", "and", "with", "of", "for", "in", "on", "to", "km", "k", "mile", "miles", "hour", "hours",
  "min", "mins", "coffee", "cafe", "café", "training", "recovery", "tempo", "endurance", "new", "test", "untitled",
  "planned", "generated", "edited", "favourite", "favorite", "nice", "good", "great", "lovely",
]);

/** A name that tells a rider nothing about where the ride goes. */
export function isWeakName(name: string | null | undefined): boolean {
  if (!name) return true;
  const words = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !/^\d+(?:km|k|mi)?$/.test(w));
  return words.length === 0 || words.every((w) => NOTHING_WORDS.has(w));
}

export function isGenericName(name: string | null | undefined): boolean {
  return !name || GENERIC_NAME.test(name.trim()) || isWeakName(name);
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
  // The display title everywhere (lists, page, <title>, share card): the
  // imported name cleaned, or a place-based title when it says nothing.
  let tidy = tidyRouteName(route.name);
  // "Mare de Déu del Mont Loop" that rides 41 % of itself twice is not
  // called a loop: the trailing word goes when the track is not one.
  if (/\sloop$/i.test(tidy)) {
    try {
      const c = (JSON.parse(route.coordinates) as number[][]).map((p) => [Number(p[0]), Number(p[1])] as [number, number]);
      const t = checkTrack(c);
      if (t && (t.shape === "out-and-back" || t.retracePct >= NOT_A_LOOP_RETRACE_PCT)) tidy = tidy.replace(/\s+loop$/i, "");
    } catch { /* keep the name */ }
  }
  if (!isGenericName(tidy)) return tidy === route.name ? route : { ...route, name: tidy };
  try {
    const coords = (JSON.parse(route.coordinates) as number[][]).map((c) => [Number(c[0]), Number(c[1])] as [number, number]);
    return { ...route, name: autoTitle(coords, Number(route.distance_km)), renamed: true };
  } catch {
    return route;
  }
}
