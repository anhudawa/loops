import { describe, expect, it } from "vitest";
import { parseBasicIntent, parseBasicWorkout } from "@/lib/route-intent";
import { findEffortStretch, lengthPlan, spliceRepeats, repKm, clearOfStops, lightTraffic } from "@/lib/effort-repeats";
import { parseBRouterStops } from "@/lib/road-segments";
import { findHills } from "@/lib/hill-finder";
import type { WorkoutSpec } from "@/lib/route-intent";

describe("parseBasicWorkout (no model needed)", () => {
  it("\"I've 20 mins threshold to do in. 4 hour ride\" is a 4-hour ride holding 20 min at threshold", () => {
    const p = parseBasicIntent("I’ve 20 mins threshold to do in. 4 hour ride")!;
    expect(p.duration_minutes).toBe(240);
    expect(p.workout?.intervals).toEqual([{ count: 1, duration_minutes: 20, zone: "z4", recovery_minutes: 10 }]);
  });
  it("\"2 hours from Clontarf with 4x4 mins vo2 max\"", () => {
    const p = parseBasicIntent("2 hours from Clontarf with 4x4 mins vo2 max")!;
    expect(p.region).toBe("Clontarf");
    expect(p.duration_minutes).toBe(120);
    expect(p.workout?.intervals[0]).toMatchObject({ count: 4, duration_minutes: 4, zone: "z5" });
  });
  it.each([
    ["2 x 20 min threshold", 2, 20, "z4"],
    ["3x10 sweet spot with 5 min rest", 3, 10, "z3"],
    ["10 x 30s sprints", 10, 1, "z7"],
    ["5 x 5 min VO2 max efforts on a steady climb", 5, 5, "z5"],
    ["4 x 8 min tempo with 3 min recovery", 4, 8, "z3"],
  ])("%s", (prompt, count, mins, zone) => {
    expect(parseBasicWorkout(prompt)!.workout.intervals[0]).toMatchObject({ count, duration_minutes: mins, zone });
  });
  it("zone 2 is a steady ride, not intervals", () => {
    expect(parseBasicWorkout("90 min Zone 2 endurance ride")).toBeNull();
    expect(parseBasicIntent("90 min Zone 2 endurance ride, flat and steady")?.workout).toBeNull();
  });
  it("vague efforts decline (the API asks for the efforts)", () => {
    expect(parseBasicIntent("2 hour ride with some intervals")).toBeNull();
  });
});

const vo2: WorkoutSpec = { intervals: [{ count: 4, duration_minutes: 4, zone: "z5", recovery_minutes: 2 }], warmup_minutes: 15, cooldown_minutes: 10, total_minutes: 47 };

/** A straight line north: `flatKm` flat, then a steady climb at `pct` for `climbKm`, then flat. */
function track(flatKm: number, climbKm: number, pct: number, tailKm = 5) {
  const coords: [number, number][] = [];
  const ele: number[] = [];
  const step = 0.05;
  let e = 10;
  for (let d = 0; d <= flatKm + climbKm + tailKm + 1e-9; d += step) {
    coords.push([53 + d / 111.32, -6]);
    if (d > flatKm && d <= flatKm + climbKm) e += (pct / 100) * step * 1000;
    ele.push(e);
  }
  const tags = new Array(coords.length - 1).fill({ highway: "tertiary" });
  return { coords, ele, tags };
}

describe("findEffortStretch", () => {
  it("puts VO2 reps on the steady climb, sized for the climbing pace", () => {
    const t = track(8, 2, 6);
    const st = findEffortStretch(t.coords, t.ele, t.tags, [], vo2)!;
    expect(st.kind).toBe("climb");
    expect(st.avg_gradient_pct).toBeGreaterThan(4);
    expect(st.length_km).toBeGreaterThanOrEqual(repKm("z5", 4, st.avg_gradient_pct) - 0.06);
  });
  it("stop signs on the climb rule it out", () => {
    const t = track(8, 2, 6);
    // Starting AT a sign is fine; two signs on the climb leave no clean rep.
    const at = (km: number) => t.coords[Math.round(km / 0.05)];
    const stops = [8.8, 9.4].map((k) => ({ lat: at(k)[0], lng: at(k)[1], kind: "stop" as const }));
    expect(findEffortStretch(t.coords, t.ele, t.tags, stops, vo2)).toBeNull();
  });
  it("busy roads don't hold efforts (light traffic only)", () => {
    const t = track(8, 2, 6);
    expect(findEffortStretch(t.coords, t.ele, t.tags.map(() => ({ highway: "tertiary", estimated_traffic_class: "5" })), [], vo2)).toBeNull();
    expect(findEffortStretch(t.coords, t.ele, t.tags.map(() => ({ highway: "tertiary", estimated_traffic_class: "2" })), [], vo2)?.traffic_class).toBe(2);
  });
  it("a junction with a real road rules the stretch out; quiet side lanes are counted", () => {
    const t = track(8, 2, 6);
    const at = (km: number) => t.coords[Math.round(km / 0.05)];
    const junctions = [8.8, 9.4].map((k) => ({ lat: at(k)[0], lng: at(k)[1], kind: "junction" as const }));
    expect(findEffortStretch(t.coords, t.ele, t.tags, junctions, vo2)).toBeNull();
    // A lane every 400 m: every rep-length window has two, which is allowed (≤ 2 per km).
    const lanes = [8.2, 8.6, 9.0, 9.4, 9.8].map((k) => ({ lat: at(k)[0], lng: at(k)[1], kind: "side_road" as const }));
    expect(findEffortStretch(t.coords, t.ele, t.tags, lanes, vo2)?.side_roads).toBe(2);
    // Every 150 m is too many.
    const busy = Array.from({ length: 14 }, (_, i) => 8 + i * 0.15).map((k) => ({ lat: at(k)[0], lng: at(k)[1], kind: "side_road" as const }));
    expect(findEffortStretch(t.coords, t.ele, t.tags, busy, vo2)).toBeNull();
  });
  it("lightTraffic: no estimate is quiet on a lane, unknown on a secondary road", () => {
    expect(lightTraffic({ highway: "unclassified" })).toBe(true);
    expect(lightTraffic({ highway: "secondary" })).toBe(false);
    expect(lightTraffic({ highway: "secondary", estimated_traffic_class: "3" })).toBe(true);
    expect(lightTraffic({ highway: "tertiary", estimated_traffic_class: "4" })).toBe(false);
  });
  it("shared paths don't hold efforts", () => {
    const t = track(8, 2, 6);
    const tags = t.tags.map(() => ({ highway: "cycleway" }));
    expect(findEffortStretch(t.coords, t.ele, tags, [], vo2)).toBeNull();
  });
  it("laps: a long flat effort on a shorter quiet stretch", () => {
    const t = track(12, 0, 0, 0);
    const thr: WorkoutSpec = { intervals: [{ count: 1, duration_minutes: 20, zone: "z4", recovery_minutes: 10 }], warmup_minutes: 15, cooldown_minutes: 10, total_minutes: 45 };
    const junction = t.coords[Math.floor(10 / 0.05)];
    const stops = [{ lat: junction[0], lng: junction[1], kind: "give_way" as const }];
    expect(findEffortStretch(t.coords, t.ele, t.tags, stops, thr, { skipEndKm: 0.5 })).toBeNull();
    const laps = findEffortStretch(t.coords, t.ele, t.tags, stops, thr, { laps: true, skipEndKm: 0.5 })!;
    expect(laps.kind).toBe("laps");
    expect(laps.passes * laps.length_km).toBeGreaterThanOrEqual(repKm("z4", 20, 0) - 0.1);
  });
});

