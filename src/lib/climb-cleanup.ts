/**
 * Elevation clean-up for what a rider reads on a route page (the profile
 * and the climb cards). A stored track can carry a DEM spike — Cap
 * Formentor's 139 → 232 → 188 m over 220 m read as a "43.5 % climb" — and
 * one real climb with a short dip in it reads as two. Pure functions, run
 * before detectClimbs (src/lib/climb-detection.ts).
 */

import { categoriseClimb, haversine, interpolateNaN, type Climb } from "./climb-detection";

/** Steeper than this over 100 m is not a road — a data spike. */
export const SPIKE_GRADE = 0.25;
const WINDOW_KM = 0.1;

/**
 * Drops elevation spikes: every 100 m stretch steeper than 25 % (no road a
 * rider is sent up is) has its inside points replaced by interpolation from
 * the points either side of the steep run. Coordinates stay as they are;
 * a track with no steep stretch comes back unchanged.
 */
export function despikeElevations(coords: [number, number, number][]): [number, number, number][] {
  const n = coords.length;
  if (n < 3) return coords;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + haversine([coords[i - 1][0], coords[i - 1][1]], [coords[i][0], coords[i][1]]));
  const ele: number[] = coords.map((c) => (typeof c[2] === "number" && Number.isFinite(c[2]) ? c[2] : NaN));
  // Union of the steep windows [i, k] (k: first point 100 m on from i).
  const runs: [number, number][] = [];
  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    if (k <= i) k = i + 1;
    while (k < n - 1 && cum[k] - cum[i] < WINDOW_KM) k++;
    const span = (cum[k] - cum[i]) * 1000;
    if (span <= 0 || Number.isNaN(ele[i]) || Number.isNaN(ele[k])) continue;
    if (Math.abs(ele[k] - ele[i]) / span <= SPIKE_GRADE) continue;
    const last = runs[runs.length - 1];
    if (last && i <= last[1]) last[1] = Math.max(last[1], k);
    else runs.push([i, k]);
  }
  if (runs.length === 0) return coords;
  for (const [s, e] of runs) for (let j = s + 1; j < e; j++) ele[j] = NaN;
  const clean = interpolateNaN(ele);
  return coords.map((c, i) => [c[0], c[1], clean[i]]);
}

/** A dip shorter than this between two climbs is part of one climb. */
export const MERGE_GAP_KM = 0.5;
/** …and no deeper than this. */
export const MERGE_DIP_M = 20;

/**
 * One climb, not two: consecutive climbs separated by a short, shallow dip
 * (≤ 0.5 km, ≤ 20 m lost) are merged and re-categorised.
 */
export function mergeClimbs(climbs: Climb[], coords: [number, number, number][]): Climb[] {
  const out: Climb[] = [];
  for (const c of [...climbs].sort((a, b) => a.startKm - b.startKm)) {
    const prev = out[out.length - 1];
    if (prev && c.startKm - prev.endKm <= MERGE_GAP_KM) {
      let low = Infinity;
      for (let i = prev.endIndex; i <= c.startIndex && i < coords.length; i++) low = Math.min(low, coords[i][2]);
      if (Number.isFinite(low) && prev.endElev - low <= MERGE_DIP_M) {
        const distanceKm = c.endKm - prev.startKm;
        const gain = c.endElev - prev.startElev;
        const avgGradient = distanceKm > 0 ? (gain / (distanceKm * 1000)) * 100 : 0;
        out[out.length - 1] = {
          ...prev,
          endIndex: c.endIndex,
          endKm: c.endKm,
          endElev: c.endElev,
          gain,
          distanceKm,
          avgGradient,
          maxElev: Math.max(prev.maxElev, c.maxElev),
          category: categoriseClimb(distanceKm, avgGradient) ?? prev.category,
        };
        continue;
      }
    }
    out.push(c);
  }
  return out;
}

/** The climbs a rider reads: spikes out, dips merged. */
export function cleanClimbs(
  coords: [number, number, number][],
  detect: (c: [number, number, number][]) => Climb[]
): { coords: [number, number, number][]; climbs: Climb[] } {
  const clean = despikeElevations(coords);
  return { coords: clean, climbs: mergeClimbs(detect(clean), clean) };
}
