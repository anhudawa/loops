/**
 * Route Rules Pre-filter
 *
 * Hard rules that must pass before quality scoring.
 * Fatal violations → score 0. Warnings → informational flags.
 *
 * Rules that require OSM data are skipped gracefully when osmData is absent.
 */

export type Discipline = "road" | "gravel" | "mtb";

export interface RuleViolation {
  rule: string;
  message: string;
  severity: "fatal" | "warning";
}

export interface RuleValidationResult {
  passed: boolean;
  violations: RuleViolation[];
  skipped: string[]; // rules skipped due to missing OSM data
}

// ──── OSM types (mirrors route-quality.ts internals) ─────────────────────────

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

interface OsmNodeCoord {
  lat: number;
  lon: number;
}

interface ProcessedWay {
  tags: Record<string, string>;
  nodes: OsmNodeCoord[];
}

// ──── Geometry helpers ───────────────────────────────────────────────────────

/** Haversine distance between two [lat, lng] points in kilometres. */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Total route distance in kilometres. */
function totalDistanceKm(coords: [number, number][]): number {
  let dist = 0;
  for (let i = 1; i < coords.length; i++) {
    dist += haversineKm(coords[i - 1], coords[i]);
  }
  return dist;
}

/** Distance from a point to the nearest point on a line segment. */
function pointToSegmentKm(
  pt: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const [px, py] = [pt[1], pt[0]];
  const [ax, ay] = [a[1], a[0]];
  const [bx, by] = [b[1], b[0]];
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return haversineKm(pt, a);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return haversineKm(pt, [ay + t * dy, ax + t * dx]);
}

/** Find the nearest way within maxKm, returning it or null. */
function findNearestWay(
  pt: [number, number],
  ways: ProcessedWay[],
  maxKm = 0.05
): ProcessedWay | null {
  let bestDist = maxKm;
  let bestWay: ProcessedWay | null = null;
  for (const way of ways) {
    for (let i = 0; i + 1 < way.nodes.length; i++) {
      const a: [number, number] = [way.nodes[i].lat, way.nodes[i].lon];
      const b: [number, number] = [way.nodes[i + 1].lat, way.nodes[i + 1].lon];
      const d = pointToSegmentKm(pt, a, b);
      if (d < bestDist) {
        bestDist = d;
        bestWay = way;
      }
    }
  }
  return bestWay;
}

// ──── OSM data helpers ───────────────────────────────────────────────────────

function buildNodeMap(elements: OsmElement[]): Record<number, OsmNodeCoord> {
  const map: Record<number, OsmNodeCoord> = {};
  for (const el of elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      map[el.id] = { lat: el.lat, lon: el.lon };
    }
  }
  return map;
}

function buildProcessedWays(
  elements: OsmElement[],
  nodeMap: Record<number, OsmNodeCoord>
): ProcessedWay[] {
  const ways: ProcessedWay[] = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.nodes || !el.tags) continue;
    const nodes = el.nodes
      .map((id) => nodeMap[id])
      .filter((n): n is OsmNodeCoord => n !== undefined);
    if (nodes.length >= 2) ways.push({ tags: el.tags, nodes });
  }
  return ways;
}

