import { describe, it, expect } from "vitest";
import { disciplineEnabled, ENABLED_DISCIPLINES, DISCIPLINE_NOTICE } from "@/config/constants";

describe("v1 disciplines", () => {
  it("plans road only", () => {
    expect(ENABLED_DISCIPLINES).toEqual(["road"]);
    expect(disciplineEnabled("road")).toBe(true);
    expect(disciplineEnabled(undefined)).toBe(true);
    expect(disciplineEnabled("gravel")).toBe(false);
    expect(disciplineEnabled("mtb")).toBe(false);
    expect(DISCIPLINE_NOTICE).toMatch(/road rides/);
    expect(DISCIPLINE_NOTICE).not.toMatch(/gravel|mtb/i);
  });
});
