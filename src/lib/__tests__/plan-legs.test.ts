import { describe, it, expect } from "vitest";
import {
  haversineKm,
  legTotals,
  formatTotals,
  concatLegGeometry,
  buildPlanGpx,
  type PlanLeg,
  type LatLng,
} from "../plan-legs";

function leg(partial: Partial<PlanLeg>): PlanLeg {
  return {
    id: 1,
    seq: 1,
    from: [53.35, -6.26],
    to: [53.36, -6.27],
    coords: [
      [53.35, -6.26],
      [53.36, -6.27],
    ],
    elevations: [10, 20],
    distance_km: 1.5,
    gain_m: 10,
    status: "snapped",
    ...partial,
  };
}

describe("haversineKm", () => {
  it("is zero for identical points", () => {
    expect(haversineKm([53.35, -6.26], [53.35, -6.26])).toBe(0);
  });

  it("measures Dublin → Skerries at roughly 28 km", () => {
    const d = haversineKm([53.3498, -6.2603], [53.5829, -6.1083]);
    expect(d).toBeGreaterThan(25);
    expect(d).toBeLessThan(30);
  });

  it("is symmetric", () => {
    const a: LatLng = [53.35, -6.26];
    const b: LatLng = [52.66, -8.62];
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
});

describe("legTotals", () => {
  it("returns zeros and exact for no legs", () => {
    expect(legTotals([])).toEqual({ distance_km: 0, gain_m: 0, approx: false });
  });

  it("sums distance and gain across snapped legs", () => {
    const t = legTotals([
      leg({ distance_km: 10.2, gain_m: 100 }),
      leg({ distance_km: 14.1, gain_m: 210 }),
    ]);
    expect(t.distance_km).toBeCloseTo(24.3, 5);
    expect(t.gain_m).toBe(310);
    expect(t.approx).toBe(false);
  });

  it("marks the total approximate when any leg is unsnapped", () => {
    for (const status of ["pending", "failed", "straight"] as const) {
      const t = legTotals([leg({}), leg({ status, distance_km: 2, gain_m: 0 })]);
      expect(t.approx).toBe(true);
    }
  });

  it("rounds the total distance to 0.1 km", () => {
    const t = legTotals([leg({ distance_km: 1.04 }), leg({ distance_km: 1.04 })]);
    expect(t.distance_km).toBe(2.1);
  });
});

describe("formatTotals", () => {
  it("renders exact totals plainly", () => {
    expect(formatTotals({ distance_km: 24.3, gain_m: 310, approx: false })).toBe(
      "24.3 km · +310 m"
    );
  });

  it("prefixes ~ when approximate", () => {
    expect(formatTotals({ distance_km: 5, gain_m: 0, approx: true })).toBe(
      "~5.0 km · +0 m"
    );
  });
});

describe("concatLegGeometry", () => {
  it("drops the duplicated junction point between consecutive legs", () => {
    const a = leg({
      coords: [
        [53.35, -6.26],
        [53.355, -6.265],
        [53.36, -6.27],
      ],
      elevations: [10, 15, 20],
    });
    const b = leg({
      coords: [
        [53.36, -6.27], // same as a's last point — must be deduped
        [53.37, -6.28],
      ],
      elevations: [20, 30],
    });
    const { coords, elevations } = concatLegGeometry([a, b]);
    expect(coords).toEqual([
      [53.35, -6.26],
      [53.355, -6.265],
      [53.36, -6.27],
      [53.37, -6.28],
    ]);
    expect(elevations).toEqual([10, 15, 20, 30]);
  });

  it("keeps both points when legs do not share a junction", () => {
    const a = leg({});
    const b = leg({
      coords: [
        [53.5, -6.4],
        [53.6, -6.5],
      ],
      elevations: [5, 6],
    });
    const { coords } = concatLegGeometry([a, b]);
    expect(coords).toHaveLength(4);
  });

  it("pads missing elevations with NaN to stay index-aligned", () => {
    const a = leg({ elevations: [] }); // straight leg — no elevations
    const { coords, elevations } = concatLegGeometry([a]);
    expect(elevations).toHaveLength(coords.length);
    expect(elevations.every((e) => Number.isNaN(e))).toBe(true);
  });
});

describe("buildPlanGpx", () => {
  it("emits trkpts with <ele> for real elevations and omits it for NaN", () => {
    const gpx = buildPlanGpx(
      [
        [53.35, -6.26],
        [53.36, -6.27],
      ],
      [12.3, NaN],
      "Test ride",
      "road"
    );
    expect(gpx).toContain('<trkpt lat="53.350000" lon="-6.260000"><ele>12.3</ele></trkpt>');
    expect(gpx).toContain('<trkpt lat="53.360000" lon="-6.270000"></trkpt>');
    expect(gpx).toContain("<name>Test ride</name>");
    expect(gpx).toContain("<type>road</type>");
    expect(gpx).toContain('creator="loops.ie"');
  });

  it("escapes XML in the route name", () => {
    const gpx = buildPlanGpx([[53.35, -6.26]], [1], "A <b> & 'c'", "gravel");
    expect(gpx).toContain("A &lt;b&gt; &amp; &apos;c&apos;");
  });
});
