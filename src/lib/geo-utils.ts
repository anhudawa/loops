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

  let elevation_gain_m = 0;
  let elevation_loss_m = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) elevation_gain_m += diff;
    else elevation_loss_m += Math.abs(diff);
  }

  return {
    distance_km: Math.round(distance_km * 10) / 10,
    elevation_gain_m: Math.round(elevation_gain_m),
    elevation_loss_m: Math.round(elevation_loss_m),
  };
}
