import FitParser from "fit-file-parser";
import { calculateStats } from "./geo-utils";
import { summariseRecordingTimestamps } from "./recording-evidence";

export interface FitData {
  name: string | null;
  coordinates: [number, number][];
  elevations: number[];
  timestamps: string[];
  timestamped_point_count: number;
  recorded_at_start: string | null;
  recorded_at_end: string | null;
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
}

export async function parseFit(buffer: ArrayBuffer): Promise<FitData> {
  const parser = new FitParser({ force: true, mode: "list" });
  const parsed = await parser.parseAsync(buffer);

  const coordinates: [number, number][] = [];
  const elevations: number[] = [];
  const timestamps: string[] = [];

  const records = parsed.records || [];
  for (const rec of records) {
    if (rec.position_lat != null && rec.position_long != null) {
      coordinates.push([rec.position_lat, rec.position_long]);
      elevations.push(rec.altitude ?? 0);
      if (rec.timestamp) timestamps.push(String(rec.timestamp));
    }
  }

  // Try to get activity name from session
  const sessions = parsed.sessions || [];
  const name = sessions[0]?.sport ?? null;

  const stats = calculateStats(coordinates, elevations);
  const recording = summariseRecordingTimestamps(timestamps);

  return {
    name,
    coordinates,
    elevations,
    timestamps,
    ...recording,
    ...stats,
  };
}
