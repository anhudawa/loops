/**
 * Engine-native road intelligence.
 *
 * Our routing engine (BRouter) already knows every road it puts a rider on:
 * its geojson `messages` carry the OSM way tags (highway class, surface,
 * maxspeed, cycle infrastructure, smoothness, tunnel, ford…) for every
 * segment of the track. This module turns those messages into
 *
 *   1. per-edge tags aligned with the track coordinates,
 *   2. the road-dependent quality dimensions (surface, safety, traffic,
 *      continuity, access) — distance-weighted, so a 3 km stretch counts
 *      3 km, not "one sample point",
 *   3. the hard road rules that previously needed an Overpass download of
 *      every road in the bounding box, and
 *   4. the Road Standard compromise report (TRUST RULE): if a route has to
 *      use a main road, a fast road or an unpaved stretch, we say so and
 *      measure it — "600 m on the R755" — never a silent bad route.
 *
 * Zero external calls: no Overpass, no paid API. The only network use is
 * optional road-name lookup for the (rare) compromise stretches.
 */

import type { Discipline } from "./route-intent";
import type { RuleViolation } from "./route-rules";

export type WayTags = Record<string, string>;

/** Tags for the edge coords[i] → coords[i+1]; null when the engine gave none. */
export type EdgeTags = Array<WayTags | null>;

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse BRouter's geojson `messages` into per-edge way tags.
 *
 * Message rows (after the header row) are
 *   [Longitude, Latitude, Elevation, Distance, CostPerKm, ElevCost, TurnCost,
 *    NodeCost, InitialCost, WayTags, NodeTags, Time, Energy]
 * with lon/lat in micro-degrees marking the END of a run of edges that all
 * share `WayTags` ("highway=tertiary surface=asphalt maxspeed=80 …").
 *
 * Returns null when the messages are absent or cannot be aligned with the
 * geometry, so callers fall back to the old path instead of trusting a
 * half-parsed track.
 */
export function parseBRouterMessages(
  messages: unknown[] | undefined,
  coords: [number, number][]       // [lat, lng]
): EdgeTags | null {
  if (!Array.isArray(messages) || messages.length < 2 || coords.length < 2) return null;
  const header = messages[0];
  if (!Array.isArray(header)) return null;
  const lonIdx = header.indexOf("Longitude");
  const latIdx = header.indexOf("Latitude");
  const tagIdx = header.indexOf("WayTags");
  if (lonIdx < 0 || latIdx < 0 || tagIdx < 0) return null;

  const edges: EdgeTags = new Array(coords.length - 1).fill(null);
  let cursor = 0; // index of the coord where the current run starts
  let matched = 0;

  for (let m = 1; m < messages.length; m++) {
    const row = messages[m];
    if (!Array.isArray(row)) continue;
    const lon = Number(row[lonIdx]) / 1e6;
    const lat = Number(row[latIdx]) / 1e6;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const tags = parseWayTags(String(row[tagIdx] ?? ""));

    // Find the coordinate this run ends at, scanning forward from the cursor.
    let end = -1;
    for (let k = cursor; k < coords.length; k++) {
      if (Math.abs(coords[k][0] - lat) < 2e-6 && Math.abs(coords[k][1] - lon) < 2e-6) {
        end = k;
        break;
      }
    }
    if (end < 0) continue; // unmatched row: leave those edges unknown
    for (let e = cursor; e < end && e < edges.length; e++) edges[e] = tags;
    if (end > cursor) matched++;
    cursor = end;
  }

  return matched > 0 ? edges : null;
}

