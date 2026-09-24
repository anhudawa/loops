import { describe, expect, it } from "vitest";
import {
  buildRoadReport,
  cityCoreAt,
  cityCoreKm,
  describeCompromise,
  irishDefaults,
  isFastRoad,
  stretchJunctions,
  summaryParts,
  type Compromise,
} from "@/lib/road-segments";
import { findEffortStretch, findSpreadStretches, tooFastForEffort, LAP_MAX_RANGE_M } from "@/lib/effort-repeats";
import { cityPenalty, qualityTier, CITY_TIER_CAP_SHARE } from "@/lib/route-quality";
import { cityEdgeOf, legsCrossCore } from "@/lib/route-generator";
import type { WorkoutSpec } from "@/lib/route-intent";

type P = [number, number];
const O_CONNELL: P = [53.3498, -6.2603];
const CLONTARF: P = [53.3636, -6.2003];

/** Straight line from a to b, ~every 20 m. */
function between(a: P, b: P): P[] {
  const km = Math.hypot((b[0] - a[0]) * 111.32, (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180));
  const n = Math.max(2, Math.ceil(km / 0.02));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as P);
}

describe("city centres (CLT-04)", () => {
  it("knows central Dublin, not Clontarf", () => {
    expect(cityCoreAt(O_CONNELL)?.name).toBe("Dublin");
    expect(cityCoreAt(CLONTARF)).toBeNull();
    expect(cityEdgeOf(CLONTARF)?.name).toBe("Dublin");
    expect(cityEdgeOf([53.0, -6.1])).toBeNull(); // Wicklow hills
  });
  it("names a pass through the centre as city streets, one line for the lot", () => {
    const coords = [...between(CLONTARF, O_CONNELL), ...between(O_CONNELL, [53.3498, -6.35]).slice(1)];
    const tags = new Array(coords.length - 1).fill({ highway: "residential", surface: "asphalt" });
    const r = buildRoadReport(coords, tags, "road");
    expect(r.standard_met).toBe(false);
    expect(r.city_pct).toBeGreaterThan(30);
    const city = r.compromises.filter((c) => c.kind === "city_streets");
    expect(city.length).toBeGreaterThan(0);
    expect(r.summary).toMatch(/km of city streets through Dublin city centre/);
    expect(cityCoreKm(coords)).toBeGreaterThan(4);
  });
  it("a loop out to Fingal has no city compromise", () => {
    const coords = between(CLONTARF, [53.45, -6.15]);
    const r = buildRoadReport(coords, new Array(coords.length - 1).fill({ highway: "tertiary" }), "road");
    expect(r.standard_met).toBe(true);
    expect(r.city_pct).toBe(0);
  });
  it("summaryParts adds up every city pass", () => {
    const c = (meters: number): Compromise => ({ kind: "city_streets", start: 0, end: 1, meters, highway: "residential", name: "Dublin city centre" });
    expect(summaryParts([c(5700), c(5000)])).toBe("10.7 km of city streets through Dublin city centre (traffic lights, buses)");
    expect(describeCompromise(c(900))).toMatch(/^900 m of city streets/);
  });
  it("straight waypoint legs through the centre are spotted", () => {
    const core = cityCoreAt(O_CONNELL)!;
    expect(legsCrossCore([CLONTARF, [53.314, -6.364], [53.356, -6.554], CLONTARF], core)).toBe(true);
    expect(legsCrossCore([CLONTARF, [53.45, -6.15], [53.5, -6.1], CLONTARF], core)).toBe(false);
  });
  it("city share costs quality and caps the tier", () => {
    expect(cityPenalty(0)).toBe(0);
    expect(cityPenalty(0.19)).toBe(15);
    expect(cityPenalty(1)).toBe(30);
    expect(qualityTier(87, 0.19, 72)).toBe("good");
    expect(qualityTier(87, CITY_TIER_CAP_SHARE, 72)).toBe("excellent");
    expect(qualityTier(70, 0, 72)).toBe("good");
  });
});

describe("Irish regional roads are 80 km/h roads (CA-01)", () => {
  it("fills in the 80 km/h default on an unsigned R-road", () => {
    expect(irishDefaults({ highway: "secondary" }).maxspeed).toBe("80");
    expect(irishDefaults({ highway: "secondary", maxspeed: "50" }).maxspeed).toBe("50");
    expect(irishDefaults({ highway: "tertiary" }).maxspeed).toBeUndefined();
  });
  it("an unsigned R-road with no traffic estimate is named in the Irish road report", () => {
    const coords = between([53.16, -6.167], [53.15, -6.163]);
    const r = buildRoadReport(coords, new Array(coords.length - 1).fill({ highway: "secondary", surface: "asphalt" }), "road");
    expect(r.compromises[0]?.kind).toBe("fast_road");
    expect(isFastRoad({ highway: "secondary" })).toBe(false); // outside Ireland: unknown stays unknown
  });
  it("never puts an effort on an 80 km/h regional road", () => {
    expect(tooFastForEffort({ highway: "secondary", maxspeed: "80", estimated_traffic_class: "2" }, true)).toBe(true);
    expect(tooFastForEffort({ highway: "secondary" }, true)).toBe(true);
    expect(tooFastForEffort({ highway: "secondary" }, false)).toBe(false);
    expect(tooFastForEffort({ highway: "tertiary", maxspeed: "80" }, true)).toBe(false);
    expect(tooFastForEffort({ highway: "tertiary", maxspeed: "100" }, false)).toBe(true);
    // A steady climb on the R755 holds no reps.
    const t = climbTrack(8, 2, 6);
    const vo2: WorkoutSpec = { intervals: [{ count: 5, duration_minutes: 5, zone: "z5", recovery_minutes: 3 }], warmup_minutes: 15, cooldown_minutes: 10, total_minutes: 62 };
    const r755 = t.tags.map(() => ({ highway: "secondary", maxspeed: "80", estimated_traffic_class: "2" }));
    expect(findEffortStretch(t.coords, t.ele, r755, [], vo2)).toBeNull();
    expect(findEffortStretch(t.coords, t.ele, t.tags, [], vo2)).not.toBeNull();
  });
});

