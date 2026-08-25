import { describe, expect, it } from "vitest";
import { parseGpx } from "@/lib/gpx";
import { parseTcx } from "@/lib/tcx";
import { validateRecordedRideEvidence } from "@/lib/recording-evidence";

const loopCoordinates: [number, number][] = Array.from({ length: 21 }, (_, index) => {
  const angle = (index / 20) * Math.PI * 2;
  return [53.25 + Math.sin(angle) * 0.01, -6.25 + Math.cos(angle) * 0.01];
});

function timestamp(index: number): string {
  return new Date(Date.UTC(2026, 7, 20, 9, index)).toISOString();
}

describe("recorded ride evidence", () => {
  it("accepts a timestamped activity that closes as a loop", () => {
    expect(validateRecordedRideEvidence({
      coordinates: loopCoordinates,
      distance_km: 8,
      timestamped_point_count: 21,
      recorded_at_start: timestamp(0),
      recorded_at_end: timestamp(20),
    }, "2026-08-20", new Date("2026-08-25T00:00:00Z"))).toBeNull();
  });

  it("rejects a planned route without timestamp coverage", () => {
    expect(validateRecordedRideEvidence({
      coordinates: loopCoordinates,
      distance_km: 8,
      timestamped_point_count: 0,
      recorded_at_start: null,
      recorded_at_end: null,
    }, "2026-08-20")).toContain("planned route");
  });

  it("rejects a ride date that does not match the recording", () => {
    expect(validateRecordedRideEvidence({
      coordinates: loopCoordinates,
      distance_km: 8,
      timestamped_point_count: 21,
      recorded_at_start: timestamp(0),
      recorded_at_end: timestamp(20),
    }, "2026-08-10")).toContain("does not match");
  });

  it("rejects a recording that does not close", () => {
    const openRide = [...loopCoordinates.slice(0, -1), [53.4, -6.4] as [number, number]];
    expect(validateRecordedRideEvidence({
      coordinates: openRide,
      distance_km: 25,
      timestamped_point_count: 21,
      recorded_at_start: timestamp(0),
      recorded_at_end: timestamp(20),
    }, "2026-08-20")).toContain("gap");
  });

  it("extracts GPX track timestamps", () => {
    const points = loopCoordinates.map(([lat, lng], index) =>
      `<trkpt lat="${lat}" lon="${lng}"><ele>100</ele><time>${timestamp(index)}</time></trkpt>`
    ).join("");
    const parsed = parseGpx(`<gpx><trk><name>Recorded loop</name><trkseg>${points}</trkseg></trk></gpx>`);
    expect(parsed.coordinates).toHaveLength(21);
    expect(parsed.timestamped_point_count).toBe(21);
    expect(parsed.recorded_at_start).toBe(timestamp(0));
  });

  it("does not treat GPX route points as completed-ride evidence", () => {
    const points = loopCoordinates.map(([lat, lng], index) =>
      `<rtept lat="${lat}" lon="${lng}"><time>${timestamp(index)}</time></rtept>`
    ).join("");
    const parsed = parseGpx(`<gpx><rte>${points}</rte></gpx>`);
    expect(parsed.coordinates).toHaveLength(21);
    expect(parsed.timestamped_point_count).toBe(0);
  });

  it("extracts TCX activity timestamps", () => {
    const points = loopCoordinates.map(([lat, lng], index) =>
      `<Trackpoint><Time>${timestamp(index)}</Time><Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lng}</LongitudeDegrees></Position><AltitudeMeters>100</AltitudeMeters></Trackpoint>`
    ).join("");
    const parsed = parseTcx(`<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Lap><Track>${points}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`);
    expect(parsed.coordinates).toHaveLength(21);
    expect(parsed.timestamped_point_count).toBe(21);
    expect(parsed.recorded_at_end).toBe(timestamp(20));
  });
});