function parseWayTags(s: string): WayTags {
  const tags: WayTags = {};
  for (const kv of s.split(" ")) {
    if (!kv) continue;
    const eq = kv.indexOf("=");
    if (eq <= 0) continue;
    tags[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  return tags;
}

/**
 * After `repairSpurs` keeps a subset of coordinates (`keep` = original
 * indices), rebuild the edge tags for the new coordinate list. An edge that
 * bridges a splice takes the tags of the road it left on — the splice joins
 * the same road the excursion left from.
 */
export function remapEdgeTags(edgeTags: EdgeTags | null, keep: number[]): EdgeTags | null {
  if (!edgeTags) return null;
  const out: EdgeTags = [];
  for (let i = 0; i + 1 < keep.length; i++) {
    const a = keep[i];
    const b = keep[i + 1];
    out.push(b === a + 1 ? edgeTags[a] ?? null : edgeTags[a] ?? edgeTags[b - 1] ?? null);
  }
  return out;
}

// ── Geometry ─────────────────────────────────────────────────────────────────

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function edgeLengths(coords: [number, number][]): number[] {
  const out: number[] = new Array(Math.max(0, coords.length - 1));
  for (let i = 0; i + 1 < coords.length; i++) out[i] = haversineM(coords[i], coords[i + 1]);
  return out;
}

// ── Tag semantics ────────────────────────────────────────────────────────────

const MAIN_ROADS = new Set(["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"]);
const PAVED_SURFACES = new Set([
  "asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes",
  "paving_stones", "sett", "metal", "wood", "chipseal",
]);
const UNPAVED_SURFACES = new Set([
  "unpaved", "gravel", "fine_gravel", "compacted", "dirt", "earth", "grass",
  "ground", "mud", "sand", "woodchips", "pebblestone", "rock", "stone", "clay",
  "cobblestone", "grass_paver",
]);
const PAVED_CLASSES = new Set([
  "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
  "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
  "unclassified", "service", "living_street", "cycleway", "road", "pedestrian",
]);
const UNPAVED_CLASSES = new Set(["track", "path", "bridleway"]);
const BAD_SMOOTHNESS = new Set(["bad", "very_bad", "horrible", "very_horrible", "impassable"]);

/** km/h from an OSM maxspeed value ("80", "50 mph", "rural" → null). */
export function maxspeedKmh(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return /mph/i.test(raw) ? n * 1.60934 : n;
}

/**
 * Fast-road test (Road Standard rule 2, as applied). "No 80 km/h+ roads
 * unless there is a segregated track" — applied to the roads that are
 * actually fast: regional roads and above (secondary+), or any road the
 * engine estimates as busy (estimated_traffic_class ≥ 4), or anything
 * signed 100 km/h+. A tertiary/unclassified lane carrying the nominal
 * rural default (80 in Ireland, 90 in Spain/France) with no traffic is a
 * quiet lane, not a fast road — applied literally, the rule left Girona
 * with no routable loop at all.
 */
export function isFastRoad(t: WayTags): boolean {
  const kmh = maxspeedKmh(t.maxspeed);
  if (kmh === null || kmh < 80 || hasSegregatedTrack(t)) return false;
  if (kmh >= 100) return true;
  const hw = t.highway ?? "";
  if (MAIN_ROADS.has(hw)) return true;
  const etc = parseInt(t.estimated_traffic_class ?? "", 10);
  if (hw === "secondary" || hw === "secondary_link") {
    // A regional road at 80/90 is fast when the engine estimates it busy
    // (class 4+) or when its traffic is unknown. Class 1–3 regional roads
    // (the GI-5xx lanes around Girona, the Ma-roads round Pollença bay)
    // are what riders go there for.
    return Number.isNaN(etc) || etc >= 4;
  }
  return !Number.isNaN(etc) && etc >= 4;
}

/** A physically separated cycle track alongside the road (a painted lane is not). */
export function hasSegregatedTrack(t: WayTags): boolean {
  if (t.highway === "cycleway") return true;
  const seg = (v?: string) => v === "track" || v === "separate";
  return seg(t.cycleway) || seg(t["cycleway:left"]) || seg(t["cycleway:right"]) || seg(t["cycleway:both"]);
}

/** true = paved, false = unpaved, null = unknown. */
export function isPaved(t: WayTags): boolean | null {
  const s = t.surface ?? "";
  if (PAVED_SURFACES.has(s)) return true;
  if (UNPAVED_SURFACES.has(s)) return false;
  if (t.tracktype && t.tracktype !== "grade1") return false;
  const hw = t.highway ?? "";
  if (PAVED_CLASSES.has(hw)) return true;
  if (UNPAVED_CLASSES.has(hw)) return false;
  return null;
}

export function isRestrictedForBikes(t: WayTags): boolean {
  return t.bicycle === "no" || t.access === "no" || t.access === "private" ||
    (t.motor_vehicle === "designated" && !t.bicycle);
}

// ── Road Standard compromise report ──────────────────────────────────────────

export type CompromiseKind = "main_road" | "fast_road" | "unpaved" | "unsuitable";

export interface Compromise {
  kind: CompromiseKind;
  /** Coordinate index range [start, end] the stretch spans. */
  start: number;
  end: number;
  meters: number;
  highway: string;
  maxspeed?: string;
  surface?: string;
  /** Road ref/name when we could resolve one ("R755", "N81"). */
  name?: string;
  /**
   * The stretch lies within EXIT_ZONE_KM of the start or finish: the way in
   * or out of the start town. A valley or island town (Sóller) often has no
   * exit that meets the standard — every rider there uses it.
   */
  near_start?: boolean;
  /** Midpoint of the stretch [lat, lng] — for the map marker (indices alone
   *  do not map onto a stored track when the report came from a trace). */
  at?: [number, number];
}

export interface RoadReport {
  /** Share (0–100) of distance for which the engine reported road tags. */
  known_pct: number;
  /** Distance share per highway class (0–100). */
  road_class_pct: Record<string, number>;
  surface: { paved_pct: number; unpaved_pct: number; unknown_pct: number };
  main_road_pct: number;
  fast_road_pct: number;
  compromises: Compromise[];
  /** No compromises: every metre meets the Road Standard. */
  standard_met: boolean;
  /** Rider-facing one-liner. */
  summary: string;
  /** ROAD_RULES_VERSION the report was built with (older → re-traced). */
  rules_version?: number;
}

/** Classify one edge against the Road Standard (road discipline is strictest). */
/**
 * Bump when the classification rules change: stored reports with an older
 * (or missing) version are re-traced on next view (api/routes/[id]).
 */
export const ROAD_RULES_VERSION = 4;

// "Unsuitable" by surface is discipline-aware: smoothness=bad is a hazard on
// a road bike and the whole point of a gravel ride; class:bicycle −2 is
// "unsuitable for road bikes" in practice. Access bans and fords stay
// unsuitable for everyone.
const UNSUITABLE_SMOOTHNESS: Record<Discipline, Set<string>> = {
  road: BAD_SMOOTHNESS,
  gravel: new Set(["horrible", "very_horrible", "impassable"]),
  mtb: new Set(["impassable"]),
};
const CLASS_BICYCLE_FLOOR: Record<Discipline, number> = { road: -2, gravel: -3, mtb: -3 };

export function classifyEdge(t: WayTags, discipline: Discipline): CompromiseKind | null {
  const hw = t.highway ?? "";
  if (MAIN_ROADS.has(hw)) return "main_road";
  if (isFastRoad(t)) return "fast_road";
  const cb = parseInt(t["class:bicycle"] ?? "", 10);
  const badClass = !Number.isNaN(cb) && cb <= CLASS_BICYCLE_FLOOR[discipline];
  if (badClass || UNSUITABLE_SMOOTHNESS[discipline].has(t.smoothness ?? "") || isRestrictedForBikes(t) || t.ford === "yes") {
    return "unsuitable";
  }
  if (discipline === "road" && isPaved(t) === false) return "unpaved";
  return null;
}

/** Start/finish zone for the exit allowance (see compromiseAcceptable). */
export const EXIT_ZONE_KM = 6;
// Shorter than this = crossing the road at a junction or a roundabout, not
// riding along it (Faro: 45–96 m traversals of the EN125/N2 ring that every
// loop must cross). Surface/access hazards count from 40 m.
const MIN_COMPROMISE_M: Record<CompromiseKind, number> = { main_road: 100, fast_road: 100, unpaved: 40, unsuitable: 40 };
const MERGE_GAP_M = 60;        // same-kind stretches this close are one stretch

function buildRoadReportInner(
  coords: [number, number][],
  edgeTags: EdgeTags,
  discipline: Discipline
): RoadReport {
  const lens = edgeLengths(coords);
  const n = Math.min(lens.length, edgeTags.length);
  let total = 0, known = 0, paved = 0, unpaved = 0, unknown = 0, main = 0, fast = 0;
  const classM: Record<string, number> = {};

  // Raw per-edge kinds, then run-length into stretches.
  const kinds: Array<CompromiseKind | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const L = lens[i];
    total += L;
    const t = edgeTags[i];
    if (!t || !t.highway) { unknown += L; continue; }
    known += L;
    classM[t.highway] = (classM[t.highway] ?? 0) + L;
    const p = isPaved(t);
    if (p === true) paved += L; else if (p === false) unpaved += L; else unknown += L;
    const kind = classifyEdge(t, discipline);
    kinds[i] = kind;
    if (kind === "main_road") main += L;
    if (kind === "fast_road") fast += L;
  }

  // Runs
  type Run = { kind: CompromiseKind; start: number; end: number; meters: number; tags: WayTags };
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const k = kinds[i];
    if (!k) continue;
    const last = runs[runs.length - 1];
    if (last && last.kind === k && last.end === i) {
      last.end = i + 1;
      last.meters += lens[i];
    } else {
      runs.push({ kind: k, start: i, end: i + 1, meters: lens[i], tags: edgeTags[i]! });
    }
  }
  // Merge same-kind runs separated by a short gap (a junction, a bridge deck).
  const merged: Run[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.kind === r.kind) {
      let gap = 0;
      for (let e = last.end; e < r.start; e++) gap += lens[e];
      if (gap <= MERGE_GAP_M) {
        last.end = r.end;
        last.meters += gap + r.meters;
        continue;
      }
    }
    merged.push({ ...r });
  }

  // Distance along the route at each edge start, for the exit zone.
  const cumM: number[] = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) cumM[i + 1] = cumM[i] + lens[i];
  const exitM = EXIT_ZONE_KM * 1000;

  const compromises: Compromise[] = merged
    .filter((r) => r.meters >= MIN_COMPROMISE_M[r.kind])
    .map((r) => {
      const nearStart = cumM[r.start] <= exitM || total - cumM[Math.min(r.end, n)] <= exitM;
      return {
        kind: r.kind,
        start: r.start,
        end: r.end,
        meters: Math.round(r.meters),
        at: coords[Math.min(coords.length - 1, Math.floor((r.start + r.end) / 2))],
        highway: r.tags.highway ?? "road",
        ...(r.tags.maxspeed ? { maxspeed: r.tags.maxspeed } : {}),
        ...(r.tags.surface ? { surface: r.tags.surface } : {}),
        ...(nearStart ? { near_start: true } : {}),
      };
    })
    .sort((a, b) => b.meters - a.meters);

  const pct = (m: number) => (total > 0 ? Math.round((m / total) * 100) : 0);
  const road_class_pct: Record<string, number> = {};
  for (const [k, v] of Object.entries(classM)) road_class_pct[k] = pct(v);

  const report: RoadReport = {
    known_pct: pct(known),
    road_class_pct,
    surface: { paved_pct: pct(paved), unpaved_pct: pct(unpaved), unknown_pct: pct(unknown) },
    main_road_pct: pct(main),
    fast_road_pct: pct(fast),
    compromises,
    standard_met: compromises.length === 0,
    summary: "",
  };
  report.summary = summarise(report, discipline);
  return report;
}

