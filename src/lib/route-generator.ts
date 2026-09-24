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
import { estimateRideMinutes } from "./ride-time";
import { mergeLoopReport } from "./library-road-report";
import { parseRouteIntent, durationToDistanceKm } from "./route-intent";
import {
  generateWaypointSets,
  DIRECTIONS_WIDE,
} from "./route-waypoint-generator";
import { validateRouteRules, repairSpurs } from "./route-rules";
import { scoreRoute, prefetchScenic, bboxOf, unionBbox, setSceneryStore, qualityTier } from "./route-quality";
import { getSceneryCache, setSceneryCache } from "./db";

// Persist scenery lookups in Postgres (server only; fail-soft without a DB).
setSceneryStore({ get: getSceneryCache, set: setSceneryCache });
import {
  parseBRouterMessages,
  parseBRouterStops,
  type RoadStop,
  remapEdgeTags,
  buildRoadReport,
  compromiseAcceptable,
  fixedPartBreaksPolicy,
  nameCompromises,
  describeCompromise,
  summaryParts,
  stretchJunctions,
  type StretchJunctions,
  EXIT_ZONE_KM,
  CITY_CORES,
  cityCoreAt,
  type CityCore,
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
import { findEffortStretch, findSpreadStretches, spliceRepeats, lengthPlan, clearOfStops, lightTraffic, totalReps, isHillSession, repKm, hardestRep, type EffortStretch } from "./effort-repeats";
import { placeNear, placesNear } from "./map-labels";
import { autoTitle } from "./route-title";
import { findHills, loopsOverHill, type Hill } from "./hill-finder";
import { isClosedLoop, nearestIndex, rotateLoop } from "./loop-geometry";
import { disciplineEnabled, DISCIPLINE_NOTICE } from "@/config/constants";
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
  /** A name for the ride when it is not a plain loop ("Port de Pollença to Cap de Formentor and back"). */
  title?: string;
  /** How the ride is shaped, said plainly ("Out and back on the same road — …"). */
  ride_note?: string;
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
  /** The rider's own avg_speed_kmh when it was used (so the UI times results at it). */
  rider_speed_kmh?: number;
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
  /** Said to the rider when the ask was adjusted (e.g. gravel → road in v1). */
  notice?: string;
  /** Destination ride: where it goes (out and back). */
  destination?: string;
  /** Destination ride: false when the rider named no distance or time (the place sets the length). */
  distance_asked?: boolean;
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
/** Phase timings of the generation in flight (diagnostics for a timeout answer). */
export function inFlightTimings(): Record<string, number> | null {
  return currentTimings ? { ...currentTimings } : null;
}
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
  road: process.env.BROUTER_ROAD_PROFILE || (process.env.BROUTER_URL ? "loops-road" : "fastbike-lowtraffic"),
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
  /** Stops, give-ways, lights and junction turns along the path (engine data). */
  stops?: RoadStop[];
}

/** Why the most recent BRouter call returned null — surfaced in decline diagnostics. */
let lastBRouterFailure = "unknown";
export function getLastBRouterFailure(): string { return lastBRouterFailure; }
/** Engine calls made in this process (diagnostics: calls per candidate). */
let engineCalls = 0;

/**
 * Strict profile → relaxed fallback. The strict road profile FORBIDS main
 * roads, 80 km/h+ roads and unpaved surfaces, so when the only way through
 * is one of those it returns no route at all. The relaxed profile makes
 * them very expensive instead of impossible; the resulting stretch is then
 * measured and named by the compromise report (or the candidate is dropped
 * if the compromise is too long). Trust rule: say so, never serve silently.
 */
const RELAXED_PROFILE: Record<string, string> = {
  "loops-road": process.env.BROUTER_ROAD_RELAXED_PROFILE || "loops-road-relaxed",
  // Uploaded-profile mode (see /api/engine/sync-profiles): strict id → relaxed id.
  ...(process.env.BROUTER_ROAD_PROFILE
    ? { [process.env.BROUTER_ROAD_PROFILE]: process.env.BROUTER_ROAD_RELAXED_PROFILE || "loops-road-relaxed" }
    : {}),
};

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
  // Only a genuine "no route under the standard" earns the relaxed profile.
  if (!NO_ROUTE_RE.test(lastBRouterFailure)) return null;
  return routeRelaxedFallback(waypoints, profile, lastBRouterFailure);
}

/**
 * The relaxed half of routeWithFallback, for callers that have ALREADY seen
 * the strict profile fail on these exact waypoints with a deterministic
 * "no route" — repeating that strict search (the engine explores everything
 * reachable before giving up, 3–4 s on mountain tiles) would return the same
 * failure. `strictFailure` is kept as the reported reason when the relaxed
 * profile finds nothing either.
 */
