import { describe, it, expect } from "vitest";
import { downsampleByInterval, elevationGainFromSeries } from "../elevation";

describe("downsampleByInterval", () => {
  it("returns empty result for empty input", () => {
    const out = downsampleByInterval([], 200);
    expect(out.coords).toEqual([]);
    expect(out.indices).toEqual([]);
  });

  it("keeps first and last point even if route is very short", () => {
    const coords: [number, number][] = [
      [53.35, -6.26],
      [53.351, -6.26],
    ];
    const out = downsampleByInterval(coords, 200);
    expect(out.coords[0]).toEqual([53.35, -6.26]);
    expect(out.coords[out.coords.length - 1]).toEqual([53.351, -6.26]);
  });

  it("downsamples densely packed points to the target interval", () => {
    // 1000 points ~1m apart (≈1km total)
    const coords: [number, number][] = Array.from({ length: 1000 }, (_, i) => [
      53.35 + i * 0.00001,
      -6.26,
    ]);
    const out = downsampleByInterval(coords, 200);
    // ~1111m route sampled at 200m → ~5-7 points, always inclusive of ends
    expect(out.coords.length).toBeGreaterThanOrEqual(5);
    expect(out.coords.length).toBeLessThanOrEqual(8);
  });
});

describe("elevationGainFromSeries", () => {
  it("returns 0 for empty or single-point series", () => {
    expect(elevationGainFromSeries([])).toBe(0);
    expect(elevationGainFromSeries([100])).toBe(0);
  });

  it("sums only positive elevation deltas", () => {
    // 100 → 200 → 150 → 250, raw gain = 100 + 100 = 200
    // After 5-point smoothing, values blur but total gain should stay roughly comparable
    const gain = elevationGainFromSeries([100, 200, 150, 250, 200]);
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(300);
  });

  it("returns 0 for a strictly descending series", () => {
    expect(elevationGainFromSeries([500, 400, 300, 200, 100, 50])).toBe(0);
  });

  it("ignores noise via smoothing (single-point spike)", () => {
    // A lone spike should be damped, not counted as 100m of climbing
    const flat = [100, 100, 100, 100, 100, 100, 100];
    const spiked = [100, 100, 100, 200, 100, 100, 100];
    const flatGain = elevationGainFromSeries(flat);
    const spikedGain = elevationGainFromSeries(spiked);
    // Smoothing will absorb much of the spike
    expect(spikedGain - flatGain).toBeLessThan(50);
  });
});