/** Sample coordinates every ~intervalMeters along the route. */
function sampleCoords(
  coords: [number, number][],
  intervalMeters = 200
): [number, number][] {
  if (coords.length < 2) return coords;
  const sampled: [number, number][] = [coords[0]];
  let accumulated = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm(coords[i - 1], coords[i]) * 1000;
    accumulated += d;
    if (accumulated >= intervalMeters) {
      sampled.push(coords[i]);
      accumulated = 0;
    }
  }
  const last = coords[coords.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

// ──── Unpaved surface sets ───────────────────────────────────────────────────

const PAVED_SURFACES = new Set([
  "asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes",
  "paving_stones", "cobblestone", "sett", "metal",
]);

const UNPAVED_SURFACES = new Set([
  "unpaved", "gravel", "fine_gravel", "compacted", "dirt", "earth",
  "grass", "ground", "mud", "sand", "woodchips", "pebblestone", "rock",
]);

const PAVED_HIGHWAY_TYPES = new Set([
  "motorway", "motorway_link", "trunk", "trunk_link",
  "primary", "primary_link", "secondary", "secondary_link",
  "tertiary", "tertiary_link", "residential", "service", "living_street",
]);

const UNPAVED_HIGHWAY_TYPES = new Set([
  "track", "path", "bridleway", "cycleway",
]);

function isSurfacePaved(tags: Record<string, string>): boolean | null {
  const surface = tags.surface;
  if (surface) {
    if (PAVED_SURFACES.has(surface)) return true;
    if (UNPAVED_SURFACES.has(surface)) return false;
  }
  const hw = tags.highway;
  if (hw) {
    if (PAVED_HIGHWAY_TYPES.has(hw)) return true;
    if (UNPAVED_HIGHWAY_TYPES.has(hw)) return false;
  }
  return null; // unknown
}

// ──── Rule implementations ───────────────────────────────────────────────────

const BLACKLISTED_HIGHWAYS = new Set([
  "motorway", "motorway_link", "trunk", "trunk_link", "primary",
]);

/**
 * RULE 1: ROAD_TYPE_BLACKLIST
 * Fatal if >5% of sampled points are on motorway/trunk/primary.
 */
function checkRoadTypeBlacklist(
  sampled: [number, number][],
  highwayWays: ProcessedWay[]
): RuleViolation | null {
  let blacklistedCount = 0;
  for (const pt of sampled) {
    const way = findNearestWay(pt, highwayWays, 0.05);
    if (way && BLACKLISTED_HIGHWAYS.has(way.tags.highway ?? "")) {
      blacklistedCount++;
    }
  }
  const pct = sampled.length > 0 ? blacklistedCount / sampled.length : 0;
  if (pct > 0.05) {
    return {
      rule: "ROAD_TYPE_BLACKLIST",
      message: `${(pct * 100).toFixed(1)}% of route is on motorway/trunk/primary (limit: 5%)`,
      severity: "fatal",
    };
  }
  return null;
}

/**
 * RULE 2: SPEED_LIMIT
 * Fatal if >10% of sampled points are on roads with maxspeed > 80 km/h.
 */
function checkSpeedLimit(
  sampled: [number, number][],
  highwayWays: ProcessedWay[]
): RuleViolation | null {
  let highSpeedCount = 0;
  for (const pt of sampled) {
    const way = findNearestWay(pt, highwayWays, 0.05);
    if (!way) continue;
    const maxspeedRaw = way.tags.maxspeed ?? "";
    // Parse "80", "80 mph", "80 km/h", "IE:motorway" etc.
    const numeric = parseInt(maxspeedRaw, 10);
    if (!isNaN(numeric)) {
      // Convert mph to km/h if tag contains "mph"
      const kmh = maxspeedRaw.toLowerCase().includes("mph") ? numeric * 1.60934 : numeric;
      if (kmh > 80) highSpeedCount++;
    }
  }
  const pct = sampled.length > 0 ? highSpeedCount / sampled.length : 0;
  if (pct > 0.1) {
    return {
      rule: "SPEED_LIMIT",
      message: `${(pct * 100).toFixed(1)}% of route is on roads with speed limit >80 km/h (limit: 10%)`,
      severity: "fatal",
    };
  }
  return null;
}

/**
 * RULE 3: CYCLING_INFRA
 * - Road: warning if <30% cycleway infrastructure
 * - Gravel: fatal if <50% unpaved
 * - MTB: fatal if <60% unpaved
 */
function checkCyclingInfra(
  sampled: [number, number][],
  highwayWays: ProcessedWay[],
  discipline: Discipline
): RuleViolation | null {
  if (sampled.length === 0) return null;

  if (discipline === "road") {
    const CYCLEWAY_TYPES = new Set(["cycleway", "path"]);
    let cyclewayCount = 0;
    for (const pt of sampled) {
      const way = findNearestWay(pt, highwayWays, 0.05);
      if (way && (CYCLEWAY_TYPES.has(way.tags.highway ?? "") || way.tags.cycleway)) {
        cyclewayCount++;
      }
    }
    const pct = cyclewayCount / sampled.length;
    if (pct < 0.3) {
      return {
        rule: "CYCLING_INFRA",
        message: `Only ${(pct * 100).toFixed(1)}% of road route has dedicated cycleway infrastructure (recommended: 30%)`,
        severity: "warning",
      };
    }
  } else {
    // gravel and mtb: check unpaved proportion
    const threshold = discipline === "gravel" ? 0.5 : 0.6;
    let unpavedCount = 0;
    let classifiedCount = 0;
    for (const pt of sampled) {
      const way = findNearestWay(pt, highwayWays, 0.05);
      if (!way) continue;
      const paved = isSurfacePaved(way.tags);
      if (paved !== null) {
        classifiedCount++;
        if (!paved) unpavedCount++;
      }
    }
    if (classifiedCount > 0) {
      const pct = unpavedCount / classifiedCount;
      if (pct < threshold) {
        return {
          rule: "CYCLING_INFRA",
          message: `Only ${(pct * 100).toFixed(1)}% of ${discipline} route is unpaved (required: ${threshold * 100}%)`,
          severity: "fatal",
        };
      }
    }
  }
  return null;
}

/**
 * RULE 4: CONNECTIVITY
 * Fatal if any gap >500m between consecutive coordinate points.
 */
function checkConnectivity(coords: [number, number][]): RuleViolation | null {
  const GAP_THRESHOLD_KM = 0.5;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm(coords[i - 1], coords[i]);
    if (d > GAP_THRESHOLD_KM) {
      return {
        rule: "CONNECTIVITY",
        message: `Gap of ${(d * 1000).toFixed(0)}m between points ${i - 1} and ${i} (max: 500m)`,
        severity: "fatal",
      };
    }
  }
  return null;
}