async function routeRelaxedFallback(
  waypoints: [number, number][],
  profile: string,
  strictFailure: string
): Promise<RoutedPath | null> {
  const relaxed = RELAXED_PROFILE[profile];
  if (!relaxed) { lastBRouterFailure = strictFailure; return null; }
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
// In-flight cap = the server's worker threads (4 on our CX33). Pre-launch
// nothing else hits the engine, so a full house of 4 is safe; the watchdog
// retry in routeStrict covers the rare kill if the planner's reroute calls
// land at the same moment.
const BROUTER_MAX_INFLIGHT = Math.max(1, parseInt(process.env.BROUTER_THREADS ?? "4", 10) || 4);
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
const LOOP_RETRACE_FIX_KM = 3.0;
/**
 * Engine-time budget for the routing phase of one request. Every optional
 * improvement (moving the far point, no-go returns, distance fit) checks
 * this deadline; the mandatory route and its relaxed fallback do not. Keeps
 * a 5-candidate request inside the 55 s pipeline budget even when the
 * engine is slow (mountain tiles, strict no-route searches ≈ 3–4 s each).
 */
const ROUTING_BUDGET_MS = 20_000;
/** Still losing more than this after the no-go return → try moving the far point. */
const LOOP_MOVE_FAR_KM = 3.0;

/**
 * How far a routed loop is from the ride the rider asked for, in kilometres:
 * the served distance's gap to the ask PLUS the retrace that spur repair
 * will cut out of it. A kilometre of spur costs as much as a kilometre off
 * the ask — the spur never reaches the rider, but every kilometre cut is a
 * deformation of the loop and a SPUR_UTURN risk, while a loop 18 km short
 * of the ask is simply the wrong ride. Both the distance fit and the
 * loop-shaping attempts pick the lower cost. (Retrace-first picking chose a
 * 61 km loop losing 7.6 km over a 78 km loop losing 11.2 km for an 80 km
 * ask; distance-first picking kept a 264 km route losing 160 km over a
 * 121 km route losing 13.5 km because its served length was 4 km nearer.)
 */
export function loopFitCostKm(rawKm: number, lossKm: number, targetKm: number): number {
  return Math.abs(rawKm - lossKm - targetKm) + lossKm;
}
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

/** Path point nearest a waypoint must be this close for it to count as the leg boundary. */
const LEG_BOUNDARY_KM = 0.15;

/**
 * Edge-index ranges of the legs a far-point move leaves untouched. The engine
 * routes each leg between consecutive via points independently, so moving
 * waypoint `farIdx` re-routes only the legs into and out of it; the route
 * before waypoint farIdx−1 and after waypoint farIdx+1 is byte-identical in
 * every moved attempt. Returns null (no claim) when either boundary cannot be
 * located on the path, or when either fixed leg is shorter than the exit
 * zone — the exit-zone classification of a stretch in a fixed leg is only
 * guaranteed to survive a move when the OTHER fixed leg is longer than the
 * zone (the far side of the route can then never come within the zone).
 */
function fixedLegEdgeRanges(
  coords: [number, number][],
  waypoints: [number, number][],
  farIdx: number
): Array<[number, number]> | null {
  if (farIdx < 2 || farIdx > waypoints.length - 3 || coords.length < 3) return null;
  const before = waypoints[farIdx - 1];
  const after = waypoints[farIdx + 1];
  let iA = -1;
  for (let i = 0; i < coords.length; i++) {
    if (haversineKm(coords[i][0], coords[i][1], before[0], before[1]) <= LEG_BOUNDARY_KM) { iA = i; break; }
  }
  let iB = -1;
  for (let i = coords.length - 1; i >= 0; i--) {
    if (haversineKm(coords[i][0], coords[i][1], after[0], after[1]) <= LEG_BOUNDARY_KM) { iB = i; break; }
  }
  if (iA < 0 || iB < 0 || iA >= iB) return null;
  const legKm = (from: number, to: number) => pathDistanceKm(coords.slice(from, to + 1));
  if (legKm(0, iA) <= EXIT_ZONE_KM || legKm(iB, coords.length - 1) <= EXIT_ZONE_KM) return null;
  return [[0, iA], [iB, coords.length - 1]];
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
    stops: [...(a.stops ?? []), ...(b.stops ?? [])],
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
export async function routeLoopCandidate(
  waypoints: [number, number][],
  profile: string,
  targetKm: number,
  discipline: Discipline,
  deadline: number = Date.now() + ROUTING_BUDGET_MS
): Promise<RoutedPath | null> {
  const timeLeft = () => Date.now() < deadline;
  const startedAt = Date.now();
  const done = (p: RoutedPath | null, why: string) => {
    genDebug(`candidate ${why} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return p;
  };
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
  // Metres of compromise ONLY when the serving policy would reject the
  // route; an acceptable short link is not worth five more engine calls.
  const compromiseM = (p: RoutedPath): number => {
    if (!p.edgeTags) return 0;
    const r = buildRoadReport(p.coords, p.edgeTags, discipline);
    return compromiseAcceptable(r, p.distance_km) ? 0 : r.compromises.reduce((a, c) => a + c.meters, 0);
  };
  let first = await routeStrict(waypoints, profile);
  let firstCompromise = first ? compromiseM(first) : Infinity;
  // A deterministic "no route" for these exact waypoints: never worth a
  // second strict search (see routeRelaxedFallback).
  const strictNoRoute = !first && NO_ROUTE_RE.test(lastBRouterFailure);
  // Moving the far point re-routes only the two legs that touch it. When
  // the legs it leaves untouched already carry a disqualifying stretch (a
  // 3 km main-road exit from a valley town, say), every moved attempt would
  // be rejected for the same reason — skip straight past five engine
  // searches. Only distance-independent rules are used for this verdict.
  let movesUseless = false;
  if (first && firstCompromise > 0 && first.edgeTags) {
    const fixed = fixedLegEdgeRanges(first.coords, waypoints, farIdx);
    movesUseless = !!fixed && fixedPartBreaksPolicy(first.coords, first.edgeTags, discipline, fixed);
  }
  if (movesUseless) genDebug(`far-point moves skipped: the legs a move keeps already break the serving policy (${Math.round(firstCompromise)} m of compromise)`);
  if (waypoints.length >= 4 && !movesUseless && (first ? firstCompromise > 0 : strictNoRoute)) {
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
  // Last resort: the relaxed profile. When the strict search for these
  // waypoints already came back "no route", go straight to it instead of
  // paying for that same search again; a strict TIMEOUT or network error is
  // not deterministic and still gets its retry through routeWithFallback.
  if (!first) {
    first = strictNoRoute
      ? await routeRelaxedFallback(waypoints, profile, lastBRouterFailure)
      : await routeWithFallback(waypoints, profile);
  }
  if (!first) return done(null, "no path");

  // Memoised per path: repair is the most expensive step and the loop-shaping
  // code asks for the same path's loss many times.
  const lossCache = new WeakMap<RoutedPath, number>();
  const lossOf = (p: RoutedPath) => {
    let v = lossCache.get(p);
    if (v === undefined) { v = repairSpurs(p.coords).removedKm; lossCache.set(p, v); }
    return v;
  };
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

  // A loop that ends up more than 50% off the requested distance can never
  // be served, and neither can a route so retraced that repair would have
  // to cut half of it (a 160 km route "repaired" to 80 km is garbage
  // geometry, not an 80 km loop). Neither the distance fit nor loop shaping
  // trades a route that could be served for one that could not.
  const fitsAsk = (p: RoutedPath) =>
    Math.abs(p.distance_km - lossOf(p) - targetKm) <= targetKm * 0.5 && p.distance_km <= targetKm * 1.6;

  // Distance fit: the waypoint radius assumes roads add ~30% over straight
  // lines. Where the network detours more (Girona: 112 km for an 80 km ask)
  // or less, scale the loop's inner points toward/away from the start once
  // and re-route on the same profile. One extra engine call, kept only if
  // it serves the rider better (loopFitCostKm: closer to the ask counting
  // the retrace to be cut as a cost).
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
        const costBefore = loopFitCostKm(first.distance_km, lossOf(first), targetKm);
        const costAfter = loopFitCostKm(p.distance_km, lossOf(p), targetKm);
        const accept = costAfter < costBefore - 1 && (fitsAsk(p) || !fitsAsk(first));
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
  if (bestLoss <= LOOP_RETRACE_FIX_KM || waypoints.length < 4) return done(first, "routed");

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
    // Lower cost wins among loops that could be served: retrace to cut and
    // distance off the ask, kilometre for kilometre. Least-retrace-first
    // pulled loops in far short of the ask (Faro: 61 km losing 7.6 km was
    // chosen over 78 km losing 11.2 km).
    const cost = loopFitCostKm(p.distance_km, loss, targetKm);
    const bestCost = loopFitCostKm(best.distance_km, bestLoss, targetKm);
    const better = fitsAsk(p) && cost < bestCost - 0.2;
    genDebug(`loop-aware ${label}: ${p.distance_km.toFixed(1)} km, would lose ${loss.toFixed(1)} km, fit cost ${cost.toFixed(1)} (best so far ${bestLoss.toFixed(1)} km lost, cost ${bestCost.toFixed(1)})`);
    if (better) { best = p; bestLoss = loss; }
  };

  // One attempt = out leg, then the return leg with the out leg as a
  // weighted no-go. The first (unmoved) attempt runs alone; if the loop is
  // still losing a lot, the three moved-far attempts run CONCURRENTLY —
  // same engine calls, a third of the wall time.
  const runAttempt = async (wps: [number, number][]): Promise<RoutedPath | null> => {
    const outPath = await routeViaBRouter(wps.slice(0, farIdx + 1), usedProfile);
    if (!outPath || outPath.coords.length < 2) return null;
    // Keep the no-go 1.5 km clear of the turning point: the engine snaps a
    // waypoint away from no-go roads, and with the no-go touching the far
    // point the return leg started on a different road up to 9 km away —
    // then the two legs were joined across the gap.
    const nogo = nogoPolyline(outPath.coords, 2.0, 1.5);
    const backPath = await routeViaBRouter(wps.slice(farIdx), usedProfile, false, nogo);
    if (!backPath || backPath.coords.length < 2) return null;
    const outEnd = outPath.coords[outPath.coords.length - 1];
    const backStart = backPath.coords[0];
    if (haversineKm(outEnd[0], outEnd[1], backStart[0], backStart[1]) > 0.1) {
      genDebug("loop-aware attempt rejected: return leg did not start where the outbound ended");
      return null;
    }
    return joinPaths(outPath, backPath);
  };
  const [firstAttempt, ...movedAttempts] = attempts;
  if (bestLoss > firstAttempt.onlyIfLossAbove && timeLeft()) {
    const p = await runAttempt(firstAttempt.wps);
    if (p) consider(p, firstAttempt.label);
  }
  if (bestLoss > LOOP_MOVE_FAR_KM && timeLeft()) {
    const results = await Promise.all(movedAttempts.map((a) => runAttempt(a.wps)));
    results.forEach((p, i) => { if (p) consider(p, movedAttempts[i].label); });
  } else if (bestLoss > LOOP_MOVE_FAR_KM) {
    genDebug("routing budget spent — skipping far-point attempts");
  }
  return done(best, "routed after loop shaping");
}


/** Per-request routing deadline (epoch ms) — engine calls never overrun it
 *  by more than a couple of seconds. Set by generateFreshRoutes. */
let currentRoutingDeadline = 0;

/** The whole pipeline must answer inside this (the API's 55 s budget less
 *  scoring and the response). */
const SCENERY_DEADLINE_MS = 44_000;
/**
 * How long, once routing is done, scoring may wait for the scenery lookup
 * that was started with the request. The lookup keeps running in the
 * background and lands in the cache for the next rider either way; waiting
 * beyond this only trades the rider's time for a scenery score on THIS
 * answer. The engine phase usually outlasts a healthy lookup (18 s cap)
 * anyway; the cap bites when the public map service is slow or
 * rate-limiting — a request from a fast, flat start (Faro: routing in
 * ~6 s) used to sit up to 38 s waiting for scenery.
 */
const SCENERY_WAIT_AFTER_ROUTING_MS = 12_000;

/** Milliseconds scoring may still wait for scenery, `elapsedMs` into the request. */
export function sceneryWaitBudgetMs(elapsedMs: number): number {
  return Math.max(1500, Math.min(SCENERY_WAIT_AFTER_ROUTING_MS, SCENERY_DEADLINE_MS - elapsedMs));
}

/**
 * Weighted no-go over a city centre while a city-edge start's loops are
 * routed ("&nogos=…", set by generateFreshRoutes). Weighted, not forbidden:
 * when the centre is the only way through the engine still takes it, and
 * the road report names it.
 */
let currentCityNogo = "";
const CITY_NOGO_WEIGHT = 20;
export function cityNogoQuery(core: CityCore | null): string {
  return core ? `&nogos=${core.center[1]},${core.center[0]},${Math.round(core.radius_km * 1000)},${CITY_NOGO_WEIGHT}` : "";
}

async function routeViaBRouter(
  waypoints: [number, number][],       // [lat, lng]
  profile: string,
  retried = false,
  extraQuery = ""                      // e.g. "&polylines=…" (weighted no-go)
): Promise<RoutedPath | null> {
  if (currentCityNogo && !extraQuery.includes("nogos=")) extraQuery += currentCityNogo;
  // Engine timeout bounded by the request's routing deadline (minimum 4 s
  // so a first call always gets a fair chance).
  const remaining = currentRoutingDeadline > 0 ? currentRoutingDeadline - Date.now() + 2000 : BROUTER_TIMEOUT_MS;
  const timeoutMs = Math.max(4000, Math.min(BROUTER_TIMEOUT_MS, remaining));
  // BRouter expects lonlats as "lng,lat|lng,lat|..."
  const lonlats = waypoints.map(([lat, lng]) => `${lng},${lat}`).join("|");
  const url =
    `${BROUTER_URL}?lonlats=${lonlats}` +
    `&profile=${encodeURIComponent(profile)}` +
    `&alternativeidx=0&format=geojson${extraQuery}`;

  let res: Response;
  engineCalls++;
  try {
    res = await withEngineSlot(() => fetch(url, { signal: AbortSignal.timeout(timeoutMs) }));
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    lastBRouterFailure = name === "TimeoutError" || name === "AbortError" ? `timeout>${timeoutMs}ms` : `network:${(e instanceof Error ? e.message : String(e)).slice(0, 80)}`;
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
    stops: parseBRouterStops(feature.properties.messages),
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
  /** Road Standard report for this leg from the engine's road tags (trust rule). */
  road_report?: RoadReport;
}

/**
 * Re-route a user-edited set of via points (drag-to-edit on the map).
 * Same BRouter profiles and geometric guardrails as generation; quality
 * re-scoring is skipped for speed — the editor shows a "re-checked
 * surfaces on export" note instead.
 */
/**
 * Weighted no-go polylines for the roads a drawn route already uses, minus
 * the stretch within `clearKm` of this leg's own endpoints (legs must be
 * able to meet at the pins). Thinned to keep the engine URL bounded.
 */
export function avoidPolylines(avoid: [number, number][][], legFrom: [number, number], legTo: [number, number], clearKm = 1.5, maxPoints = 240, clearFromKm = clearKm, weight: number | null = PLANNER_AVOID_WEIGHT): string {
  const near = (p: [number, number]) =>
    haversineKm(p[0], p[1], legFrom[0], legFrom[1]) < clearFromKm || haversineKm(p[0], p[1], legTo[0], legTo[1]) < clearKm;
  const lines: [number, number][][] = [];
  let total = 0;
  for (const path of avoid) {
    let run: [number, number][] = [];
    let lastKept: [number, number] | null = null;
    for (const p of path) {
      if (near(p)) { if (run.length >= 2) lines.push(run); run = []; lastKept = null; continue; }
      if (lastKept && haversineKm(p[0], p[1], lastKept[0], lastKept[1]) < 0.25) continue;
      run.push(p); lastKept = p;
    }
    if (run.length >= 2) lines.push(run);
  }
  for (const l of lines) total += l.length;
  const step = Math.max(1, Math.ceil(total / maxPoints));
  const parts = lines
    .map((l) => l.filter((_, i) => i % step === 0 || i === l.length - 1))
    .filter((l) => l.length >= 2)
    // weight null = a hard no-go (BRouter: a polyline without a weight).
    .map((l) => `${l.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(",")}${weight == null ? "" : `,${weight}`}`);
  return parts.length ? `&polylines=${parts.join("|")}` : "";
}

/** Share of `coords` (by length) within 30 m of any of `paths` — the roads ridden twice. */
function sharedShare(coords: [number, number][], paths: [number, number][][]): number {
  const pts = paths.flat();
  if (!pts.length || coords.length < 2) return 0;
  const cell = (p: [number, number]) => `${Math.round(p[0] / 0.0005)},${Math.round(p[1] / 0.0007)}`;
  const grid = new Map<string, [number, number][]>();
  for (const p of pts) { const k = cell(p); (grid.get(k) ?? grid.set(k, []).get(k)!).push(p); }
  let shared = 0, total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const len = haversineKm(a[0], a[1], b[0], b[1]);
    total += len;
    const [cy, cx] = cell(b).split(",").map(Number);
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) {
      for (const q of grid.get(`${cy + dy},${cx + dx}`) ?? []) if (haversineKm(b[0], b[1], q[0], q[1]) < 0.03) { hit = true; break; }
    }
    if (hit) shared += len;
  }
  return total > 0 ? shared / total : 0;
}

/** Bearing (°) of the stretch of `coords` from `fromKm` to `toKm` along it. */
function bearingAlong(coords: [number, number][], fromKm: number, toKm: number): number | null {
  let cum = 0, a: [number, number] | null = null, b: [number, number] | null = null;
  for (let i = 0; i < coords.length; i++) {
    if (i) cum += haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    if (!a && cum >= fromKm) a = coords[i];
    if (cum >= toKm) { b = coords[i]; break; }
  }
  b = b ?? coords[coords.length - 1];
  return a && b && (a[0] !== b[0] || a[1] !== b[1]) ? bearingDegFrom(a, b) : null;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** A leg that starts by turning back this sharply at its pin is a U-turn. */
const UTURN_DEG = 125;
/** Carry-on points tried beyond the pin, in the direction the rider arrived (km). */
const THROUGH_KM = [0.8, 1.5, 2.5];
/** Riding through may cost at most this much more than turning round. */
const THROUGH_MAX_STRETCH = 1.4;

/**
 * Owner (2026-09-24): "Ashbourne is part of the ride, not a self-contained
 * loop and then a detour to Ashbourne." When the leg on from a pin starts
 * by turning back the way the rider came, try a hidden via point beyond the
 * pin in the direction of arrival (so the route rides through the town and
 * out the other side) and keep the shortest that no longer turns round, no
 * longer than THROUGH_MAX_STRETCH × and with no dead-end spur of its own.
 */
async function carryOnThrough(
  path: RoutedPath,
  waypoints: [number, number][],
  arrive: [number, number][],
  profile: string,
  nogo: string,
): Promise<RoutedPath | null> {
  const arriveRev = arrive.slice().reverse();
  const inBearing = bearingAlong(arriveRev, 0, 0.4);
  const outBearing = bearingAlong(path.coords, 0, 0.5);
  if (inBearing == null || outBearing == null) return null;
  const heading = (inBearing + 180) % 360; // the way the rider was going when they reached the pin
  if (angleDiff(heading, outBearing) < UTURN_DEG) return null;
  const pin = waypoints[0];
  const aims = [0, -35, 35].flatMap((off) => THROUGH_KM.map((km) => destination(pin, (heading + off + 360) % 360, km)));
  const tries = await Promise.all(aims.map((t) => routeViaBRouter([pin, t, ...waypoints.slice(1)], profile, false, nogo)));
  let best: RoutedPath | null = null;
  for (const raw of tries) {
    if (!raw || raw.coords.length < 2) continue;
    // A carry-on point that fell up a side street leaves a stub: cut it.
    const rep = repairSpurs(raw.coords);
    const c: RoutedPath = rep.removedKm > 0.05
      ? {
          ...raw,
          coords: rep.coords,
          elevations: rep.keep.map((k) => raw.elevations[k]),
          edgeTags: remapEdgeTags(raw.edgeTags, rep.keep),
          distance_km: Math.round(pathDistanceKm(rep.coords) * 10) / 10,
          elevation_gain_m: null,
        }
      : raw;
    if (c.distance_km > path.distance_km * THROUGH_MAX_STRETCH + 1.5) continue;
    const start = bearingAlong(c.coords, 0, 0.5);
    if (start == null || angleDiff(heading, start) > 70) continue; // still turns round
    if (!best || c.distance_km < best.distance_km) best = c;
  }
  if (best) genDebug(`reroute: rides on through the pin (+${(best.distance_km - path.distance_km).toFixed(1)} km instead of a U-turn)`);
  return best;
}

/** Penalty on roads the drawn route already uses (50 left a Wicklow leg on
 *  the same road; 200 finds the parallel road; higher changes nothing). */
const PLANNER_AVOID_WEIGHT = 200;
/** A detour is worth it when it is at most this much longer than the direct leg. */
const AVOID_MAX_STRETCH = 1.35;

export async function rerouteWaypoints(
  waypoints: [number, number][],
  discipline: Discipline,
  opts: {
    avoid?: [number, number][][];
    /** The end of the leg that arrives at waypoints[0] (the rider rides on from there). */
    arrive?: [number, number][];
  } = {}
): Promise<RerouteResult | null> {
  if (waypoints.length < 2 || waypoints.length > 9) return null;
  const profile = DISCIPLINE_PROFILE[discipline];
  const avoid = (opts.avoid ?? []).filter((p) => p.length >= 2);
  const nogo = avoid.length ? avoidPolylines(avoid, waypoints[0], waypoints[waypoints.length - 1]) : "";
  // Route directly first; only when that reuses road the rest of the route
  // already rides (> 15 %) try again avoiding it — most legs cost one engine
  // call. Take the avoiding one unless it is an absurd detour or does not
  // actually reduce the shared road.
  // Direct on the Road Standard profile; when that finds nothing (a pin
  // only a main road reaches) the relaxed profile, whose compromise is then
  // measured and named below — never a silent straight line.
  let direct = await routeViaBRouter(waypoints, profile);
  if (!direct) direct = await routeWithFallback(waypoints, profile);
  if (!direct) console.error(`[reroute] no route ${JSON.stringify(waypoints)}: ${lastBRouterFailure}`);
  const directShared = direct && nogo ? sharedShare(direct.coords, avoid) : 0;
  const avoiding = nogo && (!direct || directShared > 0.15) ? await routeViaBRouter(waypoints, profile, false, nogo) : null;
  let path = direct;
  if (avoiding && avoiding.coords.length >= 2 && (!direct || avoiding.distance_km <= direct.distance_km * AVOID_MAX_STRETCH)) {
    if (!direct || sharedShare(avoiding.coords, avoid) < directShared - 0.05) path = avoiding;
  }
  if (!path || path.coords.length < 2) return null;

  // A pin in a town is a place the ride goes THROUGH: when the way on from
  // it would turn the rider straight round, try carrying on through first.
  if (opts.arrive && opts.arrive.length >= 2) {
    // Riding through, the way in must not be the way out: its road is a
    // no-go right up to 250 m from the pin (not the usual 1.5 km).
    const parts = [
      avoidPolylines([opts.arrive], waypoints[0], waypoints[waypoints.length - 1], 1.5, 120, 0.25, null),
      avoidPolylines(avoid, waypoints[0], waypoints[waypoints.length - 1]),
    ].map((q) => q.replace("&polylines=", "")).filter(Boolean);
    const throughNogo = parts.length ? `&polylines=${parts.join("|")}` : "";
    const through = await carryOnThrough(path, waypoints, opts.arrive, profile, throughNogo);
    if (through) path = through;
  }

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

  // Drawn legs get the same honesty as generated loops: the roads the
  // engine used, and any main/fast/unpaved stretch named. A rider drawing
  // through a compromise sees it while drawing, not after the ride.
  const roadReport = path.edgeTags ? buildRoadReport(path.coords, path.edgeTags, discipline) : undefined;
  if (roadReport && !roadReport.standard_met) {
    for (const c of roadReport.compromises.slice(0, 3)) warnings.push(describeCompromise(c));
  }

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
    ...(roadReport ? { road_report: roadReport } : {}),
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
  /** Workouts: the rider's answer to "OK to repeat efforts on one stretch?" */
  repeatEfforts?: boolean;
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
  // v1 plans road rides only: say so and plan a road loop (a duration ask is
  // re-sized at road speed).
  let notice: string | undefined;
  if (!disciplineEnabled(spec.discipline)) {
    notice = DISCIPLINE_NOTICE;
    spec.discipline = "road";
    if (spec.duration_minutes) {
      spec.distance_km = durationToDistanceKm(spec.duration_minutes, "road", spec.elevation_preference, options.userSpeedKmh);
    }
  }
  if (spec.workout && options.repeatEfforts !== undefined) {
    spec.effort_layout = options.repeatEfforts ? "repeat" : "spread";
  }
  markPhase("intent");
  const interpreted = { ...(await summariseIntent(spec, options.userSpeedKmh)), ...(notice ? { notice } : {}) };
  markPhase("summarise");
  const candidates = await candidatesFromSpec(spec, { userSpeedKmh: options.userSpeedKmh });
  // A destination ride with no distance asked: its length is the road there
  // and back — report that, not the 50 km default we never aimed for.
  if (spec.destination && !spec.destination.distance_asked && candidates[0]) {
    interpreted.distance_km = candidates[0].distance_km;
    delete interpreted.duration_minutes;
  }
  // Every generated ride gets a rider's title: start – far point – end · km.
  for (const c of candidates) {
    if (c.source === "generated" && !c.title) c.title = autoTitle(c.coordinates, c.distance_km);
  }
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

async function summariseIntent(spec: RouteSpec, userSpeedKmh?: number): Promise<InterpretedIntent> {
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
    rider_speed_kmh: userSpeedKmh,
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
    ...(spec.destination ? { destination: spec.destination.name, distance_asked: spec.destination.distance_asked } : {}),
  };
}

/**
 * Ride duration for sizing the wind-forecast window: the rider's own ask
 * when they gave one, else the one ride-time model (src/lib/ride-time.ts)
 * at their speed, with the elevation cap (if any) as the climbing estimate.
 */
function estimateDurationMinutes(spec: RouteSpec, userSpeedKmh?: number): number {
  return (
    spec.duration_minutes ??
    estimateRideMinutes({
      distance_km: spec.distance_km,
      elevation_gain_m: spec.max_elevation_gain_m ?? 0,
      discipline: spec.discipline,
      avgSpeedKmh: userSpeedKmh,
    })
  );
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
export async function candidatesFromSpec(
  spec: RouteSpec,
  options: { userSpeedKmh?: number } = {}
): Promise<RouteCandidate[]> {
  libraryDiag = "";
  libraryReasons.length = 0;
  const forecast =
    spec.wind_strategy !== "none"
      ? await fetchWindForecast(
          spec.start_point,
          new Date(),
          estimateDurationMinutes(spec, options.userSpeedKmh),
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

/** Library outcome for the current request (diagnostics on a decline). */
let libraryDiag = "";

/** A loop starting within this distance of home is "from home" already. */
const FROM_HOME_KM = 1.0;

/**
 * Owner rule (2026-09-22): every route starts from home. A verified loop
 * that starts elsewhere is served as ride-out + loop + ride-back: the loop
 * is rotated to begin at its point nearest home, the engine routes the
 * approach on the standard profile and the return with the approach as a
 * weighted no-go (a different road home where one exists). The whole ride
 * must fit the requested distance; the approach legs carry a road report
 * and the serving policy applies to them. Loops that cannot be reached or
 * would not fit are dropped — fresh generation takes over.
 */
const libraryReasons: string[] = [];

async function ridesFromHome(matches: LibraryMatch[], spec: RouteSpec): Promise<LibraryMatch[]> {
  const out: LibraryMatch[] = [];
  const results = await Promise.all(matches.map((m) => rideFromHome(m, spec)));
  results.forEach((r, i) => {
    const m = matches[i];
    libraryReasons.push(`${m.name.slice(0, 24)}@${m.distance_from_start_km}km:${r ? `ok ${r.distance_km}km` : lastRideFromHomeWhy.get(m.route_id) ?? "dropped"}`);
  });
  for (const r of results) if (r) out.push(r);
  out.sort((a, b) => b.match_score - a.match_score);
  return out.slice(0, 3);
}

const lastRideFromHomeWhy = new Map<string, string>();

async function rideFromHome(match: LibraryMatch, spec: RouteSpec): Promise<LibraryMatch | null> {
  const why = (w: string) => { lastRideFromHomeWhy.set(match.route_id, w); return null; };
  if (match.distance_from_start_km <= FROM_HOME_KM) return match;
  const home = spec.start_point;
  const profile = DISCIPLINE_PROFILE[spec.discipline];

  // Rotate a closed loop to start nearest home; an open track keeps its ends.
  let loopCoords = match.coordinates;
  let loopEle = match.elevations;
  const closed = isClosedLoop(loopCoords);
  if (closed) {
    const k = nearestIndex(loopCoords, home);
    const rotated = rotateLoop(loopCoords, k, loopEle);
    loopCoords = rotated.coords;
    loopEle = rotated.parallel;
  }
  const loopStart = loopCoords[0];
  const loopEnd = loopCoords[loopCoords.length - 1];

  const approach = await routeWithFallback([home, loopStart], profile);
  if (!approach || approach.coords.length < 2) {
    genDebug(`library loop "${match.name}" dropped: no ride out from home (${getLastBRouterFailure()})`);
    return why(`no ride out (${getLastBRouterFailure().slice(0, 40)})`);
  }
  const nogo = nogoPolyline(approach.coords, 0.5, 1.5);
  // Return with the approach as a no-go (a different road home where one
  // exists) — but only if the engine starts the leg where we are; if the
  // no-go pushed its snap elsewhere, route without it.
  const routeHome = async (from: [number, number]) => {
    const p = await routeViaBRouter([from, home], profile, false, nogo);
    if (p && p.coords.length >= 2 && haversineKm(p.coords[0][0], p.coords[0][1], from[0], from[1]) <= 0.3) return p;
    return routeWithFallback([from, home], profile);
  };

  // Owner rule (2026-09-22): the ride out + verified loop + ride back is
  // "essentially a new loop", sized to the ask. The full loop is used when
  // it fits; when it overshoots (a 60 km loop 20 km away is 100 km for an
  // 80 km ask) we ride only part of the loop and turn for home early.
  const loopCum: number[] = [0];
  for (let i = 1; i < loopCoords.length; i++) {
    loopCum.push(loopCum[i - 1] + haversineKm(loopCoords[i - 1][0], loopCoords[i - 1][1], loopCoords[i][0], loopCoords[i][1]));
  }
  const loopLen = loopCum[loopCum.length - 1] || match.distance_km;
  const allowance = Math.max(8, spec.distance_km * 0.35);
  const tolerance = Math.max(5, spec.distance_km * 0.1);

  let cut = loopCoords.length - 1; // index where we leave the loop
  let back = await routeHome(loopEnd);
  if (!back || back.coords.length < 2) {
    genDebug(`library loop "${match.name}" dropped: no ride home (${getLastBRouterFailure()})`);
    return why(`no ride home (${getLastBRouterFailure().slice(0, 40)})`);
  }
  let totalKm = approach.distance_km + loopLen + back.distance_km;

  if (totalKm > spec.distance_km + tolerance) {
    // Pick the exit point along the loop whose estimated total lands on the
    // ask (return estimated at 1.3× the straight line), then route it.
    let bestIdx = -1, bestErr = Infinity;
    for (let i = Math.floor(loopCoords.length * 0.25); i < loopCoords.length - 1; i += Math.max(1, Math.floor(loopCoords.length / 60))) {
      const est = approach.distance_km + loopCum[i] + 1.3 * haversineKm(loopCoords[i][0], loopCoords[i][1], home[0], home[1]);
      const err = Math.abs(est - spec.distance_km);
      if (err < bestErr) { bestErr = err; bestIdx = i; }
    }
    if (bestIdx > 0) {
      const partBack = await routeHome(loopCoords[bestIdx]);
      if (partBack && partBack.coords.length >= 2) {
        const partTotal = approach.distance_km + loopCum[bestIdx] + partBack.distance_km;
        if (Math.abs(partTotal - spec.distance_km) < Math.abs(totalKm - spec.distance_km)) {
          genDebug(`library loop "${match.name}": riding ${loopCum[bestIdx].toFixed(0)} of ${loopLen.toFixed(0)} km of the loop → ${partTotal.toFixed(0)} km from home`);
          cut = bestIdx;
          back = partBack;
          totalKm = partTotal;
        }
      }
    }
  }

  if (Math.abs(totalKm - spec.distance_km) > allowance) {
    genDebug(`library loop "${match.name}" dropped: ${totalKm.toFixed(0)} km from home for a ${spec.distance_km} km ask`);
    return why(`${totalKm.toFixed(0)}km total`);
  }
  const loopUsedKm = Math.round(loopCum[cut] * 10) / 10;
  if (cut < loopCoords.length - 1) {
    loopCoords = loopCoords.slice(0, cut + 1);
    loopEle = loopEle ? loopEle.slice(0, cut + 1) : undefined;
  }

  // Stitch: approach → loop → back (drop duplicated junction points).
  const same = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5;
  const coords: [number, number][] = [...approach.coords];
  const elevations: number[] = [...approach.elevations];
  const edgeTags: EdgeTags = [...(approach.edgeTags ?? new Array(Math.max(0, approach.coords.length - 1)).fill(null))];
  const pushLeg = (cs: [number, number][], es: number[] | undefined, tags: EdgeTags | null) => {
    const start = coords.length > 0 && same(coords[coords.length - 1], cs[0]) ? 1 : 0;
    for (let i = start; i < cs.length; i++) {
      if (coords.length > 0) edgeTags.push(i > 0 ? tags?.[i - 1] ?? null : null);
      coords.push(cs[i]);
      elevations.push(es && typeof es[i] === "number" ? es[i] : NaN);
    }
  };
  pushLeg(loopCoords, loopEle, null);
  pushLeg(back.coords, back.elevations, back.edgeTags);

  // Approach/return road standard (the loop itself is verified provenance).
  // Loop edges carry no tags → "unknown", never a compromise; only the
  // engine-routed legs are judged.
  const report = buildRoadReport(coords, edgeTags, spec.discipline);
  if (!compromiseAcceptable(report, totalKm)) {
    genDebug(`library loop "${match.name}" dropped: ride out/back fails the road standard — ${report.summary}`);
    return why(`legs fail standard: ${report.summary.slice(0, 60)}`);
  }
  if (!report.standard_met) await nameCompromises(coords, report.compromises);
  const partial = loopUsedKm < loopLen - 0.5;
  const built = `New loop from your start: ${Math.round(approach.distance_km)} km out, ${partial ? `${Math.round(loopUsedKm)} km of the ${Math.round(loopLen)} km verified loop` : "the full verified loop"}, ${Math.round(back.distance_km)} km home.`;
  // The verified loop's own measured report (traced on first view) is
  // folded in: its compromises are named, never hidden behind "verified".
  const merged = mergeLoopReport(report, match.road_report, loopUsedKm, totalKm, built);

  const approachGain = (approach.elevation_gain_m ?? elevationGainFromSeries(approach.elevations)) || 0;
  const backGain = (back.elevation_gain_m ?? elevationGainFromSeries(back.elevations)) || 0;
  const hasAllEle = elevations.every((e) => !Number.isNaN(e));
  // Climbing of the ride actually served: from the stitched series when the
  // stored loop has elevations, else the loop's share (by distance) + legs.
  const share = loopLen > 0 ? loopUsedKm / loopLen : 1;
  let gain: number, loss: number;
  if (hasAllEle) {
    gain = Math.round(elevationGainFromSeries(elevations) ?? 0);
    let l = 0;
    for (let i = 1; i < elevations.length; i++) { const d = elevations[i] - elevations[i - 1]; if (d < 0) l -= d; }
    loss = Math.round(l);
  } else {
    gain = Math.round(match.elevation_gain_m * share + approachGain + backGain);
    loss = Math.round(match.elevation_loss_m * share + approachGain + backGain);
  }
  const distanceKm = Math.round(totalKm * 10) / 10;

  return {
    ...match,
    coordinates: coords,
    elevations: hasAllEle ? elevations : undefined,
    distance_km: distanceKm,
    elevation_gain_m: gain,
    elevation_loss_m: loss,
    distance_from_start_km: 0,
    from_home: true,
    approach_km: Math.round(approach.distance_km * 10) / 10,
    loop_km: loopUsedKm,
    match_score: computeMatchScore(distanceKm, gain, spec, 90),
    road_report: merged,
    gpx_data: buildGpx(coords, hasAllEle ? elevations : null, `New loop from your start via ${match.name}`, spec.discipline),
  };
}

async function candidatesFromSpecInner(
  spec: RouteSpec,
  windForecast: WindForecast | null
): Promise<RouteCandidate[]> {

  // ── Destination ride ("Pollença to Cap de Formentor and back") ───────────
  if (spec.destination) {
    const rides = await generateDestinationRides(spec);
    return rides.map((g) => ({ source: "generated" as const, ...g }));
  }

  // ── Workout mode ───────────────────────────────────────────────────────────
  // A workout is a hard constraint: either the route's segments can host it
  // or they can't. Library-first still wins when available (known-good >
  // freshly built). Only if nothing in the library fits do we attempt a
  // fresh workout-aware generation. If even that fails we surface the
  // failure honestly rather than ship a generic route mislabelled as
  // workout-friendly.
  if (spec.workout) {
    repeatTooLongKm = null;
    // Workout matches keep their segment indices, so only loops that already
    // start at home qualify; others fall through to fresh assembly.
    // Only when efforts are spread (a library loop's own stretches), and
    // time-boxed: it checks each loop's segments on the public map service,
    // which once took 42 s of a 55 s request.
    const workoutMatches = spec.effort_layout !== "spread" ? [] : (await Promise.race([
      matchLibraryForWorkout(spec, 3).catch((e) => { console.error("[library] workout match failed:", e instanceof Error ? e.message : e); return [] as LibraryMatch[]; }),
      new Promise<LibraryMatch[]>((r) => setTimeout(() => r([]), 8000)),
    ])).filter((m) => m.distance_from_start_km <= FROM_HOME_KM);
    markPhase("library");
    if (workoutMatches.length > 0) {
      return workoutMatches.map((m) => ({ source: "library" as const, ...m }));
    }
    // The rider said efforts may be repeated on one stretch (the default):
    // plan the ride, put every effort on its best stretch (a steady climb for
    // VO2 work) — then the older corridor search. Spread: efforts on
    // different stretches of one loop.
    if (spec.effort_layout !== "spread") {
      const repeated = await generateRepeatWorkoutRoutes(spec, spec.workout);
      markPhase("repeat efforts");
      if (repeated.length > 0) return repeated.map((g) => ({ source: "generated" as const, ...g }));
      // Anchor-first (spec §3): find the effort road, build the loop around
      // it — only while the request has time for another search.
      const elapsed = () => Date.now() - (currentTimingsStart || Date.now());
      if (elapsed() < 20_000) {
        const anchored = await assembleAnchorFirstWorkout(spec, spec.workout).catch(() => []);
        if (anchored.length > 0) {
          return anchored.map((g) => ({ source: "generated" as const, ...g }));
        }
      }
      if (elapsed() > 30_000) throw new Error(workoutDeclineMessage(spec.workout, spec.effort_layout, repeatTooLongKm));
    }
    // Spread (the rider said no to repeating on one stretch): each effort on
    // its own stretch of one loop; if no loop holds them all, the best one
    // stretch with the note saying so — never a bare decline (CA-02).
    if (spec.effort_layout === "spread") {
      const spreadRides = await generateRepeatWorkoutRoutes(spec, spec.workout, "spread");
      markPhase("spread efforts");
      if (spreadRides.length > 0) return spreadRides.map((g) => ({ source: "generated" as const, ...g }));
      if (Date.now() - (currentTimingsStart || Date.now()) > 30_000) throw new Error(workoutDeclineMessage(spec.workout, spec.effort_layout, repeatTooLongKm));
    }
    const freshWorkout = await generateFreshWorkoutRoutes(spec, spec.workout);
    if (freshWorkout.length === 0) {
      throw new Error(workoutDeclineMessage(spec.workout, spec.effort_layout, repeatTooLongKm));
    }
    return freshWorkout.map((g) => ({ source: "generated" as const, ...g }));
  }

  // ── Library-first ──────────────────────────────────────────────────────────
  // Fail soft: a DB outage must never block fresh generation.
  const libraryMatches = await matchLibraryRoutes(spec, 5).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[library] match failed:", msg);
    libraryDiag = `error: ${msg.slice(0, 120)}`;
    return [];
  });
  const fromHome = await ridesFromHome(libraryMatches, spec);
  if (!libraryDiag) libraryDiag = `${libraryMatches.length} matched, ${fromHome.length} served from home — ${libraryReasons.join(" | ")}`;
  markPhase("library");
  if (fromHome.length > 0) {
    return fromHome.map((m) => ({ source: "library" as const, ...m }));
  }

  // ── Fresh generation ───────────────────────────────────────────────────────
  const generated = await generateFreshRoutes(spec, windForecast);
  markPhase("fresh");

  // If none of the fresh builds hit "excellent", try to mix in library
  // routes as fallback. A verified operator route at "good" match is
  // better than a generated one at "good" quality — trust signal.
  const hasExcellent = generated.some((g) => g.quality_tier === "excellent");
  if (!hasExcellent && generated.length > 0) {
    const libraryFallbacks = await ridesFromHome(
      await matchLibraryRoutes(spec, 2).catch((e) => { console.error("[library] fallback match failed:", e instanceof Error ? e.message : e); return []; }),
      spec
    );
    if (libraryFallbacks.length > 0) {
      return [
        ...libraryFallbacks.map((m) => ({ source: "library" as const, ...m })),
        ...generated.slice(0, 1).map((g) => ({ source: "generated" as const, ...g })),
      ];
    }
  }

  return generated.map((g) => ({ source: "generated" as const, ...g }));
}

// ── Destination rides ────────────────────────────────────────────────────────

/** A different road home is worth it when it shares less than this with the way out. */
const DEST_MAX_SHARED_HOME = 0.5;
/** …and is at most this much longer than riding back the same way. */
const DEST_MAX_HOME_STRETCH = 1.4;
/** A way home sharing at least this much with the way out is "the same road". */
const SAME_ROAD_SHARE = 0.8;

/**
 * Out to a named place and home again (owner rule, 2026-09-23): "If I'm in
 * Pollença and I want a route to Cap de Formentor and back I should get
 * one. The only way there is out and back." So the loop rules' retrace and
 * U-turn rejections do not apply here — the rider asked for exactly that.
 * What still applies: the Road Standard (every compromise measured and
 * named; motorways and unpaved stretches decline), honest labelling (same
 * road both ways is said so), and a real engine route for every metre.
 *
 * Served: a different road home when one exists that is really different
 * and not an absurd detour, plus the same road back (the shortest ride).
 */
async function generateDestinationRides(spec: RouteSpec): Promise<GeneratedRoute[]> {
  const dest = spec.destination!;
  const profile = DISCIPLINE_PROFILE[spec.discipline];
  const startName = spec.region ?? "your start";
  currentRoutingDeadline = Date.now() + ROUTING_BUDGET_MS;
  // Scenery for the area, fetched while the engine routes (as for loops).
  const scenicFetch = prefetchScenic(bboxOf([spec.start_point, dest.point], 0.08));
  try {
    const out = await routeWithFallback([spec.start_point, dest.point], profile);
    markPhase("destination out");
    if (!out || out.coords.length < 2) {
      throw new Error(`No valid routes: we found no road from ${startName} to ${dest.name} that a road bike can ride.`);
    }
    // Home: the same road reversed (always possible), and — when the network
    // has one — a different road, the way out penalised as a no-go.
    const nogo = avoidPolylines([out.coords], dest.point, spec.start_point);
    const [same, other] = await Promise.all([
      routeWithFallback([dest.point, spec.start_point], profile),
      nogo ? routeViaBRouter([dest.point, spec.start_point], profile, false, nogo) : Promise.resolve(null),
    ]);
    markPhase("destination home");
    // Label each way home by what it MEASURES, not by how it was asked for:
    // the plain route back can itself be a different road (one-way systems,
    // a cheaper descent), and the no-go route can still share most of it.
    const back = same ?? reversePath(out);
    const homes = [other, back]
      .filter((h): h is RoutedPath => !!h && h.coords.length >= 2 && h.distance_km <= back.distance_km * DEST_MAX_HOME_STRETCH + 0.5)
      .map((home) => ({ home, shared: sharedShare(home.coords, [out.coords]) }));
    const different = homes.filter((h) => h.shared < DEST_MAX_SHARED_HOME);
    const sameRoad = homes.filter((h) => h.shared >= SAME_ROAD_SHARE);
    const options: { home: RoutedPath; note: string }[] = [];
    const bestDifferent = different.sort((a, b) => a.shared - b.shared || a.home.distance_km - b.home.distance_km)[0];
    if (bestDifferent) {
      options.push({
        home: bestDifferent.home,
        note: `Out one way, home by a different road${bestDifferent.shared >= 0.1 ? ` (${Math.round(bestDifferent.shared * 100)} % of it shared with the way out)` : ""}.`,
      });
    }
    // The same road back — always offered: it is the shortest, and for a cape
    // or a summit with one road in, it is the ride.
    const retrace = sameRoad[0]?.home ?? reversePath(out);
    options.push({
      home: retrace,
      note: bestDifferent
        ? `Out and back on the same road${retrace.distance_km <= bestDifferent.home.distance_km ? ` — the shortest way to ${dest.name} and home` : ""}.`
        : `Out and back on the same road — there is no other sensible road to ${dest.name}.`,
    });

    const scenic = await Promise.race([
      scenicFetch,
      new Promise<null>((r) => setTimeout(() => r(null), SCENERY_WAIT_AFTER_ROUTING_MS)),
    ]);
    const rides: GeneratedRoute[] = [];
    let declined = "";
    for (const opt of options) {
      const joined = joinPaths(out, opt.home);
      // The engine's filtered ascend per leg beats re-summing a noisy series.
      const homeGain = opt.home.elevation_gain_m;
      if (out.elevation_gain_m != null && homeGain != null) joined.elevation_gain_m = out.elevation_gain_m + homeGain;
      const ride = await destinationRide(joined, spec, startName, opt.note, scenic);
      if (typeof ride === "string") declined = ride;
      else rides.push(ride);
    }
    markPhase("destination scoring");
    if (rides.length === 0) {
      throw new Error(declined || `No valid routes to ${dest.name} that we would take a friend on.`);
    }
    return rides;
  } finally {
    currentRoutingDeadline = 0;
  }
}

function reversePath(p: RoutedPath): RoutedPath {
  return {
    coords: p.coords.slice().reverse(),
    elevations: p.elevations.slice().reverse(),
    distance_km: p.distance_km,
    elevation_gain_m: null,
    edgeTags: p.edgeTags ? p.edgeTags.slice().reverse() : null,
    profile: p.profile,
  };
}

/** One destination ride from the joined out + home path, or the reason it is declined. */
async function destinationRide(
  path: RoutedPath,
  spec: RouteSpec,
  startName: string,
  note: string,
  scenic: Awaited<ReturnType<typeof prefetchScenic>>,
): Promise<GeneratedRoute | string> {
  const dest = spec.destination!;
  const elevations = path.elevations.slice();
  for (let i = 0; i < elevations.length; i++) {
    if (!Number.isNaN(elevations[i])) continue;
    let j = i + 1;
    while (j < elevations.length && Number.isNaN(elevations[j])) j++;
    const prev = i > 0 ? elevations[i - 1] : elevations[j] ?? 0;
    const next = j < elevations.length ? elevations[j] : prev;
    for (let k = i; k < j; k++) elevations[k] = prev + ((next - prev) * (k - i + 1)) / (j - i + 1);
  }
  const gain = Math.round(path.elevation_gain_m ?? elevationGainFromSeries(elevations));
  // Out and back to the same point: what goes up comes down.
  const loss = gain;
  const distKm = path.distance_km;

  // Road Standard: a destination the rider named is served even when the
  // only road there is a compromise — measured and named, never hidden. A
  // motorway or a stretch of dirt is not a road ride: decline.
  let roadReport: RoadReport | undefined;
  if (path.edgeTags && path.edgeTags.length > 0) {
    roadReport = buildRoadReport(path.coords, path.edgeTags, spec.discipline);
    const hard = roadReport.compromises.filter((c) => c.highway === "motorway" || c.highway === "motorway_link" || c.kind === "unsuitable" || c.kind === "unpaved");
    const hardM = hard.reduce((s, c) => s + c.meters, 0);
    if (hard.some((c) => c.highway === "motorway" || c.highway === "motorway_link") || hardM > 200) {
      return `The only way to ${dest.name} from ${startName} uses ${hard.some((c) => c.kind === "unpaved") ? "unpaved road" : "a road you can't ride a bike on"} — not a road ride we would plan.`;
    }
    if (!roadReport.standard_met) {
      await nameCompromises(path.coords, roadReport.compromises);
      roadReport.summary = summariseCompromises(roadReport.compromises);
    }
  }

  const quality = await scoreRoute(path.coords, spec.discipline, { edgeTags: path.edgeTags, scenic: path.edgeTags ? scenic ?? undefined : undefined });
  const title = `${startName} to ${dest.name} and back`;
  const ride: GeneratedRoute = {
    coordinates: path.coords,
    elevations,
    distance_km: Math.round(distKm * 10) / 10,
    elevation_gain_m: gain,
    elevation_loss_m: Math.round(loss),
    quality_score: quality.total,
    quality_tier: qualityTier(quality.total, quality.city_share, QUALITY_WORLD_CLASS),
    quality_breakdown: quality.breakdown as unknown as Record<string, number>,
    highlights: extractHighlights(quality.flags),
    road_type_breakdown: quality.road_class_breakdown ?? computeRoadTypeBreakdown(path.coords),
    surface_breakdown: quality.surface_breakdown,
    gpx_data: buildGpx(path.coords, elevations, title, spec.discipline),
    waypoints_used: [spec.start_point, dest.point, spec.start_point],
    match_score: dest.distance_asked ? computeMatchScore(distKm, gain, spec, quality.total) : Math.round(quality.total),
    title,
    ride_note: note,
    ...(roadReport ? { road_report: roadReport } : {}),
  };
  loopEngineData.set(ride, { edgeTags: path.edgeTags, stops: path.stops ?? [] });
  return ride;
}

// ── Repeat efforts on one stretch ────────────────────────────────────────────

const ZONE_LABEL: Record<string, string> = {
  z1: "recovery", z2: "endurance", z3: "tempo", z4: "threshold", z5: "VO2 max", z6: "anaerobic", z7: "sprint",
};

/** "4 × 4 min VO2 max", "20 min threshold". */
export function sessionLabel(workout: WorkoutSpec): string {
  return workout.intervals
    .map((iv) => `${iv.count > 1 ? `${iv.count} × ` : ""}${iv.duration_minutes} min ${ZONE_LABEL[iv.zone] ?? iv.zone}`)
    .join(" + ");
}

/**
 * Owner (2026-09-23): "2 hours from Clontarf with 4x4 mins VO2 max — we
 * would suggest all 4 efforts on Howth hill." Plan the ride as a normal
 * Road Standard loop (hill-seeking for VO2/anaerobic work), find the loop's
 * best stretch for the effort (effort-repeats.ts: gradient, steadiness, no
 * lights/stops/junction turns — from the engine's own data), and ride every
 * rep there: hard up, spin back, again, then on home. The loop is sized so
 * the whole ride, repeats included, is the length the rider asked for.
 */
async function generateRepeatWorkoutRoutes(spec: RouteSpec, workout: WorkoutSpec, layout: "repeat" | "spread" = "repeat"): Promise<GeneratedRoute[]> {
  const spread = layout === "spread";
  const reps = totalReps(workout);
  const hill = isHillSession(workout);
  const rep = hardestRep(workout);
  // Extra road the repeats add: (reps − 1) × (spin back + ride again).
  const stretchKm = repKm(rep.zone, rep.duration_minutes, hill ? 6 : 0);
  // Long flat reps are usually ridden as laps of a shorter stretch (~70 % extra road).
  const extraKm = hill || stretchKm <= 4
    ? Math.max(0, reps - 1) * 2 * stretchKm
    : reps * stretchKm * 0.7;
  const loopSpec: RouteSpec = {
    ...spec,
    workout: undefined,
    // Spread: the loop is the whole ride (each effort on its own stretch);
    // it only grows if the efforts have to fall back to one stretch.
    distance_km: spread ? spec.distance_km : Math.max(15, spec.distance_km - extraKm),
    // Hill repeats need a hill on the loop.
    elevation_preference: hill && (spec.elevation_preference === "any" || spec.elevation_preference === "rolling") ? "hilly" : spec.elevation_preference,
  };
  // Hill sessions: loops over the best hills in reach first (the generator
  // alone steers round climbs); the generator's own loops if none serve.
  let loops: GeneratedRoute[] = [];
  let hillsTried: Hill[] = [];
  let hillTops: Hill[] = [];
  if (hill) {
    const reachKm = Math.min(20, Math.max(6, loopSpec.distance_km / 3.2));
    const found = findHills(spec.start_point, reachKm).slice(0, 4);
    // A peak is often on heath or a track the road profile can't reach
    // (the engine then silently drops the via point): aim at the highest
    // ROAD point near it instead — where a walking route to the top leaves
    // the road network.
    const tops = await Promise.all(found.map((h) => summitRoad(spec.start_point, h)));
    // Two different climbs: hills whose summit roads meet are one climb.
    const hills: Hill[] = [];
    found.forEach((h, i) => {
      const top = tops[i];
      if (!top || hills.length >= 2) return;
      if (hills.some((o) => haversineKm(o.point[0], o.point[1], top[0], top[1]) < 1)) return;
      hills.push({ ...h, point: top });
    });
    hillsTried = found;
    hillTops = hills;
    markPhase("hills");
    // The generator's own loops (aimed at real villages) pointed at each
    // hill, with the summit inserted where it adds the least detour.
    const sets: [number, number][][] = [];
    for (const h of hills.slice(0, 2)) {
      const b = bearingDegFrom(spec.start_point, h.point);
      const aimed = await generateWaypointSets(loopSpec, {
        directions: [b - 25, b + 25].map((d) => ({ name: `hill-${Math.round(d)}`, bearingDeg: (d + 360) % 360 })),
        exactDirections: true,
      });
      for (const ws of aimed) sets.push(withVia(ws, h.point));
      sets.push(...loopsOverHill(spec.start_point, h.point, loopSpec.distance_km, placesNear).slice(0, 2));
    }
    genDebug(`repeat efforts: ${hills.length} hill(s) within ${Math.round(reachKm)} km — ${hills.slice(0, 3).map((h) => `${h.name} ${h.elevation_m} m at ${h.dist_km} km`).join(", ")}`);
    if (sets.length) {
      loops = await generateFreshRoutes(loopSpec, null, sets, true).catch((e) => {
        genDebug(`repeat efforts: hill loops failed — ${e instanceof Error ? e.message : e}`);
        return [];
      });
    }
  }
  // Hill sessions whose hill loops all failed go straight to "out to the
  // climb and home" below; the generator's own loops rarely hold a climb.
  if (!loops.length && !(hill && hillTops.length)) {
    loops = await generateFreshRoutes(loopSpec, null).catch((e) => {
      genDebug(`repeat efforts: no loops — ${e instanceof Error ? e.message : e}`);
      return [] as GeneratedRoute[];
    });
  }

  type Found = { loop: GeneratedRoute; stretch: EffortStretch; spreadStretches: EffortStretch[] | null; data: { edgeTags: EdgeTags | null; stops: RoadStop[] } };
  const searchStretches = (pool: GeneratedRoute[]): Found[] => {
    const hits: Found[] = [];
    for (const loop of pool) {
      const data = loopEngineData.get(loop);
      if (!data?.edgeTags) continue;
      const avoid = (loop.road_report?.compromises ?? []).map((c) => [c.start, c.end] as [number, number]);
      const why: Record<string, number> = {};
      const debug = process.env.GENERATE_DEBUG ? (m: string) => { const k = m.split(": ")[1]?.split(" ")[0] ?? "?"; why[k] = (why[k] ?? 0) + 1; } : undefined;
      // One stretch that holds a whole rep; else (flat sessions) a quiet flat
      // stretch ridden back and forth — the rider agreed to repeat on one stretch.
      // Spread (the rider said no to repeating): each rep on its own stretch.
      const spreadStretches = spread && reps > 1 ? findSpreadStretches(loop.coordinates, loop.elevations, data.edgeTags, data.stops, workout, { avoid }) : null;
      const stretch = findEffortStretch(loop.coordinates, loop.elevations, data.edgeTags, data.stops, workout, { avoid, debug })
        ?? (hill ? null : findEffortStretch(loop.coordinates, loop.elevations, data.edgeTags, data.stops, workout, { avoid, laps: true }));
      genDebug(`repeat efforts: ${loop.distance_km} km (max ${Math.round(Math.max(...loop.elevations.filter(Number.isFinite)))} m) → ${stretch ? `${stretch.length_km} km at ${stretch.avg_gradient_pct}% ×${stretch.passes} (score ${stretch.score.toFixed(1)})` : `no stretch ${JSON.stringify(why)}`}`);
      if (spreadStretches) genDebug(`spread efforts: ${spreadStretches.length} stretches on the ${loop.distance_km} km loop`);
      if (stretch) hits.push({ loop, stretch, spreadStretches, data });
    }
    return hits;
  };
  const found = searchStretches(loops);
  markPhase("stretch search");
  // A climb with one road up (a headland, a col road that ends at the top):
  // ride out to it, do the reps, come home — the destination-ride builder,
  // held to the loop Road Standard since the rider did not ask for that road.
  // Flat sessions from a town centre: the loop sized for the ask stayed in
  // the suburbs, where every road has a junction. Once more, bigger, out to
  // quieter roads (the ride then says it came out longer).
  // Only as much bigger as the ±35 % distance rule leaves room for (CA-04).
  const widerKm = Math.min(Math.max(loopSpec.distance_km * 1.6, 35), spec.distance_km + Math.max(8, spec.distance_km * 0.35) - (spread ? 0 : extraKm));
  if (!hill && found.length === 0 && widerKm >= loopSpec.distance_km * 1.2 && Date.now() - (currentTimingsStart || Date.now()) < 25_000) {
    const wider = await generateFreshRoutes({ ...loopSpec, distance_km: widerKm }, null, undefined, true).catch(() => [] as GeneratedRoute[]);
    markPhase("wider loops");
    found.push(...searchStretches(wider));
  }
  if (hill && found.length === 0 && hillTops.length) {
    const rides = (await Promise.all(hillTops.map((h) =>
      generateDestinationRides({ ...loopSpec, destination: { name: h.name, point: h.point, distance_asked: true } }).catch(() => [] as GeneratedRoute[]),
    ))).flat().filter((r) => !r.road_report || compromiseAcceptable(r.road_report, r.distance_km));
    markPhase("hill out-and-back");
    found.push(...searchStretches(rides));
    // Still nothing and time left: the generator's own loops after all.
    if (found.length === 0 && !loops.length && Date.now() - (currentTimingsStart || Date.now()) < 25_000) {
      found.push(...searchStretches(await generateFreshRoutes(loopSpec, null).catch(() => [] as GeneratedRoute[])));
    }
  }
  // Best stretch, then the ride closest to the length asked for (repeats included).
  const lengthsOf = (st: EffortStretch) => lengthPlan(reps, st.passes).length - 1; // beyond the loop's own pass
  const rideOff = (f: (typeof found)[number]) =>
    Math.abs(f.loop.distance_km + lengthsOf(f.stretch) * f.stretch.length_km - spec.distance_km) / spec.distance_km;
  const lengthOf = (f: (typeof found)[number]) => f.spreadStretches ? f.loop.distance_km : f.loop.distance_km + lengthsOf(f.stretch) * f.stretch.length_km;
  const rideOffBy = (f: (typeof found)[number]) => Math.abs(lengthOf(f) - spec.distance_km) / spec.distance_km;
  found.sort((a, b) =>
    (b.spreadStretches ? 1 : 0) - (a.spreadStretches ? 1 : 0) ||
    (b.stretch.score - (b.spreadStretches ? rideOffBy(b) : rideOff(b)) * 8) - (a.stretch.score - (a.spreadStretches ? rideOffBy(a) : rideOff(a)) * 8));

  // Distance honesty, as for any loop (CA-04: 42–49 km served for a 21 km
  // session): more than ±35 % (at least 8 km) off the ask is declined.
  const allowanceKm = Math.max(8, spec.distance_km * 0.35);
  // The rider named no ride length: the distance came from the session itself.
  const sessionInferred = spec.duration_minutes != null && spec.duration_minutes === Math.round(workout.total_minutes * 1.25);
  const lengthNote = (km: number): string => {
    const diff = km - spec.distance_km;
    if (Math.abs(diff) / spec.distance_km <= 0.12 || Math.abs(diff) < 3) return "";
    if (sessionInferred) {
      return diff > 0
        ? ` About ${Math.round(diff)} km longer than the ~${spec.duration_minutes} min session needs — the nearest roads that can hold it.`
        : ` About ${Math.round(-diff)} km shorter than the ~${spec.duration_minutes} min session allows.`;
    }
    return "";
  };

  const out: GeneratedRoute[] = [];
  const seen = new Set<string>();
  repeatTooLongKm = null;
  for (const f of found) {
    if (out.length >= 2) break;
    const { loop, stretch, data } = f;
    const spreadHere = f.spreadStretches;
    const ride = spreadHere
      ? { coords: loop.coordinates, elevations: loop.elevations, edgeTags: data.edgeTags!, reps: spreadHere.map((st) => [st.start, st.end] as [number, number]) }
      : spliceRepeats(loop.coordinates, loop.elevations, data.edgeTags!, stretch.start, stretch.end, reps, stretch.passes);
    const distKm = pathDistanceKm(ride.coords);
    if (Math.abs(distKm - spec.distance_km) > allowanceKm) {
      genDebug(`repeat efforts: ${distKm.toFixed(1)} km ride dropped for a ${spec.distance_km} km ask (±${Math.round(allowanceKm)} km)`);
      if (distKm > spec.distance_km) repeatTooLongKm = Math.min(repeatTooLongKm ?? Infinity, distKm);
      continue;
    }
    // The same ride found twice (two waypoint sets routed onto one loop): serve it once (CA-09).
    const key = `${Math.round(distKm * 2)}:${ride.coords[ride.reps[0][0]].map((x) => x.toFixed(3)).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Extra lengths: forward ones climb the stretch's climb, backward ones its climb less the net rise.
    const extra = spreadHere ? 0 : lengthsOf(stretch);
    const net = (loop.elevations[stretch.end] ?? 0) - (loop.elevations[stretch.start] ?? 0);
    const gain = Math.round(loop.elevation_gain_m + Math.floor(extra / 2) * stretch.climb_m + Math.ceil(extra / 2) * Math.max(0, stretch.climb_m - net));

    const report = buildRoadReport(ride.coords, ride.edgeTags, spec.discipline);
    if (!report.standard_met) {
      await nameCompromises(ride.coords, report.compromises);
      report.summary = summariseCompromises(report.compromises);
    }

    // Name the place: the town it is at, and the road when the map knows it.
    const mid = loop.coordinates[Math.floor((stretch.start + stretch.end) / 2)];
    const town = placeNear(mid, 4);
    // The named hill the loop was aimed at, when the effort is on it.
    const hillName = hillsTried.find((h) => haversineKm(mid[0], mid[1], h.point[0], h.point[1]) < 3)?.name;
    const probe = [{ kind: "main_road", start: stretch.start, end: stretch.end, meters: 0, highway: data.edgeTags![stretch.start]?.highway ?? "unclassified", at: mid }] as RoadReport["compromises"];
    await nameCompromises(loop.coordinates, probe).catch(() => {});
    const road = probe[0].name;
    const place = hillName ?? town;
    const where = hillName && road
      ? `${hillName} — ${road}`
      : road && town ? `${road}, ${town}`
      : road ?? (place ? `the ${stretch.kind === "climb" ? "climb" : "road"} ${hillName ? "up" : "at"} ${place}` : `a ${stretch.kind === "climb" ? "climb" : "stretch"} ${Math.round(pathDistanceKm(loop.coordinates.slice(0, stretch.start + 1)))} km into the ride`);

    const segments: WorkoutFit["interval_segments"] = [];
    let r = 0;
    workout.intervals.forEach((iv, ii) => {
      for (let k = 0; k < iv.count; k++, r++) {
        const [a, b] = ride.reps[Math.min(r, ride.reps.length - 1)];
        const st = spreadHere?.[Math.min(r, spreadHere.length - 1)] ?? stretch;
        segments.push({
          interval_index: ii,
          rep_index: k,
          segment: {
            start_index: a,
            end_index: b,
            length_km: st.length_km,
            avg_gradient_pct: st.avg_gradient_pct,
            max_gradient_pct: st.max_gradient_pct,
            gradient_variance: 0,
            suitable_zones: [iv.zone],
          },
        });
      }
    });
    const fit: WorkoutFit = { fits: true, interval_segments: segments, candidate_segments: [segments[0].segment] };
    const label = sessionLabel(workout);
    const lenText = stretch.length_km < 10 ? `${stretch.length_km.toFixed(1)} km` : `${Math.round(stretch.length_km)} km`;
    const shape = stretch.kind === "climb" ? `${lenText} at ${stretch.avg_gradient_pct} %` : `${lenText}, steady`;
    const allEfforts = reps === 2 ? "Both efforts" : `All ${reps} efforts`;
    // What makes it a good place for efforts, said plainly — from what
    // actually joins the stretch on the map (CA-05), not only the engine's
    // crossing marks. No claim about junctions when the map lookup failed.
    const efforts = spreadHere ?? [stretch];
    const joins = await Promise.all(efforts.map((st) => stretchJunctions(loop.coordinates.slice(st.start, st.end + 1))));
    const traffic = efforts.every((st) => st.traffic_class != null && st.traffic_class <= 2) ? "Very light traffic" : "Light traffic";
    const known = joins.every((j) => j !== null) ? (joins as StretchJunctions[]) : null;
    const sides = known ? known.reduce((a, j) => a + j.side_roads, 0) : null;
    const signals = known ? known.reduce((a, j) => a + j.signals, 0) : 0;
    const controls = known ? known.reduce((a, j) => a + j.controls, 0) : 0;
    const clean = known === null
      ? `${traffic}, no traffic lights or stop signs on the road itself.`
      : `${traffic}${signals ? `, ${signals === 1 ? "one set" : `${signals} sets`} of traffic lights` : ", no traffic lights"}` +
        `${controls - signals > 0 ? `, ${controls - signals === 1 ? "one stop/yield sign" : `${controls - signals} stop/yield signs`} at side roads` : ""}` +
        `, ${sides === 0 ? `no side roads join ${spreadHere ? "them" : "it"}` : `${sides === 1 ? "one side road joins" : `${sides} side roads join`} ${spreadHere ? "them" : "it"} — watch for traffic pulling out`}.`;
    const lengthMsg = lengthNote(distKm);
    const fallbackMsg = spread && !spreadHere && reps > 1
      ? `No loop from here has ${reps} separate stretches that hold the efforts, so they are all on its best one. `
      : "";
    let note: string;
    if (spreadHere) {
      const at = spreadHere.map((st) => {
        const km = Math.round(pathDistanceKm(loop.coordinates.slice(0, st.start + 1)));
        const len = st.length_km < 10 ? `${st.length_km.toFixed(1)} km` : `${Math.round(st.length_km)} km`;
        return `${km} km in (${st.kind === "climb" ? `${len} at ${st.avg_gradient_pct} %` : `${len}, steady`})`;
      });
      note = `Each effort has its own stretch along the loop: ${at.join("; ")}. ${clean}${lengthMsg}`;
    } else {
      note = fallbackMsg + (stretch.kind === "laps"
        ? `${reps > 1 ? allEfforts : "Your effort"} on ${where} (${lenText}, flat): ride it back and forth — ${stretch.passes} lengths per effort${reps > 1 ? ", one easy length between efforts" : ""} — then ride on home. ${clean}`
        : reps > 1
        ? `${allEfforts} on ${where} (${shape}): go hard ${stretch.kind === "climb" ? "up" : "along it"}, spin back ${stretch.kind === "climb" ? "down" : "easy"}, repeat — then ride on home. ${clean}`
        : `Your effort goes on ${where} (${shape}). ${clean}`) + lengthMsg;
    }

    out.push({
      ...loop,
      coordinates: ride.coords,
      elevations: ride.elevations,
      distance_km: Math.round(distKm * 10) / 10,
      elevation_gain_m: gain,
      elevation_loss_m: gain,
      gpx_data: buildGpx(ride.coords, ride.elevations, `${label} — ${town ?? "LOOPS"}`, spec.discipline, workoutCoursePoints(ride.coords, fit, workout)),
      match_score: computeMatchScore(distKm, gain, spec, loop.quality_score),
      workout_fit: fit,
      road_report: report,
      title: spreadHere ? `${label} from ${placeNear(spec.start_point, 4) ?? town ?? "home"}` : `${label} on ${hillName ?? road ?? town ?? "one stretch"}`,
      ride_note: note,
    });
  }
  return out;
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
    quality_tier: qualityTier(quality.total, quality.city_share, QUALITY_WORLD_CLASS),
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
function workoutDeclineMessage(workout: WorkoutSpec, layout?: RouteSpec["effort_layout"], tooLongKm: number | null = null): string {
  const longest = workout.intervals.reduce(
    (max, iv) => (iv.duration_minutes > max.duration_minutes ? iv : max),
    workout.intervals[0]
  );
  const base = `I couldn't find roads near your start point that can hold ${longest.count} × ${longest.duration_minutes} min uninterrupted at that intensity.`;
  // The roads exist, but only on a ride far longer than asked: say so.
  if (tooLongKm !== null) {
    return `The nearest roads that can hold the session make a ride of about ${Math.round(tooLongKm)} km — much longer than you asked for. Ask for a longer ride (e.g. "${Math.max(1, Math.round((tooLongKm / 25) * 2) / 2)} hours") and I'll plan it.`;
  }
  if (layout === "spread" && totalReps(workout) > 1) {
    return `${base} Allow repeating the efforts on one stretch and I'll find the best place for all of them.`;
  }
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
 * Fresh workout-aware generation. Called only when the library has no
 * verified route that fits the workout. Widens the candidate net to 8
 * compass directions and keeps only the routes whose segments can host
 * every interval rep.
 */
async function generateFreshWorkoutRoutes(
  spec: RouteSpec,
  workout: WorkoutSpec
): Promise<GeneratedRoute[]> {
  // The full loop pipeline (spur repair, rules, Road Standard, scoring),
  // every survivor kept; then each loop's own stretches are matched to the
  // reps — one different stretch per rep ("spread them out").
  const hill = isHillSession(workout);
  const loops = await generateFreshRoutes(
    {
      ...spec,
      workout: undefined,
      elevation_preference: hill && (spec.elevation_preference === "any" || spec.elevation_preference === "rolling") ? "hilly" : spec.elevation_preference,
    },
    null,
    undefined,
    true,
  ).catch(() => [] as GeneratedRoute[]);

  const candidates: GeneratedRoute[] = [];
  for (const loop of loops) {
    const data = loopEngineData.get(loop);
    const rawSegments = detectIntervalSegments(loop.coordinates, loop.elevations);
    // Stops, lights and junction turns from the engine's own route data;
    // the map-service check only when the engine sent none.
    const cleanSegments = data?.edgeTags
      ? rawSegments.filter((seg) =>
          clearOfStops(loop.coordinates, seg.start_index, seg.end_index, data.stops, { ignoreCalming: hill }) &&
          data.edgeTags!.slice(seg.start_index, seg.end_index).every((t) => !!t && lightTraffic(t)))
      : filterCleanSegments(await validateSegments(rawSegments, loop.coordinates));
    const fit = assignWorkoutToSegments(cleanSegments, workout);
    genDebug(`spread efforts: ${loop.distance_km} km loop — ${rawSegments.length} segments, ${cleanSegments.length} clear → ${fit.fits ? "fits" : "no fit"}`);
    if (!fit.fits) continue;
    const label = sessionLabel(workout);
    candidates.push({
      ...loop,
      match_score: computeMatchScore(loop.distance_km, loop.elevation_gain_m, spec, loop.quality_score),
      workout_fit: fit,
      gpx_data: buildGpx(loop.coordinates, loop.elevations, `${label} — LOOPS`, spec.discipline, workoutCoursePoints(loop.coordinates, fit, workout)),
      title: `${label}, spread along the ride`,
      ride_note: `${fit.interval_segments.length} efforts on ${new Set(fit.interval_segments.map((a) => a.segment.start_index)).size} different stretches — each one light on traffic and clear of traffic lights, stop signs and junctions. The course points on the GPX mark every start and finish.`,
    });
  }
  candidates.sort((a, b) => b.match_score - a.match_score);
  return candidates.slice(0, 3);
}

/** How one routed candidate came out: the engine's route, what spur repair cut, what is left. */
export interface LoopSizing {
  rawKm: number;     // the engine's route, before spur repair
  lossKm: number;    // via-point spur cut out by repair
  servedKm: number;  // what remains — the loop the rider would get
}

export type SecondPassPlan =
  | { kind: "recalibrate"; radiusScale: number; servedRatio: number; rawRatio: number }
  | { kind: "new-directions"; why: string }
  | { kind: "none" };

/**
 * What the second pass should do, from how the first pass's loops came out.
 *
 * The radius is a SIZING lever: it only helps when the loops the engine
 * routed were consistently long or short of the ask. Recalibrating on the
 * served (post-repair) distance conflated two different shortfalls:
 * - the network detours (Sóller: 107–211 km routed for 80) → loops are
 *   long, scale the radius down by the served ratio — still done;
 * - the network funnels (Faro: 81–89 km routed, 55–61 km served after
 *   17–41 km of retrace was cut) → the routed loops were placed right and
 *   scaling the radius up by the served ratio produced 105–184 km routes
 *   with 37–100 km of retrace that died in SPUR_UTURN/distance drops
 *   (12 s of engine time for one loop). Now: when the routed loops were
 *   within 20 % of the ask, the shortfall is retrace, not placement, and the
 *   second pass tries new directions instead. When the routed loops were
 *   genuinely short, the scale-up follows the routed (raw) ratio — the
 *   retrace does not shrink with a bigger radius, so the served ratio
 *   over-corrects.
 *
 * `servedWell` = loops served within ~15 % of the ask, `served` = loops
 * served at all; fewer than two of either is the trigger, as before.
 */
export function planSecondPass(
  sizing: LoopSizing[],
  targetKm: number,
  servedWell: number,
  served: number
): SecondPassPlan {
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  if (servedWell < 2 && sizing.length >= 2) {
    const servedRatio = median(sizing.map((s) => s.servedKm)) / targetKm;
    const rawRatio = median(sizing.map((s) => s.rawKm)) / targetKm;
    if (Math.abs(servedRatio - 1) > 0.2) {
      if (servedRatio < 1 && rawRatio >= 0.8) {
        return {
          kind: "new-directions",
          why: `first pass loops were routed at ×${rawRatio.toFixed(2)} of the ask but served at ×${servedRatio.toFixed(2)} — the shortfall is retrace, not placement`,
        };
      }
      const basis = servedRatio > 1 ? servedRatio : rawRatio;
      const radiusScale = Math.max(0.5, Math.min(1.5, 1 / basis));
      return { kind: "recalibrate", radiusScale, servedRatio, rawRatio };
    }
  }
  if (served < 2) return { kind: "new-directions", why: `only ${served} loop(s) survived` };
  return { kind: "none" };
}

const SUMMIT_ROADS = new Set(["secondary", "tertiary", "unclassified", "residential", "road"]);

/** The last road point (from the start) on a walking-tolerant route to a hilltop, within 2.5 km of it. */
async function summitRoad(start: [number, number], hill: Hill): Promise<[number, number] | null> {
  const lonlats = `${start[1]},${start[0]}|${hill.point[1]},${hill.point[0]}`;
  try {
    const res = await withEngineSlot(() => fetch(`${BROUTER_URL}?lonlats=${lonlats}&profile=trekking&alternativeidx=0&format=geojson`, { signal: AbortSignal.timeout(8000) }));
    if (!res.ok) return null;
    const json = (await res.json()) as BRouterFeatureCollection;
    const messages = json.features?.[0]?.properties?.messages as unknown[] | undefined;
    if (!Array.isArray(messages) || !Array.isArray(messages[0])) return null;
    const h = messages[0] as string[];
    const lon = h.indexOf("Longitude"), lat = h.indexOf("Latitude"), tags = h.indexOf("WayTags");
    let top: [number, number] | null = null;
    for (const row of messages.slice(1)) {
      if (!Array.isArray(row)) continue;
      const hw = /(?:^| )highway=([a-z_]+)/.exec(String(row[tags] ?? ""))?.[1] ?? "";
      if (SUMMIT_ROADS.has(hw)) top = [Number(row[lat]) / 1e6, Number(row[lon]) / 1e6];
    }
    return top && haversineKm(top[0], top[1], hill.point[0], hill.point[1]) <= 2.5 ? top : null;
  } catch {
    return null;
  }
}

/** `via` inserted into a closed waypoint loop where it adds the least straight-line detour. */
function withVia(ws: [number, number][], via: [number, number]): [number, number][] {
  let best = 1, bestCost = Infinity;
  for (let i = 1; i < ws.length; i++) {
    const a = ws[i - 1], b = ws[i];
    const cost = haversineKm(a[0], a[1], via[0], via[1]) + haversineKm(via[0], via[1], b[0], b[1]) - haversineKm(a[0], a[1], b[0], b[1]);
    if (cost < bestCost) { bestCost = cost; best = i; }
  }
  return [...ws.slice(0, best), via, ...ws.slice(best)];
}

/** Climbing a "flat" loop may have per km (mirrors delivery-note's flat ceiling)… */
const FLAT_M_PER_KM = 5;
/** …and how far over it a loop may go before it is not flat any more. */
const FLAT_TOLERANCE = 1.6;

/** A start this close (km) outside a city centre's edge is "on the city's edge". */
const CITY_EDGE_KM = 8;

/** The city centre a start sits on the edge of (outside it, within CITY_EDGE_KM). */
export function cityEdgeOf(start: [number, number]): CityCore | null {
  if (cityCoreAt(start)) return null; // in the centre: every way out crosses it
  for (const c of CITY_CORES) {
    const d = haversineKm(start[0], start[1], c.center[0], c.center[1]);
    if (d <= c.radius_km + CITY_EDGE_KM) return c;
  }
  return null;
}

/** Does any straight leg of a waypoint loop run through the city centre? */
export function legsCrossCore(ws: [number, number][], core: CityCore): boolean {
  for (let i = 1; i < ws.length; i++) {
    const a = ws[i - 1], b = ws[i];
    const steps = Math.max(1, Math.ceil(haversineKm(a[0], a[1], b[0], b[1]) / 0.5));
    for (let k = 0; k <= steps; k++) {
      const p: [number, number] = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
      // A margin: the roads between two waypoints wander either side of the line.
      if (haversineKm(p[0], p[1], core.center[0], core.center[1]) <= core.radius_km + 0.5) return true;
    }
  }
  return false;
}

/**
 * Compass directions pointing away from the city centre (≥ 75° off the
 * bearing to it) for a start on the city's edge — Clontarf loops go out to
 * Fingal and Howth, not through O'Connell Street to Sandyford (CLT-04).
 */
function directionsAwayFrom(start: [number, number], core: CityCore) {
  const toCore = bearingDegFrom(start, core.center);
  const off = (a: number) => { const d = Math.abs(a - toCore) % 360; return d > 180 ? 360 - d : d; };
  return DIRECTIONS_WIDE.filter((d) => off(d.bearingDeg) >= 75);
}

/** Waypoint loops that stay out of the city centre first; crossing ones only when too few are left. */
function cityClearFirst(sets: [number, number][][], core: CityCore | null): [number, number][][] {
  if (!core) return sets;
  const clear = sets.filter((ws) => !legsCrossCore(ws, core));
  genDebug(`city edge (${core.name}): ${sets.length - clear.length}/${sets.length} waypoint loop(s) cross the centre ${JSON.stringify(sets.map((ws) => ws.map((w) => [+w[0].toFixed(3), +w[1].toFixed(3)])))}`);
  return clear.length >= 2 ? clear : [...clear, ...sets.filter((ws) => legsCrossCore(ws, core))];
}

/**
 * Shortest ride the repeat-efforts builder dropped for being too far over the
 * ask (DISTANCE_OFF) in the current request — the decline then names it.
 */
let repeatTooLongKm: number | null = null;

/** Per-edge tags and stops for each served fresh loop, by object identity. */
const loopEngineData = new WeakMap<GeneratedRoute, { edgeTags: EdgeTags | null; stops: RoadStop[] }>();

async function generateFreshRoutes(
  spec: RouteSpec,
  windForecast: WindForecast | null = null,
  /** Loops to route instead of the generator's own (hill repeats: loops over a hill). */
  presetWaypointSets?: [number, number][][],
  /** Return every loop that passed (the caller ranks them), not the top three. */
  keepAll = false,
): Promise<GeneratedRoute[]> {
  const profile = DISCIPLINE_PROFILE[spec.discipline];

  // Loop size starts from the Irish calibration; the first pass then MEASURES
  // how long this network's loops really come out and a second pass corrects
  // (a two-leg probe was too crude: at Enniskerry one leg hit the mountains,
  // one the coast, and every loop came out 30 % short).
  const radiusScale = 1;
  const sizing: LoopSizing[] = []; // routed / cut / served distance of every routed candidate
  // A start on a city's edge aims its loops away from the centre (CLT-04).
  const cityEdge = presetWaypointSets ? null : cityEdgeOf(spec.start_point);
  const awayDirs = cityEdge ? directionsAwayFrom(spec.start_point, cityEdge) : undefined;
  const waypointSets = presetWaypointSets ?? cityClearFirst(await generateWaypointSets(spec, { radiusScale, directions: awayDirs }), cityEdge);
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
  const t0 = Date.now();
  const callsAtStart = engineCalls;
  const lap = (label: string) => genDebug(`⏱ ${label} at +${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Phases 1–3 for one set of candidates. Run once with the best-supported
  // directions; if fewer than two loops survive and time allows, run again
  // with the remaining compass directions (a coast or a mountain wall can
  // kill half a compass).
  const runPass = async (waypointSets: [number, number][][], passLabel: string): Promise<GeneratedRoute[]> => {
  const routed: Routed[] = [];
  const routingDeadline = Math.min(Date.now() + ROUTING_BUDGET_MS, t0 + 38_000);
  currentRoutingDeadline = routingDeadline;
  currentCityNogo = cityNogoQuery(cityEdgeOf(spec.start_point));
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
      const rawKm = path.distance_km;
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
      sizing.push({ rawKm, lossKm: repair.removedKm, servedKm: path.distance_km });
    })
  );

  currentRoutingDeadline = 0;
  currentCityNogo = "";
  lap(`${passLabel}: phase 1 routed ${routed.length}/${waypointSets.length} candidates`);
  markPhase("routing");

  // ── Phase 2: one scenery lookup for the whole batch ─────────────────────
  // Roads come from the engine, so the only external data left is scenery
  // (coast, water, forest, peaks, cafés). One roads-free query for the union
  // of all candidates replaces N per-candidate road downloads — the single
  // biggest latency and timeout source in generation. Fail-soft: null means
  // "scenery not assessed", reported honestly and left out of the score.
  const withTags = routed.filter((r) => r.edgeTags && r.edgeTags.length > 0);
  // Scenery never costs the request its answer: wait only as long as the
  // pipeline budget allows (leaving ~8 s for scoring and the response);
  // past that, loops are scored with scenery "not assessed". A second pass
  // covers a new area whose scenery is usually not cached yet.
  const sceneryWaitMs = sceneryWaitBudgetMs(Date.now() - t0);
  const scenicFetch = passLabel === "pass 1"
    ? scenicPromise
    : prefetchScenic(unionBbox(waypointSets.map((w) => bboxOf(w, 0.08))));
  const scenic = withTags.length > 0
    ? await Promise.race([
        scenicFetch,
        new Promise<null>((r) => setTimeout(() => { genDebug(`scenery wait capped at ${sceneryWaitMs} ms`); r(null); }, sceneryWaitMs)),
      ])
    : undefined;
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
      const t3 = Date.now();
      const step = (label: string) => genDebug(`  ⏱ ${label} +${Date.now() - t3}ms (${Math.round(distKm)} km, ${path.coords.length} pts)`);

      const rulesResult = validateRouteRules(path.coords, spec.discipline, null, {
        elevationGain: gain,
        distanceKm: distKm,
        labeledMinClimbing:
          spec.elevation_preference === "flat" &&
          (spec.max_elevation_gain_m ?? Infinity) < distKm * 6,
        rejectSpurs: true,
      });
      step("rules");
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

      step("road report");
      let quality;
      try {
        quality = await scoreRoute(path.coords, spec.discipline, {
          edgeTags,
          scenic: edgeTags ? scenic : undefined,
        });
        step("quality");
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

      step("gpx");
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
        quality_tier: qualityTier(quality.total, quality.city_share, QUALITY_WORLD_CLASS),
        quality_breakdown: quality.breakdown as unknown as Record<string, number>,
        highlights: extractHighlights(quality.flags),
        road_type_breakdown: quality.road_class_breakdown ?? computeRoadTypeBreakdown(path.coords),
        surface_breakdown: quality.surface_breakdown,
        gpx_data: gpx,
        waypoints_used: waypoints,
        match_score: matchScore,
        ...(roadReport ? { road_report: roadReport } : {}),
      };
      // Engine data the repeat-efforts builder needs (not sent to the client).
      loopEngineData.set(result, { edgeTags, stops: path.stops ?? [] });

      return result;
    })
  );

  const candidates: GeneratedRoute[] = [];
  for (const result of candidateResults) {
    if (result.status === "fulfilled" && result.value !== null) {
      candidates.push(result.value);
    }
  }

  lap(`${passLabel}: phase 3 scored → ${candidates.length} candidate(s)`);
  markPhase("scoring");
  if (currentTimings) currentTimings.engine_calls = engineCalls - callsAtStart;
  return candidates;
  };

  let candidates = await runPass(waypointSets, "pass 1");

  // Second pass, if there is time: the network made loops consistently long
  // or short → re-place the same directions with the radius corrected; the
  // loops were placed right but retrace cut them short, or fewer than two
  // survived → new directions (planSecondPass). Also when loops were served
  // but sized badly (Faro: 55–61 km for 80) — the final ranking keeps the
  // best three overall.
  const offKm = (c: GeneratedRoute) => Math.abs(c.distance_km - spec.distance_km);
  const servedWell = candidates.filter((c) => offKm(c) <= Math.max(5, spec.distance_km * 0.15)).length;
  const plan = !presetWaypointSets && Date.now() - t0 < 18_000
    ? planSecondPass(sizing, spec.distance_km, servedWell, candidates.length)
    : { kind: "none" as const };
  if (plan.kind === "recalibrate") {
    const corrected = radiusScale * plan.radiusScale;
    genDebug(`first pass loops ran ×${plan.servedRatio.toFixed(2)} of the ask (routed ×${plan.rawRatio.toFixed(2)}) — re-placing with radius ×${corrected.toFixed(2)}`);
    const again = cityClearFirst(await generateWaypointSets(spec, { radiusScale: corrected, directions: awayDirs }), cityEdge);
    candidates = candidates.concat(await runPass(again, "pass 2 (recalibrated)"));
  }
  if (plan.kind === "new-directions") {
    const start = spec.start_point;
    const usedBearings = waypointSets.map((ws) => {
      let far = ws[1], farD = -1;
      for (const w of ws.slice(1, -1)) { const d = haversineKm(start[0], start[1], w[0], w[1]); if (d > farD) { farD = d; far = w; } }
      return bearingDegFrom(start, far);
    });
    const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    // Second pass: the best-SUPPORTED bearings not yet tried (villages out
    // there = roads out there). Falls back to the plain compass only where
    // the anchor data is sparse. Directions already tried are excluded.
    const compassExtra = DIRECTIONS_WIDE.filter((d) => usedBearings.every((u) => angDiff(d.bearingDeg, u) >= 30)).slice(0, 4);
    const more = cityClearFirst(await generateWaypointSets(spec, { directions: compassExtra, excludeBearings: usedBearings, radiusScale }), cityEdge);
    const fresh = more.filter((ws) => {
      let far = ws[1], farD = -1;
      for (const w of ws.slice(1, -1)) { const d = haversineKm(start[0], start[1], w[0], w[1]); if (d > farD) { farD = d; far = w; } }
      return usedBearings.every((u) => angDiff(bearingDegFrom(start, far), u) >= 20);
    });
    if (fresh.length > 0) {
      genDebug(`${plan.why} — second pass with ${fresh.length} new direction(s)`);
      candidates = candidates.concat(await runPass(fresh, "pass 2"));
    }
  }

  if (candidates.length === 0) {
    dropped["_engine"] = (() => { try { return new URL(BROUTER_URL).host; } catch { return "?"; } })() as unknown as number;
    if (libraryDiag) dropped["_library"] = libraryDiag as unknown as number;
    throw new NoValidRoutesError(Object.values(dropped).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0), dropped, {
      distance_km: spec.distance_km,
      discipline: spec.discipline,
      elevation_preference: spec.elevation_preference,
      region: spec.region ?? null,
    });
  }

  // "Flat" is a promise (TRV-07: "flat 60 km from Alcúdia" served +845 m).
  // Loops well over the flat ceiling are dropped while a flatter one exists;
  // when none does, the ride says so.
  if (spec.elevation_preference === "flat") {
    const ceiling = (c: GeneratedRoute) => spec.max_elevation_gain_m ?? c.distance_km * FLAT_M_PER_KM;
    const tooHilly = (c: GeneratedRoute) => c.elevation_gain_m > ceiling(c) * FLAT_TOLERANCE;
    const flat = candidates.filter((c) => !tooHilly(c));
    if (flat.length > 0) {
      for (const c of candidates) if (tooHilly(c)) genDebug(`candidate dropped: ${c.elevation_gain_m} m of climbing on a flat ask (${Math.round(c.distance_km)} km)`);
      candidates = flat;
    } else {
      for (const c of candidates) {
        c.ride_note = [c.ride_note, `Hillier than you asked: ${Math.round(c.elevation_gain_m)} m of climbing — the flattest loop we could route from here.`].filter(Boolean).join(" ");
      }
    }
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

  return keepAll ? candidates : candidates.slice(0, 3);
}

function summariseCompromises(compromises: RoadReport["compromises"]): string {
  return `Compromise: ${summaryParts(compromises)}.`;
}

/**
 * Trace an existing track through the engine with a neutral profile —
 * the road report for uploads, imports and library loops (road-trace.ts).
 */
export async function engineTrace(
  waypoints: [number, number][],
  profile = "trekking"
): Promise<{ coords: [number, number][]; edgeTags: EdgeTags | null; distance_km: number } | null> {
  const path = await routeViaBRouter(waypoints, profile);
  return path ? { coords: path.coords, edgeTags: path.edgeTags, distance_km: path.distance_km } : null;
}

/**
 * Is there another sensible road home from an out-and-back's turnaround?
 * Route out on the Road Standard profile, then home with the way out as a
 * weighted no-go (the destination-ride test). "only-road" when the way home
 * stays on the way out (a cape, a summit road), "alternative" when a
 * different road exists without an absurd detour, "unknown" when the engine
 * cannot route it (no map data — never recommended).
 */
export async function outAndBackAlternative(
  start: [number, number],
  far: [number, number],
): Promise<{ status: "only-road" | "alternative" | "unknown"; out_km?: number; home_km?: number; shared_pct?: number }> {
  const profile = DISCIPLINE_PROFILE.road;
  const out = await routeWithFallback([start, far], profile);
  if (!out || out.coords.length < 2) return { status: "unknown" };
  const nogo = avoidPolylines([out.coords], far, start);
  const home = nogo ? await routeViaBRouter([far, start], profile, false, nogo) : null;
  if (!home || home.coords.length < 2) return { status: "only-road", out_km: out.distance_km };
  const shared = sharedShare(home.coords, [out.coords]);
  const r = { out_km: Math.round(out.distance_km * 10) / 10, home_km: Math.round(home.distance_km * 10) / 10, shared_pct: Math.round(shared * 100) };
  return shared < DEST_MAX_SHARED_HOME && home.distance_km <= out.distance_km * DEST_MAX_HOME_STRETCH + 2
    ? { status: "alternative", ...r }
    : { status: "only-road", ...r };
}
