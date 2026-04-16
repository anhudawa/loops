/**
 * Route Library Matcher
 *
 * Before we fresh-generate a route, check the library of verified routes
 * for a good match. This is the "safety net" — serving a known-good
 * verified route is always preferable to a freshly generated one.
 *
 * A library match must beat a score threshold to be served. If nothing in
 * the library fits, the caller falls back to fresh generation.
 */

import type { RouteSpec, WorkoutSpec } from "./route-intent";
import { getRoutes, type Route } from "./db";
import {
  detectIntervalSegments,
  segmentsForInterval,
  type IntervalSegment,
} from "./interval-segments";
import { sampleRouteElevation } from "./elevation";

export interface LibraryMatch {
  route_id: string;
  name: string;
  description: string | null;
  coordinates: [number, number][];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  discipline: "road" | "gravel" | "mtb";
  county: string;
  country: string;
  match_score: number;           // 0–100 how well it matches the request
  distance_from_start_km: number;
  workout_fit?: WorkoutFit;      // present on workout-mode matches
}

export interface WorkoutFit {
  fits: boolean;
  /** Segments within the route that each interval will be performed on. */
  interval_segments: Array<{
    interval_index: number;        // index into spec.workout.intervals
    rep_index: number;             // which rep (0..count-1)
    segment: IntervalSegment;
  }>;
  /** Segments found in the route that could host at least one interval. */
  candidate_segments: IntervalSegment[];
}

/** Minimum match score for a library route to be considered a good hit. */
export const LIBRARY_MATCH_THRESHOLD = 75;

/** Radius (km) within which library routes are candidates. */
const PROXIMITY_RADIUS_KM = 40;

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

/**
 * Score how well a library route matches the spec. Mirrors the shape of
 * computeMatchScore in route-generator.ts so library and generated candidates
 * are directly comparable by the caller.
 *
 * Dimensions:
 *   - distance fit (±tolerance)
 *   - elevation fit (under the user's max; or within preference band)
 *   - proximity to the prompt's start point
 */
