import { describe, it, expect } from "vitest";
import { classifyEdge, buildRoadReport, ROAD_RULES_VERSION } from "../road-segments";

describe("classifyEdge by discipline", () => {
  it("rough surface is unsuitable on a road bike, terrain on gravel", () => {
    const t = { highway: "track", smoothness: "bad", surface: "gravel" };
    expect(classifyEdge(t, "road")).toBe("unsuitable");
    expect(classifyEdge(t, "gravel")).toBeNull();
    expect(classifyEdge(t, "mtb")).toBeNull();
  });
  it("horrible stays unsuitable for gravel; only impassable for mtb", () => {
    expect(classifyEdge({ highway: "path", smoothness: "horrible" }, "gravel")).toBe("unsuitable");
    expect(classifyEdge({ highway: "path", smoothness: "horrible" }, "mtb")).toBeNull();
    expect(classifyEdge({ highway: "path", smoothness: "impassable" }, "mtb")).toBe("unsuitable");
  });
  it("class:bicycle -2 is a road-bike judgement; -3 is for everyone", () => {
    expect(classifyEdge({ highway: "track", "class:bicycle": "-2" }, "road")).toBe("unsuitable");
    expect(classifyEdge({ highway: "track", "class:bicycle": "-2" }, "gravel")).toBeNull();
    expect(classifyEdge({ highway: "track", "class:bicycle": "-3" }, "gravel")).toBe("unsuitable");
  });
  it("access bans and fords are unsuitable for every discipline", () => {
    for (const d of ["road", "gravel", "mtb"] as const) {
      expect(classifyEdge({ highway: "tertiary", bicycle: "no" }, d)).toBe("unsuitable");
      expect(classifyEdge({ highway: "track", ford: "yes" }, d)).toBe("unsuitable");
    }
  });
  it("stamps reports with the rules version", () => {
    const r = buildRoadReport([[53, -6.2], [53.01, -6.2]], [{ highway: "tertiary", surface: "asphalt" }], "road");
    expect(r.rules_version).toBe(ROAD_RULES_VERSION);
    expect(r.standard_met).toBe(true);
  });
});

describe("main-road crossings", () => {
  // ~11 m per edge at this latitude step; 6 edges ≈ 66 m, 14 edges ≈ 155 m.
  const step = 0.0001;
  const line = (n: number): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [53 + i * step, -6.2]);
  const tags = (n: number, from: number, to: number) =>
    Array.from({ length: n }, (_, i) => (i >= from && i < to ? { highway: "primary", surface: "asphalt" } : { highway: "tertiary", surface: "asphalt" }));
  it("a 60-70 m crossing of a primary is a junction, not a compromise", () => {
    const r = buildRoadReport(line(60), tags(60, 30, 36), "road");
    expect(r.compromises).toEqual([]);
    expect(r.standard_met).toBe(true);
    expect(r.main_road_pct).toBeGreaterThan(0); // still counted in the share
  });
  it("150 m along a primary is a compromise", () => {
    const r = buildRoadReport(line(60), tags(60, 30, 44), "road");
    expect(r.compromises.length).toBe(1);
    expect(r.compromises[0].kind).toBe("main_road");
    expect(r.standard_met).toBe(false);
  });
  it("a 50 m gravel patch still counts on a road ride", () => {
    const t = Array.from({ length: 60 }, (_, i) => (i >= 30 && i < 35 ? { highway: "track", surface: "gravel" } : { highway: "tertiary", surface: "asphalt" }));
    const r = buildRoadReport(line(60), t, "road");
    expect(r.compromises.some((c) => c.kind === "unpaved")).toBe(true);
  });
});

describe("compromise position", () => {
  it("each stretch carries its midpoint for the map", () => {
    const step = 0.0001;
    const line: [number, number][] = Array.from({ length: 61 }, (_, i) => [53 + i * step, -6.2]);
    const tags = Array.from({ length: 60 }, (_, i) => (i >= 30 && i < 44 ? { highway: "primary", surface: "asphalt" } : { highway: "tertiary", surface: "asphalt" }));
    const r = buildRoadReport(line, tags, "road");
    expect(r.compromises[0].at?.[0]).toBeCloseTo(53 + 37 * step, 5);
    expect(r.rules_version).toBe(ROAD_RULES_VERSION);
  });
});

describe("partly measured routes", () => {
  it("says how much was measured and never counts unknown as unpaved", () => {
    const step = 0.0001;
    const line: [number, number][] = Array.from({ length: 101 }, (_, i) => [53 + i * step, -6.2]);
    // first 70 edges tagged tertiary asphalt, last 30 untagged (could not be traced)
    const tags = Array.from({ length: 100 }, (_, i) => (i < 70 ? { highway: "tertiary", surface: "asphalt" } : null));
    const r = buildRoadReport(line, tags, "road");
    expect(r.known_pct).toBe(70);
    expect(r.standard_met).toBe(true);
    expect(r.summary).toContain("100% paved");
    expect(r.summary).toContain("measured on 70% of the route");
  });
});
