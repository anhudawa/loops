/**
 * Repeat efforts on one stretch (owner, 2026-09-23): "2 hours from Clontarf
 * with 4x4 mins VO2 max — we would suggest all 4 efforts on Howth hill."
 *
 * Given a loop the engine already routed to the Road Standard, find the one
 * stretch on it that best holds the session's effort — a steady climb for
 * VO2/anaerobic work, a steady quiet road for tempo/threshold/sprints — with
 * nothing on it that breaks an effort (lights, stop or give-way signs, a
 * roundabout, a barrier, speed humps, a turn at a junction; all from the
 * engine's own route data). Then splice the repeats in: ride the stretch
 * hard, spin back down/along it, go again, and carry on home.
 *
 * Pure functions over data the caller already has — no network.
 */

import { ZONES, type IntensityZone } from "./intensity";
import { smoothElevations, interpolateNaN, haversine } from "./climb-detection";
import { effectiveMaxspeedKmh, inIreland, type EdgeTags, type RoadStop } from "./road-segments";
import type { WorkoutSpec } from "./route-intent";

export interface EffortStretch {
  /** Coordinate indices on the loop: the effort runs start → end. */
  start: number;
  end: number;
  length_km: number;
  avg_gradient_pct: number;
  max_gradient_pct: number;
  /** Metres climbed over the stretch (smoothed). */
  climb_m: number;
  kind: "climb" | "steady" | "laps";
  /** Quiet side lanes joining the stretch (real junctions are never allowed). */
  side_roads: number;
  /** Busiest traffic estimate on the stretch (1–7; null = none, a quiet lane). */
  traffic_class: number | null;
  /** Laps: lengths of the stretch one effort takes (back and forth). 1 otherwise. */
  passes: number;
  /** Laps on a stretch that is not flat all along (allowRolling): say "rolling", not "flat". */
  rolling?: boolean;
  /** Metres between the stretch's lowest and highest point. */
  range_m?: number;
  score: number;
}

/** Zones whose efforts belong on a climb (hill repeats). */
const HILL_ZONES: ReadonlySet<IntensityZone> = new Set(["z5", "z6"]);

/** Roads an effort can be ridden on: real roads, not shared paths or tracks. */
const EFFORT_ROADS = new Set(["secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified", "residential", "road"]);

/** Steady-climb window for hill repeats (average gradient, %). */
const HILL_MIN_PCT = 3;
const HILL_MAX_PCT = 10;
const HILL_IDEAL_PCT = 6;

/** A stop within this of the stretch (after its first metres) interrupts it. */
const STOP_NEAR_KM = 0.02;
/** Starting from a junction is fine: stops in the first metres don't count. */
const START_GRACE_KM = 0.05;
/** Candidate effort starts are tried this far apart. */
const START_STEP_KM = 0.05;

/**
 * Light traffic for an effort: the engine's estimate (1–7) at 3 or below.
 * Lanes and residential streets it has no estimate for are quiet by nature;
 * a secondary road with no estimate is not assumed to be.
 */
export function lightTraffic(t: Record<string, string>): boolean {
  const etc = parseInt(t.estimated_traffic_class ?? "", 10);
  if (Number.isFinite(etc)) return etc <= MAX_EFFORT_TRAFFIC_CLASS;
  return t.highway !== "secondary" && t.highway !== "secondary_link";
}
export const MAX_EFFORT_TRAFFIC_CLASS = 3;

/**
 * No flat-out effort on a road where cars do 80 km/h (CA-01: all five VO2
 * reps were put on the R755 above Enniskerry, an 80 km/h regional road).
 * Regional roads (secondary) at 80+ — an Irish R-road with no sign counts
 * as 80 — and anything signed 100+. A lane carrying the nominal rural
 * default (Irish L-roads) is a quiet lane, as in the Road Standard.
 */
export function tooFastForEffort(t: Record<string, string>, ireland: boolean): boolean {
  const kmh = effectiveMaxspeedKmh(t, ireland);
  if (kmh === null) return false;
  if (kmh >= 100) return true;
  return kmh >= 80 && (t.highway === "secondary" || t.highway === "secondary_link");
}

/** Quiet side lanes allowed per km of effort (farm lanes, boreens); real junctions are never allowed. */
const SIDE_ROADS_PER_KM = 2;

export function isHillSession(workout: WorkoutSpec): boolean {
  return workout.intervals.some((iv) => HILL_ZONES.has(iv.zone));
}