function summarise(r: RoadReport, discipline: Discipline): string {
  if (r.standard_met) {
    const paved = discipline === "road" ? `, ${r.surface.paved_pct}% paved` : "";
    return `Meets the Loops road standard: no main roads, nothing over 80 km/h${paved}.`;
  }
  const top = r.compromises.slice(0, 2).map(describeCompromise);
  const more = r.compromises.length > 2 ? ` (+${r.compromises.length - 2} more)` : "";
  return `Compromise: ${top.join("; ")}${more}.`;
}

export function describeCompromise(c: Compromise): string {
  const dist = c.meters >= 1000 ? `${(c.meters / 1000).toFixed(1)} km` : `${c.meters} m`;
  const where = c.name ? `on the ${c.name}` : `on a ${roadWord(c.highway)}`;
  const near = c.near_start ? " near the start/finish" : "";
  switch (c.kind) {
    case "main_road": return `${dist} ${where}${near} (main road)`;
    case "fast_road": return `${dist} ${where}${near} signed ${c.maxspeed ?? "80+"} km/h with no cycle track`;
    case "unpaved":   return `${dist} ${where}${near} that is ${c.surface ?? "unpaved"}`;
    case "unsuitable": return `${dist} ${where}${near} tagged unsuitable for bikes`;
  }
}

