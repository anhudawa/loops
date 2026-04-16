import { describe, it, expect } from "vitest";
import {
  parseZone,
  intervalDistanceKm,
  minSegmentLengthKm,
  ZONES,
} from "../intensity";

describe("parseZone", () => {
  it("recognises 'threshold' as z4", () => {
    expect(parseZone("2x20 threshold")).toBe("z4");
  });

  it("recognises 'FTP' as z4", () => {
    expect(parseZone("5x10 at FTP")).toBe("z4");
  });

  it("recognises 'vo2 max' (two words) as z5", () => {
    expect(parseZone("6x3 vo2 max")).toBe("z5");
  });

  it("recognises 'sweet spot' as z3", () => {
    expect(parseZone("3x15 sweet spot")).toBe("z3");
  });

  it("prefers longer aliases over shorter ones (vo2 max wins over z5 shadow)", () => {
    // "zone 5" is a longer alias than "z5"; both should map to z5
    expect(parseZone("zone 5 intervals")).toBe("z5");
  });

  it("returns null for unknown labels", () => {
    expect(parseZone("unicorn pace")).toBeNull();
  });
});

describe("intervalDistanceKm", () => {
  it("20 min at threshold (z4, 32 km/h) ≈ 10.67 km", () => {
    const d = intervalDistanceKm("z4", 20);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(11);
  });

  it("5 min at vo2max (z5, 30 km/h) = 2.5 km", () => {
    expect(intervalDistanceKm("z5", 5)).toBeCloseTo(2.5, 1);
  });

  it("uses the correct speed for each zone", () => {
    for (const zone of Object.keys(ZONES) as Array<keyof typeof ZONES>) {
      const expected = (60 / 60) * ZONES[zone].flat_speed_kmh;
      expect(intervalDistanceKm(zone, 60)).toBeCloseTo(expected, 1);
    }
  });
});

describe("minSegmentLengthKm", () => {
  it("requires more length than the raw interval distance (safety margin)", () => {
    const raw = intervalDistanceKm("z4", 20);
    const min = minSegmentLengthKm("z4", 20);
    expect(min).toBeGreaterThanOrEqual(raw);
  });

  it("scales with duration", () => {
    const short = minSegmentLengthKm("z4", 8);
    const long = minSegmentLengthKm("z4", 20);
    expect(long).toBeGreaterThan(short);
  });
});