/**
 * Speed (km/h) a club rider holds at `zone` on a `gradientPct` road. Uphill
 * the pace drops (≈ 8 % per 1 % of gradient, floor at 45 % of flat speed),
 * so a 4-minute VO2 effort on a 6 % climb needs ~1.2 km, not the 2 km the
 * flat model says.
 */
export function effortSpeedKmh(zone: IntensityZone, gradientPct: number): number {
  const flat = ZONES[zone].flat_speed_kmh;
  const factor = gradientPct > 0 ? Math.max(0.45, 1 - 0.08 * gradientPct) : 1;
  return flat * factor;
}

/** Distance (km) one rep needs on a road of this gradient. */
export function repKm(zone: IntensityZone, durationMin: number, gradientPct: number): number {
  return (effortSpeedKmh(zone, gradientPct) * durationMin) / 60;
}

/** The block the stretch must hold: the rep that needs the most road. */
export function hardestRep(workout: WorkoutSpec): { zone: IntensityZone; duration_minutes: number } {
  let best = workout.intervals[0];
  for (const iv of workout.intervals) {
    if (repKm(iv.zone, iv.duration_minutes, 0) > repKm(best.zone, best.duration_minutes, 0)) best = iv;
  }
  return { zone: best.zone, duration_minutes: best.duration_minutes };
}

export function totalReps(workout: WorkoutSpec): number {
  return workout.intervals.reduce((s, iv) => s + iv.count, 0);
}

export interface FindStretchOptions {
  /** Warm-up: no effort starts before this many km (default 6 ≈ 15 min). */
  skipStartKm?: number;
  /** Keep the last km free for the ride home (default 3). */
  skipEndKm?: number;
  /** Index ranges to avoid (Road Standard compromises). */
  avoid?: Array<[number, number]>;
  /** Diagnostics: why windows were rejected. */
  debug?: (msg: string) => void;
  /**
   * Laps: a long effort ridden back and forth on a shorter flat stretch
   * ("20 min threshold" on a quiet 4 km road) — for riders who said yes to
   * repeating on one stretch, when no single stretch holds the whole rep.
   */
  laps?: boolean;
  /** Return the first stretch that qualifies (in ride order), not the best. */
  firstFit?: boolean;
  /** Laps: accept a stretch that is flat on average but rolls (marked `rolling`). */
  allowRolling?: boolean;
  /** Laps: the most lengths one effort may take (default LAP_MAX_PASSES). */
  maxPasses?: number;
}

/** Shortest stretch worth lapping, and the most lengths one effort may take. */
const LAP_MIN_KM = 2.5;
const LAP_MAX_PASSES = 4;
/** Laps ride both ways: the stretch must be flat in both directions. */
const LAP_MAX_ABS_PCT = 1.5;
/**
 * …and flat all along, not just on average (CA-06: Kinsale "flat" laps
 * climbed 38 → 63 m with a 5.8 % ramp): every 100 m within ±3 %, and no
 * more than 15 m between its lowest and highest point.
 */
export const LAP_MAX_100M_PCT = 3;
export const LAP_MAX_RANGE_M = 15;

/**
 * The best stretch on the loop for this session, or null when the loop has
 * none. Every candidate window is sized for the hardest rep at its own
 * gradient, then checked: effort-grade roads only (no unknown tags), no
 * stops/turns inside it, gradient in the session's window, steady.
 */
