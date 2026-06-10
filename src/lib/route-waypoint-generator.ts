/**
 * Route Waypoint Generator
 *
 * Takes a RouteSpec and generates 5 candidate sets of waypoints that create
 * promising loop routes, using the Overpass API to find road network context.
 */

import type { RouteSpec } from "./route-intent";

// ── Types ────────────────────────────────────────────────────────────────────

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

type OverpassElement = OverpassNode | OverpassWay;

interface OverpassResponse {
  elements: OverpassElement[];
}

// A point of interest discovered from OSM that can anchor a waypoint
interface AnchorPoint {
  lat: number;
  lon: number;
  score: number;     // 0–1, higher = more interesting anchor
  tags: Record<string, string>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Loop radius scaling. The waypoint pattern is start → mid(0.55R, −30°)
 * → far(R) → mid(0.55R, +30°) → start: a diamond with straight-line
 * perimeter ≈ 2.28R, not a circle (2πR). Roads add ~30% over straight
 * lines (measured on Irish road network), giving ridden distance ≈ 3.0R.
 * The old 2π divisor produced loops at HALF the requested distance.
 */
const LOOP_PERIMETER_FACTOR = 3.0;

// Compass directions for spreading 5 candidate routes
const DIRECTIONS: Array<{ name: string; bearingDeg: number }> = [
  { name: "north", bearingDeg: 0 },
  { name: "northeast", bearingDeg: 45 },
  { name: "east", bearingDeg: 90 },
  { name: "south", bearingDeg: 180 },
  { name: "west", bearingDeg: 270 },
];

// Wider 8-direction set used when we need more candidates (e.g. workout
// mode, where fit constraints are tight and we want a larger pool).
export const DIRECTIONS_WIDE: Array<{ name: string; bearingDeg: number }> = [
  { name: "north", bearingDeg: 0 },
  { name: "northeast", bearingDeg: 45 },
  { name: "east", bearingDeg: 90 },
  { name: "southeast", bearingDeg: 135 },
  { name: "south", bearingDeg: 180 },
  { name: "southwest", bearingDeg: 225 },
  { name: "west", bearingDeg: 270 },
  { name: "northwest", bearingDeg: 315 },
];

// OSM tags for interesting anchor points
const INTERESTING_NODE_TAGS: Record<string, string[]> = {
  place: ["village", "hamlet", "town"],
  tourism: ["viewpoint", "attraction", "museum"],
  amenity: ["cafe", "restaurant"],
  natural: ["peak", "spring"],
  historic: ["castle", "ruins", "monument"],
};

// Highway preferences → anchor scoring
const HIGHWAY_PREFERENCE_SCORES: Record<string, number> = {
  cycleway: 1.0,
  path: 0.9,
  track: 0.85,
  unclassified: 0.8,
  tertiary: 0.75,
  tertiary_link: 0.7,
  residential: 0.6,
  secondary: 0.4,
  secondary_link: 0.35,
  primary: 0.1,
  primary_link: 0.1,
  trunk: 0.0,
  motorway: 0.0,
};

// ── Geometry helpers ─────────────────────────────────────────────────────────

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

/** Move `distKm` from (lat, lon) in direction `bearingDeg`. */
/** Bearing from point 1 to point 2 in degrees (0..360). */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distKm: number
): [number, number] {
  const R = 6371;
  const d = distKm / R;
  const b = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

/** Bearing from point A to point B in degrees (0 = north). */
function bearingTo(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const lat1r = (lat1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2r);
  const x =
    Math.cos(lat1r) * Math.sin(lat2r) -
    Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ── Overpass query ───────────────────────────────────────────────────────────

/**
 * Query Overpass for the road network + POIs around a center point.
 * Radius = distance_km / (2π) to create loops of roughly the right size.
 */
async function queryOverpass(
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  roadPreferences: string[]
): Promise<OverpassResponse> {
  const radiusM = Math.round(radiusKm * 1000);

  // Build road type filter — always include preferred types, plus unclassified/tertiary fallback
  const highwayTypes = new Set([
    ...roadPreferences,
    "tertiary",
    "unclassified",
    "track",
    "residential",
  ]);
  const hwFilter = [...highwayTypes]
    .map((hw) => `["highway"="${hw}"]`)
    .join("");

  const query = `
[out:json][timeout:25];
(
  way(around:${radiusM},${centerLat},${centerLon})["highway"~"^(${[...highwayTypes].join("|")})$"];
  node(around:${radiusM},${centerLat},${centerLon})["place"~"^(village|hamlet|town)$"];
  node(around:${radiusM},${centerLat},${centerLon})["tourism"~"^(viewpoint|attraction)$"];
  node(around:${radiusM},${centerLat},${centerLon})["amenity"~"^(cafe|restaurant)$"];
  node(around:${radiusM},${centerLat},${centerLon})["natural"~"^(peak|spring)$"];
  node(around:${radiusM},${centerLat},${centerLon})["historic"];
);
out body;
>;
out skel qt;
`.trim();

  const doFetch = () =>
    fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "User-Agent": "loops.ie route generator (https://www.loops.ie)", "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(30000),
    });

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await doFetch();
    } catch {
      res = null; // network/timeout — treat like a 5xx and retry once
    }
    if (res && res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2500));
  }

  if (!res || !res.ok) {
    throw new Error(`Overpass API error: ${res ? `HTTP ${res.status}` : "network timeout"}`);
  }

  return res.json();
}

