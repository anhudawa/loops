import { describe, it, expect } from "vitest";
import {
  detectIntervalSegments,
  segmentsForInterval,
} from "../interval-segments";

/**
 * Build a synthetic straight-line path with given per-km gradient.
 * `gradientsPerKm` is an array where each entry is the gradient (%) applied
 * to a 1km stretch. Points are placed every 100m along due-east.
 */
function syntheticPath(gradientsPerKm: number[]): {
  coords: [number, number][];
  elevations: number[];
} {
  const coords: [number, number][] = [];
  const elevations: number[] = [];

  // 1 degree of longitude ≈ 111.32 km at the equator; at 53° lat (Ireland)
  // it's ≈ 66.9 km. Use a constant ~111m per 0.001 degree for simplicity.
  const startLat = 53.35;
  const startLng = -6.26;
  let currentElev = 100;

  coords.push([startLat, startLng]);
  elevations.push(currentElev);

  for (let km = 0; km < gradientsPerKm.length; km++) {
    const g = gradientsPerKm[km];
    // 10 points per km (every 100m)
    for (let step = 1; step <= 10; step++) {
      const lng = startLng + (km + step / 10) * 0.00134; // ≈100m east in deg at 53° lat
      currentElev += g; // +g metres per 100m if gradient is % (g% × 100m = g metres)
      coords.push([startLat, lng]);
      elevations.push(currentElev);
    }
  }

  return { coords, elevations };
}

describe("detectIntervalSegments", () => {
  it("returns empty for too-short paths", () => {
    expect(detectIntervalSegments([], [])).toEqual([]);
    expect(
      detectIntervalSegments(
        [[53.35, -6.26], [53.351, -6.26]],
        [100, 105]
      )
    ).toEqual([]);
  });

  it("finds a long flat segment suitable for threshold", () => {
    // 12km of 0% gradient → classic threshold territory
    const { coords, elevations } = syntheticPath(Array(12).fill(0));
    const segs = detectIntervalSegments(coords, elevations);
    expect(segs.length).toBeGreaterThan(0);
    const flat = segs[0];
    expect(flat.length_km).toBeGreaterThan(5);
    expect(flat.suitable_zones).toContain("z4");
    expect(flat.suitable_zones).toContain("z3");
  });

  it("rejects wildly varying gradient (rollers) for threshold", () => {
    // Alternating +4% / -4% every km — zone 4 requires low variance
    const { coords, elevations } = syntheticPath([4, -4, 4, -4, 4, -4, 4, -4, 4, -4]);
    const segs = detectIntervalSegments(coords, elevations);
    // Whatever segments we find should NOT be z4-suitable
    for (const s of segs) {
      expect(s.suitable_zones).not.toContain("z4");
    }
  });

  it("a steady 2% climb qualifies for z4 (threshold on a drag)", () => {
    const { coords, elevations } = syntheticPath(Array(8).fill(2));
    const segs = detectIntervalSegments(coords, elevations);
    const z4Segs = segs.filter((s) => s.suitable_zones.includes("z4"));
    expect(z4Segs.length).toBeGreaterThan(0);
  });
});

describe("segmentsForInterval", () => {
  it("filters out segments too short to host the interval", () => {
    const { coords, elevations } = syntheticPath(Array(5).fill(0));
    const segs = detectIntervalSegments(coords, elevations);
    // A 5km flat run can host a short interval but not a 20 min threshold
    // (≈10.7 km at z4 pace, needs ≥10.7 km + safety margin)
    const forShort = segmentsForInterval(segs, "z4", 5);
    const forLong = segmentsForInterval(segs, "z4", 20);
    expect(forShort.length).toBeGreaterThanOrEqual(forLong.length);
  });
});