export function findEffortStretch(
  coords: [number, number][],
  elevations: number[],
  edgeTags: EdgeTags | null,
  stops: RoadStop[],
  workout: WorkoutSpec,
  opts: FindStretchOptions = {},
): EffortStretch | null {
  const n = coords.length;
  if (n < 3 || elevations.length !== n || !edgeTags) return null;
  const hill = isHillSession(workout);
  const rep = hardestRep(workout);
  const terrain = ZONES[rep.zone].terrain;
  const skipStart = opts.skipStartKm ?? 6;
  const skipEnd = opts.skipEndKm ?? 3;

  const elev = smoothElevations(interpolateNaN(elevations));
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const total = cum[n - 1];

  // Stops → the coordinate index they sit on (nearest point within 20 m).
  const stopAt = new Set<number>();
  const sideAt = new Set<number>();
  for (const st of stops) {
    // A speed hump slows a flat effort; on a climb the rider is going slowly anyway.
    if (hill && st.kind === "traffic_calming") continue;
    // Cheap box test first (0.0003° ≈ 20–33 m), exact distance only near it.
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (Math.abs(coords[i][0] - st.lat) > 0.0003 || Math.abs(coords[i][1] - st.lng) > 0.0005) continue;
      const d = haversine(coords[i], [st.lat, st.lng]);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && bestD <= STOP_NEAR_KM) (st.kind === "side_road" ? sideAt : stopAt).add(best);
  }
  const avoided = (i: number) => (opts.avoid ?? []).some(([a, b]) => i >= a && i <= b);
  const ireland = inIreland(coords[0]);
  const roadOk = (e: number) => {
    const t = edgeTags[e];
    return !!t && EFFORT_ROADS.has(t.highway ?? "") && lightTraffic(t) && !tooFastForEffort(t, ireland);
  };

  let best: EffortStretch | null = null;
  // Starts every START_STEP_KM (not every point: a 90 km loop has ~10k),
  // and a blocked window skips every start that would run into the same block.
  let lastStart = -Infinity;
  for (let i = 0; i < n - 1; i++) {
    if (cum[i] < skipStart) continue;
    if (!roadOk(i) || avoided(i)) continue;
    if (cum[i] - lastStart < START_STEP_KM) continue;
    lastStart = cum[i];
    // Grow until the window holds one rep at its own gradient.
    let j = i + 1;
    let ok = true;
    let blockedAt = -1;
    let maxG = -Infinity;
    for (; j < n; j++) {
      const e = j - 1;
      if (!roadOk(e) || avoided(j)) { opts.debug?.(`${cum[i].toFixed(2)}: road ${edgeTags[e]?.highway ?? "?"} at ${cum[j].toFixed(2)}`); ok = false; blockedAt = j; break; }
      if (stopAt.has(j) && cum[j] - cum[i] > START_GRACE_KM) { opts.debug?.(`${cum[i].toFixed(2)}: stop at ${cum[j].toFixed(2)}`); ok = false; blockedAt = j - 1; break; }
      const stepKm = cum[j] - cum[j - 1];
      if (stepKm > 0.02) {
        const g = ((elev[j] - elev[j - 1]) / (stepKm * 1000)) * 100;
        maxG = Math.max(maxG, g);
      }
      const len = cum[j] - cum[i];
      const avg = len > 0 ? ((elev[j] - elev[i]) / (len * 1000)) * 100 : 0;
      const need = repKm(rep.zone, rep.duration_minutes, Math.max(0, avg));
      if (len >= (opts.laps ? Math.max(LAP_MIN_KM, need / (opts.maxPasses ?? LAP_MAX_PASSES)) : need)) break;
    }
    if (!ok) {
      // Every start before the block runs into it too (windows only grow).
      if (blockedAt > i) { i = blockedAt; lastStart = -Infinity; i--; }
      continue;
    }
    if (j >= n) continue;
    if (cum[j] > total - skipEnd) break; // later starts only get later
    const len = cum[j] - cum[i];
    let sides = 0;
    for (let k = i + 1; k < j; k++) if (sideAt.has(k) && cum[k] - cum[i] > START_GRACE_KM) sides++;
    if (sides > Math.max(1, Math.floor(len * SIDE_ROADS_PER_KM))) { opts.debug?.(`${cum[i].toFixed(2)}: side roads ${sides}`); continue; }
    const avg = ((elev[j] - elev[i]) / (len * 1000)) * 100;
    // Cheap gradient checks before the steadiness scan.
    if (opts.laps ? Math.abs(avg) > LAP_MAX_ABS_PCT : hill ? avg < HILL_MIN_PCT || avg > HILL_MAX_PCT : avg < terrain.min_gradient_pct || avg > terrain.max_gradient_pct) {
      opts.debug?.(`${cum[i].toFixed(2)}: avg ${avg.toFixed(1)}%`);
      continue;
    }
    // Steadiness: variance of 100 m gradients across the window.
    const grads: number[] = [];
    let a = i;
    for (let k = i + 1; k <= j; k++) {
      if (cum[k] - cum[a] >= 0.1 || k === j) {
        const d = cum[k] - cum[a];
        if (d > 0.03) grads.push(((elev[k] - elev[a]) / (d * 1000)) * 100);
        a = k;
      }
    }
    const mean = grads.reduce((s, g) => s + g, 0) / Math.max(1, grads.length);
    const sd = Math.sqrt(grads.reduce((s, g) => s + (g - mean) ** 2, 0) / Math.max(1, grads.length));

    let score: number;
    const passes = opts.laps ? Math.ceil(repKm(rep.zone, rep.duration_minutes, 0) / len) : 1;
    if (opts.laps) {
      if (Math.abs(avg) > LAP_MAX_ABS_PCT || sd > terrain.max_gradient_variance + 1) continue;
      let lo = Infinity, hi = -Infinity;
      for (let k = i; k <= j; k++) { lo = Math.min(lo, elev[k]); hi = Math.max(hi, elev[k]); }
      const rolls = hi - lo > LAP_MAX_RANGE_M || grads.some((g) => Math.abs(g) > LAP_MAX_100M_PCT);
      if (rolls && !opts.allowRolling) {
        opts.debug?.(`${cum[i].toFixed(2)}: rolling ${Math.round(hi - lo)} m`);
        continue;
      }
      score = 10 - sd - passes * 0.8;
    } else if (hill) {
      if (avg < HILL_MIN_PCT || avg > HILL_MAX_PCT) { opts.debug?.(`${cum[i].toFixed(2)}: avg ${avg.toFixed(1)}%`); continue; }
      if (grads.some((g) => g < -1)) { opts.debug?.(`${cum[i].toFixed(2)}: dip ${Math.min(...grads).toFixed(1)}%`); continue; } // a dip mid-climb breaks the effort
      score = 10 - Math.abs(avg - HILL_IDEAL_PCT) - sd * 0.8;
    } else {
      if (avg < terrain.min_gradient_pct || avg > terrain.max_gradient_pct) continue;
      if (sd > terrain.max_gradient_variance + 1) continue;
      score = 10 - sd - Math.abs(avg - 1) * 0.3;
    }
    score -= sides * 0.5; // fewer side lanes, better place
    let rangeM = 0;
    if (opts.laps) {
      let lo = Infinity, hi = -Infinity;
      for (let k = i; k <= j; k++) { lo = Math.min(lo, elev[k]); hi = Math.max(hi, elev[k]); }
      rangeM = hi - lo;
      if (rangeM > LAP_MAX_RANGE_M || grads.some((g) => Math.abs(g) > LAP_MAX_100M_PCT)) score -= 3; // flat laps first
    }
    if (!best || score > best.score) {
      let climb = 0;
      for (let k = i + 1; k <= j; k++) climb += Math.max(0, elev[k] - elev[k - 1]);
      best = {
        start: i,
        end: j,
        length_km: Math.round(len * 100) / 100,
        avg_gradient_pct: Math.round(avg * 10) / 10,
        max_gradient_pct: Math.round(Math.max(avg, Math.min(maxG, avg + 6)) * 10) / 10,
        climb_m: Math.round(climb),
        kind: opts.laps ? "laps" : hill ? "climb" : "steady",
        side_roads: sides,
        traffic_class: (() => {
          let m: number | null = null;
          for (let k = i; k < j; k++) { const c = parseInt(edgeTags[k]?.estimated_traffic_class ?? "", 10); if (Number.isFinite(c)) m = Math.max(m ?? 0, c); }
          return m;
        })(),
        passes,
        ...(opts.laps ? { range_m: Math.round(rangeM), rolling: rangeM > LAP_MAX_RANGE_M || grads.some((g) => Math.abs(g) > LAP_MAX_100M_PCT) } : {}),
        score,
      };
      if (opts.firstFit) return best;
    }
  }
  return best;
}

