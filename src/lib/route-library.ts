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

import type { RouteSpec } from "./route-intent";
import { getRoutes, type Route } from "./db";

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