// ── Anchor point extraction ──────────────────────────────────────────────────

/**
 * Extract interesting anchor points from OSM data.
 * Scores each point based on tags and proximity to preferred road types.
 */
function extractAnchorPoints(
  elements: OverpassElement[],
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  spec: RouteSpec
): AnchorPoint[] {
  const nodeMap = new Map<number, OverpassNode>();
  const anchors: AnchorPoint[] = [];

  // Index nodes
  for (const el of elements) {
    if (el.type === "node") nodeMap.set(el.id, el);
  }

  // Score interesting nodes (villages, viewpoints, cafes, etc.)
  for (const el of elements) {
    if (el.type !== "node" || !el.tags) continue;

    let score = 0;

    // Check for interesting tags
    for (const [key, values] of Object.entries(INTERESTING_NODE_TAGS)) {
      if (el.tags[key] && values.includes(el.tags[key])) {
        score += 0.5;
        break;
      }
    }

    if (score === 0) continue; // Not interesting

    // Boost score for vibes match
    const tags = el.tags;
    if (spec.vibes.includes("scenic") && (tags.tourism === "viewpoint" || tags.natural === "peak")) {
      score += 0.3;
    }
    if (spec.vibes.includes("village") && tags.place) {
      score += 0.3;
    }
    if (spec.vibes.includes("coastal") && tags.natural === "bay") {
      score += 0.3;
    }

    // Prefer points that aren't too close to center or too far
    const dist = haversineKm(centerLat, centerLon, el.lat, el.lon);
    const idealDist = radiusKm * 0.5;
    const distScore = 1 - Math.abs(dist - idealDist) / radiusKm;
    score *= Math.max(0.1, distScore);

    anchors.push({ lat: el.lat, lon: el.lon, score, tags: el.tags });
  }

  // Also add synthetic anchor points on preferred roads (intersection heuristic)
  // Find nodes that appear in multiple ways (intersections) on preferred roads
  const nodeCounts = new Map<number, number>();
  const nodeHighways = new Map<number, string>();

  for (const el of elements) {
    if (el.type !== "way" || !el.tags?.highway) continue;
    const hw = el.tags.highway;
    const hwScore = HIGHWAY_PREFERENCE_SCORES[hw] ?? 0;
    if (hwScore < 0.6) continue; // Only preferred roads

    for (const nodeId of el.nodes) {
      nodeCounts.set(nodeId, (nodeCounts.get(nodeId) ?? 0) + 1);
      nodeHighways.set(nodeId, hw);
    }
  }

  // Nodes at intersections of preferred roads
  for (const [nodeId, count] of nodeCounts) {
    if (count < 2) continue; // Not an intersection
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const dist = haversineKm(centerLat, centerLon, node.lat, node.lon);
    if (dist < radiusKm * 0.2 || dist > radiusKm * 0.95) continue;

    const hw = nodeHighways.get(nodeId) ?? "";
    const hwScore = HIGHWAY_PREFERENCE_SCORES[hw] ?? 0.3;

    anchors.push({
      lat: node.lat,
      lon: node.lon,
      score: hwScore * 0.4 * (count > 3 ? 1.2 : 1),
      tags: { highway: hw },
    });
  }

  return anchors;
}