/**
 * RULE 5: DEAD_END
 * Warning if >2km of out-and-back on same segment.
 * Uses a spatial grid to find retraced sections efficiently.
 */
function checkDeadEnd(coords: [number, number][]): RuleViolation | null {
  if (coords.length < 10) return null;

  // Sample route every 100m
  const sampled = sampleCoords(coords, 100);
  if (sampled.length < 5) return null;

  // Accumulate path distances for each sampled index
  const pathDist: number[] = [0];
  for (let i = 1; i < sampled.length; i++) {
    pathDist[i] = pathDist[i - 1] + haversineKm(sampled[i - 1], sampled[i]);
  }

  const PROXIMITY_KM = 0.03; // 30m — consider as "same road"
  const MIN_PATH_SEPARATION_KM = 0.5; // must be 500m apart in path to count as out-and-back
  const RETRACE_THRESHOLD_KM = 2.0;

  let retracedKm = 0;

  // For each point, find if a significantly earlier point is spatially close
  // (indicating we passed the same location twice with a detour in between)
  for (let i = 5; i < sampled.length; i++) {
    const pt = sampled[i];
    for (let j = 0; j < i - 1; j++) {
      const pathSep = pathDist[i] - pathDist[j];
      if (pathSep < MIN_PATH_SEPARATION_KM) continue;
      if (haversineKm(pt, sampled[j]) < PROXIMITY_KM) {
        // We retraced approximately (pathDist[i] - pathDist[j]) / 2 km
        retracedKm += pathSep / 2;
        break;
      }
    }
    if (retracedKm > RETRACE_THRESHOLD_KM) {
      return {
        rule: "DEAD_END",
        message: `Route contains ~${retracedKm.toFixed(1)}km of out-and-back on the same segment`,
        severity: "warning",
      };
    }
  }
  return null;
}

/**
 * RULE 6: LOOP_CLOSURE
 * Fatal if start and end points are more than 3km apart (road/gravel) or 5km apart (mtb).
 * Routes that don't close are point-to-point and not suitable as loops.
 */
function checkLoopClosure(
  coords: [number, number][],
  discipline: Discipline
): RuleViolation | null {
  if (coords.length < 2) return null;
  const start = coords[0];
  const end = coords[coords.length - 1];
  const gap = haversineKm(start, end);
  const maxGap = discipline === "mtb" ? 5.0 : 3.0;
  if (gap > maxGap) {
    return {
      rule: "LOOP_CLOSURE",
      message: `Route is point-to-point: start and end are ${gap.toFixed(1)}km apart (max: ${maxGap}km for ${discipline})`,
      severity: "fatal",
    };
  }
  return null;
}

/**
 * RULE 8: MIN_DISTANCE
 * Fatal if road <15km, gravel <10km, mtb <5km.
 */
