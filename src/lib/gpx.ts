export interface GpxData {
  name: string | null;
  coordinates: [number, number][]; // [lat, lng]
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
}

export function parseGpx(xml: string): GpxData {
  const coordinates: [number, number][] = [];
  const elevations: number[] = [];

  // Extract track name
  const nameMatch = xml.match(/<name>([^<]*)<\/name>/);
  const name = nameMatch ? nameMatch[1] : null;

  // Extract track points
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let match;
  while ((match = trkptRegex.exec(xml)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    coordinates.push([lat, lng]);

    const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
    if (eleMatch) {
      elevations.push(parseFloat(eleMatch[1]));
    }
  }

  // Also try route points if no track points found
  if (coordinates.length === 0) {
    const rteptRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/rtept>/g;
    while ((match = rteptRegex.exec(xml)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      coordinates.push([lat, lng]);

      const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
      if (eleMatch) {
        elevations.push(parseFloat(eleMatch[1]));
      }
    }
  }

  // Calculate distance using Haversine formula
  let distance_km = 0;
  for (let i = 1; i < coordinates.length; i++) {
    distance_km += haversine(coordinates[i - 1], coordinates[i]);
  }

  // Calculate elevation gain/loss
  let elevation_gain_m = 0;
  let elevation_loss_m = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) elevation_gain_m += diff;
    else elevation_loss_m += Math.abs(diff);
  }

  return {
    name,
    coordinates,
    elevations,
    distance_km: Math.round(distance_km * 10) / 10,
    elevation_gain_m: Math.round(elevation_gain_m),
    elevation_loss_m: Math.round(elevation_loss_m),
  };
}

function haversine(a: [number, number], b: [number, number]): number {
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

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function suggestDifficulty(distance_km: number, elevation_gain_m: number): string {
  const gradientFactor = elevation_gain_m / Math.max(distance_km, 1);
  const score = gradientFactor + distance_km / 50;

  if (score < 5) return "easy";
  if (score < 15) return "moderate";
  if (score < 30) return "hard";
  return "expert";
}