function roadWord(hw: string): string {
  switch (hw) {
    case "motorway": case "motorway_link": return "motorway";
    case "trunk": case "trunk_link": return "national road";
    case "primary": case "primary_link": return "primary road";
    case "secondary": case "secondary_link": return "regional road";
    case "tertiary": case "tertiary_link": return "tertiary road";
    case "track": return "track";
    case "path": return "path";
    default: return "road";
  }
}

/**
 * Serving policy for a route that does not fully meet the standard. A short,
 * unavoidable stretch is served WITH the compromise marked; anything more is
 * not a route we'd take a friend on.
 */
export function compromiseAcceptable(report: RoadReport, distanceKm: number): boolean {
  if (report.standard_met) return true;
  if (report.compromises.some((c) => c.highway === "motorway" || c.highway === "motorway_link")) return false;
  // Surface/suitability compromises are near-zero tolerance: a road bike on
  // 500 m of dirt is a ruined ride, not a detail. (The engine only takes such
  // a way as an absolute last resort — a via point in a dead end — and we
  // would rather drop that candidate.)
  const unsuitableM = report.compromises.filter((c) => c.kind === "unsuitable").reduce((s, c) => s + c.meters, 0);
  if (unsuitableM > 100) return false;
  const unpavedM = report.compromises.filter((c) => c.kind === "unpaved").reduce((s, c) => s + c.meters, 0);
  if (unpavedM > 200) return false;
  // Main/fast roads: a short, unavoidable link (a bridge, a bypass crossing)
  // is served WITH the warning; anything longer is not our route.
  const roadM = report.compromises.filter((c) => c.kind === "main_road" || c.kind === "fast_road");
  // Exit allowance: the way in/out of the start town. A valley or island
  // town may have no exit that meets the standard (Sóller: 1.6 km of the
  // Ma-11 is how every rider leaves). Up to 2.5 km per stretch and 4 km in
  // total there, always named "near the start/finish"; it does not eat the
  // mid-ride allowance.
  const exitM = roadM.filter((c) => c.near_start);
  const exitTotal = exitM.reduce((s, c) => s + c.meters, 0);
  if (exitM.some((c) => c.meters > 2500) || exitTotal > 4000) return false;
  const midM = roadM.filter((c) => !c.near_start);
  const totalM = midM.reduce((s, c) => s + c.meters, 0);
  const longest = midM.reduce((m, c) => Math.max(m, c.meters), 0);
  const allowance = Math.max(500, distanceKm * 1000 * 0.03);
  return totalM <= allowance && longest <= 1500;
}

