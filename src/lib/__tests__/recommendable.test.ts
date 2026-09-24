import { describe, expect, it } from "vitest";
import { recommendableNow, shapeVerdict, turnaround } from "@/lib/recommendable";

const line = (km: number): [number, number][] =>
  Array.from({ length: 200 }, (_, i) => [53.36 + (km / 111.32) * (i / 199), -6.2] as [number, number]);
const outAndBack = (km: number) => { const o = line(km); return [...o, ...o.slice().reverse()]; };
const loop = (km: number): [number, number][] => {
  const r = km / (2 * Math.PI) / 111.32;
  return Array.from({ length: 400 }, (_, i) => {
    const a = (i / 399) * 2 * Math.PI;
    return [53.36 + r * Math.sin(a), -6.2 + (r * (1 - Math.cos(a))) / Math.cos((53.36 * Math.PI) / 180)] as [number, number];
  });
};
const asRoute = (coords: [number, number][], extra: Record<string, unknown> = {}) => ({ name: "x", coordinates: JSON.stringify(coords), ...extra });

describe("recommendable routes", () => {
  it("a loop is recommended", () => {
    expect(shapeVerdict(loop(60))).toBe("ok");
    expect(recommendableNow(asRoute(loop(60)))).toBe(true);
  });
  it("an out-and-back is held back until the engine confirms there is no other road", () => {
    expect(shapeVerdict(outAndBack(30))).toBe("out-and-back");
    expect(recommendableNow(asRoute(outAndBack(30)))).toBe(false);
    expect(recommendableNow(asRoute(outAndBack(30), { recommend_status: "alternative" }))).toBe(false);
    expect(recommendableNow(asRoute(outAndBack(30), { recommend_status: "unknown" }))).toBe(false);
    // Cap de Formentor: the only way there is out and back.
    expect(recommendableNow(asRoute(outAndBack(30), { recommend_status: "only-road" }))).toBe(true);
  });
  it("a stored 'no' wins even when the shape looks fine", () => {
    expect(recommendableNow(asRoute(loop(60), { recommend_status: "broken" }))).toBe(false);
  });
  it("the turnaround is the far end", () => {
    const t = turnaround(outAndBack(30));
    expect(t[0]).toBeCloseTo(53.36 + 30 / 111.32, 3);
  });
});
