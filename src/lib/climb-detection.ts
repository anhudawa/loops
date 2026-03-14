// ============================================================
// climb-detection.ts — Pure functions for elevation analysis
// ============================================================

/**
 * Haversine distance in km between two [lat, lng] points.
 */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Replace NaN/undefined elevation values with linear interpolation from neighbours.
 * Returns a clean number[] with no NaN values.
 */
export function interpolateNaN(elevations: (number | undefined | null)[]): number[] {
  const result = elevations.map((e) => (e != null && !isNaN(e) ? e : NaN));

  for (let i = 0; i < result.length; i++) {
    if (isNaN(result[i])) {
      let prev = -1;
      for (let j = i - 1; j >= 0; j--) { if (!isNaN(result[j])) { prev = j; break; } }
      let next = -1;
      for (let j = i + 1; j < result.length; j++) { if (!isNaN(result[j])) { next = j; break; } }

      if (prev >= 0 && next >= 0) {
        const ratio = (i - prev) / (next - prev);
        result[i] = result[prev] + ratio * (result[next] - result[prev]);
      } else if (prev >= 0) {
        result[i] = result[prev];
      } else if (next >= 0) {
        result[i] = result[next];
      } else {
        result[i] = 0;
      }
    }
  }
  return result;
}

/**
 * Smooth elevation data using a 5-point moving average.
 * Asymmetric window at boundaries.
 */
export function smoothElevations(elevations: number[]): number[] {
  const n = elevations.length;
  if (n < 5) return [...elevations];

  const smoothed: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 2);
    const end = Math.min(n - 1, i + 2);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += elevations[j];
      count++;
    }
    smoothed[i] = sum / count;
  }
  return smoothed;
}

/**
 * Compute gradient (%) between consecutive points.
 * Returns array of length (n-1).
 */
export function computeGradients(elevations: number[], cumulativeDistancesKm: number[]): number[] {
  const gradients: number[] = [];
  for (let i = 1; i < elevations.length; i++) {
    const dElev = elevations[i] - elevations[i - 1];
    const dDist = (cumulativeDistancesKm[i] - cumulativeDistancesKm[i - 1]) * 1000; // to metres
    if (dDist === 0) {
      gradients.push(0);
    } else {
      gradients.push((dElev / dDist) * 100);
    }
  }
  return gradients;
}

/**
 * Colour for a given gradient percentage.
 * Negative gradients (descents) → muted blue-grey.
 * Positive gradients → green → yellow-green → orange → red → purple.
 */
export function gradientColor(pct: number): string {
  if (pct < 0) return "#6688aa";   // descent
  if (pct < 3) return "#00ff88";   // easy green
  if (pct < 5) return "#bbff00";   // moderate yellow-green
  if (pct < 7) return "#ffbb00";   // hard orange
  if (pct < 10) return "#ff5533";  // steep red
  return "#cc33ff";                 // brutal purple
}

/** Category badge colours, matching the gradient scale. */
export const CATEGORY_COLORS: Record<string, string> = {
  HC: "#cc33ff",
  "Cat 1": "#ff5533",
  "Cat 2": "#ffbb00",
  "Cat 3": "#bbff00",
  "Cat 4": "#00ff88",
};

/** A detected climb with stats and category. */
export interface Climb {
  startIndex: number;
  endIndex: number;
  startKm: number;
  endKm: number;
  startElev: number;
  endElev: number;
  gain: number;
  distanceKm: number;
  avgGradient: number;
  maxElev: number;
  category: string | null; // "HC" | "Cat 1" | "Cat 2" | "Cat 3" | "Cat 4" | null
}

/**
 * Categorise a climb by the Strava-style score formula.
 * Score = length_km × avg_gradient_%
 */
export function categoriseClimb(lengthKm: number, avgGradient: number): string | null {
  const score = lengthKm * avgGradient;
  if (score >= 80) return "HC";
  if (score >= 40) return "Cat 1";
  if (score >= 20) return "Cat 2";
  if (score >= 8) return "Cat 3";
  if (score >= 3) return "Cat 4";
  return null;
}

/**
 * Detect significant climbs from coordinate data.
 *
 * @param coordinates Array of [lat, lng, elevation] tuples
 * @returns Array of Climb objects, ordered by start km ascending
 */