/**
 * Serving-policy verdict for PART of a route: only the edges inside `ranges`
 * (half-open [from, to) edge-index ranges) are judged; every other edge is
 * treated as unknown road. Only the distance-independent rules are applied
 * (an exit stretch over 2.5 km / 4 km in total, a mid-ride stretch over
 * 1.5 km, unpaved over 200 m, unsuitable over 100 m, any motorway) — the
 * 3 %-of-the-ride allowance is left out because the ride length is not known
 * for the routes this verdict is meant to stand in for.
 *
 * Compromise stretches only ever add up, so a part that breaks the policy
 * on its own means every route that keeps those edges breaks it too. The
 * generator uses this to skip far-point moves that cannot help: moving the
 * far point re-routes only the two legs that touch it, and when the legs it
 * leaves untouched already carry the disqualifying stretch, five more engine
 * searches would all end in the same rejection.
 */
export function fixedPartBreaksPolicy(
  coords: [number, number][],
  edgeTags: EdgeTags,
  discipline: Discipline,
  ranges: Array<[number, number]>
): boolean {
  const n = Math.min(Math.max(0, coords.length - 1), edgeTags.length);
  const masked: EdgeTags = new Array(n).fill(null);
  for (const [from, to] of ranges) {
    for (let e = Math.max(0, from); e < Math.min(n, to); e++) masked[e] = edgeTags[e];
  }
  const report = buildRoadReport(coords, masked, discipline);
  return !compromiseAcceptable(report, Number.POSITIVE_INFINITY);
}

// ── Quality dimensions from edges ────────────────────────────────────────────

const HIGHWAY_WEIGHTS: Record<string, [number, number, number]> = {
  cycleway:     [25, 20, 18],
  path:         [ 8, 18, 22],
  track:        [ 5, 20, 25],
  bridleway:    [ 3, 16, 22],
  footway:      [ 3, 10, 15],
  living_street:[20, 17, 12],
  residential:  [20, 18, 12],
  service:      [15, 15, 10],
  unclassified: [18, 20, 18],
  tertiary:     [22, 20, 12],
  tertiary_link:[20, 18, 12],
  secondary:    [18, 15,  8],
  secondary_link:[16, 13, 8],
  primary:      [10,  8,  5],
  primary_link: [ 8,  6,  5],
  trunk:        [ 3,  2,  2],
  trunk_link:   [ 3,  2,  2],
  motorway:     [ 0,  0,  0],
  motorway_link:[ 0,  0,  0],
};
const SURFACE_ADJ: Record<string, Record<Discipline, number>> = {
  asphalt:   { road:  5, gravel:  2, mtb: -2 },
  paved:     { road:  4, gravel:  2, mtb: -2 },
  concrete:  { road:  3, gravel:  1, mtb: -2 },
  gravel:    { road: -5, gravel:  5, mtb:  3 },
  unpaved:   { road: -5, gravel:  4, mtb:  3 },
  compacted: { road:  2, gravel:  5, mtb:  3 },
  dirt:      { road: -8, gravel:  2, mtb:  5 },
  grass:     { road:-10, gravel: -3, mtb:  4 },
  sand:      { road:-10, gravel: -5, mtb: -2 },
  mud:       { road:-10, gravel: -8, mtb: -3 },
};
const TRAFFIC_SCORES: Record<string, number> = {
  cycleway: 15, path: 14, track: 14, bridleway: 13, footway: 12, living_street: 13,
  residential: 11, service: 10, unclassified: 10, tertiary_link: 7, tertiary: 7,
  secondary_link: 4, secondary: 4, primary_link: 2, primary: 2,
  trunk_link: 0, trunk: 0, motorway_link: 0, motorway: 0,
};
const SAFE_CLASSES = new Set(["cycleway", "path", "track", "residential", "service", "living_street"]);

