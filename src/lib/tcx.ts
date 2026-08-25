import { calculateStats } from "./geo-utils";
import { summariseRecordingTimestamps } from "./recording-evidence";

export interface TcxData {
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

export function parseTcx(xml: string): TcxData {
  const coordinates: [number, number][] = [];
  const elevations: number[] = [];
  const timestamps: string[] = [];

  // Extract activity name
  const nameMatch = xml.match(/<Activity\s+Sport="([^"]+)"/);
  const notesMatch = xml.match(/<Notes>([^<]*)<\/Notes>/);
  const name = notesMatch ? notesMatch[1] : nameMatch ? nameMatch[1] : null;

  // Extract trackpoints across all laps
  const tpRegex = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/g;
  let match;
  while ((match = tpRegex.exec(xml)) !== null) {
    const block = match[1];

    const latMatch = block.match(/<LatitudeDegrees>([^<]+)<\/LatitudeDegrees>/);
    const lngMatch = block.match(/<LongitudeDegrees>([^<]+)<\/LongitudeDegrees>/);

    if (latMatch && lngMatch) {
      coordinates.push([parseFloat(latMatch[1]), parseFloat(lngMatch[1])]);

      const eleMatch = block.match(/<AltitudeMeters>([^<]+)<\/AltitudeMeters>/);
      if (eleMatch) {
        elevations.push(parseFloat(eleMatch[1]));
      }
      const timeMatch = block.match(/<Time>([^<]+)<\/Time>/);
      if (timeMatch) timestamps.push(timeMatch[1]);
    }
  }

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
