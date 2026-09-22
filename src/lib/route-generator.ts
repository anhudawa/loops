/**
 * Route Generator — Main Orchestrator
 *
 * Pipeline:
 *   1. Parse intent → RouteSpec
 *   2. Library-first match over verified routes. If any hit, serve them.
 *   3. Otherwise fresh-generate:
 *      a. Generate waypoint sets → N candidate waypoint arrays
 *      b. Route each via BRouter (cyclist-built, free, elevation-aware)
 *      c. Validate with hard rules
 *      d. Score with quality system
 *      e. Return top 3 ranked routes
 *
 * BRouter is the router of choice: cyclist-built, returns elevation per
 * coordinate, supports custom cycling profiles, and can be self-hosted.
 * The public demo endpoint is rate-limited and suitable only for dev/staging;
 * production should set BROUTER_URL to a self-hosted instance.
 */

import type { RouteSpec, Discipline, WorkoutSpec } from "./route-intent";
import { parseRouteIntent } from "./route-intent";
import {
  generateWaypointSets,
  DIRECTIONS_WIDE,
} from "./route-waypoint-generator";
import { validateRouteRules, repairSpurs } from "./route-rules";
import { scoreRoute, prefetchScenic, bboxOf, unionBbox } from "./route-quality";
import {
  parseBRouterMessages,
  remapEdgeTags,
  buildRoadReport,
  compromiseAcceptable,
  nameCompromises,
  describeCompromise,
  type EdgeTags,
  type RoadReport,
} from "./road-segments";
import {
  sampleRouteElevation,
  elevationGainFromSeries,
  interpolateToFullPath,
} from "./elevation";
import {
  matchLibraryRoutes,
  matchLibraryForWorkout,
  type LibraryMatch,
  type WorkoutFit,
} from "./route-library";
import {
  detectIntervalSegments,
  segmentsForInterval,
  type IntervalSegment,
} from "./interval-segments";
import { validateSegments, filterCleanSegments } from "./interval-validation";
import {
  QUALITY_FLOOR,
  QUALITY_WORLD_CLASS,
} from "@/config/constants";
import {
  fetchWindForecast,
  analyzeWind,
  alignmentScore as windAlignmentScore,
  type WindForecast,
  type WindStrategy,
} from "./wind";
import { findEffortCorridors, type EffortCorridor } from "./session-assembly";
import { ZONES } from "./intensity";

// ── Types ────────────────────────────────────────────────────────────────────

export type QualityTier = "excellent" | "good";

export interface GeneratedRoute {
  coordinates: [number, number][];
  elevations: number[];         // metres per coordinate, aligned 1:1
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  quality_score: number;
  quality_tier: QualityTier;
  quality_breakdown: Record<string, number>;
  /** Positive highlights from quality scoring: landscape, POIs, surface. */
  highlights: string[];
  road_type_breakdown: Record<string, number>;
  /** Paved/unpaved/unknown share — "know before you go". */
  surface_breakdown?: { paved_pct: number; unpaved_pct: number; unknown_pct: number };
  gpx_data: string;
  waypoints_used: [number, number][];
  match_score: number;          // 0–100 how well it matches the request
  workout_fit?: WorkoutFit;     // present on workout-mode generations
  /** Rider-facing wind summary; present when the request had a wind strategy. */
  wind_note?: string;
  /** 0–100 fit against the requested wind strategy (50 = neutral). */
  wind_alignment_score?: number;
  /** The forecast used, for wind-painting the preview. */
  wind_forecast?: { direction_deg: number; speed_kmh: number };
  /**
   * Road Standard report from the routing engine's own road data: which
   * roads the loop uses and, when it had to compromise, exactly where and
   * for how long ("600 m on the R755"). Trust rule: never a silent bad road.
   */
  road_report?: RoadReport;
}

/**
 * Unified result shape for the /api/generate-route endpoint. The `source`
 * discriminator lets the UI tell a verified library hit from a fresh build
 * — important for the "this was hand-verified" trust signal.
 */
export type RouteCandidate =
  | ({ source: "library" } & LibraryMatch)
  | ({ source: "generated" } & GeneratedRoute);

/**
 * Summary of what the LLM extracted from the user's prompt.
 * Surfaced in the UI as "Interpreted as: …" so the rider can see why
 * we returned the routes we did — and re-prompt if we got it wrong.
 */
export interface InterpretedIntent {
  distance_km: number;
  duration_minutes?: number;
  discipline: "road" | "gravel" | "mtb";
  elevation_preference: "flat" | "rolling" | "hilly" | "mountainous" | "any";
  region?: string;
  country: string;
  is_workout: boolean;
  workout_summary?: string;  // e.g. "2 × 20 min threshold"
  /** Present when the rider asked for wind-aware routing ("tailwind home"). */
  wind_strategy?: WindStrategy;
  cafe_stop?: boolean;
  /** Diagnostics (trust): which parser ran and how the start was found. */
  parser?: "llm" | "basic";
  start_source?: "known_place" | "geocoded" | "origin";
  start_point?: [number, number];
}

export interface GenerateResult {
  interpreted: InterpretedIntent;
  candidates: RouteCandidate[];
  /** Wall-clock seconds per pipeline phase (diagnostics; logged, not shown). */
  timings?: Record<string, number>;
}

// Per-request phase timings. Generation requests are rate-limited per rider
// and a serverless instance rarely runs two at once, so a module-level
// collector is an acceptable diagnostic (worst case: two requests' timings
// interleave — never wrong routes).
let currentTimings: Record<string, number> | null = null;
let currentTimingsStart = 0;
function markPhase(label: string): void {
  if (!currentTimings) return;
  currentTimings[label] = Math.round((Date.now() - currentTimingsStart) / 100) / 10;
}

interface BRouterFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      "track-length"?: string;
      "filtered ascend"?: string;
      "plain-ascend"?: string;
      name?: string;
      messages?: unknown[];
    };
    geometry: {
      type: "LineString";
      coordinates: Array<[number, number, number?]>; // [lng, lat, ele?]
    };
  }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BROUTER_URL =
  process.env.BROUTER_URL?.replace(/\/$/, "") ?? "https://brouter.de/brouter";
const BROUTER_TIMEOUT_MS = 15000;

/**
 * Thrown when every candidate loop was rejected. Carries WHY, so the decline
 * can be honest to the rider (trust rule: never a silent "no") and diagnosable
 * in production without log access.
 */
export class NoValidRoutesError extends Error {
  constructor(
    public readonly candidateCount: number,
    public readonly dropped: Record<string, number>,
    public readonly spec: { distance_km: number; discipline: string; elevation_preference: string; region?: string | null }
  ) {
    super("No valid routes could be generated. Try adjusting distance, location, or route preferences.");
    this.name = "NoValidRoutesError";
  }
}

function pathDistanceKm(coords: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  return d;
}

/** Stage-by-stage rejection logging for generation triage (GENERATE_DEBUG=1). */
function genDebug(msg: string): void {
  if (process.env.GENERATE_DEBUG) console.error(`[generate] ${msg}`);
}

/**
 * BRouter profile per discipline (all verified live on brouter.de).
 * fastbike-lowtraffic = paved-only and quiet-road-preferring — exactly
 * the road product promise. Previously everything used `trekking`,
 * which happily routes a road bike onto dirt tracks.
 */