// ── Waypoint set generation ──────────────────────────────────────────────────

/**
 * For a given compass direction, pick 4–6 waypoints that create a loop
 * of roughly the right distance.
 *
 * Strategy:
 * 1. Pick a "furthest point" at distance_km/4 from start in the given direction
 * 2. Pick intermediate waypoints that curve around via interesting anchors
 * 3. Arrange as: start → intermediate1 → furthest → intermediate2 → start
 */
function buildWaypointSet(
  spec: RouteSpec,
  direction: { name: string; bearingDeg: number },
  anchors: AnchorPoint[]
): [number, number][] {
  const [startLat, startLon] = spec.start_point;

  const radiusKm = spec.distance_km / LOOP_PERIMETER_FACTOR;

  // Furthest point in the chosen direction
  const [fpLat, fpLon] = destinationPoint(
    startLat,
    startLon,
    direction.bearingDeg,
    radiusKm
  );

  // Build candidate loop: start → outbound → furthest → return → start
  // Outbound sweeps 30° left of direction, return sweeps 30° right
  const outboundBearing = (direction.bearingDeg - 30 + 360) % 360;
  const returnBearing = (direction.bearingDeg + 30) % 360;

  const [mid1Lat, mid1Lon] = destinationPoint(
    startLat,
    startLon,
    outboundBearing,
    radiusKm * 0.55
  );
  const [mid2Lat, mid2Lon] = destinationPoint(
    startLat,
    startLon,
    returnBearing,
    radiusKm * 0.55
  );

  // Snap each synthetic waypoint to the nearest high-scoring anchor (within 3km)
  const SNAP_RADIUS_KM = 3;

  function snapToAnchor(lat: number, lon: number): [number, number] {
    let best: AnchorPoint | null = null;
    let bestScore = -1;

    for (const anchor of anchors) {
      const dist = haversineKm(lat, lon, anchor.lat, anchor.lon);
      if (dist > SNAP_RADIUS_KM) continue;

      // Score combines anchor interest + proximity
      const proximityScore = 1 - dist / SNAP_RADIUS_KM;
      const combined = anchor.score * 0.6 + proximityScore * 0.4;

      if (combined > bestScore) {
        bestScore = combined;
        best = anchor;
      }
    }

    if (best) return [best.lat, best.lon];

    // No anchor within snap range: the synthetic point is likely in
    // water or a roadless area (coastal starts aim half the compass at
    // the sea). Fall back to an anchor that preserves the loop shape:
    // same compass sector from the start (±60°), at least 35% of the
    // intended radius out, closest to where the synthetic point was.
    // Anchors are real OSM nodes near roads, so they are routable.
    const intendedBearing = bearingDeg(startLat, startLon, lat, lon);
    const intendedDist = haversineKm(startLat, startLon, lat, lon);
    let fallback: AnchorPoint | null = null;
    let fallbackDist = Infinity;
    for (const anchor of anchors) {
      const fromStart = haversineKm(startLat, startLon, anchor.lat, anchor.lon);
      if (fromStart < intendedDist * 0.35) continue;
      const ab = bearingDeg(startLat, startLon, anchor.lat, anchor.lon);
      let delta = Math.abs(ab - intendedBearing);
      if (delta > 180) delta = 360 - delta;
      if (delta > 60) continue;
      const dist = haversineKm(lat, lon, anchor.lat, anchor.lon);
      if (dist < fallbackDist) {
        fallbackDist = dist;
        fallback = anchor;
      }
    }
    if (fallback) return [fallback.lat, fallback.lon];

    // Sector is empty (pure sea) — nearest anchor anywhere keeps the
    // waypoint on land; the set may still route, just less directional.
    let nearest: AnchorPoint | null = null;
    let nearestDist = Infinity;
    for (const anchor of anchors) {
      const dist = haversineKm(lat, lon, anchor.lat, anchor.lon);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = anchor;
      }
    }
    return nearest ? [nearest.lat, nearest.lon] : [lat, lon];
  }

  const snappedMid1 = snapToAnchor(mid1Lat, mid1Lon);
  const snappedFp = snapToAnchor(fpLat, fpLon);
  const snappedMid2 = snapToAnchor(mid2Lat, mid2Lon);

  // Return loop: start → mid1 → furthest → mid2 → start
  return [
    [startLat, startLon],
    snappedMid1,
    snappedFp,
    snappedMid2,
    [startLat, startLon],
  ];
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface WaypointSetOptions {
  /** Override the default 5-direction compass for candidate generation. */
  directions?: Array<{ name: string; bearingDeg: number }>;
}

