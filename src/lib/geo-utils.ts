export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function calculateStats(
  coordinates: [number, number][],
  elevations: number[]
): { distance_km: number; elevation_gain_m: number; elevation_loss_m: number } {
  let distance_km = 0;
  for (let i = 1; i < coordinates.length; i++) {
    distance_km += haversine(coordinates[i - 1], coordinates[i]);
  }

  const { gain_m: elevation_gain_m, loss_m: elevation_loss_m } =
    elevations.length === coordinates.length ? climbStats(coordinates, elevations) : rawClimb(elevations);

  return {
    distance_km: Math.round(distance_km * 10) / 10,
    elevation_gain_m: Math.round(elevation_gain_m),
    elevation_loss_m: Math.round(elevation_loss_m),
  };
}

/** Every up-tick summed — only for heights not aligned with a track. */
function rawClimb(elevations: number[]): { gain_m: number; loss_m: number } {
  let gain_m = 0, loss_m = 0;
  for (let i = 1; i < elevations.length; i++) {
    const d = elevations[i] - elevations[i - 1];
    if (d > 0) gain_m += d; else loss_m -= d;
  }
  return { gain_m, loss_m };
}

/** Heights averaged over this much road before counting (km). */
const CLIMB_SMOOTH_KM = 0.3;
/** A rise or fall counts once it exceeds this (m). */
const CLIMB_HYSTERESIS_M = 3;

/**
 * Climbing as ridden: heights smoothed over ~300 m of road, then counted
 * with a 3 m threshold. Summing every up-tick counts GPS/DEM jitter as
 * climbing (the Rupit Loop read 6,191 m; the engine's filtered ascent is
 * 2,675 m; this gives ~2,800 m. The Roadman spin: 554 m stored, engine 324,
 * this 327).
 */
export function climbStats(coords: [number, number][], elevations: number[]): { gain_m: number; loss_m: number } {
  const n = Math.min(coords.length, elevations.length);
  if (n < 2) return { gain_m: 0, loss_m: 0 };
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const pre = [0];
  for (let i = 0; i < n; i++) pre.push(pre[i] + elevations[i]);
  const half = CLIMB_SMOOTH_KM / 2;
  const smooth: number[] = new Array(n);
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    while (cum[lo] < cum[i] - half) lo++;
    while (hi < n && cum[hi] <= cum[i] + half) hi++;
    smooth[i] = (pre[hi] - pre[lo]) / (hi - lo);
  }
  let gain_m = 0, loss_m = 0, ref = smooth[0];
  for (let i = 1; i < n; i++) {
    const d = smooth[i] - ref;
    if (d >= CLIMB_HYSTERESIS_M) { gain_m += d; ref = smooth[i]; }
    else if (d <= -CLIMB_HYSTERESIS_M) { loss_m -= d; ref = smooth[i]; }
  }
  return { gain_m, loss_m };
}