export interface EdgeQuality {
  surface_score: number;          // 0–25
  safety_score: number;           // 0–35
  traffic_volume_score: number;   // 0–15
  road_continuity_score: number;  // 0–5
  bicycle_access_score: number;   // 0–15
  flags: string[];
  surface: { paved_pct: number; unpaved_pct: number; unknown_pct: number };
  road_classes: Record<string, number>;
  /** 0–1 share of distance with engine road data. */
  confidence: number;
}

export function scoreEdges(
  coords: [number, number][],
  edgeTags: EdgeTags,
  discipline: Discipline
): EdgeQuality {
  const lens = edgeLengths(coords);
  const n = Math.min(lens.length, edgeTags.length);
  const di = discipline === "road" ? 0 : discipline === "gravel" ? 1 : 2;
  const flags: string[] = [];

  let total = 0, known = 0;
  let surfaceW = 0, trafficW = 0, busyM = 0;
  let dangerM = 0, primaryM = 0, fastM = 0, safeM = 0, motorwayM = 0, restrictedM = 0;
  let changes = 0;
  let lastClass: string | null = null;

  for (let i = 0; i < n; i++) {
    const L = lens[i];
    total += L;
    const t = edgeTags[i];
    const hw = t?.highway;
    if (!t || !hw) {
      surfaceW += 15 * L;  // neutral for unknown
      trafficW += 8 * L;
      continue;
    }
    known += L;

    // Surface / class suitability
    let s = (HIGHWAY_WEIGHTS[hw] ?? [15, 15, 15])[di];
    if (hw === "motorway" || hw === "motorway_link") { motorwayM += L; s = 0; }
    else {
      const adj = SURFACE_ADJ[t.surface ?? ""];
      if (adj) s += adj[discipline];
    }
    surfaceW += Math.max(0, Math.min(25, s)) * L;

    // Safety
    if (hw === "motorway" || hw === "motorway_link" || hw === "trunk" || hw === "trunk_link") dangerM += L;
    else if (hw === "primary" || hw === "primary_link") primaryM += L;
    else if (isFastRoad(t)) fastM += L;
    if (SAFE_CLASSES.has(hw)) safeM += L;

    // Traffic: class proxy, nudged by the engine's estimated traffic class
    let tr = TRAFFIC_SCORES[hw] ?? 8;
    const etc = parseInt(t.estimated_traffic_class ?? "", 10);
    if (!Number.isNaN(etc)) {
      if (etc <= 2) tr = Math.min(15, tr + 1);
      else if (etc === 5) tr = Math.max(0, tr - 2);
      else if (etc >= 6) tr = Math.min(tr, 3);
    }
    trafficW += tr * L;
    if (tr <= 4) busyM += L;

    // Continuity
    if (lastClass !== null && lastClass !== hw) changes++;
    lastClass = hw;

    if (isRestrictedForBikes(t)) restrictedM += L;
  }

  const T = Math.max(1, total);
  const fDanger = dangerM / T, fPrimary = primaryM / T, fFast = fastM / T, fSafe = safeM / T;

  const surface_score = Math.round(surfaceW / T);
  const safety_score = Math.round(
    Math.max(0, Math.min(35, 25 - (3 * fDanger + 1 * fPrimary + 1 * fFast) * 10 + 0.5 * fSafe * 5))
  );
  const traffic_volume_score = Math.round(trafficW / T);
  // Continuity: class changes per 200 m of road (what the sampled scorer measured)
  const changeRate = changes / Math.max(1, T / 200);
  const road_continuity_score = changeRate < 0.15 ? 5 : changeRate < 0.3 ? 4 : changeRate < 0.45 ? 3 : changeRate < 0.6 ? 2 : 1;
  const restrictedPct = restrictedM / T;
  const bicycle_access_score = restrictedM === 0 ? 15 : Math.max(0, 15 - Math.min(15, Math.round(restrictedPct * 30)));

  if (motorwayM > 0) flags.push(`Route uses ${Math.round(motorwayM)} m of motorway — dangerous for cycling`);
  if (dangerM > 0) flags.push("Route uses a trunk/national road — high-speed traffic danger");
  if (primaryM > 0) flags.push("Route uses primary road — moderate traffic");
  if (busyM / T > 0.2) flags.push(`${Math.round((busyM / T) * 100)}% of route is on busy arterial roads`);
  if (changeRate >= 0.45) flags.push("Route frequently switches road type — choppy ride experience likely");
  if (restrictedM > 0) flags.push(`Route passes through bicycle-restricted road (${Math.round(restrictedM)} m)`);
  if (restrictedPct > 0.5) flags.push("Majority of route is on roads restricted to cyclists");

  const report = buildRoadReport(coords, edgeTags, discipline);
  return {
    surface_score,
    safety_score,
    traffic_volume_score,
    road_continuity_score,
    bicycle_access_score,
    flags,
    surface: report.surface,
    road_classes: report.road_class_pct,
    confidence: known / T,
  };
}