const DISCIPLINE_PROFILE: Record<Discipline, string> = {
  // loops-road = the CEO Road Standard as a routing profile (no main roads,
  // no 80 km/h+ without a segregated track, paved only, quiet lanes win even
  // when longer). Ships on our own routing server; see scripts/routing/profiles.
  road: process.env.BROUTER_URL ? "loops-road" : "fastbike-lowtraffic",
  gravel: "gravel",
  mtb: "mtb",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalDistanceKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return total;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface GpxWaypoint {
  lat: number;
  lng: number;
  name: string;
  desc?: string;
}

/**
 * Course points for a workout: a waypoint at the start and end of every
 * effort segment so head units (Garmin/Wahoo) fire alerts on course.
 * Names are kept short — some units truncate around 16 characters.
 */
function workoutCoursePoints(
  coords: [number, number][],
  fit: WorkoutFit,
  workout: WorkoutSpec
): GpxWaypoint[] {
  const points: GpxWaypoint[] = [];
  let effortNum = 0;
  for (const a of fit.interval_segments) {
    effortNum += 1;
    const iv = workout.intervals[a.interval_index];
    const zone = iv ? iv.zone.toUpperCase() : "EFFORT";
    const mins = iv ? `${iv.duration_minutes}min` : "";
    const start = coords[a.segment.start_index];
    const end = coords[a.segment.end_index];
    if (!start || !end) continue;
    points.push({
      lat: start[0], lng: start[1],
      name: `EFFORT ${effortNum} GO`,
      desc: `${mins} ${zone}`.trim(),
    });
    points.push({
      lat: end[0], lng: end[1],
      name: `EFFORT ${effortNum} END`,
      desc: "Recover",
    });
  }
  return points;
}

function buildGpx(
  coords: [number, number][],
  elevations: number[] | null,
  name: string,
  discipline: string,
  waypoints: GpxWaypoint[] = []
): string {
  const now = new Date().toISOString();
  const trkpts = coords
    .map(([lat, lng], i) => {
      const ele = elevations && elevations[i] != null && !Number.isNaN(elevations[i])
        ? `<ele>${elevations[i].toFixed(1)}</ele>`
        : "";
      return `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${ele}</trkpt>`;
    })
    .join("\n");

  const wpts = waypoints
    .map(
      (w) =>
        `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lng.toFixed(6)}"><name>${escapeXml(w.name)}</name>${w.desc ? `<desc>${escapeXml(w.desc)}</desc>` : ""}<sym>Flag, Blue</sym></wpt>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="loops.ie"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <author><name>loops.ie</name></author>
    <time>${now}</time>
  </metadata>
${wpts ? wpts + "\n" : ""}  <trk>
    <name>${escapeXml(name)}</name>
    <type>${escapeXml(discipline)}</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

// ── BRouter routing ──────────────────────────────────────────────────────────

interface RoutedPath {
  coords: [number, number][];   // [lat, lng]
  elevations: number[];         // metres per coord, NaN if missing
  distance_km: number;
  elevation_gain_m: number | null;  // null when BRouter omitted it
  /** Per-edge OSM way tags from the engine (null when it sent none). */
  edgeTags: EdgeTags | null;
  /** Profile that produced this path (the relaxed fallback marks a compromise). */
  profile: string;
}

/** Why the most recent BRouter call returned null — surfaced in decline diagnostics. */
let lastBRouterFailure = "unknown";
export function getLastBRouterFailure(): string { return lastBRouterFailure; }

/**
 * Strict profile → relaxed fallback. The strict road profile FORBIDS main
 * roads, 80 km/h+ roads and unpaved surfaces, so when the only way through
 * is one of those it returns no route at all. The relaxed profile makes
 * them very expensive instead of impossible; the resulting stretch is then
 * measured and named by the compromise report (or the candidate is dropped
 * if the compromise is too long). Trust rule: say so, never serve silently.
 */
const RELAXED_PROFILE: Record<string, string> = { "loops-road": "loops-road-relaxed" };

/** Strict-profile route with one retry when the engine's watchdog killed
 *  the request (server saturation is load, not "no route"). */
async function routeStrict(waypoints: [number, number][], profile: string): Promise<RoutedPath | null> {
  const path = await routeViaBRouter(waypoints, profile);
  if (path || !/watchdog/i.test(lastBRouterFailure)) return path;
  await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
  return routeViaBRouter(waypoints, profile);
}

// "error re-tracking track": the engine found a track but could not re-run
// it under the strict profile's cost ceiling (seen on Mallorca; the same
// waypoints route fine on the relaxed profile) — treat as no route under
// the standard.
const NO_ROUTE_RE = /no track found|target island|not found|re-tracking/i;

async function routeWithFallback(
  waypoints: [number, number][],
  profile: string
): Promise<RoutedPath | null> {
  const strict = await routeStrict(waypoints, profile);
  if (strict) return strict;
  const relaxed = RELAXED_PROFILE[profile];
  // Only a genuine "no route under the standard" earns the relaxed profile.
  if (!relaxed || !NO_ROUTE_RE.test(lastBRouterFailure)) return null;
  const strictFailure = lastBRouterFailure;
  const path = await routeViaBRouter(waypoints, relaxed);
  if (!path) { lastBRouterFailure = strictFailure; return null; }
  genDebug(`candidate routed on the relaxed profile (strict: ${strictFailure})`);
  return path;
}

/**
 * Engine concurrency gate. Our BRouter runs N worker threads; a request
 * beyond that is killed by its watchdog ("operation killed by
 * thread-priority-watchdog"). Keep in-flight calls below the thread count
 * so 5 candidates never cost us one. BROUTER_THREADS defaults to the 4 we
 * provision (scripts/routing/cloud-init-brouter.yaml).
 */
const BROUTER_MAX_INFLIGHT = Math.max(1, (parseInt(process.env.BROUTER_THREADS ?? "4", 10) || 4) - 1);
let brouterInflight = 0;
const brouterQueue: Array<() => void> = [];
async function withEngineSlot<T>(run: () => Promise<T>): Promise<T> {
  while (brouterInflight >= BROUTER_MAX_INFLIGHT) {
    await new Promise<void>((resolve) => brouterQueue.push(resolve));
  }
  brouterInflight++;
  try {
    return await run();
  } finally {
    brouterInflight--;
    brouterQueue.shift()?.();
  }
}

// ── Loop-aware routing ───────────────────────────────────────────────────────

/** A loop that would lose more than this to spur repair gets re-routed. */
const LOOP_RETRACE_FIX_KM = 1.5;
/**
 * Engine-time budget for the routing phase of one request. Every optional
 * improvement (moving the far point, no-go returns, distance fit) checks
 * this deadline; the mandatory route and its relaxed fallback do not. Keeps
 * a 5-candidate request inside the 55 s pipeline budget even when the
 * engine is slow (mountain tiles, strict no-route searches ≈ 3–4 s each).
 */
const ROUTING_BUDGET_MS = 24_000;
/** Still losing more than this after the no-go return → try moving the far point. */
const LOOP_MOVE_FAR_KM = 3.0;
/** No-go weight for the outbound roads when routing the return leg. Tested on
 *  the local engine: weight 50 cut a 9.7 km retrace to 4.3 km; a hard no-go
 *  (no weight) blew the return leg up to 96 km. */
const LOOP_NOGO_WEIGHT = 50;

function bearingDegFrom(a: [number, number], b: [number, number]): number {
  const p1 = (a[0] * Math.PI) / 180, p2 = (b[0] * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function destination(a: [number, number], bearing: number, distKm: number): [number, number] {
  const R = 6371, d = distKm / R, b = (bearing * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180, lon1 = (a[1] * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

/**
 * Weighted no-go polyline from an outbound path: the roads it used, minus
 * the first `skipStartKm` (the return must converge on the start) and the
 * last `skipEndKm` (the return must be able to leave the far point).
 */
function nogoPolyline(coords: [number, number][], skipStartKm: number, skipEndKm: number): string {
  const pts: [number, number][] = [];
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
  const total = cum[cum.length - 1];
  let last = -1;
  for (let i = 0; i < coords.length; i++) {
    if (cum[i] <= skipStartKm || cum[i] >= total - skipEndKm) continue;
    if (last >= 0 && cum[i] - cum[last] < 0.25) continue; // ~250 m spacing keeps the URL short
    pts.push(coords[i]);
    last = i;
  }
  if (pts.length < 2) return "";
  return `&polylines=${pts.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(",")},${LOOP_NOGO_WEIGHT}`;
}

function joinPaths(a: RoutedPath, b: RoutedPath): RoutedPath {
  const dup =
    b.coords.length > 0 && a.coords.length > 0 &&
    Math.abs(a.coords[a.coords.length - 1][0] - b.coords[0][0]) < 1e-6 &&
    Math.abs(a.coords[a.coords.length - 1][1] - b.coords[0][1]) < 1e-6;
  const from = dup ? 1 : 0;
  const coords = a.coords.concat(b.coords.slice(from));
  const elevations = a.elevations.concat(b.elevations.slice(from));
  const aTags: EdgeTags = a.edgeTags ?? new Array(Math.max(0, a.coords.length - 1)).fill(null);
  const bTags: EdgeTags = b.edgeTags ?? new Array(Math.max(0, b.coords.length - 1)).fill(null);
  // Without a shared point there is an extra bridging edge between the legs.
  const bridge: EdgeTags = dup ? [] : [null];
  const edgeTags = aTags.concat(bridge, bTags);
  return {
    coords,
    elevations,
    distance_km: a.distance_km + b.distance_km,
    elevation_gain_m: null, // recomputed from the joined series by the caller
    edgeTags: edgeTags.some((t) => t) ? edgeTags : null,
    profile: a.profile,
  };
}

/**
 * Route a loop candidate so it does not retrace itself. Via-point routing
 * treats each leg independently, and on a real road network the approach
 * to and departure from the far point often funnel onto the same road — a
 * long U-turn finger that spur repair then cuts out (the loop comes back
 * 10–20 km short). When the one-shot route would lose more than
 * LOOP_RETRACE_FIX_KM to repair, try: (A) two legs, the return penalised for
 * reusing the outbound roads; (B/C) the same with the far point rotated
 * ±25° around the start. Keep whichever loses the least, closest to the
 * requested distance on a tie. Every attempt is a real engine route, so
 * nothing here can invent a road.
 */
async function routeLoopCandidate(
  waypoints: [number, number][],
  profile: string,
  targetKm: number,
  discipline: Discipline,
  deadline: number = Date.now() + ROUTING_BUDGET_MS
): Promise<RoutedPath | null> {
  const timeLeft = () => Date.now() < deadline;
  const start = waypoints[0];
  const inner = waypoints.slice(1, waypoints.length - 1);
  let farIdx = 1;
  let farDist = -1;
  inner.forEach((w, i) => {
    const d = haversineKm(start[0], start[1], w[0], w[1]);
    if (d > farDist) { farDist = d; farIdx = i + 1; }
  });
  const far = waypoints[farIdx];
  const farBearing = bearingDegFrom(start, far);
  const moveFar = (bearing: number, dist: number) =>
    waypoints.map((w, i) => (i === farIdx ? destination(start, bearing, dist) : w));

  // Strict first. A far point that is an "island" under the standard (a
  // village whose only paved access is a main road, or a track), or one the
  // engine can only reach by falling back on a forbidden road (its cost
  // ceiling makes those a last resort, not impossible), is not a reason to
  // compromise — move the far point and stay on the standard. The relaxed
  // profile is the last resort, not the second attempt.
  const compromiseM = (p: RoutedPath): number => {
    if (!p.edgeTags) return 0;
    const r = buildRoadReport(p.coords, p.edgeTags, discipline);
    return compromiseAcceptable(r, p.distance_km) ? 0 : r.compromises.reduce((a, c) => a + c.meters, 0);
  };
  let first = await routeStrict(waypoints, profile);
  let firstCompromise = first ? compromiseM(first) : Infinity;
  if (waypoints.length >= 4 && (first ? firstCompromise > 0 : NO_ROUTE_RE.test(lastBRouterFailure))) {
    const strictFailure = first ? `${Math.round(firstCompromise)} m of compromise` : lastBRouterFailure;
    const moved: Array<{ label: string; wps: [number, number][] }> = [
      { label: "far point +25°", wps: moveFar(farBearing + 25, farDist) },
      { label: "far point -25°", wps: moveFar(farBearing - 25, farDist) },
      { label: "far point pulled in 30%", wps: moveFar(farBearing, farDist * 0.7) },
      { label: "far point +45°", wps: moveFar(farBearing + 45, farDist * 0.85) },
      { label: "far point -45°", wps: moveFar(farBearing - 45, farDist * 0.85) },
    ];
    for (const m of moved) {
      if (!timeLeft()) { genDebug("routing budget spent — skipping further far-point moves"); break; }
      const p = await routeStrict(m.wps, profile);
      if (!p) continue;
      const c = compromiseM(p);
      if (c < firstCompromise) {
        genDebug(`strict route improved with ${m.label}: ${c === 0 ? "meets the standard" : `${Math.round(c)} m of compromise`} (before: ${strictFailure})`);
        first = p;
        firstCompromise = c;
        waypoints = m.wps;
      }
      if (c === 0) break;
    }
    if (!first) lastBRouterFailure = strictFailure;
  }
  if (!first) first = await routeWithFallback(waypoints, profile);
  if (!first) return null;

  const lossOf = (p: RoutedPath) => repairSpurs(p.coords).removedKm;
  // A strict result that is wildly over the requested distance, or mostly
  // retrace, is the engine detouring around a fragmented quiet-lane network
  // (Girona: 137–204 km for an 80 km ask, 37–80 km of it retraced). That is
  // "no sane route under the standard" — try the relaxed profile, whose
  // main-road links the compromise policy then measures and names, or drops.
  const garbage = (p: RoutedPath) => p.distance_km > targetKm * 1.6 || lossOf(p) > p.distance_km * 0.35;
  const relaxed = RELAXED_PROFILE[profile];
  if (relaxed && first.profile === profile && garbage(first)) {
    const alt = await routeViaBRouter(waypoints, relaxed);
    if (alt && alt.coords.length >= 2 && !garbage(alt)) {
      genDebug(`strict route was ${first.distance_km.toFixed(0)} km with ${lossOf(first).toFixed(0)} km retrace for a ${targetKm} km ask — using the relaxed profile (${alt.distance_km.toFixed(0)} km), compromise to be measured`);
      first = alt;
    }
  }

  // Distance fit: the waypoint radius assumes roads add ~30% over straight
  // lines. Where the network detours more (Girona: 112 km for an 80 km ask)
  // or less, scale the loop's inner points toward/away from the start once
  // and re-route on the same profile. One extra engine call, kept only if
  // it lands closer to the ask without retracing more.
  if (waypoints.length >= 4 && timeLeft()) {
    const served = first.distance_km - lossOf(first);
    const ratio = targetKm / Math.max(1, served);
    if (ratio < 0.8 || ratio > 1.25) {
      const scale = Math.max(0.5, Math.min(1.5, ratio));
      const scaled = waypoints.map((w, i) =>
        i === 0 || i === waypoints.length - 1
          ? w
          : destination(start, bearingDegFrom(start, w), haversineKm(start[0], start[1], w[0], w[1]) * scale)
      );
      const p = await routeViaBRouter(scaled, first.profile);
      if (p && p.coords.length >= 2) {
        const pServed = p.distance_km - lossOf(p);
        const gain = Math.abs(served - targetKm) - Math.abs(pServed - targetKm); // km closer to the ask
        const accept =
          (gain > 0 && lossOf(p) <= lossOf(first) + 1) ||
          (gain > targetKm * 0.2 && lossOf(p) <= lossOf(first) + 3);
        if (accept) {
          genDebug(`distance fit: ${served.toFixed(0)} km → ${pServed.toFixed(0)} km for a ${targetKm} km ask (inner points scaled ×${scale.toFixed(2)})`);
          first = p;
          waypoints = scaled;
          farDist *= scale;
        } else {
          genDebug(`distance fit rejected: scaled ×${scale.toFixed(2)} gave ${pServed.toFixed(0)} km (loss ${lossOf(p).toFixed(1)} km) vs ${served.toFixed(0)} km (loss ${lossOf(first).toFixed(1)} km)`);
        }
      } else {
        genDebug(`distance fit: scaled ×${scale.toFixed(2)} did not route (${lastBRouterFailure})`);
      }
    }
  }

  let best = first;
  let bestLoss = lossOf(first);
  if (bestLoss <= LOOP_RETRACE_FIX_KM || waypoints.length < 4) return first;

  // Attempt order: keep the far point (no-go return only); then, if the
  // loop still loses a lot, move the far point — rotated either way, then
  // pulled in — because a far point on a peninsula, in a cul-de-sac or (with
  // no anchor data) in the sea can only be reached and left by one road.
  const attempts: Array<{ label: string; wps: [number, number][]; onlyIfLossAbove: number }> = [
    { label: "no-go return", wps: waypoints, onlyIfLossAbove: LOOP_RETRACE_FIX_KM },
    { label: "far point +25° + no-go return", wps: moveFar(farBearing + 25, farDist), onlyIfLossAbove: LOOP_MOVE_FAR_KM },
    { label: "far point -25° + no-go return", wps: moveFar(farBearing - 25, farDist), onlyIfLossAbove: LOOP_MOVE_FAR_KM },
    { label: "far point pulled in 30% + no-go return", wps: moveFar(farBearing, farDist * 0.7), onlyIfLossAbove: LOOP_MOVE_FAR_KM },
  ];
  const usedProfile = first.profile;
  const consider = (p: RoutedPath, label: string) => {
    const loss = lossOf(p);
    // A loop that ends up more than 50% off the requested distance is not
    // a fix, whatever it saves in retrace — and neither is a route so
    // retraced that repair would have to cut half of it (a 160 km route
    // "repaired" to 80 km is garbage geometry, not an 80 km loop).
    const fits =
      Math.abs(p.distance_km - loss - targetKm) <= targetKm * 0.5 &&
      p.distance_km <= targetKm * 1.6;
    const better =
      fits && (
        loss < bestLoss - 0.2 ||
        (Math.abs(loss - bestLoss) <= 0.2 &&
          Math.abs(p.distance_km - loss - targetKm) < Math.abs(best.distance_km - bestLoss - targetKm)));
    genDebug(`loop-aware ${label}: ${p.distance_km.toFixed(1)} km, would lose ${loss.toFixed(1)} km (best so far ${bestLoss.toFixed(1)})`);
    if (better) { best = p; bestLoss = loss; }
  };

  for (const { label, wps, onlyIfLossAbove } of attempts) {
    if (bestLoss <= onlyIfLossAbove) continue;
    if (!timeLeft()) { genDebug("routing budget spent — skipping further loop-shape attempts"); break; }
    const outPath = await routeViaBRouter(wps.slice(0, farIdx + 1), usedProfile);
    if (!outPath || outPath.coords.length < 2) continue;
    const nogo = nogoPolyline(outPath.coords, 2.0, 0.3);
    const backPath = await routeViaBRouter(wps.slice(farIdx), usedProfile, false, nogo);
    if (!backPath || backPath.coords.length < 2) continue;
    consider(joinPaths(outPath, backPath), label);
  }
  return best;
}


async function routeViaBRouter(
  waypoints: [number, number][],       // [lat, lng]
  profile: string,
  retried = false,
  extraQuery = ""                      // e.g. "&polylines=…" (weighted no-go)
): Promise<RoutedPath | null> {
  // BRouter expects lonlats as "lng,lat|lng,lat|..."
  const lonlats = waypoints.map(([lat, lng]) => `${lng},${lat}`).join("|");
  const url =
    `${BROUTER_URL}?lonlats=${lonlats}` +
    `&profile=${encodeURIComponent(profile)}` +
    `&alternativeidx=0&format=geojson${extraQuery}`;

  let res: Response;
  try {
    res = await withEngineSlot(() => fetch(url, { signal: AbortSignal.timeout(BROUTER_TIMEOUT_MS) }));
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    lastBRouterFailure = name === "TimeoutError" || name === "AbortError" ? `timeout>${BROUTER_TIMEOUT_MS}ms` : `network:${(e instanceof Error ? e.message : String(e)).slice(0, 80)}`;
    return null;
  }
  if (!res.ok) {
    lastBRouterFailure = `http:${res.status}`;
    const body = res.status === 400 ? await res.text().catch(() => "") : "";
    if (body) lastBRouterFailure = `http:${res.status}:${body.slice(0, 80).replace(/\s+/g, " ")}`;
    // "target island detected for section N" = waypoint N+1 is unreachable
    // (offshore island, private estate, sea). Drop it and retry once —
    // a triangle loop beats a dead candidate.
    if (res.status === 400 && !retried && waypoints.length > 3) {
      const match = body.match(/island detected for section (\d+)/);
      if (match) {
        const badIdx = Math.min(parseInt(match[1], 10) + 1, waypoints.length - 2);
        const pruned = waypoints.filter((_, i) => i !== badIdx);
        return routeViaBRouter(pruned, profile, true, extraQuery);
      }
    }
    return null;
  }

  let json: BRouterFeatureCollection;
  try {
    json = (await res.json()) as BRouterFeatureCollection;
  } catch {
    return null;
  }

  const feature = json.features?.[0];
  if (!feature || !feature.geometry?.coordinates?.length) return null;

  const coords: [number, number][] = feature.geometry.coordinates.map(
    ([lng, lat]) => [lat, lng]
  );
  const elevations: number[] = feature.geometry.coordinates.map(([, , ele]) =>
    typeof ele === "number" ? ele : NaN
  );

  const trackLen = feature.properties["track-length"];
  const ascend = feature.properties["filtered ascend"] ?? feature.properties["plain-ascend"];

  return {
    coords,
    elevations,
    distance_km: trackLen ? Number(trackLen) / 1000 : totalDistanceKm(coords),
    elevation_gain_m: ascend !== undefined ? Number(ascend) : null,
    edgeTags: parseBRouterMessages(feature.properties.messages, coords),
    profile,
  };
}

// ── Match scoring ────────────────────────────────────────────────────────────

function computeMatchScore(
  actual_distance_km: number,
  actual_elevation_gain_m: number,
  spec: RouteSpec,
  quality_score: number
): number {
  let score = 100;

  const distDiff = Math.abs(actual_distance_km - spec.distance_km);
  const tolerance = spec.distance_tolerance_km;
  if (distDiff > tolerance) {
    const overagePct = (distDiff - tolerance) / spec.distance_km;
    score -= Math.min(40, overagePct * 200);
  }

  if (spec.max_elevation_gain_m !== undefined) {
    if (actual_elevation_gain_m > spec.max_elevation_gain_m) {
      const overage = actual_elevation_gain_m - spec.max_elevation_gain_m;
      score -= Math.min(30, (overage / spec.max_elevation_gain_m) * 60);
    }
  }

  // Quality score contribution (up to 30pts)
  score = score * 0.7 + quality_score * 0.3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Pick the positive, rider-facing highlights from the quality flags.
 * Quality flags include both warnings ("Route near trunk") and positive
 * signals ("Diverse landscape: coast, water"). We show only the good ones.
 */
function extractHighlights(flags: string[]): string[] {
  const positivePatterns = [
    /^Diverse landscape/i,
    /viewpoint/i,
    /^Near café/i,
    /^Near restaurant/i,
    /^Near pub/i,
    /drinking.water/i,
    /historic/i,
    /castle/i,
    /village/i,
    /coast/i,
    /lake/i,
    /forest/i,
    /peak/i,
  ];
  return flags
    .filter((f) => positivePatterns.some((p) => p.test(f)))
    .slice(0, 5);
}

function computeRoadTypeBreakdown(_coords: [number, number][]): Record<string, number> {
  // Detailed road-type analysis is already done in scoreRoute via Overpass.
  return { estimated: 100 };
}

// ── Reroute (route editing) ──────────────────────────────────────────────────

export interface RerouteResult {
  coordinates: [number, number][];
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  gpx_data: string;
  /** Geometric rule check — surfaced so the editor can warn honestly. */
  warnings: string[];
}

/**
 * Re-route a user-edited set of via points (drag-to-edit on the map).
 * Same BRouter profiles and geometric guardrails as generation; quality
 * re-scoring is skipped for speed — the editor shows a "re-checked
 * surfaces on export" note instead.
 */
export async function rerouteWaypoints(
  waypoints: [number, number][],
  discipline: Discipline
): Promise<RerouteResult | null> {
  if (waypoints.length < 2 || waypoints.length > 10) return null;
  const profile = DISCIPLINE_PROFILE[discipline];
  const path = await routeViaBRouter(waypoints, profile);
  if (!path || path.coords.length < 2) return null;

  let elevations = path.elevations;
  let elevGain = path.elevation_gain_m;
  let elevLoss: number | null = null;
  const hasElevation = elevations.some((e) => !Number.isNaN(e));
  if (!hasElevation) {
    const sampled = await sampleRouteElevation(path.coords, 200);
    // The sampled series is DOWNSAMPLED — expand back to one elevation
    // per coordinate so the 1:1 alignment contract holds.
    elevations = interpolateToFullPath(path.coords, sampled.sampled_coords, sampled.elevations);
    elevGain = sampled.gain_m;
    elevLoss = sampled.loss_m;
  } else if (elevGain === null) {
    elevGain = elevationGainFromSeries(elevations);
  }
  if (elevLoss === null) {
    let loss = 0;
    for (let i = 1; i < elevations.length; i++) {
      const d = elevations[i] - elevations[i - 1];
      if (d < 0 && !Number.isNaN(d)) loss += -d;
    }
    elevLoss = Math.round(loss);
  }

  const distKm = path.distance_km;
  const rules = validateRouteRules(path.coords, discipline, null, {
    elevationGain: elevGain ?? 0,
    distanceKm: distKm,
  });
  const warnings = rules.passed
    ? []
    : rules.violations.map((v) => v.message);

  return {
    coordinates: path.coords,
    elevations,
    distance_km: Math.round(distKm * 10) / 10,
    elevation_gain_m: Math.round(elevGain ?? 0),
    elevation_loss_m: elevLoss,
    gpx_data: buildGpx(
      path.coords,
      elevations,
      `Edited ${discipline} route — ${Math.round(distKm)}km`,
      discipline
    ),
    warnings,
  };
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface GenerateRouteOptions {
  /** The rider's average cycling speed in km/h. Used to personalise the
   * duration → distance conversion so "2 hour loop" means the right
   * distance for that specific rider, not a baseline 25 km/h rider. */
  userSpeedKmh?: number;
  /** The rider's current location [lat, lng] from the browser, used as the
   * start point when the prompt doesn't name a place. */
  origin?: [number, number];
}

/**
 * Back-compat: return freshly generated routes only, same shape as before.
 * Use `generateRouteCandidates` to get the library+generated unified shape
 * with the interpreted-intent summary.
 */
export async function generateRoutes(
  prompt: string,
  options: GenerateRouteOptions = {}
): Promise<GeneratedRoute[]> {
  const { candidates } = await generateRouteCandidates(prompt, options);
  return candidates
    .filter((c): c is { source: "generated" } & GeneratedRoute => c.source === "generated")
    .map(({ source: _source, ...rest }) => rest);
}

/**
 * Main pipeline. Always tries the library first. If any verified route
 * scores above the match threshold, we serve those and skip fresh
 * generation entirely — a known-good route beats a freshly built one
 * every time for trust.
 */
export async function generateRouteCandidates(
  prompt: string,
  options: GenerateRouteOptions = {}
): Promise<GenerateResult> {
  currentTimings = {};
  currentTimingsStart = Date.now();
  const spec = await parseRouteIntent(prompt, {
    userSpeedKmh: options.userSpeedKmh,
    origin: options.origin,
  });
  markPhase("intent");
  const interpreted = await summariseIntent(spec);
  markPhase("summarise");
  const candidates = await candidatesFromSpec(spec);
  markPhase("total");
  const timings = currentTimings;
  currentTimings = null;
  return { interpreted, candidates, timings: timings ?? undefined };
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
      {
        headers: { "User-Agent": "loops.ie route generator (https://www.loops.ie)" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    return addr?.suburb || addr?.town || addr?.city || addr?.village || addr?.county || null;
  } catch {
    return null;
  }
}

async function summariseIntent(spec: RouteSpec): Promise<InterpretedIntent> {
  let workout_summary: string | undefined;
  if (spec.workout) {
    workout_summary = spec.workout.intervals
      .map((iv) => {
        const zoneName = ({
          z1: "recovery",
          z2: "endurance",
          z3: "tempo",
          z4: "threshold",
          z5: "vo2max",
          z6: "anaerobic",
          z7: "sprint",
        } as const)[iv.zone];
        return `${iv.count} × ${iv.duration_minutes} min ${zoneName}`;
      })
      .join(", then ");
  }

  // When the start point came from browser GPS (no region in prompt),
  // reverse-geocode it so the "Interpreted as" panel shows a place name
  // instead of raw coordinates.
  let region = spec.region;
  if (!region && spec.start_point) {
    const placeName = await reverseGeocode(spec.start_point[0], spec.start_point[1]);
    if (placeName) region = placeName;
  }

  return {
    distance_km: spec.distance_km,
    duration_minutes: spec.duration_minutes,
    discipline: spec.discipline,
    elevation_preference: spec.elevation_preference,
    region,
    country: spec.country,
    is_workout: !!spec.workout,
    workout_summary,
    wind_strategy: spec.wind_strategy !== "none" ? spec.wind_strategy : undefined,
    cafe_stop: spec.cafe_stop || undefined,
    parser: spec.parser,
    start_source: spec.start_source,
    start_point: spec.start_point,
  };
}

/** Rough ride duration for forecasting which hour the rider is on each leg. */
function estimateDurationMinutes(spec: RouteSpec): number {
  return spec.duration_minutes ?? Math.round((spec.distance_km / 25) * 60);
}

/**
 * Wind wrapper around candidate selection. Fetches the forecast for the
 * ride window once, lets generation use it for ranking, then annotates
 * every served candidate (library or generated) with an honest wind note.
 * Forecast failure or light wind never blocks generation — we degrade
 * and say so, per the launch spec.
 */
/**
 * Generate candidates from an already-built RouteSpec — used by the smoke
 * test and any future structured (non-LLM) entry points.
 */
export async function candidatesFromSpec(spec: RouteSpec): Promise<RouteCandidate[]> {
  const forecast =
    spec.wind_strategy !== "none"
      ? await fetchWindForecast(
          spec.start_point,
          new Date(),
          estimateDurationMinutes(spec),
          spec.wind_strategy
        )
      : null;
  markPhase("wind");

  const candidates = await candidatesFromSpecInner(spec, forecast);

  if (spec.wind_strategy !== "none") {
    for (const c of candidates) {
      if (forecast) {
        const analysis = analyzeWind(c.coordinates, forecast, spec.wind_strategy);
        c.wind_note = analysis.note;
        if (c.source === "generated") {
          c.wind_alignment_score = analysis.alignment_score;
          c.wind_forecast = {
            direction_deg: forecast.direction_deg,
            speed_kmh: forecast.speed_kmh,
          };
        }
      } else {
        c.wind_note =
          "Couldn't reach the wind forecast — this route isn't wind-optimised.";
      }
    }
  }

  return candidates;
}

async function candidatesFromSpecInner(
  spec: RouteSpec,
  windForecast: WindForecast | null
): Promise<RouteCandidate[]> {

  // ── Workout mode ───────────────────────────────────────────────────────────
  // A workout is a hard constraint: either the route's segments can host it
  // or they can't. Library-first still wins when available (known-good >
  // freshly built). Only if nothing in the library fits do we attempt a
  // fresh workout-aware generation. If even that fails we surface the
  // failure honestly rather than ship a generic route mislabelled as
  // workout-friendly.
  if (spec.workout) {
    const workoutMatches = await matchLibraryForWorkout(spec, 3).catch(() => []);
    if (workoutMatches.length > 0) {
      return workoutMatches.map((m) => ({ source: "library" as const, ...m }));
    }
    // Anchor-first (spec §3): find the effort road, build the loop
    // around it. Falls back to route-first wide search, then declines.
    const anchored = await assembleAnchorFirstWorkout(spec, spec.workout);
    if (anchored.length > 0) {
      return anchored.map((g) => ({ source: "generated" as const, ...g }));
    }
    const freshWorkout = await generateFreshWorkoutRoutes(spec, spec.workout);
    if (freshWorkout.length === 0) {
      throw new Error(workoutDeclineMessage(spec.workout));
    }
    return freshWorkout.map((g) => ({ source: "generated" as const, ...g }));
  }

  // ── Library-first ──────────────────────────────────────────────────────────
  // Fail soft: a DB outage must never block fresh generation.
  const libraryMatches = await matchLibraryRoutes(spec, 3).catch(() => []);
  markPhase("library");
  if (libraryMatches.length > 0) {
    return libraryMatches.map((m) => ({ source: "library" as const, ...m }));
  }

  // ── Fresh generation ───────────────────────────────────────────────────────
  const generated = await generateFreshRoutes(spec, windForecast);
  markPhase("fresh");

  // If none of the fresh builds hit "excellent", try to mix in library
  // routes as fallback. A verified operator route at "good" match is
  // better than a generated one at "good" quality — trust signal.
  const hasExcellent = generated.some((g) => g.quality_tier === "excellent");
  if (!hasExcellent && generated.length > 0) {
    const libraryFallbacks = await matchLibraryRoutes(spec, 2).catch(() => []);
    if (libraryFallbacks.length > 0) {
      return [
        ...libraryFallbacks.map((m) => ({ source: "library" as const, ...m })),
        ...generated.slice(0, 1).map((g) => ({ source: "generated" as const, ...g })),
      ];
    }
  }

  return generated.map((g) => ({ source: "generated" as const, ...g }));
}

/**
 * Anchor-first session assembly (launch spec §3): find a qualifying
 * effort corridor near the start FIRST, then build the loop around it —
 * warm-up leg out, efforts as laps of the corridor (ride the stretch,
 * spin back, repeat), cool-down home. Efforts are engineered onto a road
 * that can hold them, not hoped for.
 */
async function assembleAnchorFirstWorkout(
  spec: RouteSpec,
  workout: WorkoutSpec
): Promise<GeneratedRoute[]> {
  const profile = DISCIPLINE_PROFILE[spec.discipline];

  // Corridor must hold the most demanding block (longest distance need).
  let needBlock = workout.intervals[0];
  let needKm = 0;
  for (const iv of workout.intervals) {
    const km = ZONES[iv.zone].terrain.min_length_km_per_minute * iv.duration_minutes;
    if (km > needKm) {
      needKm = km;
      needBlock = iv;
    }
  }
  const totalReps = workout.intervals.reduce((s, iv) => s + iv.count, 0);

  let corridors: EffortCorridor[];
  try {
    corridors = await findEffortCorridors(
      spec.start_point,
      needBlock.zone,
      needBlock.duration_minutes,
      { limit: 2 }
    );
  } catch (err) {
    genDebug(`anchor-first: corridor search failed — ${err instanceof Error ? err.message : err}`);
    return [];
  }
  genDebug(`anchor-first: ${corridors.length} qualifying corridor(s)`);

  const results: GeneratedRoute[] = [];
  for (const corridor of corridors) {
    try {
      const route = await buildLoopAroundCorridor(spec, workout, corridor, totalReps, profile);
      if (route) results.push(route);
    } catch (err) {
      genDebug(`anchor-first: assembly failed — ${err instanceof Error ? err.message : err}`);
    }
    if (results.length >= 2) break;
  }
  results.sort((a, b) => b.match_score - a.match_score);
  return results;
}

async function buildLoopAroundCorridor(
  spec: RouteSpec,
  workout: WorkoutSpec,
  corridor: EffortCorridor,
  totalReps: number,
  profile: string
): Promise<GeneratedRoute | null> {
  const A = corridor.coords[0];

  // Spec §3: minimum 15 minutes riding before effort 1. If the corridor
  // is close, detour the warm-up leg to make up the time.
  const warmupNeedKm = (Math.max(15, workout.warmup_minutes) / 60) * 24; // easy pace
  let warmupLeg = await routeViaBRouter([spec.start_point, A], profile);
  if (warmupLeg && warmupLeg.distance_km < warmupNeedKm * 0.7) {
    const deficit = warmupNeedKm - warmupLeg.distance_km;
    const brg = ((Math.atan2(
      Math.sin(((A[1] - spec.start_point[1]) * Math.PI) / 180) * Math.cos((A[0] * Math.PI) / 180),
      Math.cos((spec.start_point[0] * Math.PI) / 180) * Math.sin((A[0] * Math.PI) / 180) -
        Math.sin((spec.start_point[0] * Math.PI) / 180) * Math.cos((A[0] * Math.PI) / 180) *
          Math.cos(((A[1] - spec.start_point[1]) * Math.PI) / 180)
    ) * 180) / Math.PI + 360) % 360;
    // Detour point ~120° off the direct line, half the deficit out
    const detourBrg = ((brg + 120) * Math.PI) / 180;
    const dKm = deficit / 2;
    const detour: [number, number] = [
      spec.start_point[0] + (dKm / 111.32) * Math.cos(detourBrg),
      spec.start_point[1] + (dKm / (111.32 * Math.cos((spec.start_point[0] * Math.PI) / 180))) * Math.sin(detourBrg),
    ];
    const extended = await routeViaBRouter([spec.start_point, detour, A], profile);
    if (extended && extended.distance_km > warmupLeg.distance_km) {
      genDebug(`anchor-first: warm-up extended ${warmupLeg.distance_km.toFixed(1)}km → ${extended.distance_km.toFixed(1)}km (need ~${warmupNeedKm.toFixed(1)}km)`);
      warmupLeg = extended;
    }
  }
  if (!warmupLeg || warmupLeg.coords.length < 2) {
    genDebug("anchor-first: no warm-up leg to corridor");
    return null;
  }

  // Assemble: warm-up → [effort A→B, spin back B→A] × (reps−1) → final
  // effort A→B → home. All efforts run the same direction, so the
  // qualified gradient profile applies to every rep.
  const coords: [number, number][] = [];
  const elevations: number[] = [];
  // Per-edge road tags from the engine, aligned with `coords` (null where a
  // segment came from the corridor finder, which carries no tags).
  const edgeTags: EdgeTags = [];

  // Truncate the traversal to the longest rep's needed distance plus a
  // short roll-off: a 30-second effort must not drag the rider down an
  // 8 km corridor end to end on every rep.
  let maxNeedKm = 0;
  for (const iv of workout.intervals) {
    const km = ZONES[iv.zone].terrain.min_length_km_per_minute * iv.duration_minutes;
    if (km > maxNeedKm) maxNeedKm = km;
  }
  const traverseKm = Math.min(corridor.length_km, maxNeedKm + 0.4);
  let cut = corridor.coords.length;
  {
    let cum = 0;
    for (let i = 1; i < corridor.coords.length; i++) {
      cum += haversineKm(
        corridor.coords[i - 1][0], corridor.coords[i - 1][1],
        corridor.coords[i][0], corridor.coords[i][1]
      );
      if (cum >= traverseKm) {
        cut = i + 1;
        break;
      }
    }
  }
  const corridorCoords = corridor.coords.slice(0, cut);
  const corridorElev = corridor.elevations.slice(0, cut);
  const reverseCoords = [...corridorCoords].reverse();
  const reverseElev = [...corridorElev].reverse();

  const B = corridorCoords[corridorCoords.length - 1];
  const homeLeg = await routeViaBRouter([B, spec.end_point], profile);
  if (!homeLeg || homeLeg.coords.length < 2) {
    genDebug("anchor-first: no leg home from corridor");
    return null;
  }

  const push = (cs: [number, number][], es: number[], tags: EdgeTags | null = null) => {
    // Skip the first point only when it actually duplicates the tail
    // (~1 m tolerance) — BRouter legs snap to slightly different points,
    // and unconditionally dropping a real point left a gap in effort 1.
    let start = 0;
    if (coords.length > 0 && cs.length > 0) {
      const tail = coords[coords.length - 1];
      if (Math.abs(tail[0] - cs[0][0]) < 1e-5 && Math.abs(tail[1] - cs[0][1]) < 1e-5) {
        start = 1;
      }
    }
    for (let i = start; i < cs.length; i++) {
      // Edge into this point: from the leg's own edge (i-1 → i) when known,
      // else the bridging edge from the previous leg's tail (untagged).
      if (coords.length > 0) edgeTags.push(i > 0 ? tags?.[i - 1] ?? null : null);
      coords.push(cs[i]);
      elevations.push(es[i]);
    }
  };

  push(warmupLeg.coords, warmupLeg.elevations, warmupLeg.edgeTags);

  // Effort segment bounds (by traversal): efforts occupy the corridor up
  // to the zone's required distance; any remainder is roll-off.
  const intervalPlan: Array<{ interval_index: number; rep_index: number; zone: string; duration: number }> = [];
  workout.intervals.forEach((iv, ii) => {
    for (let r = 0; r < iv.count; r++) {
      intervalPlan.push({ interval_index: ii, rep_index: r, zone: iv.zone, duration: iv.duration_minutes });
    }
  });

  const segments: WorkoutFit["interval_segments"] = [];
  const candidateSegments: IntervalSegment[] = [];

  for (let rep = 0; rep < totalReps; rep++) {
    const plan = intervalPlan[rep];
    const needRepKm =
      ZONES[plan.zone as keyof typeof ZONES].terrain.min_length_km_per_minute * plan.duration;

    const effortStartIdx = coords.length - 1;
    push(corridorCoords, corridorElev);

    // Find where the rep's needed distance is reached within the traverse
    let cum = 0;
    let effortEndIdx = coords.length - 1;
    for (let i = effortStartIdx + 1; i < coords.length; i++) {
      cum += haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      if (cum >= needRepKm) {
        effortEndIdx = i;
        break;
      }
    }

    const seg: IntervalSegment = {
      start_index: effortStartIdx,
      end_index: effortEndIdx,
      length_km: Math.round(Math.min(cum, corridor.length_km) * 10) / 10,
      avg_gradient_pct: corridor.avg_gradient_pct,
      max_gradient_pct: corridor.max_gradient_pct,
      gradient_variance: corridor.gradient_variance,
      suitable_zones: [plan.zone as IntervalSegment["suitable_zones"][number]],
    };
    segments.push({ interval_index: plan.interval_index, rep_index: plan.rep_index, segment: seg });
    if (rep === 0) candidateSegments.push(seg);

    // Spin back for the next rep (not after the last)
    if (rep < totalReps - 1) {
      push(reverseCoords, reverseElev);
    }
  }

  push(homeLeg.coords, homeLeg.elevations, homeLeg.edgeTags);

  // Elevation gaps from BRouter legs: backfill NaNs by interpolation
  for (let i = 0; i < elevations.length; i++) {
    if (Number.isNaN(elevations[i])) {
      let j = i + 1;
      while (j < elevations.length && Number.isNaN(elevations[j])) j++;
      const prev = i > 0 ? elevations[i - 1] : elevations[j] ?? 0;
      const next = j < elevations.length ? elevations[j] : prev;
      for (let k = i; k < j; k++) {
        elevations[k] = prev + ((next - prev) * (k - i + 1)) / (j - i + 1);
      }
    }
  }

  const distKm = totalDistanceKm(coords);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < elevations.length; i++) {
    const d = elevations[i] - elevations[i - 1];
    if (d > 0) gain += d;
    else loss += -d;
  }

  const rulesResult = validateRouteRules(coords, spec.discipline, null, {
    elevationGain: Math.round(gain),
    distanceKm: distKm,
    rejectSpurs: true,
  });
  if (!rulesResult.passed) {
    genDebug(`anchor-first: assembled loop failed rules — ${rulesResult.violations?.map((v) => v.rule).join("; ")}`);
    return null;
  }

  // Engine road tags cover the legs; the corridor itself was already
  // road-checked by the corridor finder. Scoring from tags avoids the full
  // road download (the workout path's main timeout source).
  const taggedShare = edgeTags.filter(Boolean).length / Math.max(1, edgeTags.length);
  const quality = await scoreRoute(coords, spec.discipline, taggedShare >= 0.5 ? { edgeTags } : {});
  if (quality.total < QUALITY_FLOOR) {
    genDebug(`anchor-first: assembled loop quality ${quality.total} < ${QUALITY_FLOOR}`);
    return null;
  }
  const roadReport = taggedShare >= 0.5 ? buildRoadReport(coords, edgeTags, spec.discipline) : undefined;
  if (roadReport && !compromiseAcceptable(roadReport, distKm)) {
    genDebug(`anchor-first: assembled loop fails the road standard — ${roadReport.summary}`);
    return null;
  }

  const fit: WorkoutFit = {
    fits: true,
    interval_segments: segments,
    candidate_segments: candidateSegments,
  };

  const matchScore = computeMatchScore(distKm, Math.round(gain), spec, quality.total);

  return {
    coordinates: coords,
    elevations,
    distance_km: Math.round(distKm * 10) / 10,
    elevation_gain_m: Math.round(gain),
    elevation_loss_m: Math.round(loss),
    quality_score: quality.total,
    quality_tier: quality.total >= QUALITY_WORLD_CLASS ? "excellent" : "good",
    quality_breakdown: quality.breakdown as unknown as Record<string, number>,
    highlights: extractHighlights(quality.flags),
    road_type_breakdown: quality.road_class_breakdown ?? computeRoadTypeBreakdown(coords),
    surface_breakdown: quality.surface_breakdown,
    gpx_data: buildGpx(
      coords,
      elevations,
      `Workout ${spec.discipline} route — ${Math.round(distKm)}km`,
      spec.discipline,
      workoutCoursePoints(coords, fit, workout)
    ),
    waypoints_used: [spec.start_point, A, B],
    match_score: matchScore,
    workout_fit: fit,
    ...(roadReport ? { road_report: roadReport } : {}),
  };
}

/**
 * Honest decline with a concrete alternative (launch spec: never silently
 * serve a compromised segment — say so and suggest what would work).
 * Splitting the longest interval in half is the most common fix: a clean
 * 10-minute stretch is far easier to find than a clean 20.
 */
function workoutDeclineMessage(workout: WorkoutSpec): string {
  const longest = workout.intervals.reduce(
    (max, iv) => (iv.duration_minutes > max.duration_minutes ? iv : max),
    workout.intervals[0]
  );
  const base = `I couldn't find roads near your start point that can hold ${longest.count} × ${longest.duration_minutes} min uninterrupted at that intensity.`;
  if (longest.duration_minutes >= 12) {
    const half = Math.round(longest.duration_minutes / 2);
    return `${base} Splitting it into ${longest.count * 2} × ${half} min would be much easier to place — or try a different start location.`;
  }
  return `${base} Try a different start location, or a slightly shorter interval.`;
}

// ── Workout-aware fresh generation ───────────────────────────────────────────

/**
 * Greedy assignment of workout reps to detected segments.
 * Mirrors assignWorkout in route-library.ts — duplicated here to avoid a
 * circular import on a tiny helper.
 */
function assignWorkoutToSegments(
  segments: IntervalSegment[],
  workout: WorkoutSpec
): WorkoutFit {
  const allCandidates: IntervalSegment[] = [];
  const assignments: WorkoutFit["interval_segments"] = [];
  const used = new Set<number>();

  for (let i = 0; i < workout.intervals.length; i++) {
    const iv = workout.intervals[i];
    const candidates = segmentsForInterval(segments, iv.zone, iv.duration_minutes);
    allCandidates.push(...candidates);

    for (let rep = 0; rep < iv.count; rep++) {
      let pickedIdx = -1;
      for (let s = 0; s < segments.length; s++) {
        if (used.has(s)) continue;
        if (!candidates.some((c) => c.start_index === segments[s].start_index)) continue;
        pickedIdx = s;
        break;
      }
      if (pickedIdx === -1) {
        return { fits: false, interval_segments: assignments, candidate_segments: dedupe(allCandidates) };
      }
      assignments.push({ interval_index: i, rep_index: rep, segment: segments[pickedIdx] });
      used.add(pickedIdx);
    }
  }

  return { fits: true, interval_segments: assignments, candidate_segments: dedupe(allCandidates) };
}

function dedupe(segments: IntervalSegment[]): IntervalSegment[] {
  const seen = new Set<string>();
  const out: IntervalSegment[] = [];
  for (const s of segments) {
    const key = `${s.start_index}-${s.end_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Build a route from a BRouter path (no library / no quality scoring).
 * Used by the workout generator — for workouts, segment fit is the quality
 * signal, not OSM road-type breakdowns.
 */
async function buildFreshRouteFromPath(
  path: Awaited<ReturnType<typeof routeViaBRouter>>,
  waypoints: [number, number][],
  spec: RouteSpec
): Promise<GeneratedRoute | null> {
  if (!path || path.coords.length < 2) return null;

  let elevations = path.elevations;
  let elevGain = path.elevation_gain_m;
  let elevLoss: number | null = null;

  const hasElevation = elevations.some((e) => !Number.isNaN(e));
  if (!hasElevation) {
    const sampled = await sampleRouteElevation(path.coords, 200);
    // Downsampled series → expand to full resolution (1:1 with coords).
    elevations = interpolateToFullPath(path.coords, sampled.sampled_coords, sampled.elevations);
    elevGain = sampled.gain_m;
    elevLoss = sampled.loss_m;
  } else if (elevGain === null) {
    elevGain = elevationGainFromSeries(elevations);
  }

  if (elevLoss === null) {
    let loss = 0;
    for (let i = 1; i < elevations.length; i++) {
      const d = elevations[i] - elevations[i - 1];
      if (d < 0 && !Number.isNaN(d)) loss += -d;
    }
    elevLoss = Math.round(loss);
  }

  const distKm = path.distance_km;
  const gain = elevGain ?? 0;

  const rulesResult = validateRouteRules(path.coords, spec.discipline, null, {
    elevationGain: gain,
    distanceKm: distKm,
    labeledMinClimbing:
      spec.elevation_preference === "flat" &&
      (spec.max_elevation_gain_m ?? Infinity) < distKm * 6,
    rejectSpurs: true,
  });
  if (!rulesResult.passed) return null;

  const gpx = buildGpx(
    path.coords,
    elevations,
    `Generated ${spec.discipline} route — ${Math.round(distKm)}km`,
    spec.discipline
  );

  return {
    coordinates: path.coords,
    elevations,
    distance_km: Math.round(distKm * 10) / 10,
    elevation_gain_m: gain,
    elevation_loss_m: elevLoss,
    // Placeholder quality — the caller (generateFreshWorkoutRoutes) runs
    // scoreRoute on candidates that fit the workout and applies the
    // QUALITY_FLOOR, exactly like the plain generation path.
    quality_score: 0,
    quality_tier: "good" as QualityTier,
    quality_breakdown: {},
    highlights: [],
    road_type_breakdown: { estimated: 100 },
    gpx_data: gpx,
    waypoints_used: waypoints,
    match_score: computeMatchScore(distKm, gain, spec, 50),
  };
}

/**
 * Fresh workout-aware generation. Called only when the library has no
 * verified route that fits the workout. Widens the candidate net to 8
 * compass directions and keeps only the routes whose segments can host
 * every interval rep.
 */
async function generateFreshWorkoutRoutes(
  spec: RouteSpec,
  workout: WorkoutSpec
): Promise<GeneratedRoute[]> {
  const profile = DISCIPLINE_PROFILE[spec.discipline];
  const waypointSets = await generateWaypointSets(spec, {
    directions: DIRECTIONS_WIDE,
  });

  const results = await Promise.allSettled(
    waypointSets.map(async (waypoints): Promise<GeneratedRoute | null> => {
      const path = await routeWithFallback(waypoints, profile);
      const route = await buildFreshRouteFromPath(path, waypoints, spec);
      if (!route) return null;

      const rawSegments = detectIntervalSegments(route.coordinates, route.elevations);
      const validated = await validateSegments(rawSegments, route.coordinates);
      const cleanSegments = filterCleanSegments(validated);
      const fit = assignWorkoutToSegments(cleanSegments, workout);
      if (!fit.fits) return null;

      // Workout candidates face the same quality bar as plain generation:
      // hosting the efforts doesn't excuse an industrial-estate loop.
      const quality = await scoreRoute(route.coordinates, spec.discipline, { edgeTags: path?.edgeTags ?? null });
      if (quality.total < QUALITY_FLOOR) {
        genDebug(`workout candidate dropped: quality ${quality.total} < floor ${QUALITY_FLOOR}`);
        return null;
      }
      const roadReport = path?.edgeTags ? buildRoadReport(route.coordinates, path.edgeTags, spec.discipline) : undefined;
      if (roadReport && !compromiseAcceptable(roadReport, route.distance_km)) {
        genDebug(`workout candidate dropped: road standard — ${roadReport.summary}`);
        return null;
      }

      // Rebuild the GPX with effort course points so head units alert
      // at the start and end of every interval.
      const gpxWithEfforts = buildGpx(
        route.coordinates,
        route.elevations,
        `Workout ${spec.discipline} route — ${Math.round(route.distance_km)}km`,
        spec.discipline,
        workoutCoursePoints(route.coordinates, fit, workout)
      );

      return {
        ...route,
        quality_score: quality.total,
        quality_tier: (quality.total >= QUALITY_WORLD_CLASS ? "excellent" : "good") as QualityTier,
        quality_breakdown: quality.breakdown as unknown as Record<string, number>,
        highlights: extractHighlights(quality.flags),
        road_type_breakdown: quality.road_class_breakdown ?? route.road_type_breakdown,
        surface_breakdown: quality.surface_breakdown,
        match_score: computeMatchScore(route.distance_km, route.elevation_gain_m, spec, quality.total),
        workout_fit: fit,
        gpx_data: gpxWithEfforts,
        ...(roadReport ? { road_report: roadReport } : {}),
      };
    })
  );

  const candidates: GeneratedRoute[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value !== null) candidates.push(r.value);
  }

  candidates.sort((a, b) => b.match_score - a.match_score);
  return candidates.slice(0, 3);
}

async function generateFreshRoutes(
  spec: RouteSpec,
  windForecast: WindForecast | null = null
): Promise<GeneratedRoute[]> {
  const profile = DISCIPLINE_PROFILE[spec.discipline];

  const waypointSets = await generateWaypointSets(spec);
  markPhase("waypoints");

  // Kick off the scenery lookup NOW, for the whole search area, so it runs
  // while the engine routes the candidates. The engine reports the roads;
  // scenery (coast, water, forest, peaks, cafés) is the one external lookup
  // left, and it is the slowest step, so it must not wait for routing.
  const searchBbox = unionBbox(waypointSets.map((w) => bboxOf(w, 0.08)));
  const scenicPromise = prefetchScenic(searchBbox);

  // Why candidates were dropped (surfaced on a full decline).
  const dropped: Record<string, number> = {};
  const drop = (reason: string) => { dropped[reason] = (dropped[reason] ?? 0) + 1; };

  // Optional geometry dump for spur/route triage (GENERATE_DUMP_DIR=/path).
  const dumpDir = process.env.GENERATE_DUMP_DIR;
  const dump = async (name: string, data: unknown) => {
    if (!dumpDir) return;
    try {
      const fs = await import("node:fs/promises");
      await fs.mkdir(dumpDir, { recursive: true });
      await fs.writeFile(`${dumpDir}/${name}.json`, JSON.stringify(data));
    } catch { /* diagnostics only */ }
  };

  // ── Phase 1: route every candidate on our engine (parallel) ─────────────
  interface Routed {
    waypoints: [number, number][];
    path: RoutedPath;
    elevations: number[];
    elevGain: number;
    elevLoss: number;
    edgeTags: EdgeTags | null;
  }
  const routed: Routed[] = [];
  const t0 = Date.now();
  const routingDeadline = t0 + ROUTING_BUDGET_MS;
  const lap = (label: string) => genDebug(`⏱ ${label} at +${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await Promise.all(
    waypointSets.map(async (waypoints) => {
      const path = await routeLoopCandidate(waypoints, profile, spec.distance_km, spec.discipline, routingDeadline);
      if (!path || path.coords.length < 2) {
        genDebug(`candidate dropped: BRouter returned no path (${getLastBRouterFailure()}) for ${JSON.stringify(waypoints.map((w) => [+w[0].toFixed(4), +w[1].toFixed(4)]))}`);
        drop(`NO_PATH[${getLastBRouterFailure()}]`);
        return;
      }

      // Backfill elevation from Open-Meteo if BRouter didn't return any (rare
      // but possible if the profile skips SRTM). This is the safety net for
      // our "minimal climbing" trust guarantee — we NEVER ship a route with
      // unknown elevation.
      let elevations = path.elevations;
      let elevGain = path.elevation_gain_m;
      let elevLoss: number | null = null;

      const hasElevation = elevations.some((e) => !Number.isNaN(e));
      if (!hasElevation) {
        const sampled = await sampleRouteElevation(path.coords, 200);
        elevations = interpolateToFullPath(path.coords, sampled.sampled_coords, sampled.elevations);
        elevGain = sampled.gain_m;
        elevLoss = sampled.loss_m;
      } else if (elevGain === null) {
        elevGain = elevationGainFromSeries(elevations);
      }

      // Repair via-point spurs (U-turn fingers) instead of discarding the
      // candidate: splice the excursion out of coords, elevations AND road
      // tags, then recompute distance/climb. SPUR_UTURN stays as backstop.
      let edgeTags = path.edgeTags;
      const rawCoords = dumpDir ? path.coords.slice() : null;
      const repair = repairSpurs(path.coords);
      if (rawCoords) {
        await dump(`candidate-${waypointSets.indexOf(waypoints)}`, {
          waypoints, profile: path.profile, raw_km: path.distance_km, raw: rawCoords,
          repaired: repair.coords, removed_km: repair.removedKm, edge_tags: path.edgeTags,
        });
      }
      if (repair.removedKm > 0.15) {
        path.coords = repair.coords;
        elevations = repair.keep.map((k) => elevations[k]);
        edgeTags = remapEdgeTags(edgeTags, repair.keep);
        path.distance_km = Math.round(pathDistanceKm(path.coords) * 10) / 10;
        elevGain = elevationGainFromSeries(elevations);
        genDebug(`candidate repaired: removed ${Math.round(repair.removedKm * 1000)} m of via-point spur`);
      }

      if (elevLoss === null) {
        let loss = 0;
        for (let i = 1; i < elevations.length; i++) {
          const d = elevations[i] - elevations[i - 1];
          if (d < 0 && !Number.isNaN(d)) loss += -d;
        }
        elevLoss = Math.round(loss);
      }

      routed.push({ waypoints, path, elevations, elevGain: elevGain ?? 0, elevLoss, edgeTags });
    })
  );

  lap(`phase 1 routed ${routed.length}/${waypointSets.length} candidates`);
  markPhase("routing");

  // ── Phase 2: one scenery lookup for the whole batch ─────────────────────
  // Roads come from the engine, so the only external data left is scenery
  // (coast, water, forest, peaks, cafés). One roads-free query for the union
  // of all candidates replaces N per-candidate road downloads — the single
  // biggest latency and timeout source in generation. Fail-soft: null means
  // "scenery not assessed", reported honestly and left out of the score.
  const withTags = routed.filter((r) => r.edgeTags && r.edgeTags.length > 0);
  const scenic = withTags.length > 0 ? await scenicPromise : undefined;
  if (withTags.length > 0) {
    genDebug(`scenery ${scenic ? `loaded (${scenic.length} elements)` : "unavailable"} for ${withTags.length} engine-tagged candidate(s)`);
  }
  lap("phase 2 scenery");
  markPhase("scenery");

  // ── Phase 3: guardrails → road standard → quality (CPU-bound, parallel) ──
  const candidateResults = await Promise.allSettled(
    routed.map(async ({ waypoints, path, elevations, elevGain, elevLoss, edgeTags }): Promise<GeneratedRoute | null> => {
      const distKm = path.distance_km;
      const gain = elevGain;

      const rulesResult = validateRouteRules(path.coords, spec.discipline, null, {
        elevationGain: gain,
        distanceKm: distKm,
        labeledMinClimbing:
          spec.elevation_preference === "flat" &&
          (spec.max_elevation_gain_m ?? Infinity) < distKm * 6,
        rejectSpurs: true,
      });
      if (!rulesResult.passed) {
        genDebug(`candidate dropped: rules — ${rulesResult.violations?.map((v) => v.rule).join("; ") ?? "failed"} (${Math.round(distKm)}km)`);
        for (const v of rulesResult.violations ?? []) if (v.severity === "fatal") drop(v.rule);
        return null;
      }

      // Distance honesty: a "100 km loop" is not 17 km and not 146 km. The
      // match score already penalises the gap, but with few survivors a
      // wildly-off loop could still be served — decline instead.
      const distanceAllowance = Math.max(8, spec.distance_km * 0.35);
      if (Math.abs(distKm - spec.distance_km) > distanceAllowance) {
        genDebug(`candidate dropped: ${Math.round(distKm)} km for a ${spec.distance_km} km ask (allowance ±${Math.round(distanceAllowance)} km)`);
        drop("DISTANCE_OFF");
        return null;
      }

      // Road Standard (engine-native). A compromise stretch is measured and,
      // if short and unavoidable, served WITH the warning; anything longer
      // is not a route we'd take a friend on.
      let roadReport: RoadReport | undefined;
      if (edgeTags && edgeTags.length > 0) {
        roadReport = buildRoadReport(path.coords, edgeTags, spec.discipline);
        if (!compromiseAcceptable(roadReport, distKm)) {
          genDebug(`candidate dropped: road standard — ${roadReport.summary}`);
          drop("ROAD_STANDARD");
          return null;
        }
        if (!roadReport.standard_met) {
          // Name the stretch ("R755") so the rider knows exactly where it is.
          await nameCompromises(path.coords, roadReport.compromises);
          roadReport.summary = summariseCompromises(roadReport.compromises);
        }
      } else if (process.env.BROUTER_URL) {
        genDebug("candidate has no engine road tags — falling back to OSM road download for scoring");
      }

      let quality;
      try {
        quality = await scoreRoute(path.coords, spec.discipline, {
          edgeTags,
          scenic: edgeTags ? scenic : undefined,
        });
      } catch (err) {
        genDebug(`candidate dropped: quality scoring threw — ${err instanceof Error ? err.message : err}`);
        drop("QUALITY_ERROR");
        throw err;
      }

      const gpx = buildGpx(
        path.coords,
        elevations,
        `Generated ${spec.discipline} route — ${Math.round(distKm)}km`,
        spec.discipline
      );

      let matchScore = computeMatchScore(distKm, gain, spec, quality.total);

      // Wind alignment shapes the ranking: a loop oriented for the
      // requested tailwind beats an equally good one that ignores it.
      // 15% weight — wind helps pick between good routes, it never
      // rescues a bad one.
      if (windForecast && spec.wind_strategy !== "none") {
        const ws = windAlignmentScore(path.coords, windForecast, spec.wind_strategy);
        matchScore = Math.round(matchScore * 0.85 + ws * 0.15);
      }

      // Café stop requested: prefer candidates whose quality scan found
      // cafés/restaurants along the way (a nudge, never a rescue).
      if (spec.cafe_stop) {
        const hasCafe = quality.flags.some((f) => /caf|restaurant|pub/i.test(f));
        matchScore = Math.min(100, Math.round(matchScore + (hasCafe ? 6 : -4)));
      }

      // Drop candidates below the quality floor — these are routes on
      // industrial estates, motorway slip roads, or featureless suburban
      // laps. Serving one is the "one bad experience" we can't afford.
      if (quality.total < QUALITY_FLOOR) {
        genDebug(`candidate dropped: quality ${quality.total} < floor ${QUALITY_FLOOR} (${Math.round(distKm)}km; flags: ${quality.flags.slice(0, 3).join("; ")})`);
        drop("QUALITY_BELOW_FLOOR");
        return null;
      }

      const result: GeneratedRoute = {
        coordinates: path.coords,
        elevations,
        distance_km: Math.round(distKm * 10) / 10,
        elevation_gain_m: gain,
        elevation_loss_m: elevLoss,
        quality_score: quality.total,
        quality_tier: quality.total >= QUALITY_WORLD_CLASS ? "excellent" : "good",
        quality_breakdown: quality.breakdown as unknown as Record<string, number>,
        highlights: extractHighlights(quality.flags),
        road_type_breakdown: quality.road_class_breakdown ?? computeRoadTypeBreakdown(path.coords),
        surface_breakdown: quality.surface_breakdown,
        gpx_data: gpx,
        waypoints_used: waypoints,
        match_score: matchScore,
        ...(roadReport ? { road_report: roadReport } : {}),
      };

      return result;
    })
  );

  const candidates: GeneratedRoute[] = [];
  for (const result of candidateResults) {
    if (result.status === "fulfilled" && result.value !== null) {
      candidates.push(result.value);
    }
  }

  lap(`phase 3 scored → ${candidates.length} candidate(s) served`);
  markPhase("scoring");

  if (candidates.length === 0) {
    dropped["_engine"] = (() => { try { return new URL(BROUTER_URL).host; } catch { return "?"; } })() as unknown as number;
    throw new NoValidRoutesError(waypointSets.length, dropped, {
      distance_km: spec.distance_km,
      discipline: spec.discipline,
      elevation_preference: spec.elevation_preference,
      region: spec.region ?? null,
    });
  }

  // Rank: routes that fully meet the road standard first, then world-class
  // tier, then match accuracy, quality, distance fit.
  candidates.sort((a, b) => {
    const aStd = a.road_report ? (a.road_report.standard_met ? 1 : 0) : 0;
    const bStd = b.road_report ? (b.road_report.standard_met ? 1 : 0) : 0;
    if (bStd !== aStd) return bStd - aStd;
    const aTier = a.quality_tier === "excellent" ? 1 : 0;
    const bTier = b.quality_tier === "excellent" ? 1 : 0;
    if (bTier !== aTier) return bTier - aTier;
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
    const aDist = Math.abs(a.distance_km - spec.distance_km);
    const bDist = Math.abs(b.distance_km - spec.distance_km);
    return aDist - bDist;
  });

  return candidates.slice(0, 3);
}

function summariseCompromises(compromises: RoadReport["compromises"]): string {
  const top = compromises.slice(0, 2).map(describeCompromise);
  const more = compromises.length > 2 ? ` (+${compromises.length - 2} more)` : "";
  return `Compromise: ${top.join("; ")}${more}.`;
}
