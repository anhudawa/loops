import { haversine, calculateStats } from "./geo-utils";

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

  const stats = calculateStats(coordinates, elevations);

  return {
    name,
    coordinates,
    elevations,
    ...stats,
  };
}

export function suggestDifficulty(distance_km: number, elevation_gain_m: number): string {
  const gradientFactor = elevation_gain_m / Math.max(distance_km, 1);
  const score = gradientFactor + distance_km / 50;

  if (score < 5) return "easy";
  if (score < 15) return "moderate";
  if (score < 30) return "hard";
  return "expert";
}