// ── Hard rules from edges ────────────────────────────────────────────────────

/**
 * The road rules that used to need an Overpass download, evaluated on the
 * roads the engine actually routed over. Distance-weighted.
 */
export function validateRoadEdges(
  coords: [number, number][],
  edgeTags: EdgeTags,
  discipline: Discipline
): RuleViolation[] {
  const lens = edgeLengths(coords);
  const n = Math.min(lens.length, edgeTags.length);
  const out: RuleViolation[] = [];
  let total = 0, known = 0, mainM = 0, fastM = 0, pavedM = 0, unpavedM = 0, classified = 0, cycleM = 0;
  let fordM = 0;

  // Tunnel runs
  let tunnelRun = 0;
  let tunnelTags: WayTags | null = null;
  const tunnelViolation = (): RuleViolation | null => {
    if (tunnelRun <= 200 || !tunnelTags) return null;
    const t = tunnelTags;
    const ok = t.bicycle === "yes" || t.bicycle === "designated" || t.bicycle === "permissive" || t.highway === "cycleway";
    return ok ? null : {
      rule: "TUNNEL_CHECK",
      message: `Route passes through a ${Math.round(tunnelRun)}m tunnel without explicit cycling access — dangerous`,
      severity: "fatal",
    };
  };

  for (let i = 0; i < n; i++) {
    const L = lens[i];
    total += L;
    const t = edgeTags[i];
    if (!t || !t.highway) {
      const tv = tunnelViolation(); if (tv) { out.push(tv); tunnelRun = 0; tunnelTags = null; }
      tunnelRun = 0; tunnelTags = null;
      continue;
    }
    known += L;
    const hw = t.highway;
    if (MAIN_ROADS.has(hw)) mainM += L;
    if (isFastRoad(t)) fastM += L;
    const p = isPaved(t);
    if (p !== null) { classified += L; if (p) pavedM += L; else unpavedM += L; }
    if (hw === "cycleway" || hw === "path" || t.cycleway || t["cycleway:both"] || t["cycleway:left"] || t["cycleway:right"]) cycleM += L;
    if (t.ford === "yes") fordM += L;

    if (t.tunnel === "yes" || t.tunnel === "building_passage") {
      tunnelRun += L;
      tunnelTags = t;
    } else {
      const tv = tunnelViolation(); if (tv) out.push(tv);
      tunnelRun = 0; tunnelTags = null;
    }
  }
  const tv = tunnelViolation(); if (tv) out.push(tv);

  const T = Math.max(1, total);
  const mainPct = mainM / T;
  if (mainPct > 0.05) {
    out.push({
      rule: "ROAD_TYPE_BLACKLIST",
      message: `${(mainPct * 100).toFixed(1)}% of route is on motorway/trunk/primary (limit: 5%)`,
      severity: "fatal",
    });
  }
  const fastPct = fastM / T;
  if (fastPct > 0.1) {
    out.push({
      rule: "SPEED_LIMIT",
      message: `${(fastPct * 100).toFixed(1)}% of route is on fast roads (80 km/h+ regional/busy roads, or 100 km/h+; limit: 10%)`,
      severity: "fatal",
    });
  }
  if (fordM > 0) {
    out.push({
      rule: "WATER_CROSSING_CHECK",
      message: `Route crosses a ford — ${discipline === "road" ? "unsuitable for road bikes" : "check water levels before riding"}`,
      severity: discipline === "road" ? "fatal" : "warning",
    });
  }
  if (discipline === "road") {
    const cyclePct = cycleM / T;
    if (cyclePct < 0.3) {
      out.push({
        rule: "CYCLING_INFRA",
        message: `Only ${(cyclePct * 100).toFixed(1)}% of road route has dedicated cycleway infrastructure (recommended: 30%)`,
        severity: "warning",
      });
    }
  } else if (classified > 0) {
    const unpavedPct = unpavedM / classified;
    const need = discipline === "gravel" ? 0.5 : 0.6;
    if (unpavedPct < need) {
      out.push({
        rule: "CYCLING_INFRA",
        message: `Only ${(unpavedPct * 100).toFixed(1)}% of ${discipline} route is unpaved (required: ${need * 100}%)`,
        severity: "fatal",
      });
    }
    const pavedPct = pavedM / classified;
    const maxPaved = discipline === "gravel" ? 0.3 : 0.2;
    if (pavedPct > maxPaved) {
      out.push({
        rule: "SURFACE_MISMATCH",
        message: `${(pavedPct * 100).toFixed(1)}% of ${discipline} route is paved (max: ${maxPaved * 100}%)`,
        severity: "fatal",
      });
    }
  }
  if (known / T < 0.7) {
    out.push({
      rule: "ROAD_DATA_COVERAGE",
      message: `Road data covers only ${Math.round((known / T) * 100)}% of the route`,
      severity: "warning",
    });
  }
  return out;
}