function checkMinDistance(
  coords: [number, number][],
  discipline: Discipline
): RuleViolation | null {
  const minimums: Record<Discipline, number> = { road: 15, gravel: 10, mtb: 5 };
  const min = minimums[discipline];
  const dist = totalDistanceKm(coords);
  if (dist < min) {
    return {
      rule: "MIN_DISTANCE",
      message: `${discipline} route is ${dist.toFixed(1)}km — minimum is ${min}km`,
      severity: "fatal",
    };
  }
  return null;
}

/**
 * RULE 9: SURFACE_MISMATCH
 * Fatal if gravel >30% paved, mtb >20% paved.
 */
function checkSurfaceMismatch(
  sampled: [number, number][],
  highwayWays: ProcessedWay[],
  discipline: Discipline
): RuleViolation | null {
  if (discipline === "road") return null;
  if (sampled.length === 0) return null;

  const maxPavedPct = discipline === "gravel" ? 0.3 : 0.2;
  let pavedCount = 0;
  let classifiedCount = 0;

  for (const pt of sampled) {
    const way = findNearestWay(pt, highwayWays, 0.05);
    if (!way) continue;
    const paved = isSurfacePaved(way.tags);
    if (paved !== null) {
      classifiedCount++;
      if (paved) pavedCount++;
    }
  }

  if (classifiedCount === 0) return null;

  const pct = pavedCount / classifiedCount;
  if (pct > maxPavedPct) {
    return {
      rule: "SURFACE_MISMATCH",
      message: `${(pct * 100).toFixed(1)}% of ${discipline} route is paved (max: ${maxPavedPct * 100}%)`,
      severity: "fatal",
    };
  }
  return null;
}

// ──── Main export ─────────────────────────────────────────────────────────────

/**
 * Validate a route against hard rules before quality scoring.
 *
 * @param coordinates  Array of [lat, lng] coordinate pairs.
 * @param discipline   Route discipline.
 * @param osmData      Raw Overpass API response ({ elements: OsmElement[] }).
 *                     OSM-dependent rules are skipped if this is omitted.
 */
export function validateRouteRules(
  coordinates: [number, number][],
  discipline: Discipline,
  osmData?: { elements: OsmElement[] } | OsmElement[] | null
): RuleValidationResult {
  const violations: RuleViolation[] = [];
  const skipped: string[] = [];

  // ── Pure GPS rules (no OSM needed) ──────────────────────────────────────

  const loopClosureViolation = checkLoopClosure(coordinates, discipline);
  if (loopClosureViolation) violations.push(loopClosureViolation);

  const minDistViolation = checkMinDistance(coordinates, discipline);
  if (minDistViolation) violations.push(minDistViolation);

  const connectivityViolation = checkConnectivity(coordinates);
  if (connectivityViolation) violations.push(connectivityViolation);

  const deadEndViolation = checkDeadEnd(coordinates);
  if (deadEndViolation) violations.push(deadEndViolation);

  // ── OSM-dependent rules ──────────────────────────────────────────────────

  // Normalise osmData: accept raw array or wrapped object
  let elements: OsmElement[] | null = null;
  if (osmData) {
    if (Array.isArray(osmData)) {
      elements = osmData as OsmElement[];
    } else if (osmData.elements && Array.isArray(osmData.elements)) {
      elements = osmData.elements;
    }
  }

  if (!elements) {
    skipped.push(
      "ROAD_TYPE_BLACKLIST",
      "SPEED_LIMIT",
      "CYCLING_INFRA",
      "SURFACE_MISMATCH"
    );
  } else {
    const nodeMap = buildNodeMap(elements);
    const highwayWays = buildProcessedWays(elements, nodeMap).filter(
      (w) => !!w.tags.highway
    );
    const sampled = sampleCoords(coordinates, 200);

    const blacklistViolation = checkRoadTypeBlacklist(sampled, highwayWays);
    if (blacklistViolation) violations.push(blacklistViolation);

    const speedViolation = checkSpeedLimit(sampled, highwayWays);
    if (speedViolation) violations.push(speedViolation);

    const infraViolation = checkCyclingInfra(sampled, highwayWays, discipline);
    if (infraViolation) violations.push(infraViolation);

    const mismatchViolation = checkSurfaceMismatch(sampled, highwayWays, discipline);
    if (mismatchViolation) violations.push(mismatchViolation);
  }

  const fatalCount = violations.filter((v) => v.severity === "fatal").length;

  return {
    passed: fatalCount === 0,
    violations,
    skipped,
  };
}
