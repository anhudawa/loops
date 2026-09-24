import { describe, it, expect } from "vitest";
import { dedupeRoutes, trackOverlap } from "@/lib/track-shape";
import { withAutoTitle } from "@/lib/route-title";

const line = (lat0: number, n: number, dLng = 0.001): [number, number][] => Array.from({ length: n }, (_, i) => [lat0, -6 + i * dLng]);

describe("dedupeRoutes", () => {
  it("keeps one of two near-identical tracks, both of two different ones", () => {
    const a = { id: "a", c: line(53, 200) };
    const b = { id: "b", c: line(53.0002, 190) }; // same road, ~20 m off, a bit shorter
    const c = { id: "c", c: line(53.05, 200) }; // 5.5 km north: another ride
    expect(trackOverlap(b.c, a.c)).toBeGreaterThan(0.9);
    expect(dedupeRoutes([a, b, c], (r) => r.c).map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("withAutoTitle: no 'Loop' on an out-and-back", () => {
  it("drops the trailing word when the track rides itself twice", () => {
    const out = line(53, 100);
    const back = [...out].reverse();
    const coordinates = JSON.stringify([...out, ...back]);
    expect(withAutoTitle({ name: "Summit Road Loop", coordinates, distance_km: 13 }).name).toBe("Summit Road");
  });
});
