import FitParser from "fit-file-parser";
import { calculateStats } from "./geo-utils";

export interface FitData {
  name: string | null;
  coordinates: [number, number][];
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
}

export async function parseFit(buffer: ArrayBuffer): Promise<FitData> {
  const parser = new FitParser({ force: true, mode: "list" });
  const parsed = await parser.parseAsync(buffer);

  const coordinates: [number, number][] = [];
  const elevations: number[] = [];

  const records = parsed.records || [];
  for (const rec of records) {
    if (rec.position_lat != null && rec.position_long != null) {
      coordinates.push([rec.position_lat, rec.position_long]);
      elevations.push(rec.altitude ?? 0);
    }
  }

  // Try to get activity name from session
  const sessions = parsed.sessions || [];
  const name = sessions[0]?.sport ?? null;

  const stats = calculateStats(coordinates, elevations);

  return {
    name,
    coordinates,
    elevations,
    ...stats,
  };
}
