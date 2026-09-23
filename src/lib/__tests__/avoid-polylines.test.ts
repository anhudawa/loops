import { describe, it, expect } from "vitest";
import { avoidPolylines } from "../route-generator";

describe("avoidPolylines", () => {
  const road: [number, number][] = Array.from({ length: 200 }, (_, i) => [53.3 - i * 0.001, -6.3 - i * 0.001]);
  it("penalises the roads in use but clears the leg's own pins", () => {
    const q = avoidPolylines([road], road[road.length - 1], [53.35, -6.26]);
    expect(q.startsWith("&polylines=")).toBe(true);
    expect(q.endsWith(",200")).toBe(true);
    // nothing within 1.5 km of the shared pin (the last point of the road)
    const pts = q.replace("&polylines=", "").split("|")[0].split(",").slice(0, -1);
    const lastLat = Number(pts[pts.length - 1]);
    expect(lastLat).toBeGreaterThan(road[road.length - 1][0] + 0.009);
  });
  it("is empty when there is nothing to avoid", () => {
    expect(avoidPolylines([], [53, -6], [53.1, -6.1])).toBe("");
  });
});
