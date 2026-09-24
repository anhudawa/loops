import { describe, it, expect } from "vitest";
import routes from "@/data/hub-bundles/dublin-designed.json";
import { isTrainingLoop } from "@/lib/ride-check";
import { ROAD_RULES_VERSION } from "@/lib/road-segments";

describe("dublin-designed bundle", () => {
  it("every loop meets the Road Standard under the current rules and is a sound training loop", () => {
    expect(routes.length).toBe(16);
    for (const r of routes) {
      expect(r.road_report.standard_met, r.name).toBe(true);
      expect(r.road_report.rules_version, r.name).toBe(ROAD_RULES_VERSION);
      const coords = r.coordinates.map((c) => [c[0], c[1]] as [number, number]);
      expect(isTrainingLoop(coords, r.distance_km).ok, r.name).toBe(true);
    }
  });
});
