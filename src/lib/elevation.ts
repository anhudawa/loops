/**
 * Elevation Sampling
 *
 * Samples elevation along a route using the Open-Meteo elevation API.
 * Free, no key required. We already use Open-Meteo for weather elsewhere.
 *
 * The Open-Meteo endpoint accepts up to 100 coordinates per request as
 * comma-separated latitude/longitude lists. For long routes we downsample
 * to a target interval and then chunk into API-friendly batches.
 */

import { smoothElevations, interpolateNaN } from "./climb-detection";

const OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
const BATCH_SIZE = 100;
const FETCH_TIMEOUT_MS = 10000;

/**
 * Downsample a coordinate list so consecutive points are at least
 * `targetIntervalM` metres apart. Always keeps the first and last point.
 *
 * Returns both the downsampled coords and the indices into the original array
 * so callers can interpolate back to full resolution if they need to.
 */
export function downsampleByInterval(
  coords: [number, number][],
  targetIntervalM: number
): { coords: [number, number][]; indices: number[] } {
  if (coords.length === 0) return { coords: [], indices: [] };

  const kept: [number, number][] = [coords[0]];
  const indices: number[] = [0];
  let lastLat = coords[0][0];
  let lastLng = coords[0][1];

  for (let i = 1; i < coords.length - 1; i++) {
    const [lat, lng] = coords[i];
    if (haversineMeters(lastLat, lastLng, lat, lng) >= targetIntervalM) {
      kept.push(coords[i]);
      indices.push(i);
      lastLat = lat;
      lastLng = lng;
    }
  }

  // Always include the final point
  kept.push(coords[coords.length - 1]);
  indices.push(coords.length - 1);

  return { coords: kept, indices };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchElevationBatch(batch: [number, number][]): Promise<number[]> {
  const lats = batch.map(([lat]) => lat.toFixed(5)).join(",");
  const lngs = batch.map(([, lng]) => lng.toFixed(5)).join(",");
  const url = `${OPEN_METEO_ELEVATION_URL}?latitude=${lats}&longitude=${lngs}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo elevation API returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as { elevation?: number[] };
  if (!Array.isArray(json.elevation) || json.elevation.length !== batch.length) {
    throw new Error("Open-Meteo elevation API returned malformed response");
  }
  return json.elevation;
}

/**
 * Fetch elevation (metres) for each coordinate.
 * Requests are batched at BATCH_SIZE and run in parallel.
 */
export async function fetchElevations(
  coords: [number, number][]
): Promise<number[]> {
  if (coords.length === 0) return [];

  const batches: [number, number][][] = [];
  for (let i = 0; i < coords.length; i += BATCH_SIZE) {
    batches.push(coords.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(batches.map(fetchElevationBatch));
  return results.flat();
}

/**
 * Compute cumulative elevation gain (positive altitude changes only) after
 * smoothing. This mirrors how Strava/Komoot compute "elevation gain" — raw
 * elevation data is noisy and summing every uphill sample inflates the total.
 */
export function elevationGainFromSeries(elevations: number[]): number {
  if (elevations.length < 2) return 0;
  const cleaned = interpolateNaN(elevations);
  const smoothed = smoothElevations(cleaned);
  let gain = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const d = smoothed[i] - smoothed[i - 1];
    if (d > 0) gain += d;
  }
  return Math.round(gain);
}

export interface RouteElevationResult {
  elevations: number[];        // metres, aligned with the sampled coords
  sampled_coords: [number, number][];
  gain_m: number;
  loss_m: number;
}

/**
 * Sample and compute elevation gain/loss for a route.
 *
 * @param coords full-resolution [lat, lng][] path from the router
 * @param sampleIntervalM target spacing between sample points (default 200m)
 */
export async function sampleRouteElevation(
  coords: [number, number][],
  sampleIntervalM = 200
): Promise<RouteElevationResult> {
  const { coords: sampled } = downsampleByInterval(coords, sampleIntervalM);
  const elevations = await fetchElevations(sampled);

  const cleaned = interpolateNaN(elevations);
  const smoothed = smoothElevations(cleaned);

  let gain = 0;
  let loss = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const d = smoothed[i] - smoothed[i - 1];
    if (d > 0) gain += d;
    else loss += -d;
  }

  return {
    elevations: smoothed,
    sampled_coords: sampled,
    gain_m: Math.round(gain),
    loss_m: Math.round(loss),
  };
}
