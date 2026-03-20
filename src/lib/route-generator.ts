/**
 * Route Generator — Main Orchestrator
 *
 * Orchestrates the full pipeline:
 * 1. Parse intent → RouteSpec
 * 2. Generate waypoint sets → 5 candidate waypoint arrays
 * 3. Route each via OSRM
 * 4. Validate with hard rules
 * 5. Score with quality system
 * 6. Return top 3 ranked routes
 */

import type { RouteSpec } from "./route-intent";
import { parseRouteIntent } from "./route-intent";
import { generateWaypointSets } from "./route-waypoint-generator";
import { validateRouteRules } from "./route-rules";
import { scoreRoute } from "./route-quality";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedRoute {
  coordinates: [number, number][];
  distance_km: number;
  elevation_gain_m: number;
  quality_score: number;
  quality_breakdown: Record<string, number>;
  road_type_breakdown: Record<string, number>; // % on each road type
  gpx_data: string;
  waypoints_used: [number, number][];
  match_score: number; // 0–100 how well it matches the request
}

interface OsrmResponse {
  code: string;
  routes?: Array<{
    distance: number;   // metres
    duration: number;   // seconds
    geometry: {
      coordinates: Array<[number, number]>; // [lng, lat]
    };
  }>;
  message?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const OSRM_BASE = "http://router.project-osrm.org/route/v1/cycling";
const OSRM_TIMEOUT_MS = 15000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

/** Simple elevation gain estimate: flat 8m/km as placeholder (no elevation data from OSRM). */
function estimateElevationGain(coords: [number, number][], distKm: number): number {
  // OSRM public server doesn't return elevation data.
  // We return a placeholder; the quality scoring system handles the actual elevation check.
  return Math.round(distKm * 8);
}

/** Escape XML special characters. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build a GPX string from coordinates [lat, lng][]. */
function buildGpx(
  coords: [number, number][],
  name: string,
  discipline: string
): string {
  const now = new Date().toISOString();
  const trkpts = coords
    .map(([lat, lng]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`)
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

// ── OSRM routing ─────────────────────────────────────────────────────────────

/**
 * Call OSRM to route between waypoints. Returns [lat, lng][] coordinates.
 * OSRM uses lng,lat ordering in the URL and returns [lng, lat] in GeoJSON.
 */
async function routeViaOsrm(
  waypoints: [number, number][] // [lat, lng][]
): Promise<[number, number][] | null> {
  // Convert [lat, lng] → "lng,lat" for OSRM URL
  const coordStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson&steps=false`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(OSRM_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json: OsrmResponse = await res.json();
    if (json.code !== "Ok" || !json.routes || json.routes.length === 0) return null;

    // OSRM returns [[lng, lat], ...] — convert to [lat, lng]
    return json.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {
    return null;
  }
}

// ── Road type breakdown ───────────────────────────────────────────────────────

/** Sample coords along route and return rough road type breakdown (placeholder). */
function computeRoadTypeBreakdown(
  _coords: [number, number][]
): Record<string, number> {
  // Without querying Overpass again here, we return a generic breakdown.
  // The quality scoring already does the detailed OSM analysis.
  return { estimated: 100 };
}

// ── Match scoring ────────────────────────────────────────────────────────────

/**
 * Score how well the generated route matches the original request.
 * Returns 0–100.
 */
function computeMatchScore(
  actual_distance_km: number,
  actual_elevation_gain_m: number,
  spec: RouteSpec,
  quality_score: number
): number {
  let score = 100;

  // Distance match (±tolerance → full marks, outside → linear penalty)
  const distDiff = Math.abs(actual_distance_km - spec.distance_km);
  const tolerance = spec.distance_tolerance_km;
  if (distDiff > tolerance) {
    const overagePct = (distDiff - tolerance) / spec.distance_km;
    score -= Math.min(40, overagePct * 200); // up to 40pt penalty
  }

  // Elevation preference match
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

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateRoutes(prompt: string): Promise<GeneratedRoute[]> {
  // Step 1: Parse intent
  const spec = await parseRouteIntent(prompt);

  // Step 2: Generate waypoint sets
  const waypointSets = await generateWaypointSets(spec);

  // Step 3 & 4 & 5: Route, validate, score each candidate (in parallel)
  const candidateResults = await Promise.allSettled(
    waypointSets.map(async (waypoints) => {
      // Route via OSRM
      const coords = await routeViaOsrm(waypoints);
      if (!coords || coords.length < 2) return null;

      const distKm = totalDistanceKm(coords);
      const elevGain = estimateElevationGain(coords, distKm);

      // Hard rules validation (GPS-only, fast)
      const rulesResult = validateRouteRules(coords, spec.discipline, null, {
        elevationGain: elevGain,
        distanceKm: distKm,
        labeledMinClimbing:
          spec.elevation_preference === "flat" &&
          (spec.max_elevation_gain_m ?? Infinity) < distKm * 6,
      });

      if (!rulesResult.passed) return null;

      // Quality scoring
      const quality = await scoreRoute(coords, spec.discipline);

      const gpx = buildGpx(
        coords,
        `Generated ${spec.discipline} route — ${Math.round(distKm)}km`,
        spec.discipline
      );

      const matchScore = computeMatchScore(distKm, elevGain, spec, quality.total);

      const result: GeneratedRoute = {
        coordinates: coords,
        distance_km: Math.round(distKm * 10) / 10,
        elevation_gain_m: elevGain,
        quality_score: quality.total,
        quality_breakdown: quality.breakdown as unknown as Record<string, number>,
        road_type_breakdown: computeRoadTypeBreakdown(coords),
        gpx_data: gpx,
        waypoints_used: waypoints,
        match_score: matchScore,
      };

      return result;
    })
  );

  // Collect successful results
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

  // Step 6: Rank by match_score desc, then quality_score, then distance accuracy
  candidates.sort((a, b) => {
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
    const aDist = Math.abs(a.distance_km - spec.distance_km);
    const bDist = Math.abs(b.distance_km - spec.distance_km);
    return aDist - bDist;
  });

  return candidates.slice(0, 3);
}
