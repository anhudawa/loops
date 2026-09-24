import { describe, it, expect } from "vitest";
import { autoTitle } from "@/lib/route-title";
import { pickByDistanceFit } from "@/lib/route-generator";
import { summaryParts, type Compromise } from "@/lib/road-segments";

describe("autoTitle: a far town must be on the route", () => {
  // A loop 10 km north and back; a town 3 km off the far point, one on it.
  const loop: [number, number][] = [];
  for (let i = 0; i <= 50; i++) loop.push([53 + i * 0.0018, -6]);
  for (let i = 50; i >= 0; i--) loop.push([53 + i * 0.0018, -6.01]);
  const far: [number, number] = [53.09, -6];
  it("names a town the ride passes", () => {
    const place = (p: [number, number], max: number) =>
      Math.hypot((p[0] - 53) * 111, (p[1] + 6) * 67) < 1 ? "Start" : Math.hypot((p[0] - far[0]) * 111, (p[1] - far[1]) * 67) <= max ? "Onroute" : null;
    expect(autoTitle(loop, 20, place)).toBe("Start – Onroute – Start · 20 km");
  });
  it("does not name a town 3 km off the route", () => {
    const off: [number, number] = [53.09, -5.955]; // ~3 km east
    const place = (p: [number, number], max: number) =>
      Math.hypot((p[0] - 53) * 111, (p[1] + 6) * 67) < 1 ? "Start" : Math.hypot((p[0] - off[0]) * 111, (p[1] - off[1]) * 67) <= max ? "Faraway" : null;
    expect(autoTitle(loop, 20, place)).toBe("Start loop · 20 km");
  });
});

describe("pickByDistanceFit: a hilly ask's climbing before the distance band", () => {
  it("serves the loop that climbs first", () => {
    const flatClose = { distance_km: 78, road_report: { standard_met: true }, climbs: false };
    const hillyFar = { distance_km: 67, road_report: { standard_met: true }, climbs: true };
    const out = pickByDistanceFit([flatClose, hillyFar], 80, true, 3, (c) => c.climbs);
    expect(out[0]).toBe(hillyFar);
  });
});

describe("summaryParts: one road, one line", () => {
  it("merges stretches of the same road and kind", () => {
    const c = (meters: number): Compromise => ({ kind: "fast_road", start: 0, end: 1, meters, highway: "secondary", maxspeed: "80", name: "R122" });
    const s = summaryParts([c(636), c(133)]);
    expect(s).toContain("769 m");
    expect(s.match(/R122/g)?.length).toBe(1);
  });
});
