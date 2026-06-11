import { describe, it, expect } from "vitest";
import {
  haversineKm,
  legTotals,
  formatTotals,
  concatLegGeometry,
  legGeometryForChart,
  insertAnchorAtLeg,
  legHandlePoint,
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
    loss_m: 0,
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
    expect(legTotals([])).toEqual({ distance_km: 0, gain_m: 0, loss_m: 0, approx: false });
  });

  it("sums distance, gain and loss across snapped legs", () => {
    const t = legTotals([
      leg({ distance_km: 10.2, gain_m: 100, loss_m: 40 }),
      leg({ distance_km: 14.1, gain_m: 210, loss_m: 60 }),
    ]);
    expect(t.distance_km).toBeCloseTo(24.3, 5);
    expect(t.gain_m).toBe(310);
    expect(t.loss_m).toBe(100);
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
    expect(formatTotals({ distance_km: 24.3, gain_m: 310, loss_m: 100, approx: false })).toBe(
      "24.3 km · +310 m"
    );
  });

  it("prefixes ~ when approximate", () => {
    expect(formatTotals({ distance_km: 5, gain_m: 0, loss_m: 0, approx: true })).toBe(
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

describe("legGeometryForChart", () => {
  it("returns [lat,lng,ele] triples with real elevations preserved", () => {
    const a = leg({
      coords: [
        [53.35, -6.26],
        [53.36, -6.27],
      ],
      elevations: [12, 18],
    });
    expect(legGeometryForChart([a])).toEqual([
      [53.35, -6.26, 12],
      [53.36, -6.27, 18],
    ]);
  });

  it("substitutes 0 for missing elevation so the chart reads it as no-data", () => {
    const a = leg({ elevations: [] });
    const triples = legGeometryForChart([a]);
    expect(triples.every((t) => t[2] === 0)).toBe(true);
    // An all-zero series is how ElevationProfile detects "no real data".
    expect(triples.some((t) => t[2] !== 0)).toBe(false);
  });

  it("dedupes the shared junction like concatLegGeometry", () => {
    const a = leg({
      coords: [
        [53.35, -6.26],
        [53.36, -6.27],
      ],
      elevations: [10, 20],
    });
    const b = leg({
      coords: [
        [53.36, -6.27],
        [53.37, -6.28],
      ],
      elevations: [20, 30],
    });
    expect(legGeometryForChart([a, b])).toEqual([
      [53.35, -6.26, 10],
      [53.36, -6.27, 20],
      [53.37, -6.28, 30],
    ]);
  });
});

describe("insertAnchorAtLeg", () => {
  const anchors: LatLng[] = [
    [0, 0],
    [1, 1],
    [2, 2],
  ];

  it("inserts the via between the two anchors of the given leg", () => {
    // leg 0 connects anchors[0] → anchors[1]; via lands at index 1.
    expect(insertAnchorAtLeg(anchors, 0, [0.5, 0.5])).toEqual([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [2, 2],
    ]);
  });

  it("inserts into a later leg at the correct position", () => {
    // leg 1 connects anchors[1] → anchors[2]; via lands at index 2.
    expect(insertAnchorAtLeg(anchors, 1, [1.5, 1.5])).toEqual([
      [0, 0],
      [1, 1],
      [1.5, 1.5],
      [2, 2],
    ]);
  });

  it("returns the array unchanged for an out-of-range leg index", () => {
    // legIndex 2 is the last anchor — no leg starts there (no closing leg here).
    expect(insertAnchorAtLeg(anchors, 2, [9, 9])).toBe(anchors);
    expect(insertAnchorAtLeg(anchors, -1, [9, 9])).toBe(anchors);
  });

  it("keeps the array length growing by exactly one", () => {
    const out = insertAnchorAtLeg(anchors, 0, [0.5, 0.5]);
    expect(out).toHaveLength(anchors.length + 1);
  });
});

describe("legHandlePoint", () => {
  it("returns the central vertex of the snapped geometry", () => {
    const a = leg({
      coords: [
        [0, 0],
        [1, 1], // central vertex of 3 → index 1
        [2, 2],
      ],
    });
    expect(legHandlePoint(a)).toEqual([1, 1]);
  });

  it("falls back to from/to midpoint vertex for a two-point straight leg", () => {
    const a = leg({ coords: [], from: [10, 10], to: [20, 20] });
    // coords empty → uses [from, to], floor(2/2) = index 1 → to
    expect(legHandlePoint(a)).toEqual([20, 20]);
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
