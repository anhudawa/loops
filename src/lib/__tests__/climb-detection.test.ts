import { describe, it, expect } from "vitest";
import { haversine, smoothElevations, computeGradients, gradientColor, CATEGORY_COLORS, detectClimbs, categoriseClimb, downsample, tooltipGradient, type Climb } from "../climb-detection";

describe("haversine", () => {
  it("returns 0 for same point", () => {
    expect(haversine([53.3498, -6.2603], [53.3498, -6.2603])).toBe(0);
  });

  it("calculates Dublin to Cork ≈ 220km", () => {
    const d = haversine([53.3498, -6.2603], [51.8985, -8.4756]);
    expect(d).toBeGreaterThan(210);
    expect(d).toBeLessThan(230);
  });

  it("calculates short distance accurately", () => {
    // ~111m (0.001 degree latitude ≈ 111m)
    const d = haversine([53.35, -6.26], [53.351, -6.26]);
    expect(d).toBeGreaterThan(0.1);
    expect(d).toBeLessThan(0.12);
  });
});

describe("smoothElevations", () => {
  it("returns same array for fewer than 5 points", () => {
    const input = [100, 200, 150];
    expect(smoothElevations(input)).toEqual([100, 200, 150]);
  });

  it("smooths a spike in the middle", () => {
    const input = [100, 100, 100, 200, 100, 100, 100];
    const result = smoothElevations(input);
    expect(result[3]).toBeLessThan(160);
    expect(result[3]).toBeGreaterThan(100);
  });

  it("preserves endpoints approximately", () => {
    const input = [100, 110, 120, 130, 140, 150, 160];
    const result = smoothElevations(input);
    expect(Math.abs(result[0] - 100)).toBeLessThan(15);
    expect(Math.abs(result[6] - 160)).toBeLessThan(15);
  });

  it("handles flat terrain", () => {
    const input = [100, 100, 100, 100, 100, 100, 100];
    const result = smoothElevations(input);
    result.forEach((v) => expect(v).toBe(100));
  });
});

describe("computeGradients", () => {
  it("computes positive gradient for uphill", () => {
    // 100m gain over 1km = 10%
    const elevations = [0, 100];
    const distances = [0, 1]; // km
    const grads = computeGradients(elevations, distances);
    expect(grads[0]).toBeCloseTo(10, 0);
  });

  it("computes negative gradient for downhill", () => {
    const elevations = [100, 0];
    const distances = [0, 1];
    const grads = computeGradients(elevations, distances);
    expect(grads[0]).toBeCloseTo(-10, 0);
  });

  it("returns empty for single point", () => {
    expect(computeGradients([100], [0])).toEqual([]);
  });
});

describe("gradientColor", () => {
  it("returns green for flat/easy gradients", () => {
    expect(gradientColor(0)).toBe("#00ff88");
    expect(gradientColor(2)).toBe("#00ff88");
  });

  it("returns purple for steep gradients", () => {
    expect(gradientColor(12)).toBe("#cc33ff");
  });

  it("returns blue-grey for descents", () => {
    expect(gradientColor(-5)).toBe("#6688aa");
  });
});

describe("CATEGORY_COLORS", () => {
  it("has entries for all categories", () => {
    expect(CATEGORY_COLORS.HC).toBe("#cc33ff");
    expect(CATEGORY_COLORS["Cat 1"]).toBe("#ff5533");
    expect(CATEGORY_COLORS["Cat 2"]).toBe("#ffbb00");
    expect(CATEGORY_COLORS["Cat 3"]).toBe("#bbff00");
    expect(CATEGORY_COLORS["Cat 4"]).toBe("#00ff88");
  });
});

describe("categoriseClimb", () => {
  it("returns HC for score >= 80", () => {
    expect(categoriseClimb(10, 8.5)).toBe("HC"); // 10 * 8.5 = 85
  });

  it("returns Cat 1 for score 40-79", () => {
    expect(categoriseClimb(8, 6)).toBe("Cat 1"); // 48
  });

  it("returns Cat 2 for score 20-39", () => {
    expect(categoriseClimb(5, 5)).toBe("Cat 2"); // 25
  });

  it("returns Cat 3 for score 8-19", () => {
    expect(categoriseClimb(3, 4)).toBe("Cat 3"); // 12
  });

  it("returns Cat 4 for score 3-7", () => {
    expect(categoriseClimb(1, 4)).toBe("Cat 4"); // 4
  });

  it("returns null for score < 3", () => {
    expect(categoriseClimb(0.5, 3)).toBeNull(); // 1.5
  });
});