/** Road between two spread efforts, at least (km): the recovery, ridden easy. */
const SPREAD_MIN_GAP_KM = 1;
/** Easy recovery pace (km/h) for sizing the gap between spread efforts. */
const RECOVERY_KMH = 22;

/**
 * Spread efforts (the rider said no to repeating on one stretch): every rep
 * on its own qualifying stretch, in ride order, with at least its recovery
 * ridden between them — the same checks as findEffortStretch, applied per
 * rep. Null when the loop cannot hold them all.
 */
export function findSpreadStretches(
  coords: [number, number][],
  elevations: number[],
  edgeTags: EdgeTags | null,
  stops: RoadStop[],
  workout: WorkoutSpec,
  opts: { avoid?: Array<[number, number]>; skipStartKm?: number; skipEndKm?: number } = {},
): EffortStretch[] | null {
  const n = coords.length;
  if (n < 3 || !edgeTags) return null;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const out: EffortStretch[] = [];
  let fromKm = opts.skipStartKm ?? 6;
  for (const iv of workout.intervals) {
    const one: WorkoutSpec = { ...workout, intervals: [{ ...iv, count: 1 }] };
    const gapKm = Math.max(SPREAD_MIN_GAP_KM, ((iv.recovery_minutes ?? 0) * RECOVERY_KMH) / 60);
    for (let k = 0; k < iv.count; k++) {
      const st = findEffortStretch(coords, elevations, edgeTags, stops, one, {
        avoid: opts.avoid,
        skipStartKm: fromKm,
        skipEndKm: opts.skipEndKm,
        firstFit: true,
      });
      if (!st) return null;
      out.push(st);
      fromKm = cum[st.end] + gapKm;
    }
  }
  return out;
}

