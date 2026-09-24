import { describe, it, expect } from "vitest";
import { climbStats } from "@/lib/geo-utils";
import { trueClimb } from "@/lib/true-climb";

// A 10 km straight road rising 100 m, with ±2 m jitter every point (every 25 m).
const pts: number[][] = [];
for (let i = 0; i <= 400; i++) pts.push([53 + i * 0.000225, -6, 100 * (i / 400) + (i % 2 ? 2 : -2)]);

describe("climbStats", () => {
  it("counts the climb, not the jitter", () => {
    const { gain_m } = climbStats(pts.map((p) => [p[0], p[1]] as [number, number]), pts.map((p) => p[2]));
    expect(gain_m).toBeGreaterThan(85);
    expect(gain_m).toBeLessThan(115);
  });
  it("trueClimb corrects an inflated stored total, leaves a right one", () => {
    const coordinates = JSON.stringify(pts);
    expect(trueClimb({ coordinates, elevation_gain_m: 900, elevation_loss_m: 800 })?.gain).toBeLessThan(115);
    expect(trueClimb({ coordinates, elevation_gain_m: 100, elevation_loss_m: 0 })).toBeNull();
  });
});