describe("detectClimbs", () => {
  it("returns empty for flat terrain", () => {
    const coords: [number, number, number][] = Array.from({ length: 100 }, (_, i) => [
      53.35 + i * 0.001,
      -6.26,
      100,
    ]);
    const climbs = detectClimbs(coords);
    expect(climbs).toEqual([]);
  });

  it("detects a single significant climb", () => {
    // Build a route: flat, then 3km at ~8% (240m gain), then flat
    const coords: [number, number, number][] = [];
    for (let i = 0; i < 200; i++) {
      const km = i * 0.05; // 0.05km per point = 10km total
      let elev = 100;
      if (km >= 2 && km <= 5) {
        elev = 100 + ((km - 2) / 3) * 240; // 240m over 3km = 8%
      } else if (km > 5) {
        elev = 340;
      }
      coords.push([53.35 + i * 0.0005, -6.26, elev]);
    }

    const climbs = detectClimbs(coords);
    expect(climbs.length).toBeGreaterThanOrEqual(1);
    const mainClimb = climbs[0];
    expect(mainClimb.gain).toBeGreaterThan(180); // smoothing may reduce slightly
    expect(mainClimb.category).not.toBeNull();
  });

  it("returns empty for < 5 coordinates", () => {
    const coords: [number, number, number][] = [
      [53.35, -6.26, 100],
      [53.351, -6.26, 200],
    ];
    expect(detectClimbs(coords)).toEqual([]);
  });

  it("filters out climbs with < 30m gain", () => {
    const coords: [number, number, number][] = [];
    for (let i = 0; i < 100; i++) {
      const km = i * 0.05;
      const elev = km < 2 ? 100 : km < 3 ? 100 + ((km - 2) * 20) : 120;
      coords.push([53.35 + i * 0.0005, -6.26, elev]);
    }
    const climbs = detectClimbs(coords);
    expect(climbs).toEqual([]);
  });

  it("orders climbs by start km ascending", () => {
    const coords: [number, number, number][] = [];
    for (let i = 0; i < 200; i++) {
      const km = i * 0.05;
      let elev = 100;
      if (km >= 1 && km <= 3) {
        elev = 100 + ((km - 1) / 2) * 100;
      } else if (km > 3 && km < 5) {
        elev = 200;
      } else if (km >= 5 && km <= 7) {
        elev = 200 + ((km - 5) / 2) * 100;
      } else if (km > 7) {
        elev = 300;
      }
      coords.push([53.35 + i * 0.0005, -6.26, elev]);
    }
    const climbs = detectClimbs(coords);
    if (climbs.length >= 2) {
      expect(climbs[0].startKm).toBeLessThan(climbs[1].startKm);
    }
  });
});

describe("downsample", () => {
  it("returns original if under maxPoints", () => {
    const data = [1, 2, 3, 4, 5];
    expect(downsample(data, 10)).toEqual(data);
  });

  it("reduces array size", () => {
    const data = Array.from({ length: 1000 }, (_, i) => Math.sin(i / 100) * 100);
    const result = downsample(data, 200);
    expect(result.length).toBe(200);
  });

  it("preserves first and last values", () => {
    const data = Array.from({ length: 500 }, (_, i) => i);
    const result = downsample(data, 100);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(499);
  });
});

describe("tooltipGradient", () => {
  it("averages over ±3 window", () => {
    const gradients = [2, 2, 2, 10, 2, 2, 2];
    const result = tooltipGradient(gradients, 3);
    // Average of all 7 = (2*6 + 10) / 7 ≈ 3.14
    expect(result).toBeCloseTo(3.14, 1);
  });

  it("handles edge indices", () => {
    const gradients = [5, 5, 5, 5, 5];
    expect(tooltipGradient(gradients, 0)).toBeCloseTo(5, 1);
    expect(tooltipGradient(gradients, 4)).toBeCloseTo(5, 1);
  });
});