describe("splicing the reps in", () => {
  it("hill repeats: up, down, up… ending where the loop carries on", () => {
    expect(lengthPlan(4, 1)).toEqual([0, null, 1, null, 2, null, 3]);
    expect(lengthPlan(1, 4)).toEqual([0, 0, 0, 0, null]);
    expect(lengthPlan(2, 3)).toEqual([0, 0, 0, null, 1, 1, 1]);
  });
  it("every rep sits on the stretch, and the ride ends at the loop's end", () => {
    const coords: [number, number][] = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]];
    const ele = [0, 1, 2, 3, 4, 5];
    const tags = coords.slice(1).map((_, i) => ({ highway: `h${i}` }));
    const r = spliceRepeats(coords, ele, tags, 1, 3, 3);
    expect(r.coords[0]).toEqual([0, 0]);
    expect(r.coords[r.coords.length - 1]).toEqual([0, 5]);
    expect(r.reps).toHaveLength(3);
    for (const [a, b] of r.reps) {
      expect(r.coords[a]).toEqual([0, 1]);
      expect(r.coords[b]).toEqual([0, 3]);
    }
    expect(r.edgeTags).toHaveLength(r.coords.length - 1);
  });
});

describe("engine stops", () => {
  const header = ["Longitude", "Latitude", "Elevation", "Distance", "CostPerKm", "ElevCost", "TurnCost", "NodeCost", "InitialCost", "WayTags", "NodeTags", "Time", "Energy"];
  const row = (turn: number, way: string, node: string) => ["-6000000", "53000000", "10", "100", "0", "0", String(turn), "0", "0", way, node, "0", "0"];
  it("a stop sign facing the other way is not the rider's", () => {
    expect(parseBRouterStops([header, row(0, "highway=tertiary", "highway=stop direction=backward")])).toHaveLength(0);
    expect(parseBRouterStops([header, row(0, "reversedirection=yes highway=tertiary", "highway=stop direction=backward")])).toHaveLength(1);
  });
  it("a bend at a side road is not a turn; leaving the road is", () => {
    expect(parseBRouterStops([header, row(60, "highway=tertiary", ""), row(0, "highway=tertiary surface=asphalt", "")])).toHaveLength(0);
    expect(parseBRouterStops([header, row(60, "highway=tertiary", ""), row(0, "highway=residential", "")])).toHaveLength(1);
  });
  it("junctions come from the engine's crossing estimate", () => {
    expect(parseBRouterStops([header, row(0, "highway=tertiary", "estimated_crossing_class=4")])[0].kind).toBe("junction");
    expect(parseBRouterStops([header, row(0, "highway=tertiary", "estimated_crossing_class=2")])[0].kind).toBe("side_road");
  });
  it("clearOfStops ignores the first metres (efforts start at junctions)", () => {
    const coords: [number, number][] = [[53, -6], [53.0003, -6], [53.001, -6], [53.002, -6]];
    expect(clearOfStops(coords, 0, 3, [{ lat: 53, lng: -6, kind: "give_way" }])).toBe(true);
    expect(clearOfStops(coords, 0, 3, [{ lat: 53.002, lng: -6, kind: "give_way" }])).toBe(false);
  });
});

describe("findHills", () => {
  it("finds the Ben of Howth from Clontarf", () => {
    const hills = findHills([53.3636, -6.2003], 12);
    expect(hills.map((h) => h.name)).toContain("Ben of Howth");
  });
});

describe("a contraction is not a place", () => {
  it("\"I’ve 20 mins threshold to do in. 4 hour ride\" names no start (the phone location is used)", () => {
    expect(parseBasicIntent("I’ve 20 mins threshold to do in. 4 hour ride")?.region ?? null).toBeNull();
    expect(parseBasicIntent("I've 20 mins threshold to do in. 4 hour ride")?.region ?? null).toBeNull();
  });
});