/** North from [53, -6]: `flatKm` flat, a `pct` climb for `climbKm`, then `tailKm` flat. */
function climbTrack(flatKm: number, climbKm: number, pct: number, tailKm = 5, wobble?: (d: number) => number) {
  const coords: P[] = [];
  const ele: number[] = [];
  const step = 0.05;
  let e = 10;
  for (let d = 0; d <= flatKm + climbKm + tailKm + 1e-9; d += step) {
    coords.push([53 + d / 111.32, -6]);
    if (d > flatKm && d <= flatKm + climbKm) e += (pct / 100) * step * 1000;
    ele.push(e + (wobble ? wobble(d) : 0));
  }
  return { coords, ele, tags: new Array(coords.length - 1).fill({ highway: "tertiary" }) };
}

describe("laps must be flat all along (CA-06)", () => {
  const thr: WorkoutSpec = { intervals: [{ count: 1, duration_minutes: 20, zone: "z4", recovery_minutes: 10 }], warmup_minutes: 15, cooldown_minutes: 10, total_minutes: 45 };
  it("a road that rises and falls 25 m is not lapped as 'flat'", () => {
    // Flat on average, but a 25 m hump every 1.2 km (Kinsale: 38 → 63 m).
    const t = climbTrack(14, 0, 0, 0, (d) => 12.5 * (1 - Math.cos((2 * Math.PI * d) / 1.2)));
    expect(findEffortStretch(t.coords, t.ele, t.tags, [], thr, { laps: true, skipEndKm: 0.5 })).toBeNull();
    expect(LAP_MAX_RANGE_M).toBe(15);
  });
  it("a truly flat road still holds laps", () => {
    const t = climbTrack(14, 0, 0, 0);
    expect(findEffortStretch(t.coords, t.ele, t.tags, [], thr, { laps: true, skipEndKm: 0.5 })?.kind).toBe("laps");
  });
});

describe("spread efforts (CA-02)", () => {
  const two: WorkoutSpec = { intervals: [{ count: 2, duration_minutes: 4, zone: "z5", recovery_minutes: 4 }], warmup_minutes: 15, cooldown_minutes: 10, total_minutes: 45 };
  it("each rep on its own climb, in ride order, with the recovery between", () => {
    // Two climbs: at 8–10 km and 14–16 km.
    const a = climbTrack(8, 2, 6, 4);
    const b = climbTrack(0, 2, 6, 5);
    const top = a.ele[a.ele.length - 1] - 10;
    const coords = [...a.coords, ...b.coords.slice(1).map(([lat, lng]) => [lat + (a.coords[a.coords.length - 1][0] - 53), lng] as P)];
    const ele = [...a.ele, ...b.ele.slice(1).map((e) => e + top)];
    const tags = new Array(coords.length - 1).fill({ highway: "tertiary" });
    const sts = findSpreadStretches(coords, ele, tags, [], two)!;
    expect(sts).toHaveLength(2);
    expect(sts[0].end).toBeLessThan(sts[1].start);
    expect(sts.every((s) => s.kind === "climb")).toBe(true);
  });
  it("one climb cannot hold two spread reps", () => {
    const t = climbTrack(8, 2, 6);
    expect(findSpreadStretches(t.coords, t.ele, t.tags, [], two)).toBeNull();
  });
});

describe("what joins an effort stretch (CA-05)", () => {
  const stretch = between([53.47, -6.2], [53.47, -6.18]); // ~1.3 km east
  const fake = (elements: unknown[]) => (async () => new Response(JSON.stringify({ elements }))) as unknown as typeof fetch;
  it("counts side roads and stop signs from the map, not the stretch's own road", async () => {
    const own = { type: "way", tags: { highway: "tertiary" }, geometry: [{ lat: 53.47, lon: -6.21 }, { lat: 53.47, lon: -6.17 }] };
    const lane = { type: "way", tags: { highway: "residential" }, geometry: [{ lat: 53.47, lon: -6.19 }, { lat: 53.475, lon: -6.19 }] };
    const track = { type: "way", tags: { highway: "track" }, geometry: [{ lat: 53.47, lon: -6.185 }, { lat: 53.465, lon: -6.185 }] };
    const drive = { type: "way", tags: { highway: "service", service: "driveway" }, geometry: [{ lat: 53.47, lon: -6.195 }, { lat: 53.471, lon: -6.195 }] };
    const stop = { type: "node", lat: 53.4701, lon: -6.19, tags: { highway: "stop" } };
    const j = await stretchJunctions(stretch, fake([own, lane, track, drive, stop]));
    expect(j).toEqual({ side_roads: 2, controls: 1, signals: 0 });
  });
  it("a failed lookup is unknown, not 'no junctions'", async () => {
    const failing = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await stretchJunctions(stretch, failing)).toBeNull();
  });
});
