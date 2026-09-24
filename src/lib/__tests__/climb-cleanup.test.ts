import { describe, it, expect } from "vitest";
import { despikeElevations, mergeClimbs, cleanClimbs } from "../climb-cleanup";
import { detectClimbs, type Climb } from "../climb-detection";

/** Points every ~10 m due north with the given elevation profile (m per point). */
const track = (ele: (km: number) => number, km: number): [number, number, number][] =>
  Array.from({ length: Math.round(km * 100) + 1 }, (_, i) => [53 + (i * 0.01) / 111.32, -6.2, ele(i * 0.01)]);

describe("despikeElevations", () => {
  it("leaves a real 10 % climb alone", () => {
    const t = track((km) => 20 + Math.min(km, 2) * 100, 3);
    expect(despikeElevations(t)).toBe(t);
  });

  it("takes out a DEM spike (Cap Formentor: 139 → 232 → 188 m over 220 m)", () => {
    // Flat at 139 m, up to 232 m in 110 m, down to 188 m by 220 m, flat on.
    const ele = (km: number) =>
      km <= 1 ? 139 : km <= 1.11 ? 139 + ((km - 1) / 0.11) * 93 : km <= 1.22 ? 232 - ((km - 1.11) / 0.11) * 44 : 188;
    const t = track(ele, 2.5);
    const clean = despikeElevations(t);
    expect(Math.max(...clean.map((c) => c[2]))).toBeLessThanOrEqual(188.01);
    expect(clean.map((c) => [c[0], c[1]])).toEqual(t.map((c) => [c[0], c[1]]));
    // …and the steep "climb" it made is gone.
    expect(detectClimbs(t).some((c) => c.avgGradient > 25)).toBe(true);
    expect(cleanClimbs(t, detectClimbs).climbs.some((c) => c.avgGradient > 25)).toBe(false);
  });
});

describe("mergeClimbs", () => {
  const climb = (startKm: number, endKm: number, startElev: number, endElev: number, startIndex: number, endIndex: number): Climb => ({
    startIndex, endIndex, startKm, endKm, startElev, endElev,
    gain: endElev - startElev, distanceKm: endKm - startKm,
    avgGradient: ((endElev - startElev) / ((endKm - startKm) * 1000)) * 100, maxElev: endElev, category: "Cat 4",
  });

  it("merges two climbs split by a short shallow dip", () => {
    const coords = track((km) => (km < 2 ? km * 60 : km < 2.3 ? 120 - (km - 2) * 30 : 111 + (km - 2.3) * 60), 4.5);
    const out = mergeClimbs([climb(0, 2, 0, 120, 0, 200), climb(2.3, 4.5, 111, 243, 230, 450)], coords);
    expect(out).toHaveLength(1);
    expect(out[0].gain).toBe(243);
    expect(out[0].endKm).toBe(4.5);
    expect(out[0].category).not.toBeNull();
  });

  it("keeps climbs apart across a long or deep descent", () => {
    const coords = track(() => 0, 6);
    coords.forEach((c, i) => { c[2] = i > 200 && i < 400 ? 40 : 120; });
    const a = climb(0, 2, 0, 120, 0, 200), b = climb(4, 6, 40, 200, 400, 600);
    expect(mergeClimbs([a, b], coords)).toHaveLength(2);
  });
});
