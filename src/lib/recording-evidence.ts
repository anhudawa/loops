import { haversine } from "./geo-utils";

export function summariseRecordingTimestamps(timestamps: string[]): {
  timestamped_point_count: number;
  recorded_at_start: string | null;
  recorded_at_end: string | null;
} {
  const valid = timestamps
    .map((timestamp) => new Date(timestamp))
    .filter((timestamp) => !Number.isNaN(timestamp.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    timestamped_point_count: valid.length,
    recorded_at_start: valid[0]?.toISOString() ?? null,
    recorded_at_end: valid.at(-1)?.toISOString() ?? null,
  };
}

interface RecordedRideCandidate {
  coordinates: [number, number][];
  distance_km: number;
  timestamped_point_count: number;
  recorded_at_start: string | null;
  recorded_at_end: string | null;
}

/**
 * Reject planned routes masquerading as rides before they can enter review.
 * Human review remains mandatory; these checks only establish that the file
 * looks like a time-series recording of a completed loop.
 */
export function validateRecordedRideEvidence(
  candidate: RecordedRideCandidate,
  riddenAt: string,
  now: Date = new Date()
): string | null {
  const pointCount = candidate.coordinates.length;
  if (pointCount < 20) {
    return "The recording needs at least 20 GPS points.";
  }

  const minimumTimestampedPoints = Math.max(20, Math.ceil(pointCount * 0.8));
  if (candidate.timestamped_point_count < minimumTimestampedPoints) {
    return "This looks like a planned route rather than a completed activity. Upload a ride recording with timestamps.";
  }

  if (!candidate.recorded_at_start || !candidate.recorded_at_end) {
    return "The activity recording is missing its start or finish time.";
  }

  const startedAt = new Date(candidate.recorded_at_start);
  const endedAt = new Date(candidate.recorded_at_end);
  const durationMs = endedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(durationMs) || durationMs < 5 * 60 * 1000) {
    return "The activity recording is too short to verify as a ridden loop.";
  }
  if (endedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    return "The activity recording has a finish time in the future.";
  }

  const claimedDay = new Date(`${riddenAt}T00:00:00Z`).getTime();
  const recordedDay = Date.UTC(
    startedAt.getUTCFullYear(),
    startedAt.getUTCMonth(),
    startedAt.getUTCDate()
  );
  if (!Number.isFinite(claimedDay) || Math.abs(claimedDay - recordedDay) > 24 * 60 * 60 * 1000) {
    return "The date ridden does not match the activity recording.";
  }

  const start = candidate.coordinates[0];
  const finish = candidate.coordinates.at(-1);
  if (!start || !finish) return "The activity recording has no usable geometry.";
  const closureKm = haversine(start, finish);
  const maximumClosureKm = Math.min(1.5, Math.max(0.3, candidate.distance_km * 0.03));
  if (closureKm > maximumClosureKm) {
    return `This activity does not finish close enough to its start to be a loop (${closureKm.toFixed(1)} km gap).`;
  }

  return null;
}
