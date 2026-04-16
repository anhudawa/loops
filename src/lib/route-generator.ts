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
import { validateRouteRules } from "./route-rules";
import { scoreRoute } from "./route-quality";
import {
  sampleRouteElevation,
  elevationGainFromSeries,
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

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedRoute {
  coordinates: [number, number][];
  elevations: number[];         // metres per coordinate, aligned 1:1
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  quality_score: number;
  quality_breakdown: Record<string, number>;
  road_type_breakdown: Record<string, number>;
  gpx_data: string;
  waypoints_used: [number, number][];
  match_score: number;          // 0–100 how well it matches the request
  workout_fit?: WorkoutFit;     // present on workout-mode generations
}

/**
 * Unified result shape for the /api/generate-route endpoint. The `source`
 * discriminator lets the UI tell a verified library hit from a fresh build
 * — important for the "this was hand-verified" trust signal.
 */
export type RouteCandidate =
  | ({ source: "library" } & LibraryMatch)
  | ({ source: "generated" } & GeneratedRoute);

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

/** BRouter profile per discipline. `trekking` is the safest default. */
const DISCIPLINE_PROFILE: Record<Discipline, string> = {
  road: "trekking",
  gravel: "trekking",
  mtb: "trekking",
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

function buildGpx(
  coords: [number, number][],
  elevations: number[] | null,
  name: string,
  discipline: string
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
  <trk>
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
}

async function routeViaBRouter(
  waypoints: [number, number][],       // [lat, lng]
  profile: string
): Promise<RoutedPath | null> {
  // BRouter expects lonlats as "lng,lat|lng,lat|..."
  const lonlats = waypoints.map(([lat, lng]) => `${lng},${lat}`).join("|");
  const url =
    `${BROUTER_URL}?lonlats=${lonlats}` +
    `&profile=${encodeURIComponent(profile)}` +
    `&alternativeidx=0&format=geojson`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(BROUTER_TIMEOUT_MS) });
  } catch {
    return null;
  }
  if (!res.ok) return null;

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

function computeRoadTypeBreakdown(_coords: [number, number][]): Record<string, number> {
  // Detailed road-type analysis is already done in scoreRoute via Overpass.
  return { estimated: 100 };
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface GenerateRouteOptions {
  /** The rider's average cycling speed in km/h. Used to personalise the
   * duration → distance conversion so "2 hour loop" means the right
   * distance for that specific rider, not a baseline 25 km/h rider. */
  userSpeedKmh?: number;
}

/**
 * Back-compat: return freshly generated routes only, same shape as before.
 * Use `generateRouteCandidates` to get the library+generated unified shape.
 */
export async function generateRoutes(
  prompt: string,
  options: GenerateRouteOptions = {}
): Promise<GeneratedRoute[]> {
  const candidates = await generateRouteCandidates(prompt, options);
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
): Promise<RouteCandidate[]> {
  const spec = await parseRouteIntent(prompt, { userSpeedKmh: options.userSpeedKmh });

  // ── Workout mode ───────────────────────────────────────────────────────────
  // A workout is a hard constraint: either the route's segments can host it
  // or they can't. Library-first still wins when available (known-good >
  // freshly built). Only if nothing in the library fits do we attempt a
  // fresh workout-aware generation. If even that fails we surface the
  // failure honestly rather than ship a generic route mislabelled as
  // workout-friendly.
  if (spec.workout) {
    const workoutMatches = await matchLibraryForWorkout(spec, 3);
    if (workoutMatches.length > 0) {
      return workoutMatches.map((m) => ({ source: "library" as const, ...m }));
    }
    const freshWorkout = await generateFreshWorkoutRoutes(spec, spec.workout);
    if (freshWorkout.length === 0) {
      throw new Error(
        "No routes in your area can host this workout. Try a shorter interval duration, a different zone, or a wider start location."
      );
    }
    return freshWorkout.map((g) => ({ source: "generated" as const, ...g }));
  }

  // ── Library-first ──────────────────────────────────────────────────────────
  const libraryMatches = await matchLibraryRoutes(spec, 3);
  if (libraryMatches.length > 0) {
    return libraryMatches.map((m) => ({ source: "library" as const, ...m }));
  }

  // ── Fresh generation ───────────────────────────────────────────────────────
  const generated = await generateFreshRoutes(spec);
  return generated.map((g) => ({ source: "generated" as const, ...g }));
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
    elevations = sampled.elevations;
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
    // Quality scoring is skipped for workout-mode candidates — we're
    // validating by "can actually host the workout," which is a stricter
    // signal than road-type breakdowns.
    quality_score: 0,
    quality_breakdown: {},
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
      const path = await routeViaBRouter(waypoints, profile);
      const route = await buildFreshRouteFromPath(path, waypoints, spec);
      if (!route) return null;

      // Detect segments on the freshly routed path and check workout fit.
      // If the route can't host the workout, it's useless to us — drop it.
      const segments = detectIntervalSegments(route.coordinates, route.elevations);
      const fit = assignWorkoutToSegments(segments, workout);
      if (!fit.fits) return null;

      return { ...route, workout_fit: fit };
    })
  );

  const candidates: GeneratedRoute[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value !== null) candidates.push(r.value);
  }

  candidates.sort((a, b) => b.match_score - a.match_score);
  return candidates.slice(0, 3);
}

async function generateFreshRoutes(spec: RouteSpec): Promise<GeneratedRoute[]> {
  const profile = DISCIPLINE_PROFILE[spec.discipline];

  const waypointSets = await generateWaypointSets(spec);

  const candidateResults = await Promise.allSettled(
    waypointSets.map(async (waypoints) => {
      const path = await routeViaBRouter(waypoints, profile);
      if (!path || path.coords.length < 2) return null;

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
        elevations = sampled.elevations;
        elevGain = sampled.gain_m;
        elevLoss = sampled.loss_m;
      } else if (elevGain === null) {
        elevGain = elevationGainFromSeries(elevations);
      }

      if (elevLoss === null) {
        // Compute loss from the elevation series
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
      });
      if (!rulesResult.passed) return null;

      const quality = await scoreRoute(path.coords, spec.discipline);

      const gpx = buildGpx(
        path.coords,
        elevations,
        `Generated ${spec.discipline} route — ${Math.round(distKm)}km`,
        spec.discipline
      );

      const matchScore = computeMatchScore(distKm, gain, spec, quality.total);

      const result: GeneratedRoute = {
        coordinates: path.coords,
        elevations,
        distance_km: Math.round(distKm * 10) / 10,
        elevation_gain_m: gain,
        elevation_loss_m: elevLoss,
        quality_score: quality.total,
        quality_breakdown: quality.breakdown as unknown as Record<string, number>,
        road_type_breakdown: computeRoadTypeBreakdown(path.coords),
        gpx_data: gpx,
        waypoints_used: waypoints,
        match_score: matchScore,
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

  if (candidates.length === 0) {
    throw new Error(
      "No valid routes could be generated. Try adjusting distance, location, or route preferences."
    );
  }

  candidates.sort((a, b) => {
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
    const aDist = Math.abs(a.distance_km - spec.distance_km);
    const bDist = Math.abs(b.distance_km - spec.distance_km);
    return aDist - bDist;
  });

  return candidates.slice(0, 3);
}
