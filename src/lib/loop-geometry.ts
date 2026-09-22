/**
 * Pure geometry for serving a verified loop FROM HOME: every route starts
 * where the rider is. A loop that starts elsewhere is rotated to begin at
 * its point nearest home, and the generator adds the ride out and back.
 */

export type LatLng = [number, number];

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** A track whose ends meet (within 300 m) is a loop. */
export function isClosedLoop(coords: LatLng[]): boolean {
  return coords.length >= 3 && haversineKm(coords[0], coords[coords.length - 1]) < 0.3;
}

/** Index of the track point nearest `home`. */
export function nearestIndex(coords: LatLng[], home: LatLng): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineKm(coords[i], home);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Rotate a closed loop so it starts (and ends) at index `k`, keeping its
 * direction. Parallel arrays (elevations) rotate identically. The closing
 * duplicate point is dropped before rotating and re-added after.
 */
export function rotateLoop<T>(coords: LatLng[], k: number, parallel?: T[]): { coords: LatLng[]; parallel?: T[] } {
  if (coords.length < 3) return { coords, parallel };
  const open = coords.slice(0, coords.length - 1);
  const par = parallel ? parallel.slice(0, coords.length - 1) : undefined;
  const kk = Math.max(0, Math.min(k, open.length - 1));
  const rc = open.slice(kk).concat(open.slice(0, kk));
  rc.push(rc[0]);
  const rp = par ? par.slice(kk).concat(par.slice(0, kk)) : undefined;
  if (rp) rp.push(rp[0]);
  return { coords: rc, parallel: rp };
}
