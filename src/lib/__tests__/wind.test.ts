import { describe, it, expect } from "vitest";
import {
  bearing,
  compassPoint,
  windAlignment,
  alignmentScore,
  analyzeWind,
  MIN_WIND_KMH,
  type WindForecast,
} from "../wind";

/**
 * Synthetic out-and-back loop: ride due north for ~11 km, then due south
 * back to the start. First half bearing ≈ 0°, second half ≈ 180°.
 */
function northSouthLoop(): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= 10; i++) coords.push([53.0 + i * 0.01, -6.3]);
  for (let i = 9; i >= 0; i--) coords.push([53.0 + i * 0.01, -6.3]);
  return coords;
}

function forecast(direction_deg: number, speed_kmh: number): WindForecast {
  return { direction_deg, speed_kmh, forecast_time: "2026-06-10T12:00" };
}

describe("bearing", () => {
  it("computes cardinal bearings", () => {
    expect(bearing([53.0, -6.3], [53.1, -6.3])).toBeCloseTo(0, 0);   // north
    expect(bearing([53.1, -6.3], [53.0, -6.3])).toBeCloseTo(180, 0); // south
    expect(bearing([53.0, -6.3], [53.0, -6.1])).toBeCloseTo(90, 0);  // east
  });
});

describe("compassPoint", () => {
  it("maps degrees to 16-point compass", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(225)).toBe("SW");
    expect(compassPoint(90)).toBe("E");
    expect(compassPoint(359)).toBe("N");
  });
});

describe("windAlignment", () => {
  const loop = northSouthLoop();

  it("northerly wind is a tailwind on the southbound home leg", () => {
    // Wind FROM north blows TO the south; home leg rides south.
    expect(windAlignment(loop, 0, "home")).toBeGreaterThan(0.9);
    expect(windAlignment(loop, 0, "out")).toBeLessThan(-0.9);
  });

  it("southerly wind is the opposite", () => {
    expect(windAlignment(loop, 180, "home")).toBeLessThan(-0.9);
    expect(windAlignment(loop, 180, "out")).toBeGreaterThan(0.9);
  });

  it("crosswind is near zero on both legs", () => {
    expect(Math.abs(windAlignment(loop, 90, "home"))).toBeLessThan(0.1);
    expect(Math.abs(windAlignment(loop, 90, "out"))).toBeLessThan(0.1);
  });

  it("out-and-back nets to zero over the whole route", () => {
    expect(Math.abs(windAlignment(loop, 0, "all"))).toBeLessThan(0.1);
  });
});

describe("alignmentScore", () => {
  const loop = northSouthLoop();

  it("rewards tailwind_home when the home leg rides downwind", () => {
    expect(alignmentScore(loop, forecast(0, 20), "tailwind_home")).toBeGreaterThan(90);
    expect(alignmentScore(loop, forecast(180, 20), "tailwind_home")).toBeLessThan(10);
  });

  it("headwind_out rewards riding into the wind first", () => {
    expect(alignmentScore(loop, forecast(0, 20), "headwind_out")).toBeGreaterThan(90);
  });

  it("returns neutral 50 for light wind or no strategy", () => {
    expect(alignmentScore(loop, forecast(0, MIN_WIND_KMH - 1), "tailwind_home")).toBe(50);
    expect(alignmentScore(loop, forecast(0, 30), "none")).toBe(50);
  });
});

describe("analyzeWind", () => {
  const loop = northSouthLoop();

  it("says so when wind is too light to matter", () => {
    const a = analyzeWind(loop, forecast(225, 5), "tailwind_home");
    expect(a.alignment_score).toBe(50);
    expect(a.note).toMatch(/light/i);
  });

  it("describes a well-oriented tailwind-home loop", () => {
    const a = analyzeWind(loop, forecast(0, 18), "tailwind_home");
    expect(a.alignment_score).toBeGreaterThan(90);
    expect(a.note).toContain("N 18 km/h");
    expect(a.note).toMatch(/back for the run home/i);
  });

  it("admits when the loop could not be oriented for the request", () => {
    const a = analyzeWind(loop, forecast(180, 18), "tailwind_home");
    expect(a.alignment_score).toBeLessThan(10);
    expect(a.note).toMatch(/couldn't be fully oriented/i);
  });

  it("splits headwind and tailwind distance honestly", () => {
    const a = analyzeWind(loop, forecast(0, 18), "tailwind_home");
    // ~11 km out into the wind, ~11 km home with it.
    expect(a.headwind_km).toBeGreaterThan(8);
    expect(a.tailwind_km).toBeGreaterThan(8);
    expect(a.crosswind_km).toBeLessThan(2);
  });
});
