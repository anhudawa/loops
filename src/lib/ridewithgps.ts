import type { RouteData } from "./route-parser";

interface TrackPoint {
  y: number;
  x: number;
  e?: number;
}

function downsample(points: TrackPoint[], maxPoints: number): TrackPoint[] {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const result: TrackPoint[] = [points[0]];
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

export async function fetchRideWithGPS(url: string): Promise<RouteData> {
  // Support both /routes/ID and /trips/ID
  const routeMatch = url.match(/ridewithgps\.com\/(routes|trips)\/(\d+)/);
  if (!routeMatch) {
    throw new Error("Invalid RideWithGPS URL. Expected: ridewithgps.com/routes/ID or ridewithgps.com/trips/ID");
  }

  const type = routeMatch[1]; // "routes" or "trips"
  const id = routeMatch[2];

  const res = await fetch(`https://ridewithgps.com/${type}/${id}.json`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Route not found on RideWithGPS. It may be private or deleted.");
    }
    throw new Error(`Failed to fetch from RideWithGPS (${res.status})`);
  }

  const data = await res.json();
  const rte = data.route || data.trip || data;
  const trackPoints = rte.track_points || [];

  if (trackPoints.length === 0) {
    throw new Error("No track points found in this RideWithGPS route");
  }

  const sampled = downsample(trackPoints as TrackPoint[], 8000);

  const coordinates: [number, number][] = sampled.map((p) => [
    Math.round(p.y * 1e6) / 1e6,
    Math.round(p.x * 1e6) / 1e6,
  ]);

  const elevations: number[] = sampled.map((p) => p.e ?? 0);

  return {
    name: rte.name || null,
    coordinates,
    elevations,
    distance_km: Math.round((rte.distance / 1000) * 10) / 10,
    elevation_gain_m: Math.round(rte.elevation_gain || 0),
    elevation_loss_m: Math.round(rte.elevation_loss || 0),
  };
}
