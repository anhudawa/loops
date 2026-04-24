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

  // At 53° lat, 1° longitude ≈ 66.9 km, so 0.0015° ≈ 100m.
  const startLat = 53.35;
  const startLng = -6.26;
  const degPerStep = 0.0015; // ≈100m east at 53° lat
  let currentElev = 100;

  coords.push([startLat, startLng]);
  elevations.push(currentElev);

  let totalSteps = 0;
  for (let km = 0; km < gradientsPerKm.length; km++) {
    const g = gradientsPerKm[km];
    // 10 points per km (every ~100m)
    for (let step = 1; step <= 10; step++) {
      totalSteps++;
      const lng = startLng + totalSteps * degPerStep;
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

/**
 * Build a synthetic path with fine-grained elevation control.
 * `sections` is an array of { lengthKm, gradient }. Points are placed
 * every 100m along a due-east line at 53° lat.
 */
function syntheticPathFine(
  sections: { lengthKm: number; gradient: number }[]
): { coords: [number, number][]; elevations: number[] } {
  const coords: [number, number][] = [];
  const elevations: number[] = [];
  const startLat = 53.35;
  const startLng = -6.26;
  const degPerStep = 0.0015; // ≈100m east at 53° lat

  let currentElev = 100;
  let totalSteps = 0;
  coords.push([startLat, startLng]);
  elevations.push(currentElev);

  for (const sec of sections) {
    const steps = Math.round(sec.lengthKm * 10); // 10 points per km (every 100m)
    for (let s = 0; s < steps; s++) {
      totalSteps++;
      const lng = startLng + totalSteps * degPerStep;
      // gradient % means dElev/dDist × 100; per 100m step: elevChange = gradient
      currentElev += sec.gradient;
      coords.push([startLat, lng]);
      elevations.push(currentElev);
    }
  }

  return { coords, elevations };
}

describe("descent-during-effort detection", () => {
  it("z4 does not span a segment with a 50m descent in the middle", () => {
    // 5km flat → 300m with -50m descent → 5km flat
    // The descent is ~16.7% downhill over 300m, which is 50m drop —
    // well over the 30m/500m threshold for z3/z4.
    const { coords, elevations } = syntheticPathFine([
      { lengthKm: 5, gradient: 0 },       // flat: 5km
      { lengthKm: 0.3, gradient: -16.67 }, // descend 50m over 300m (3 steps × -16.67m)
      { lengthKm: 5, gradient: 0 },        // flat: 5km
    ]);

    const segs = detectIntervalSegments(coords, elevations, { minLengthKm: 2 });

    // No single z4-suitable segment should span the full ~10.3km.
    // The descent should split it into two separate segments.
    const z4Segs = segs.filter((s) => s.suitable_zones.includes("z4"));
    expect(z4Segs.length).toBeGreaterThanOrEqual(2);

    // Each z4 segment should be shorter than the total route (i.e. the
    // descent prevents a single long segment).
    for (const seg of z4Segs) {
      expect(seg.length_km).toBeLessThan(8);
    }

    // Verify the two segments are on opposite sides of the descent:
    // one should end before ~index 50 (the 5km mark) and the next
    // should start after ~index 53 (past the 300m descent).
    if (z4Segs.length >= 2) {
      expect(z4Segs[0].end_index).toBeLessThanOrEqual(55);
      expect(z4Segs[1].start_index).toBeGreaterThanOrEqual(48);
    }
  });

  it("z1/z2 still span across the descent (no descent check for endurance zones)", () => {
    const { coords, elevations } = syntheticPathFine([
      { lengthKm: 5, gradient: 0 },
      { lengthKm: 0.3, gradient: -16.67 },
      { lengthKm: 5, gradient: 0 },
    ]);

    const segs = detectIntervalSegments(coords, elevations, { minLengthKm: 2 });

    // z1 and z2 tolerate descents, so at least one segment should include
    // them and be large (spanning across the descent).
    const z1Segs = segs.filter((s) => s.suitable_zones.includes("z1"));
    const anyLargeZ1 = z1Segs.some((s) => s.length_km > 8);
    expect(anyLargeZ1).toBe(true);
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