// ── Road names for compromise stretches (optional, tiny, fail-soft) ──────────

const NAME_LOOKUP_URL = "https://overpass-api.de/api/interpreter";

/**
 * Resolve "R755"/"N81"-style refs (or names) for compromise stretches so the
 * rider is told exactly where the compromise is. One ~200-byte query per
 * stretch, 1.5 s budget, never throws — a missing name degrades to
 * "on a primary road".
 */
// At most this many name lookups in flight per server instance: five
// candidates × three stretches used to fire 15 at once, which the public
// map service answered with 429s — every name on production came back
// null. A 2.5 s budget fits its usual 1–3 s answer; names are cached by
// spot so the same road is looked up once.
const NAME_MAX_INFLIGHT = 5;
const NAME_TIMEOUT_MS = 1500;      // generation: names never cost the rider more than this
const NAME_MAX_PER_CALL = 2;       // generation: the two longest stretches per candidate
let nameInflight = 0;
const nameQueue: Array<() => void> = [];
const nameCache = new Map<string, string | null>();

async function withNameSlot<T>(run: () => Promise<T>): Promise<T> {
  while (nameInflight >= NAME_MAX_INFLIGHT) await new Promise<void>((r) => nameQueue.push(r));
  nameInflight++;
  try { return await run(); } finally { nameInflight--; nameQueue.shift()?.(); }
}

export async function nameCompromises(
  coords: [number, number][],
  compromises: Compromise[],
  fetchImpl: typeof fetch = fetch,
  opts: { timeoutMs?: number; max?: number } = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? NAME_TIMEOUT_MS;
  const max = opts.max ?? NAME_MAX_PER_CALL;
  await Promise.all(
    compromises.slice(0, max).map(async (c) => {
      const mid = coords[Math.min(coords.length - 1, Math.floor((c.start + c.end) / 2))];
      if (!mid) return;
      const key = `${mid[0].toFixed(4)},${mid[1].toFixed(4)}:${c.highway}`;
      const hit = nameCache.get(key);
      if (hit !== undefined) { if (hit) c.name = hit; return; }
      const q = `[out:json][timeout:2];way(around:25,${mid[0].toFixed(6)},${mid[1].toFixed(6)})["highway"="${c.highway}"];out tags 3;`;
      try {
        await withNameSlot(async () => {
          const res = await fetchImpl(NAME_LOOKUP_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "loops.ie route generator (https://www.loops.ie)" },
            body: `data=${encodeURIComponent(q)}`,
            // Bounded: a name is nice ("on the R755") but never worth
            // stalling scoring. Unnamed degrades to "on a primary road".
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok) return;
          const json = (await res.json()) as { elements?: Array<{ tags?: WayTags }> };
          for (const el of json.elements ?? []) {
            const name = el.tags?.ref ?? el.tags?.name;
            if (name) { c.name = name.split(";")[0].trim(); nameCache.set(key, c.name); return; }
          }
          nameCache.set(key, null);
        });
      } catch {
        /* fail-soft: leave unnamed */
      }
    })
  );
}

/** The road report, stamped with the rules version it was built under. */
export function buildRoadReport(
  coords: [number, number][],
  edgeTags: EdgeTags,
  discipline: Discipline
): RoadReport {
  return { ...buildRoadReportInner(coords, edgeTags, discipline), rules_version: ROAD_RULES_VERSION };
}
