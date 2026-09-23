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
