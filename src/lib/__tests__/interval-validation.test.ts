import { describe, it, expect } from "vitest";
import { filterCleanSegments, type ValidatedSegment } from "../interval-validation";

function makeSegment(overrides: Partial<ValidatedSegment> = {}): ValidatedSegment {
  return {
    start_index: 0,
    end_index: 10,
    length_km: 5,
    avg_gradient_pct: 1,
    max_gradient_pct: 3,
    gradient_variance: 0.5,
    suitable_zones: ["z4"],
    issues: [],
    has_blocking_issues: false,
    ...overrides,
  };
}

describe("filterCleanSegments", () => {
  it("keeps segments with no issues", () => {
    const clean = makeSegment();
    expect(filterCleanSegments([clean])).toEqual([clean]);
  });

  it("drops segments with blocking issues (traffic signals)", () => {
    const blocked = makeSegment({
      issues: [
        { type: "traffic_signal", lat: 53.35, lng: -6.26, detail: "Traffic signal 12m from route" },
      ],
      has_blocking_issues: true,
    });
    expect(filterCleanSegments([blocked])).toEqual([]);
  });

  it("treats unverified segments as NOT clean (Overpass down ≠ no junctions)", () => {
    const unverified = makeSegment({
      issues: [
        {
          type: "unverified",
          lat: 53.35,
          lng: -6.26,
          detail: "Road data unavailable — junctions on this segment could not be verified",
        },
      ],
      // non-blocking: it's an honesty flag, not a confirmed hazard
      has_blocking_issues: false,
    });
    expect(filterCleanSegments([unverified])).toEqual([]);
  });

  it("keeps clean segments while dropping unverified ones in the same batch", () => {
    const clean = makeSegment();
    const unverified = makeSegment({
      start_index: 20,
      end_index: 30,
      issues: [{ type: "unverified", lat: 53.4, lng: -6.3, detail: "Road data unavailable" }],
    });
    expect(filterCleanSegments([clean, unverified])).toEqual([clean]);
  });
});