export function detectClimbs(coordinates: [number, number, number][]): Climb[] {
  if (coordinates.length < 5) return [];

  const rawElevations = interpolateNaN(coordinates.map((c) => c[2]));
  const smoothed = smoothElevations(rawElevations);

  // Build cumulative distance array
  const cumDist: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cumDist.push(
      cumDist[i - 1] + haversine([coordinates[i - 1][0], coordinates[i - 1][1]], [coordinates[i][0], coordinates[i][1]])
    );
  }

  const n = smoothed.length;
  const climbs: Climb[] = [];

  // Compute gradients between consecutive smoothed points
  const gradients = computeGradients(smoothed, cumDist);

  let i = 0;
  const CLIMB_START_THRESHOLD = 2; // % gradient to start a climb
  const CLIMB_END_THRESHOLD = 1;   // % gradient to end a climb
  const MIN_CONSECUTIVE_START = 3;  // consecutive points above threshold to start
  const MIN_CONSECUTIVE_END = 5;    // consecutive points below threshold to end

  while (i < n - 1) {
    // Find start of climb: MIN_CONSECUTIVE_START points above CLIMB_START_THRESHOLD
    let consecutiveUp = 0;
    while (i < gradients.length) {
      if (gradients[i] >= CLIMB_START_THRESHOLD) {
        consecutiveUp++;
        if (consecutiveUp >= MIN_CONSECUTIVE_START) {
          i = i - MIN_CONSECUTIVE_START + 1; // back to start of sequence
          break;
        }
      } else {
        consecutiveUp = 0;
      }
      i++;
    }
    if (i >= gradients.length) break;

    const climbStartIdx = i;
    let climbEndIdx = i;
    let peakElev = smoothed[i];
    let peakIdx = i;
    let consecutiveBelow = 0;

    // Walk the climb
    while (i < gradients.length) {
      i++;
      if (smoothed[i] > peakElev) {
        peakElev = smoothed[i];
        peakIdx = i;
      }
      if (gradients[i - 1] < CLIMB_END_THRESHOLD) {
        consecutiveBelow++;
        if (consecutiveBelow >= MIN_CONSECUTIVE_END) {
          climbEndIdx = i - MIN_CONSECUTIVE_END;
          break;
        }
      } else {
        consecutiveBelow = 0;
        climbEndIdx = i;
      }
    }
    if (i >= gradients.length) climbEndIdx = peakIdx;

    // Calculate stats
    const gain = smoothed[climbEndIdx] - smoothed[climbStartIdx];
    const startKm = cumDist[climbStartIdx];
    const endKm = cumDist[climbEndIdx];
    const distKm = endKm - startKm;

    // Filter: min 30m gain, min 2% average, min distance
    if (gain >= 30 && distKm > 0.1) {
      const avgGrad = (gain / (distKm * 1000)) * 100;
      if (avgGrad >= 2) {
        const category = categoriseClimb(distKm, avgGrad);
        climbs.push({
          startIndex: climbStartIdx,
          endIndex: climbEndIdx,
          startKm,
          endKm,
          startElev: smoothed[climbStartIdx],
          endElev: smoothed[climbEndIdx],
          gain,
          distanceKm: distKm,
          avgGradient: avgGrad,
          maxElev: peakElev,
          category,
        });
      }
    }

    i = climbEndIdx + 1;
  }

  // Sort by start km ascending (natural route order)
  climbs.sort((a, b) => a.startKm - b.startKm);

  // Only return categorised climbs (score >= 3)
  return climbs.filter((c) => c.category !== null);
}

/**
 * Downsample returning the selected indices (not values).
 * Use this when you need to downsample multiple parallel arrays in sync.
 */
export function downsampleIndices(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return Array.from({ length: data.length }, (_, i) => i);

  const indices: number[] = [0];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  let prevIndex = 0;
  for (let i = 1; i < maxPoints - 1; i++) {
    const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);
    const nextBucketStart = Math.floor(i * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);

    let avgNext = 0;
    for (let j = nextBucketStart; j <= nextBucketEnd; j++) avgNext += data[j];
    avgNext /= nextBucketEnd - nextBucketStart + 1;

    let maxArea = -1;
    let bestIdx = rangeStart;
    for (let j = rangeStart; j <= rangeEnd; j++) {
      const area = Math.abs(
        (prevIndex - (nextBucketStart + nextBucketEnd) / 2) * (data[j] - data[prevIndex]) -
        (prevIndex - j) * (avgNext - data[prevIndex])
      );
      if (area > maxArea) {
        maxArea = area;
        bestIdx = j;
      }
    }

    indices.push(bestIdx);
    prevIndex = bestIdx;
  }

  indices.push(data.length - 1);
  return indices;
}

/**
 * Downsample an array to at most `maxPoints` using largest-triangle-three-buckets.
 */
export function downsample(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;

  const sampled: number[] = [data[0]];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  let prevIndex = 0;
  for (let i = 1; i < maxPoints - 1; i++) {
    const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);
    const nextBucketStart = Math.floor(i * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);

    let avgNext = 0;
    for (let j = nextBucketStart; j <= nextBucketEnd; j++) avgNext += data[j];
    avgNext /= nextBucketEnd - nextBucketStart + 1;

    let maxArea = -1;
    let bestIdx = rangeStart;
    for (let j = rangeStart; j <= rangeEnd; j++) {
      const area = Math.abs(
        (prevIndex - (nextBucketStart + nextBucketEnd) / 2) * (data[j] - data[prevIndex]) -
        (prevIndex - j) * (avgNext - data[prevIndex])
      );
      if (area > maxArea) {
        maxArea = area;
        bestIdx = j;
      }
    }

    sampled.push(data[bestIdx]);
    prevIndex = bestIdx;
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

/**
 * Compute a smoothed gradient for tooltip display.
 * Averages over a ±3 point window around the target index.
 */
export function tooltipGradient(gradients: number[], index: number): number {
  const WINDOW = 3;
  const start = Math.max(0, index - WINDOW);
  const end = Math.min(gradients.length - 1, index + WINDOW);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    sum += gradients[i];
    count++;
  }
  return count > 0 ? sum / count : 0;
}
