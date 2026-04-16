import { describe, it, expect } from "vitest";
import { durationToDistanceKm } from "../route-intent";

describe("durationToDistanceKm", () => {
  it("converts 2 hours on flat road to ~52km", () => {
    expect(durationToDistanceKm(120, "road", "flat")).toBe(52);
  });

  it("reduces distance when the route is hilly", () => {
    const flat = durationToDistanceKm(120, "road", "flat");
    const hilly = durationToDistanceKm(120, "road", "hilly");
    expect(hilly).toBeLessThan(flat);
  });

  it("gravel covers less distance than road for same time and terrain", () => {
    const road = durationToDistanceKm(90, "road", "flat");
    const gravel = durationToDistanceKm(90, "gravel", "flat");
    expect(gravel).toBeLessThan(road);
  });

  it("mtb is the slowest discipline", () => {
    const road = durationToDistanceKm(60, "road", "any");
    const gravel = durationToDistanceKm(60, "gravel", "any");
    const mtb = durationToDistanceKm(60, "mtb", "any");
    expect(mtb).toBeLessThan(gravel);
    expect(gravel).toBeLessThan(road);
  });

  it("handles short durations", () => {
    // 30 minutes on flat road ≈ 13km
    expect(durationToDistanceKm(30, "road", "flat")).toBe(13);
  });
});
