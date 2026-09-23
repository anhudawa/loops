import { describe, it, expect } from "vitest";
import { validRoadReport, mergeLoopReport } from "../library-road-report";
import type { RoadReport } from "../road-segments";

const clean: RoadReport = {
  known_pct: 60, road_class_pct: { tertiary: 60 }, surface: { paved_pct: 60, unpaved_pct: 0, unknown_pct: 40 },
  main_road_pct: 0, fast_road_pct: 0, compromises: [], standard_met: true, summary: "legs ok",
};
const loopBad: RoadReport = {
  known_pct: 100, road_class_pct: { primary: 10, tertiary: 90 }, surface: { paved_pct: 100, unpaved_pct: 0, unknown_pct: 0 },
  main_road_pct: 10, fast_road_pct: 0, standard_met: false, summary: "Compromise: 5.0 km on a primary road (main road).",
  compromises: [{ kind: "main_road", start: 40, end: 90, meters: 5000, highway: "primary", name: "Ma-2200" }],
};

describe("validRoadReport", () => {
  it("accepts a stored report and rejects junk", () => {
    expect(validRoadReport(loopBad)).toBe(loopBad);
    expect(validRoadReport(null)).toBeUndefined();
    expect(validRoadReport({ summary: "x" })).toBeUndefined();
    expect(validRoadReport("Meets the standard")).toBeUndefined();
  });
});

describe("mergeLoopReport", () => {
  const built = "New loop from your start: 10 km out, the full verified loop, 10 km home.";
  it("names the verified loop's compromises and fails the standard", () => {
    const m = mergeLoopReport(clean, loopBad, 40, 60, built);
    expect(m.standard_met).toBe(false);
    expect(m.summary).toContain("on the verified loop: 5.0 km on the Ma-2200");
    expect(m.compromises).toHaveLength(1);
    expect(m.compromises[0].start).toBe(0); // indices do not map onto the stitched track
    // 10 % of a 40 km loop over a 60 km ride ≈ 7 %
    expect(m.main_road_pct).toBe(7);
    expect(m.known_pct).toBe(100); // 60 + 67, clamped
  });
  it("whole ride clean when both legs and loop meet the standard", () => {
    const m = mergeLoopReport(clean, { ...loopBad, standard_met: true, compromises: [], main_road_pct: 0 }, 40, 60, built);
    expect(m.standard_met).toBe(true);
    expect(m.summary).toContain("whole ride meets the Loops road standard");
  });
  it("keeps the legs-only wording when the loop has no report", () => {
    const m = mergeLoopReport(clean, undefined, 40, 60, built);
    expect(m.summary).toContain("Out and home meet the Loops road standard");
    expect(m.standard_met).toBe(true);
  });
});
