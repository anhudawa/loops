import { describe, expect, it } from "vitest";
import { autoTitle, isGenericName } from "@/lib/route-title";

const towns: Array<[string, [number, number]]> = [["Clontarf", [53.3636, -6.2003]], ["Ashbourne", [53.5114, -6.3975]], ["Navan", [53.652, -6.681]]];
const place = (p: [number, number], maxKm: number) => {
  let best: string | null = null, bd = Infinity;
  for (const [n, q] of towns) { const d = Math.hypot((p[0] - q[0]) * 111, (p[1] - q[1]) * 66); if (d < bd && d <= maxKm) { bd = d; best = n; } }
  return best;
};
const line = (a: [number, number], b: [number, number], n = 50) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n)] as [number, number]);

describe("autoTitle", () => {
  it("a loop: start – far point – start · km", () => {
    const loop = [...line(towns[0][1], towns[1][1]), ...line(towns[1][1], towns[0][1]).slice(1)];
    expect(autoTitle(loop, 116.9, place)).toBe("Clontarf – Ashbourne – Clontarf · 117 km");
  });
  it("A to B: start – halfway – end", () => {
    expect(autoTitle([...line(towns[0][1], towns[1][1]), ...line(towns[1][1], towns[2][1]).slice(1)], 60.2, place)).toBe("Clontarf – Ashbourne – Navan · 60 km");
  });
  it("a loop that never leaves town", () => {
    const tiny = [...line([53.3636, -6.2003], [53.37, -6.19]), ...line([53.37, -6.19], [53.3636, -6.2003]).slice(1)];
    expect(autoTitle(tiny, 25, place)).toBe("Clontarf loop · 25 km");
  });
  it("no towns known", () => {
    expect(autoTitle(line([0, 0], [0, 0.5]), 55, () => null)).toBe("Ride · 55 km");
  });
});

describe("isGenericName", () => {
  it.each(["Planned road route — 116.9 km", "Generated 78 km route", "Generated road route — 78km", "Edited road route — 40km"])("%s is generic", (n) => {
    expect(isGenericName(n)).toBe(true);
  });
  it.each(["Clontarf – Ashbourne – Clontarf · 117 km", "Wicklow Gap", "3 hours from Clontarf"])("%s is a real name", (n) => {
    expect(isGenericName(n)).toBe(false);
  });
});

describe("weak names get a real title", () => {
  it.each(["Sunday Social", "Flat long route", "  Flat  long route ", "Easy 50km spin", "Saturday Club Ride"])("%s is weak", (n) => {
    expect(isGenericName(n)).toBe(true);
  });
  it.each(["Roadman Group Spin (Saturday Route)", "Sally Gap loop", "Coll de Rates Classic Loop", "Els Àngels Loop, Girona"])("%s is kept", (n) => {
    expect(isGenericName(n)).toBe(false);
  });
});
