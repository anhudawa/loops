import { describe, it, expect } from "vitest";
import { isClosedLoop, nearestIndex, rotateLoop, type LatLng } from "@/lib/loop-geometry";

const square: LatLng[] = [
  [53.50, -6.10], [53.51, -6.10], [53.52, -6.10], [53.52, -6.08], [53.50, -6.08], [53.50, -6.10],
];

describe("loop geometry (serve verified loops from home)", () => {
  it("recognises a closed loop and an open track", () => {
    expect(isClosedLoop(square)).toBe(true);
    expect(isClosedLoop(square.slice(0, 4))).toBe(false);
  });

  it("finds the loop point nearest home", () => {
    expect(nearestIndex(square, [53.521, -6.081])).toBe(3);
    expect(nearestIndex(square, [53.49, -6.10])).toBe(0);
  });

  it("rotates a loop to start at that point, keeps direction, stays closed, rotates elevations with it", () => {
    const ele = [10, 20, 30, 40, 50, 10];
    const r = rotateLoop(square, 3, ele);
    expect(r.coords.length).toBe(square.length);
    expect(r.coords[0]).toEqual([53.52, -6.08]);
    expect(r.coords[r.coords.length - 1]).toEqual([53.52, -6.08]);
    expect(r.coords[1]).toEqual([53.50, -6.08]); // next point in the original direction
    expect(r.parallel).toEqual([40, 50, 10, 20, 30, 40]);
    expect(rotateLoop(square, 0).coords).toEqual(square);
  });
});
