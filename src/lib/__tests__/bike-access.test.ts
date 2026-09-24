import { describe, it, expect } from "vitest";
import { isRestrictedForBikes } from "@/lib/road-segments";

describe("isRestrictedForBikes", () => {
  it("access=no with bicycle=designated/yes is a cycle path bikes may use", () => {
    expect(isRestrictedForBikes({ highway: "cycleway", access: "no", bicycle: "designated" })).toBe(false);
    expect(isRestrictedForBikes({ highway: "cycleway", access: "no", bicycle: "yes" })).toBe(false);
  });
  it("access=no without a bicycle tag, or bicycle=no, keeps bikes off", () => {
    expect(isRestrictedForBikes({ highway: "service", access: "no", foot: "yes" })).toBe(true);
    expect(isRestrictedForBikes({ highway: "tertiary", bicycle: "no" })).toBe(true);
  });
});
