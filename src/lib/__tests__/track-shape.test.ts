import { describe, it, expect } from "vitest";
import { checkTrack, shapeLabel } from "../track-shape";

const line = (n: number, dLat: number, dLng: number, lat0 = 53, lng0 = -6.2): [number, number][] =>
  Array.from({ length: n }, (_, i) => [lat0 + i * dLat, lng0 + i * dLng]);

describe("checkTrack", () => {
  it("a square is a loop", () => {
    const sq = [...line(100, 0.001, 0), ...line(100, 0, 0.0015, 53.1), ...line(100, -0.001, 0, 53.1, -6.05), ...line(101, 0, -0.0015, 53, -6.05)];
    const c = checkTrack(sq, "Square Loop")!;
    expect(c.shape).toBe("loop");
    expect(c.broken).toBeNull();
    expect(shapeLabel(c)).toBe("Loop");
  });
  it("there and back on one road is an out-and-back; broken if called a loop", () => {
    const out = line(200, 0.0005, 0.0005);
    const tb = [...out, ...out.slice().reverse()];
    const c = checkTrack(tb, "Els Àngels Loop")!;
    expect(c.shape).toBe("out-and-back");
    expect(c.retracePct).toBeGreaterThan(90);
    expect(c.broken).toMatch(/called a loop/);
    expect(checkTrack(tb, "Cap de Formentor")!.broken).toBeNull();
  });
  it("a jump in the data is broken", () => {
    const g = [...line(50, 0.001, 0), ...line(50, 0.001, 0, 53.2)];
    expect(checkTrack(g)!.broken).toMatch(/gap/);
  });
});
