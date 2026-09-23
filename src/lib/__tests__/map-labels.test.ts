import { describe, it, expect } from "vitest";
import { labelsForRoute } from "../map-labels";

describe("labelsForRoute", () => {
  // Blessington → Brittas → Tallaght-ish line (Wicklow/Dublin)
  const line: [number, number][] = Array.from({ length: 60 }, (_, i) => [53.170 + i * 0.002, -6.533 + i * 0.003]);
  it("labels the start town first, then bigger places along the way", () => {
    const ls = labelsForRoute(line);
    expect(ls.length).toBeGreaterThan(0);
    expect(ls[0].start).toBe(true);
    expect(ls[0].name).toBe("Blessington");
    expect(new Set(ls.map((l) => l.name)).size).toBe(ls.length);
  });
  it("returns nothing for an empty track", () => {
    expect(labelsForRoute([])).toEqual([]);
  });
});