export interface SplicedRide {
  coords: [number, number][];
  elevations: number[];
  edgeTags: EdgeTags;
  /** [start, end] indices of every rep on the spliced ride, in order. */
  reps: Array<[number, number]>;
}

/**
 * Lengths of the stretch the session rides, in order, alternating
 * direction (forward = the loop's own direction first). `effort` is the rep
 * a length belongs to, or null for an easy length. Always an odd count, so
 * the rider ends where the loop carries on.
 *   Hill repeats (passes 1): up hard, down easy, … up hard.
 *   Laps (passes n): n lengths hard per rep, one easy length between reps.
 */
export function lengthPlan(reps: number, passes: number): Array<number | null> {
  const plan: Array<number | null> = [];
  for (let r = 0; r < reps; r++) {
    for (let p = 0; p < passes; p++) plan.push(r);
    if (r < reps - 1) plan.push(null);
  }
  if (plan.length % 2 === 0) plan.push(null);
  return plan;
}

/**
 * The loop with the session spliced in on [s, e]: the loop's own pass is
 * the first length; the plan's further lengths go back and forth; then the
 * loop carries on from e. Every metre is a road the loop already uses.
 */
export function spliceRepeats(
  coords: [number, number][],
  elevations: number[],
  edgeTags: EdgeTags,
  s: number,
  e: number,
  reps: number,
  passes = 1,
): SplicedRide {
  const plan = lengthPlan(reps, passes);
  const outC: [number, number][] = coords.slice(0, s + 1);
  const outE: number[] = elevations.slice(0, s + 1);
  const outT: EdgeTags = edgeTags.slice(0, s);
  const repIdx: Array<[number, number]> = [];
  plan.forEach((rep, k) => {
    const from = outC.length - 1;
    if (k % 2 === 0) {
      for (let i = s + 1; i <= e; i++) { outC.push(coords[i]); outE.push(elevations[i]); outT.push(edgeTags[i - 1]); }
    } else {
      for (let i = e - 1; i >= s; i--) { outC.push(coords[i]); outE.push(elevations[i]); outT.push(edgeTags[i]); }
    }
    if (rep === null) return;
    if (repIdx.length === rep) repIdx.push([from, outC.length - 1]);
    else repIdx[rep][1] = outC.length - 1;
  });
  for (let k = e + 1; k < coords.length; k++) { outC.push(coords[k]); outE.push(elevations[k]); outT.push(edgeTags[k - 1]); }
  return { coords: outC, elevations: outE, edgeTags: outT, reps: repIdx };
}

/**
 * True when nothing on [start, end] breaks an effort (engine stops, after
 * the first metres). The engine's own data — no second map lookup, so a
 * map-service outage never turns "clear" into "unknown".
 */
export function clearOfStops(
  coords: [number, number][],
  start: number,
  end: number,
  stops: RoadStop[],
  opts: { ignoreCalming?: boolean } = {},
): boolean {
  let run = 0;
  const after: number[] = [];
  for (let i = start + 1; i <= end && i < coords.length; i++) {
    run += haversine(coords[i - 1], coords[i]);
    if (run > START_GRACE_KM) after.push(i);
  }
  if (!after.length) return true;
  for (const st of stops) {
    if (opts.ignoreCalming && st.kind === "traffic_calming") continue;
    if (st.kind === "side_road") continue;
    for (const i of after) {
      if (haversine(coords[i], [st.lat, st.lng]) <= STOP_NEAR_KM) return false;
    }
  }
  return true;
}
