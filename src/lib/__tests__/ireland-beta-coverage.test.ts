import { describe, expect, it } from "vitest";
import {
  discoveryCoverageCases,
  workoutCoverageCases,
} from "../../../scripts/ireland-beta-coverage-cases";
import { IRELAND_BETA_SESSION_TYPES } from "@/lib/workout";

describe("fixed Ireland beta coverage set", () => {
  it("covers eight Dublin/Wicklow anchors at three ride lengths", () => {
    expect(discoveryCoverageCases).toHaveLength(24);
    expect(new Set(discoveryCoverageCases.map((testCase) => testCase.id)).size).toBe(24);
    expect(discoveryCoverageCases.every((testCase) =>
      testCase.spec.country === "Ireland" && testCase.spec.discipline === "road"
    )).toBe(true);
  });

  it("tests only workout types approved for the Ireland beta", () => {
    expect(workoutCoverageCases).toHaveLength(8);
    expect(workoutCoverageCases.every((testCase) =>
      testCase.spec.workout?.intervals.every((interval) =>
        interval.session_type != null && IRELAND_BETA_SESSION_TYPES.has(interval.session_type)
      )
    )).toBe(true);
  });
});
