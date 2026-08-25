import { describe, expect, it } from "vitest";
import { ratePercent } from "@/lib/beta-metrics";

describe("Ireland beta KPI rates", () => {
  it("returns no rate before a cohort exists", () => {
    expect(ratePercent(0, 0)).toBeNull();
  });

  it("rounds rates to one decimal place", () => {
    expect(ratePercent(1, 3)).toBe(33.3);
    expect(ratePercent(25, 100)).toBe(25);
  });
});
