/**
 * Route Library Matcher
 *
 * Search the human-ridden route library for a good match. The commercial
 * product returns an honest no-match when the library has no suitable route;
 * it never falls through to invented consumer geometry.
 *
 * A library match must beat a score threshold to be served.
 */

import type { RouteSpec, WorkoutSpec } from "./route-intent";
import {
  getApprovedSegmentAssessments,
  getRoutes,
  type ApprovedSegmentAssessment,
  type Route,
} from "./db";
import {
  segmentsForInterval,
  type IntervalSegment,
} from "./interval-segments";
import {
  defaultSessionTypeForZone,
  IRELAND_BETA_SESSION_TYPES,
  zoneForSessionType,
} from "./workout";

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
  /** Rider-facing wind summary; set by the generator when wind was requested. */
  wind_note?: string;
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

function assessmentToSegment(assessment: ApprovedSegmentAssessment): IntervalSegment {
  return {
    start_index: Number(assessment.start_index),
    end_index: Number(assessment.end_index),
    length_km: Number(assessment.length_km),
    avg_gradient_pct: Number(assessment.avg_gradient_pct),
    max_gradient_pct: Number(assessment.max_gradient_pct),
    gradient_variance: Number(assessment.gradient_variance),
    suitable_zones: [zoneForSessionType(assessment.session_type)],
    assessment_id: assessment.id,
    session_type: assessment.session_type,
    direction: assessment.direction,
    min_effort_seconds: Number(assessment.min_effort_seconds),
    max_effort_seconds: Number(assessment.max_effort_seconds),
    assessor_name: assessment.assessor_name,
    assessed_at: assessment.assessed_at,
    surface_rating: assessment.surface_rating,
    traffic_rating: assessment.traffic_rating,
    sightlines_rating: assessment.sightlines_rating,
    junction_count: Number(assessment.junction_count),
    entry_notes: assessment.entry_notes,
    recovery_notes: assessment.recovery_notes,
    runout_notes: assessment.runout_notes,
    hazards_notes: assessment.hazards_notes,
  };
}

/**
 * Assign a structured workout exclusively from current, approved human
 * segment assessments. Automated terrain detection can assist curators, but
 * it is never passed to this function and can never create a workout claim.
 */
export function assignHumanAssessedWorkout(
  assessments: ApprovedSegmentAssessment[],
  workout: WorkoutSpec
): WorkoutFit {
  const segments = assessments.map(assessmentToSegment);
  const assignments: WorkoutFit["interval_segments"] = [];
  const allCandidates: IntervalSegment[] = [];
  const usedGeometry = new Set<string>();

  for (let intervalIndex = 0; intervalIndex < workout.intervals.length; intervalIndex++) {
    const interval = workout.intervals[intervalIndex];
    const sessionType = interval.session_type ?? defaultSessionTypeForZone(interval.zone);
    const durationSeconds = interval.duration_seconds ?? Math.round(interval.duration_minutes * 60);

    if (!sessionType || !IRELAND_BETA_SESSION_TYPES.has(sessionType)) {
      return { fits: false, interval_segments: assignments, candidate_segments: dedupeSegments(allCandidates) };
    }

    const candidates = segments.filter((segment) =>
      segment.session_type === sessionType &&
      durationSeconds >= (segment.min_effort_seconds ?? Infinity) &&
      durationSeconds <= (segment.max_effort_seconds ?? -Infinity)
    );
    allCandidates.push(...candidates);

    for (let repIndex = 0; repIndex < interval.count; repIndex++) {
      const segment = candidates.find((candidate) => {
        const key = `${candidate.start_index}-${candidate.end_index}-${candidate.direction}`;
        return !usedGeometry.has(key);
      });
      if (!segment) {
        return { fits: false, interval_segments: assignments, candidate_segments: dedupeSegments(allCandidates) };
      }
      assignments.push({ interval_index: intervalIndex, rep_index: repIndex, segment });
      usedGeometry.add(`${segment.start_index}-${segment.end_index}-${segment.direction}`);
    }
  }

  return { fits: true, interval_segments: assignments, candidate_segments: dedupeSegments(allCandidates) };
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
 * Every workout match must come from a current, approved human segment
 * assessment tied to the route's immutable current version. Results are
 * returned sorted by workout fit quality + base match score.
 */
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

  // Pre-filter by route, distance and proximity before loading its human
  // assessments. This path intentionally performs no segment inference.
  type Prefiltered = {
    route: (typeof pool)[number];
    distFromStart: number;
    baseScore: number;
  };

  const prefiltered: Prefiltered[] = [];
  for (const route of pool) {
    if (route.coordinates == null) continue;

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
      distFromStart,
      baseScore,
    });
  }

  prefiltered.sort((a, b) => b.baseScore - a.baseScore);
  const assessments = await getApprovedSegmentAssessments(prefiltered.map((candidate) => candidate.route.id));
  const assessmentsByRoute = new Map<string, ApprovedSegmentAssessment[]>();
  for (const assessment of assessments) {
    const existing = assessmentsByRoute.get(assessment.route_id) ?? [];
    existing.push(assessment);
    assessmentsByRoute.set(assessment.route_id, existing);
  }

  const scored: LibraryMatch[] = [];
  for (const candidate of prefiltered) {
    const fit = assignHumanAssessedWorkout(
      assessmentsByRoute.get(candidate.route.id) ?? [],
      workout
    );
    if (!fit.fits) continue;
    scored.push({
      ...toLibraryMatch(candidate.route, spec, Math.min(100, candidate.baseScore + 5), candidate.distFromStart),
      workout_fit: fit,
    });
  }
  scored.sort((a, b) => b.match_score - a.match_score);
  return scored.slice(0, maxResults);
}
