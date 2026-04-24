import { describe, it, expect } from "vitest";
import {
  detectIntervalSegments,
  segmentsForInterval,
  hasSignificantDescent,
  DESCENT_THRESHOLDS,
  DESCENT_WINDOW_KM,
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
  it("hasSignificantDescent detects a 50m drop over 500m", () => {
    // Direct unit test of the descent-scanning function.
    // Build synthetic smoothed-elevation and cumulative-distance arrays:
    // 5km flat at 100m → 500m dropping 50m (100→50) → 5km flat at 50m
    // Points every 100m.
    const smoothedElev: number[] = [];
    const cumDistKm: number[] = [];
    const stepKm = 0.1; // 100m

    // 50 flat points (5km) at 100m elevation
    for (let i = 0; i < 50; i++) {
      smoothedElev.push(100);
      cumDistKm.push(i * stepKm);
    }
    // 5 descent points (500m), dropping 10m each (50m total)
    for (let i = 0; i < 5; i++) {
      smoothedElev.push(90 - i * 10);
      cumDistKm.push((50 + i) * stepKm);
    }
    // 50 flat points (5km) at 50m elevation
    for (let i = 0; i < 50; i++) {
      smoothedElev.push(50);
      cumDistKm.push((55 + i) * stepKm);
    }

    // z4 threshold: >30m over 500m → should be detected
    expect(
      hasSignificantDescent(0, smoothedElev.length - 1, smoothedElev, cumDistKm, 30)
    ).toBe(true);

    // z5 threshold: >50m over 500m → should NOT be detected (drop is exactly 50m
    // but the sliding window might not align perfectly)
    // The window from index 49 (elev=100) to index 54 (elev=50) spans 500m and drops 50m.
    // Since the check is >, 50 > 50 is false.
    expect(
      hasSignificantDescent(0, smoothedElev.length - 1, smoothedElev, cumDistKm, 50)
    ).toBe(false);

    // A lower threshold of 25m → should also be detected
    expect(
      hasSignificantDescent(0, smoothedElev.length - 1, smoothedElev, cumDistKm, 25)
    ).toBe(true);
  });

  it("hasSignificantDescent returns false for a flat segment", () => {
    const smoothedElev = Array(100).fill(100);
    const cumDistKm = Array.from({ length: 100 }, (_, i) => i * 0.1);

    expect(
      hasSignificantDescent(0, 99, smoothedElev, cumDistKm, 30)
    ).toBe(false);
  });

  it("hasSignificantDescent only checks the specified index range", () => {
    // Full array has a descent, but the sub-range we check does not.
    const smoothedElev: number[] = [];
    const cumDistKm: number[] = [];
    // 50 flat points
    for (let i = 0; i < 50; i++) {
      smoothedElev.push(100);
      cumDistKm.push(i * 0.1);
    }
    // 5 descent points (50m drop)
    for (let i = 0; i < 5; i++) {
      smoothedElev.push(90 - i * 10);
      cumDistKm.push((50 + i) * 0.1);
    }
    // 50 flat points at 50m
    for (let i = 0; i < 50; i++) {
      smoothedElev.push(50);
      cumDistKm.push((55 + i) * 0.1);
    }

    // Check only the flat section before the descent (indices 0-45)
    expect(
      hasSignificantDescent(0, 45, smoothedElev, cumDistKm, 30)
    ).toBe(false);

    // Check only the flat section after the descent (indices 55-104)
    expect(
      hasSignificantDescent(55, 104, smoothedElev, cumDistKm, 30)
    ).toBe(false);
  });

  it("z4 does not span a segment with a 50m descent in the middle", () => {
    // 5km flat → 300m with -50m descent → 5km flat
    // The descent is ~16.7% downhill over 300m, which is 50m drop —
    // far beyond what any sustained-effort zone tolerates.
    const { coords, elevations } = syntheticPathFine([
      { lengthKm: 5, gradient: 0 },       // flat: 5km
      { lengthKm: 0.3, gradient: -16.67 }, // descend 50m over 300m (3 steps × -16.67m)
      { lengthKm: 5, gradient: 0 },        // flat: 5km
    ]);

    const segs = detectIntervalSegments(coords, elevations, { minLengthKm: 2 });

    // The route should be split into two separate segments — one before
    // the descent and one after. Both sides have ~5km of flat terrain.
    expect(segs.length).toBeGreaterThanOrEqual(2);

    // No single segment should span the full ~10.3km route.
    for (const seg of segs) {
      expect(seg.length_km).toBeLessThan(8);
    }

    // z4 (threshold) should not appear on any segment that includes the
    // descent. The steep gradient and descent detection both prevent this.
    const z4Spanning = segs.filter(
      (s) => s.suitable_zones.includes("z4") && s.length_km > 8
    );
    expect(z4Spanning.length).toBe(0);

    // The two segments should be on opposite sides of the descent
    expect(segs[0].end_index).toBeLessThanOrEqual(55);
    expect(segs[1].start_index).toBeGreaterThanOrEqual(48);
  });

  it("descent thresholds are defined for z3, z4, z5 only", () => {
    // Verify configuration: only sustained-effort zones have descent checks
    expect(DESCENT_THRESHOLDS.z3).toBe(30);
    expect(DESCENT_THRESHOLDS.z4).toBe(30);
    expect(DESCENT_THRESHOLDS.z5).toBe(50);
    expect(DESCENT_THRESHOLDS.z1).toBeUndefined();
    expect(DESCENT_THRESHOLDS.z2).toBeUndefined();
    expect(DESCENT_THRESHOLDS.z6).toBeUndefined();
    expect(DESCENT_THRESHOLDS.z7).toBeUndefined();
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