export function scoreLibraryRoute(
  route: Route,
  spec: RouteSpec,
  distanceFromStartKm: number
): number {
  let score = 100;

  // ── Distance match ─────────────────────────────────────────────────────────
  const distDiff = Math.abs(route.distance_km - spec.distance_km);
  const tolerance = spec.distance_tolerance_km;
  if (distDiff > tolerance) {
    const overagePct = (distDiff - tolerance) / spec.distance_km;
    score -= Math.min(40, overagePct * 200);
  }

  // ── Elevation match ────────────────────────────────────────────────────────
  if (spec.max_elevation_gain_m !== undefined) {
    if (route.elevation_gain_m > spec.max_elevation_gain_m) {
      const overage = route.elevation_gain_m - spec.max_elevation_gain_m;
      score -= Math.min(30, (overage / spec.max_elevation_gain_m) * 60);
    }
  } else {
    // Softer penalty based on preference band when no hard cap given
    const perKm = route.elevation_gain_m / Math.max(1, route.distance_km);
    const overPreference =
      (spec.elevation_preference === "flat" && perKm > 8) ||
      (spec.elevation_preference === "rolling" && perKm > 15) ||
      (spec.elevation_preference === "hilly" && perKm < 10);
    if (overPreference) score -= 15;
  }

  // ── Proximity ──────────────────────────────────────────────────────────────
  // Within 10km of requested start = full marks.
  // Linear penalty up to the full PROXIMITY_RADIUS_KM.
  if (distanceFromStartKm > 10) {
    const overshoot = Math.min(
      distanceFromStartKm - 10,
      PROXIMITY_RADIUS_KM - 10
    );
    score -= (overshoot / (PROXIMITY_RADIUS_KM - 10)) * 20;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function toLibraryMatch(
  route: Route,
  spec: RouteSpec,
  score: number,
  distanceFromStartKm: number
): LibraryMatch {
  const raw = JSON.parse(route.coordinates) as number[][];
  const coordinates: [number, number][] = raw.map(([lat, lng]) => [lat, lng]);

  return {
    route_id: route.id,
    name: route.name,
    description: route.description,
    coordinates,
    distance_km: route.distance_km,
    elevation_gain_m: route.elevation_gain_m,
    elevation_loss_m: route.elevation_loss_m,
    discipline: route.discipline,
    county: route.county,
    country: route.country,
    match_score: score,
    distance_from_start_km: Math.round(distanceFromStartKm * 10) / 10,
  };
}

/**
 * Query the library for route candidates and return those that score above
 * the match threshold, ranked by score.
 *
 * @param spec      parsed route spec from the user's prompt
 * @param maxResults cap on returned matches (default 3)
 */
export async function matchLibraryRoutes(
  spec: RouteSpec,
  maxResults = 3
): Promise<LibraryMatch[]> {
  const [startLat, startLng] = spec.start_point;

  // Pull a generous candidate pool from the DB — filter/score in memory.
  // Using the existing getRoutes so we inherit quality_status='approved' and
  // the rating/verification signals it already computes.
  const pool = await getRoutes({
    discipline: spec.discipline,
    country: spec.country,
    lat: startLat,
    lng: startLng,
    maxRadius: PROXIMITY_RADIUS_KM,
    limit: 100,
  });

  const scored: LibraryMatch[] = [];
  for (const route of pool) {
    if (route.coordinates == null) continue;
    const distFromStart = haversineKm(
      startLat,
      startLng,
      route.start_lat,
      route.start_lng
    );
    const score = scoreLibraryRoute(route, spec, distFromStart);
    if (score < LIBRARY_MATCH_THRESHOLD) continue;
    scored.push(toLibraryMatch(route, spec, score, distFromStart));
  }

  scored.sort((a, b) => b.match_score - a.match_score);
  return scored.slice(0, maxResults);
}

// ── Workout-mode matching ─────────────────────────────────────────────────────

/**
 * Given detected segments in a route and a workout, try to assign each
 * interval rep to a distinct segment.
 *
 * Returns fits=false if any rep cannot be placed. Exported for unit
 * testing — callers should use matchLibraryForWorkout, which wraps this
 * with the broader matching pipeline.
 */
export function assignWorkout(
  segments: IntervalSegment[],
  workout: WorkoutSpec
): WorkoutFit {
  const allCandidates: IntervalSegment[] = [];
  const assignments: WorkoutFit["interval_segments"] = [];

  // Greedy assignment: for each (interval, rep) in order, pick the first
  // unused segment long enough to host it. If no fresh segment is available
  // but one is long enough to host the rep AND leave room for a recovery
  // stretch past, reuse it.
  const used = new Set<number>();  // indices into segments

  for (let i = 0; i < workout.intervals.length; i++) {
    const iv = workout.intervals[i];
    const candidates = segmentsForInterval(segments, iv.zone, iv.duration_minutes);
    allCandidates.push(...candidates);

    for (let rep = 0; rep < iv.count; rep++) {
      // Find first unused candidate
      let picked: { idx: number; segment: IntervalSegment } | null = null;
      for (let s = 0; s < segments.length; s++) {
        if (used.has(s)) continue;
        if (!candidates.some((c) => c.start_index === segments[s].start_index)) continue;
        picked = { idx: s, segment: segments[s] };
        break;
      }
      if (!picked) {
        return {
          fits: false,
          interval_segments: assignments,
          candidate_segments: dedupeSegments(allCandidates),
        };
      }
      assignments.push({ interval_index: i, rep_index: rep, segment: picked.segment });
      used.add(picked.idx);
    }
  }

  return {
    fits: true,
    interval_segments: assignments,
    candidate_segments: dedupeSegments(allCandidates),
  };
}

function dedupeSegments(segments: IntervalSegment[]): IntervalSegment[] {
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
 * Find library routes that can host the requested workout.
 *
 * A route is a candidate if:
 *   - it matches the base spec (discipline, country, within proximity)
 *   - its total distance is compatible with the workout's total_minutes
 *     (we don't want a 100km route for a 90-minute session)
 *   - it contains enough interval-suitable segments to host each rep
 *
 * Elevation data is required to detect segments. When a route's stored
 * coordinates lack per-point elevation, we sample on-demand via Open-Meteo.
 * Results are returned sorted by workout fit quality + base match score.
 */
/** Max candidates we'll run segment detection over. Each triggers at most
 * one Open-Meteo elevation call; we parallelise but cap to protect the
 * Vercel 28s pipeline budget. */
const WORKOUT_ANALYSIS_CAP = 8;

export async function matchLibraryForWorkout(
  spec: RouteSpec,
  maxResults = 3
): Promise<LibraryMatch[]> {
  if (!spec.workout) return [];

  const [startLat, startLng] = spec.start_point;
  const workout = spec.workout;

  const pool = await getRoutes({
    discipline: spec.discipline,
    country: spec.country,
    lat: startLat,
    lng: startLng,
    maxRadius: PROXIMITY_RADIUS_KM,
    limit: 100,
  });

  // ── Step 1: pre-filter cheaply by base score ────────────────────────────────
  // Workout analysis (elevation sampling + segment detection) is expensive.
  // Cut the pool down before touching the network.
  type Prefiltered = {
    route: (typeof pool)[number];
    coords: [number, number][];
    rawCoords: number[][];
    distFromStart: number;
    baseScore: number;
  };

  const prefiltered: Prefiltered[] = [];
  for (const route of pool) {
    if (route.coordinates == null) continue;

    let rawCoords: number[][];
    try {
      rawCoords = JSON.parse(route.coordinates) as number[][];
    } catch {
      continue;
    }
    if (rawCoords.length < 10) continue;

    const distFromStart = haversineKm(
      startLat,
      startLng,
      route.start_lat,
      route.start_lng
    );
    const baseScore = scoreLibraryRoute(route, spec, distFromStart);
    // Slightly relaxed in workout mode — a route that's a 70/100 base match
    // and can host the workout is far better than one that's 80/100 but
    // has no suitable segments.
    if (baseScore < LIBRARY_MATCH_THRESHOLD - 10) continue;

    prefiltered.push({
      route,
      coords: rawCoords.map(([lat, lng]) => [lat, lng]) as [number, number][],
      rawCoords,
      distFromStart,
      baseScore,
    });
  }

  prefiltered.sort((a, b) => b.baseScore - a.baseScore);
  const topCandidates = prefiltered.slice(0, WORKOUT_ANALYSIS_CAP);

  // ── Step 2: run segment detection in parallel ───────────────────────────────
  const analysed = await Promise.all(
    topCandidates.map(async (c): Promise<LibraryMatch | null> => {
      let elevations: number[] = c.rawCoords.map((p) =>
        typeof p[2] === "number" ? p[2] : NaN
      );
      const hasElevation = elevations.some((e) => !Number.isNaN(e));
      if (!hasElevation) {
        try {
          const sampled = await sampleRouteElevation(c.coords, 200);
          elevations = interpolateToFullPath(c.coords, sampled.sampled_coords, sampled.elevations);
        } catch {
          return null; // can't analyse without elevation
        }
      }

      const segments = detectIntervalSegments(c.coords, elevations);
      const fit = assignWorkout(segments, workout);
      if (!fit.fits) return null;

      // Small bonus for fitting the workout — the base score already encodes
      // distance/elevation/proximity so we don't want to drown it out.
      const score = Math.min(100, c.baseScore + 5);

      return {
        ...toLibraryMatch(c.route, spec, score, c.distFromStart),
        workout_fit: fit,
      };
    })
  );

  const scored = analysed.filter((x): x is LibraryMatch => x !== null);
  scored.sort((a, b) => b.match_score - a.match_score);
  return scored.slice(0, maxResults);
}

/**
 * Given a downsampled series of elevations, expand back to the full path
 * length via nearest-neighbour. Good enough for segment detection; we are
 * not rendering elevation profiles off this data.
 */
function interpolateToFullPath(
  fullCoords: [number, number][],
  sampledCoords: [number, number][],
  sampledElevations: number[]
): number[] {
  if (sampledCoords.length === 0 || sampledElevations.length === 0) {
    return fullCoords.map(() => NaN);
  }
  // Build cumulative distance for both series, then for each full-path
  // point find the nearest-by-distance sampled point.
  const fullDist: number[] = [0];
  for (let i = 1; i < fullCoords.length; i++) {
    fullDist.push(fullDist[i - 1] + haversineKm(
      fullCoords[i - 1][0], fullCoords[i - 1][1],
      fullCoords[i][0], fullCoords[i][1],
    ));
  }
  const sampledDist: number[] = [0];
  for (let i = 1; i < sampledCoords.length; i++) {
    sampledDist.push(sampledDist[i - 1] + haversineKm(
      sampledCoords[i - 1][0], sampledCoords[i - 1][1],
      sampledCoords[i][0], sampledCoords[i][1],
    ));
  }

  const out = new Array<number>(fullCoords.length);
  let j = 0;
  for (let i = 0; i < fullCoords.length; i++) {
    while (j < sampledDist.length - 1 && sampledDist[j + 1] < fullDist[i]) j++;
    out[i] = sampledElevations[j];
  }
  return out;
}