/**
 * Generate candidate waypoint sets for the given RouteSpec.
 * Each set covers a different compass direction from the start point.
 *
 * Default behaviour: 5 candidates across N/NE/E/S/W.
 * Pass DIRECTIONS_WIDE (exported) via options.directions for 8 candidates
 * when fit constraints are tight (workout mode).
 */
export async function generateWaypointSets(
  spec: RouteSpec,
  options: WaypointSetOptions = {}
): Promise<Array<[number, number][]>> {
  const directions = options.directions ?? DIRECTIONS;
  const [startLat, startLon] = spec.start_point;
  const radiusKm = spec.distance_km / LOOP_PERIMETER_FACTOR;

  // Query Overpass for the surrounding road network. Fail soft: with no
  // road data we fall back to plain compass waypoints — the island-retry
  // and rules layers still guard the output, and a degraded attempt
  // beats a guaranteed failure.
  let anchors: AnchorPoint[] = [];
  try {
    const osmData = await queryOverpass(
      startLat,
      startLon,
      radiusKm * 1.2, // slightly larger to capture edges
      spec.road_preferences
    );
    anchors = extractAnchorPoints(osmData.elements, startLat, startLon, radiusKm, spec);
  } catch (err) {
    console.error(
      `[waypoints] Overpass unavailable — using geometric waypoints (${err instanceof Error ? err.message : err})`
    );
  }

  // Choose bearings by anchor support instead of a fixed compass: count
  // anchors in a ±30° sector beyond 35% of the radius for each of 12
  // bearings, and aim candidates at the best-supported ones. Coastal
  // starts stop wasting half their candidates pointing out to sea.
  const supported = rankBearingsByAnchorSupport(
    startLat,
    startLon,
    radiusKm,
    anchors,
    directions.length
  );
  const chosen =
    supported.length >= 2
      ? supported.map((bearingDegVal, i) => ({
          name: `auto-${Math.round(bearingDegVal)}`,
          bearingDeg: bearingDegVal,
        }))
      : directions; // sparse anchor data — fall back to the fixed compass

  // Generate one waypoint set per direction
  return chosen.map((direction) => buildWaypointSet(spec, direction, anchors));
}

/**
 * Rank 12 compass bearings (every 30°) by how many anchors sit in their
 * ±30° sector at a useful distance from the start, and return the top
 * `count` bearings with non-zero support, spaced at least 45° apart so
 * candidates stay diverse.
 */
function rankBearingsByAnchorSupport(
  startLat: number,
  startLon: number,
  radiusKm: number,
  anchors: AnchorPoint[],
  count: number
): number[] {
  const candidates: Array<{ bearing: number; support: number }> = [];
  for (let b = 0; b < 360; b += 30) {
    let support = 0;
    for (const a of anchors) {
      const dist = haversineKm(startLat, startLon, a.lat, a.lon);
      if (dist < radiusKm * 0.35) continue;
      const ab = bearingDeg(startLat, startLon, a.lat, a.lon);
      let delta = Math.abs(ab - b);
      if (delta > 180) delta = 360 - delta;
      if (delta <= 30) support++;
    }
    if (support > 0) candidates.push({ bearing: b, support });
  }
  candidates.sort((x, y) => y.support - x.support);

  const picked: number[] = [];
  for (const c of candidates) {
    const tooClose = picked.some((p) => {
      let d = Math.abs(p - c.bearing);
      if (d > 180) d = 360 - d;
      return d < 45;
    });
    if (!tooClose) picked.push(c.bearing);
    if (picked.length >= count) break;
  }
  return picked;
}
