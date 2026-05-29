/**
 * Interval Segment Detection
 *
 * Finds stretches of a route that are suitable for sustained training
 * intervals at each intensity zone. A "suitable segment" satisfies:
 *   - long enough (≥ zone's min_length_km_per_minute × requested minutes)
 *   - gradient within the zone's acceptable range
 *   - gradient variance under the zone's cap (no rollers when threshold)
 *   - not interrupted by sharp direction changes (proxy for junctions)
 *
 * This is a pure function over coordinates + elevations — no DB, no
 * network. Callers pass in data they already have from an existing route
 * or a freshly routed BRouter result.
 */

import { smoothElevations, interpolateNaN, haversine } from "./climb-detection";
import { ZONES, type IntensityZone, type TerrainRequirements } from "./intensity";

export interface IntervalSegment {
  start_index: number;
  end_index: number;
  length_km: number;
  avg_gradient_pct: number;
  max_gradient_pct: number;
  gradient_variance: number;
  suitable_zones: IntensityZone[];
}

/** Bearing between two [lat, lng] points in degrees (0..360). */
function bearing(a: [number, number], b: [number, number]): number {
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Absolute bearing change between two headings, in degrees (0..180). */
function bearingDelta(b1: number, b2: number): number {
  let d = Math.abs(b1 - b2);
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Compute cumulative distance in km from the start of the path.
 */
function cumulativeDistancesKm(coords: [number, number][]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    result.push(result[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return result;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Max abs value in array. */
function maxAbs(values: number[]): number {
  let max = 0;
  for (const v of values) if (Math.abs(v) > max) max = Math.abs(v);
  return max;
}

/**
 * Compute per-point gradient (%) from smoothed elevation + cumulative
 * distance. Gradient at index i is computed against i-1.
 */
function pointGradients(
  smoothedElev: number[],
  cumDistKm: number[]
): number[] {
  const gradients: number[] = [0];
  for (let i = 1; i < smoothedElev.length; i++) {
    const dDistM = (cumDistKm[i] - cumDistKm[i - 1]) * 1000;
    const dElev = smoothedElev[i] - smoothedElev[i - 1];
    gradients.push(dDistM > 0.1 ? (dElev / dDistM) * 100 : 0);
  }
  return gradients;
}

/**
 * Mid-segment descent thresholds by zone (metres of drop over 500m of road).
 * Zones requiring sustained effort (z3, z4, z5) reject segments that contain
 * a coast-worthy descent in the middle. Other zones either tolerate rollers
 * (z1, z2) or are too short to care (z6, z7).
 */
export const DESCENT_THRESHOLDS: Partial<Record<IntensityZone, number>> = {
  z3: 30,
  z4: 30,
  z5: 50,
};

/** Scanning window distance for descent detection, in km. */
export const DESCENT_WINDOW_KM = 0.5;

/**
 * Returns true if the segment between indices [startIdx..endIdx] contains a
 * sustained descent exceeding `maxDropM` metres over any DESCENT_WINDOW_KM
 * stretch.
 *
 * We slide a distance-based window across the segment and track the maximum
 * elevation drop (start-of-window minus end-of-window, only when negative =
 * descent).
 */
export function hasSignificantDescent(
  startIdx: number,
  endIdx: number,
  smoothedElev: number[],
  cumDistKm: number[],
  maxDropM: number
): boolean {
  // Slide left pointer `a` across the segment; advance right pointer `b`
  // until the distance between a and b reaches DESCENT_WINDOW_KM, then
  // check the elevation drop.
  let b = startIdx;
  for (let a = startIdx; a <= endIdx; a++) {
    // Advance b so that dist(a, b) >= DESCENT_WINDOW_KM
    while (b < endIdx && cumDistKm[b] - cumDistKm[a] < DESCENT_WINDOW_KM) {
      b++;
    }
    if (cumDistKm[b] - cumDistKm[a] < DESCENT_WINDOW_KM) break; // remaining stretch too short

    const drop = smoothedElev[a] - smoothedElev[b]; // positive when descending
    if (drop > maxDropM) return true;
  }
  return false;
}

/**
 * Determine which zones a window (from `start` to `end` inclusive) can host,
 * given its terrain characteristics and a candidate duration range.
 *
 * `smoothedElev` and `cumDistKm` are the full-route arrays; `startIdx` /
 * `endIdx` delimit the window being evaluated so we can scan for mid-segment
 * descents.
 */
function zonesMatching(
  lengthKm: number,
  avgGradient: number,
  maxGradient: number,
  gradientVariance: number,
  maxBearingChange: number,
  startIdx: number,
  endIdx: number,
  smoothedElev: number[],
  cumDistKm: number[]
): IntensityZone[] {
  const out: IntensityZone[] = [];
  // A sharp bearing change (≥ 90°) implies a junction / town; unsuitable
  // for any sustained interval.
  if (maxBearingChange >= 90) return out;

  for (const zone of Object.keys(ZONES) as IntensityZone[]) {
    const req = ZONES[zone].terrain;
    if (fitsTerrain(avgGradient, maxGradient, gradientVariance, req)) {
      // Length check is done by the caller per-interval via
      // minSegmentLengthKm; here we check the window can host at least
      // 1 minute of interval at this zone, which is always true for
      // segments > ~0.35 km.
      if (lengthKm < req.min_length_km_per_minute) continue;

      // Descent-during-effort check: reject sustained zones that contain
      // a significant descent in the middle of the segment.
      const threshold = DESCENT_THRESHOLDS[zone];
      if (
        threshold != null &&
        hasSignificantDescent(startIdx, endIdx, smoothedElev, cumDistKm, threshold)
      ) {
        continue;
      }

      out.push(zone);
    }
  }
  return out;
}

function fitsTerrain(
  avgGradient: number,
  maxGradient: number,
  gradientVariance: number,
  req: TerrainRequirements
): boolean {
  if (avgGradient < req.min_gradient_pct) return false;
  if (avgGradient > req.max_gradient_pct) return false;
  if (maxGradient > req.max_gradient_pct + 2) return false;
  if (gradientVariance > req.max_gradient_variance) return false;
  return true;
}

export interface DetectOptions {
  /** Minimum segment length in km. Default 2. */
  minLengthKm?: number;
  /** Maximum segment length in km. Default 15. */
  maxLengthKm?: number;
  /** Step size for scanning window start positions. */
  stepKm?: number;
}

/**
 * Scan the route for all maximal interval-suitable segments.
 *
 * Algorithm:
 *   For each start index, grow the window as long as the terrain remains
 *   suitable for at least one zone. When it breaks, record the segment
 *   and jump past it.
 *
 * This returns non-overlapping segments in order. The caller matches
 * them against a specific workout (zone + duration) downstream.
 */
export function detectIntervalSegments(
  coords: [number, number][],
  elevations: number[],
  options: DetectOptions = {}
): IntervalSegment[] {
  const minLengthKm = options.minLengthKm ?? 2;
  const maxLengthKm = options.maxLengthKm ?? 15;

  if (coords.length < 3 || elevations.length !== coords.length) return [];

  const cleaned = interpolateNaN(elevations);
  const smoothed = smoothElevations(cleaned);
  const cumDist = cumulativeDistancesKm(coords);
  const gradients = pointGradients(smoothed, cumDist);

  // Pre-compute per-step bearings (length n-1)
  const bearings: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    bearings.push(bearing(coords[i - 1], coords[i]));
  }

  const segments: IntervalSegment[] = [];
  let i = 0;
  while (i < coords.length - 1) {
    // Grow window from i until terrain no longer suits any zone or we hit
    // maxLengthKm.
    let bestEnd = -1;
    let bestAnyZoneMatch = false;
    let j = i + 1;
    let maxBearingDelta = 0;

    while (j < coords.length) {
      const lengthKm = cumDist[j] - cumDist[i];
      if (lengthKm > maxLengthKm) break;

      if (j - 1 >= 1 && j - 2 >= 0) {
        // Largest bearing change since window start
        const bPrev = bearings[j - 2];
        const bCurr = bearings[j - 1];
        const delta = bearingDelta(bPrev, bCurr);
        if (delta > maxBearingDelta) maxBearingDelta = delta;
      }

      const slice = gradients.slice(i + 1, j + 1); // gradients covering window
      const avgG = mean(slice);
      const maxG = maxAbs(slice);
      const varG = stdev(slice);

      const zonesOk = zonesMatching(lengthKm, avgG, maxG, varG, maxBearingDelta, i, j, smoothed, cumDist);
      if (zonesOk.length > 0 && lengthKm >= minLengthKm) {
        bestEnd = j;
        bestAnyZoneMatch = true;
      } else if (bestAnyZoneMatch && lengthKm > (bestEnd - i) * 0.001) {
        // Terrain just broke. Stop growing.
        break;
      }
      j++;
    }

    if (bestEnd > i) {
      const lengthKm = cumDist[bestEnd] - cumDist[i];
      const slice = gradients.slice(i + 1, bestEnd + 1);
      const avgG = mean(slice);
      const maxG = maxAbs(slice);
      const varG = stdev(slice);
      const suitable = zonesMatching(lengthKm, avgG, maxG, varG, maxBearingDelta, i, bestEnd, smoothed, cumDist);
      if (suitable.length > 0 && lengthKm >= minLengthKm) {
        segments.push({
          start_index: i,
          end_index: bestEnd,
          length_km: Math.round(lengthKm * 100) / 100,
          avg_gradient_pct: Math.round(avgG * 10) / 10,
          max_gradient_pct: Math.round(maxG * 10) / 10,
          gradient_variance: Math.round(varG * 100) / 100,
          suitable_zones: suitable,
        });
        i = bestEnd; // non-overlapping: jump past this segment
        continue;
      }
    }
    i++;
  }

  return segments;
}

/**
 * Filter segments that can host a single interval of the given duration
 * and zone. Segment must be long enough per the zone's length model AND
 * its suitable_zones must include the requested zone.
 */
export function segmentsForInterval(
  segments: IntervalSegment[],
  zone: IntensityZone,
  durationMinutes: number
): IntervalSegment[] {
  const { terrain } = ZONES[zone];
  const minLen = Math.max(
    (durationMinutes / 60) * ZONES[zone].flat_speed_kmh,
    durationMinutes * terrain.min_length_km_per_minute
  );
  return segments.filter(
    (s) => s.suitable_zones.includes(zone) && s.length_km >= minLen
  );
}
