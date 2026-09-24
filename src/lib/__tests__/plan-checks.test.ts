import { describe, it, expect } from "vitest";
import { planCompromises, detourLegs } from "@/app/plan/plan-checks";
import { describeCompromise, type Compromise } from "@/lib/road-segments";
import type { LatLng } from "@/lib/plan-legs";

const start: LatLng = [53.3636, -6.2003]; // Clontarf
const far: LatLng = [53.55, -6.45]; // ~25 km out

const c = (over: Partial<Compromise>): Compromise => ({ kind: "main_road", start: 0, end: 1, meters: 1000, highway: "primary", ...over });

describe("planCompromises", () => {
  it("puts a fast road first, however short, then the longest", () => {
    const legs = [
      { coords: [start, far], compromises: [c({ meters: 2100, name: "R132", at: far })] },
      { coords: [far, start], compromises: [c({ kind: "fast_road", meters: 347, name: "N81", maxspeed: "100", highway: "trunk", at: far }), c({ meters: 900, at: far })] },
    ];
    const out = planCompromises(legs, [start, far], true);
    expect(out.map((x) => x.meters)).toEqual([347, 2100, 900]);
    expect(describeCompromise(out[0])).toMatch(/N81/);
  });

  it("a main road signed 80+ counts as fast", () => {
    const out = planCompromises([{ coords: [start, far], compromises: [c({ meters: 3000, at: far }), c({ meters: 200, maxspeed: "80", at: far })] }], [start, far], true);
    expect(out[0].meters).toBe(200);
  });

  it("near the start is measured from the ride's first pin, not each leg's ends", () => {
    const legs = [
      // Leg 2 starts at `far`: its own report called this "near the start".
      { coords: [far, start], compromises: [c({ at: far, near_start: true })] },
      { coords: [start, far], compromises: [c({ at: [53.37, -6.2] as LatLng })] },
    ];
    const out = planCompromises(legs, [start, far], true);
    expect(out.find((x) => x.at?.[0] === far[0])?.near_start).toBeUndefined();
    expect(out.find((x) => x.at?.[0] === 53.37)?.near_start).toBe(true);
  });

  it("without loop back the last pin is the finish", () => {
    const out = planCompromises([{ coords: [start, far], compromises: [c({ at: far })] }], [start, far], false);
    expect(out[0].near_start).toBe(true);
  });
});

describe("detourLegs", () => {
  it("names legs over 1.6x the straight line, and ignores a missing field", () => {
    expect(detourLegs([{ detour_ratio: 1.2 }, { detour_ratio: 2.1 }, {}, { detour_ratio: null }])).toEqual([1]);
  });
});
