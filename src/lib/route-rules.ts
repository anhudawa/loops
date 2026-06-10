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

export interface RouteValidationOptions {
  /** Total elevation gain in metres (computed from 3-D coordinates externally). */
  elevationGain?: number;
  /** Total route distance in km (if pre-computed; otherwise derived from coords). */
  distanceKm?: number;
  /** Whether the route is labelled / queried as "minimum climbing". */
  labeledMinClimbing?: boolean;
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

/** Check if any way is within maxKm of a point, return it or null. */
function anyWayWithin(
  pt: [number, number],
  ways: ProcessedWay[],
  maxKm: number
): ProcessedWay | null {
  for (const way of ways) {
    for (let i = 0; i + 1 < way.nodes.length; i++) {
      const a: [number, number] = [way.nodes[i].lat, way.nodes[i].lon];
      const b: [number, number] = [way.nodes[i + 1].lat, way.nodes[i + 1].lon];
      if (pointToSegmentKm(pt, a, b) < maxKm) return way;
    }
  }
  return null;
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
 * RULE 5: OUT_AND_BACK
 * Fatal if <15% of the route is on unique roads (not retracing the same path).
 *
 * Algorithm: sample every 200m, track all visited points. A point is "unique"
 * if it is >200m from every previously visited point. Routes with a meaningful
 * loop section (e.g. coast approach + inland loop) naturally have ≥15% unique
 * roads. Pure out-and-backs (same road there and back) score near 0%.
 */
function checkDeadEnd(coords: [number, number][]): RuleViolation | null {
  if (coords.length < 10) return null;

  const sampled = sampleCoords(coords, 200);
  if (sampled.length < 3) return null;

  const UNIQUE_THRESHOLD_KM = 0.2; // 200m — treat as "new road" if further than this

  let uniqueKm = 0;
  let totalKm = 0;
  const visited: [number, number][] = [sampled[0]];

  for (let i = 1; i < sampled.length; i++) {
    const segmentKm = haversineKm(sampled[i - 1], sampled[i]);
    totalKm += segmentKm;

    // A point is unique if it is >200m from all previously visited points
    const isNew = visited.every((v) => haversineKm(sampled[i], v) > UNIQUE_THRESHOLD_KM);
    if (isNew) uniqueKm += segmentKm;

    visited.push(sampled[i]);
  }

  if (totalKm === 0) return null;

  const uniqueMiddlePct = (uniqueKm / totalKm) * 100;

  if (uniqueMiddlePct < 15) {
    return {
      rule: "OUT_AND_BACK",
      message: `Only ${uniqueMiddlePct.toFixed(1)}% of route is on unique roads — pure out-and-back with no meaningful loop section (minimum: 15%)`,
      severity: "fatal",
    };
  }

  return null;
}

/**
 * RULE 6: MIN_DISTANCE
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
 * RULE 7: SURFACE_MISMATCH
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

// ──── New Rule implementations ───────────────────────────────────────────────

/**
 * RULE 8: DANGEROUS_JUNCTION_DENSITY
 * Fatal if route crosses high-speed roads (maxspeed ≥ 80 km/h) more than 3 times per 10km.
 * Crossings are clustered spatially so a single junction doesn't count multiple times.
 */
function checkDangerousJunctionDensity(
  coords: [number, number][],
  sampled: [number, number][],
  highwayWays: ProcessedWay[]
): RuleViolation | null {
  // Filter to genuinely dangerous roads to cross: major road classes, or
  // anything signed 100 km/h+. A bare maxspeed of 80-90 is the DEFAULT
  // rural limit in Ireland/France/Spain — quiet lanes carry it too, so
  // speed alone over-rejects practically every rural loop.
  const highSpeedWays = highwayWays.filter((w) => {
    const highway = w.tags.highway ?? "";
    if (["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"].includes(highway)) {
      return true;
    }
    const raw = w.tags.maxspeed ?? "";
    const numeric = parseInt(raw, 10);
    if (isNaN(numeric)) return false;
    const kmh = raw.toLowerCase().includes("mph") ? numeric * 1.60934 : numeric;
    return kmh >= 100;
  });

  if (highSpeedWays.length === 0) return null;

  // Collect crossing points, cluster within 100m to count distinct junctions
  const junctionCentres: [number, number][] = [];

  for (const pt of sampled) {
    const near = anyWayWithin(pt, highSpeedWays, 0.03); // 30m proximity
    if (!near) continue;
    // Is this near an already-found junction?
    const isNew = junctionCentres.every((j) => haversineKm(pt, j) > 0.1);
    if (isNew) junctionCentres.push(pt);
  }

  if (junctionCentres.length === 0) return null;

  const distKm = totalDistanceKm(coords);
  if (distKm === 0) return null;

  const per10km = (junctionCentres.length / distKm) * 10;
  if (per10km > 3) {
    return {
      rule: "DANGEROUS_JUNCTION_DENSITY",
      message: `${junctionCentres.length} crossings of major roads (trunk/primary or 100 km/h+) over ${distKm.toFixed(1)}km — ${per10km.toFixed(1)} per 10km (limit: 3)`,
      severity: "fatal",
    };
  }
  return null;
}

/**
 * RULE 9: TUNNEL_CHECK
 * Fatal if the route passes through a tunnel longer than 200m that isn't
 * explicitly marked as cycling-permitted.
 */
function checkTunnelCheck(
  sampled: [number, number][],
  tunnelWays: ProcessedWay[]
): RuleViolation | null {
  if (tunnelWays.length === 0) return null;

  // Collect unique tunnel ways the route passes through
  const foundTunnels = new Set<ProcessedWay>();
  for (const pt of sampled) {
    const near = findNearestWay(pt, tunnelWays, 0.05);
    if (near) foundTunnels.add(near);
  }

  for (const tunnel of foundTunnels) {
    // Calculate tunnel length from its nodes
    let lengthM = 0;
    for (let i = 1; i < tunnel.nodes.length; i++) {
      const a: [number, number] = [tunnel.nodes[i - 1].lat, tunnel.nodes[i - 1].lon];
      const b: [number, number] = [tunnel.nodes[i].lat, tunnel.nodes[i].lon];
      lengthM += haversineKm(a, b) * 1000;
    }
    if (lengthM <= 200) continue; // short tunnels are acceptable

    // Check for explicit cycling permission
    const t = tunnel.tags;
    const cyclingAllowed =
      t.bicycle === "yes" ||
      t.bicycle === "designated" ||
      t.bicycle === "permissive" ||
      t.highway === "cycleway";

    if (!cyclingAllowed) {
      return {
        rule: "TUNNEL_CHECK",
        message: `Route passes through a ${Math.round(lengthM)}m tunnel without explicit cycling access — dangerous`,
        severity: "fatal",
      };
    }
  }
  return null;
}

/**
 * RULE 10: ELEVATION_SANITY
 * Fatal if elevation gain exceeds 20m per km of distance (impossibly steep average).
 * Warning if route is labelled "minimum climbing" but has >500m elevation gain.
 */
function checkElevationSanity(
  elevationGain: number | undefined,
  distanceKm: number,
  labeledMinClimbing = false
): RuleViolation | null {
  if (elevationGain === undefined || distanceKm === 0) return null;

  const gainPerKm = elevationGain / distanceKm;
  if (gainPerKm > 20) {
    return {
      rule: "ELEVATION_SANITY",
      message: `Elevation gain of ${Math.round(elevationGain)}m over ${distanceKm.toFixed(1)}km averages ${gainPerKm.toFixed(1)}m/km — likely a GPS error`,
      severity: "fatal",
    };
  }

  if (labeledMinClimbing && elevationGain > 500) {
    return {
      rule: "ELEVATION_SANITY",
      message: `Route is labelled "minimum climbing" but has ${Math.round(elevationGain)}m elevation gain (limit: 500m)`,
      severity: "warning",
    };
  }

  return null;
}

/**
 * RULE 11: ROAD_WIDTH_CHECK
 * Warning (road discipline only) if >20% of matched points are on unclassified
 * or track roads with no surface tag — potentially unsuitable for road bikes.
 */
function checkRoadWidthCheck(
  sampled: [number, number][],
  highwayWays: ProcessedWay[],
  discipline: Discipline
): RuleViolation | null {
  if (discipline !== "road") return null;
  if (sampled.length === 0) return null;

  let warnCount = 0;
  let matchedCount = 0;

  for (const pt of sampled) {
    const way = findNearestWay(pt, highwayWays, 0.05);
    if (!way) continue;
    matchedCount++;
    const hw = way.tags.highway ?? "";
    if ((hw === "unclassified" || hw === "track") && !way.tags.surface) {
      warnCount++;
    }
  }

  if (matchedCount === 0) return null;
  const pct = warnCount / matchedCount;
  if (pct > 0.2) {
    return {
      rule: "ROAD_WIDTH_CHECK",
      message: `${(pct * 100).toFixed(1)}% of route uses unclassified/track roads with no surface data — may be unsuitable for road bikes`,
      severity: "warning",
    };
  }
  return null;
}

/**
 * RULE 12: SEASONAL_ACCESS
 * Warning if any road along the route is tagged access=seasonal or winter_road=yes.
 */
function checkSeasonalAccess(
  sampled: [number, number][],
  highwayWays: ProcessedWay[]
): RuleViolation | null {
  for (const pt of sampled) {
    const way = findNearestWay(pt, highwayWays, 0.05);
    if (!way) continue;
    if (way.tags.access === "seasonal" || way.tags.winter_road === "yes") {
      return {
        rule: "SEASONAL_ACCESS",
        message: "Route includes roads with seasonal or winter-only access — may be impassable outside of summer",
        severity: "warning",
      };
    }
  }
  return null;
}

/**
 * RULE 13: WATER_CROSSING_CHECK
 * Road bikes: fatal if route passes a ford.
 * Gravel/MTB: warning.
 */
function checkWaterCrossing(
  sampled: [number, number][],
  fordNodes: [number, number][],
  fordWays: ProcessedWay[],
  discipline: Discipline
): RuleViolation | null {
  const PROXIMITY_KM = 0.03;

  for (const pt of sampled) {
    // Check ford nodes (standalone ford tags at river crossings)
    for (const ford of fordNodes) {
      if (haversineKm(pt, ford) < PROXIMITY_KM) {
        return {
          rule: "WATER_CROSSING_CHECK",
          message: `Route crosses a ford — ${discipline === "road" ? "unsuitable for road bikes" : "check water levels before riding"}`,
          severity: discipline === "road" ? "fatal" : "warning",
        };
      }
    }

    // Check ford ways (road sections that become fords)
    if (fordWays.length > 0) {
      const near = anyWayWithin(pt, fordWays, PROXIMITY_KM);
      if (near) {
        return {
          rule: "WATER_CROSSING_CHECK",
          message: `Route crosses a ford — ${discipline === "road" ? "unsuitable for road bikes" : "check water levels before riding"}`,
          severity: discipline === "road" ? "fatal" : "warning",
        };
      }
    }
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
 * @param options      Optional metadata for elevation-based rules.
 */
export function validateRouteRules(
  coordinates: [number, number][],
  discipline: Discipline,
  osmData?: { elements: OsmElement[] } | OsmElement[] | null,
  options?: RouteValidationOptions
): RuleValidationResult {
  const violations: RuleViolation[] = [];
  const skipped: string[] = [];

  // ── Pure GPS rules (no OSM needed) ──────────────────────────────────────

  const minDistViolation = checkMinDistance(coordinates, discipline);
  if (minDistViolation) violations.push(minDistViolation);

  const connectivityViolation = checkConnectivity(coordinates);
  if (connectivityViolation) violations.push(connectivityViolation);

  const deadEndViolation = checkDeadEnd(coordinates);
  if (deadEndViolation) violations.push(deadEndViolation);

  // ── Elevation sanity (pure GPS — needs elevation in options) ─────────────

  const distKm = options?.distanceKm ?? totalDistanceKm(coordinates);
  const elevSanityViolation = checkElevationSanity(
    options?.elevationGain,
    distKm,
    options?.labeledMinClimbing
  );
  if (elevSanityViolation) violations.push(elevSanityViolation);

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
      "SURFACE_MISMATCH",
      "DANGEROUS_JUNCTION_DENSITY",
      "TUNNEL_CHECK",
      "ROAD_WIDTH_CHECK",
      "SEASONAL_ACCESS",
      "WATER_CROSSING_CHECK"
    );
  } else {
    const nodeMap = buildNodeMap(elements);
    const allWays = buildProcessedWays(elements, nodeMap);
    const highwayWays = allWays.filter((w) => !!w.tags.highway);
    const sampled = sampleCoords(coordinates, 200);

    // Existing rules
    const blacklistViolation = checkRoadTypeBlacklist(sampled, highwayWays);
    if (blacklistViolation) violations.push(blacklistViolation);

    const speedViolation = checkSpeedLimit(sampled, highwayWays);
    if (speedViolation) violations.push(speedViolation);

    const infraViolation = checkCyclingInfra(sampled, highwayWays, discipline);
    if (infraViolation) violations.push(infraViolation);

    const mismatchViolation = checkSurfaceMismatch(sampled, highwayWays, discipline);
    if (mismatchViolation) violations.push(mismatchViolation);

    // New rules
    const junctionViolation = checkDangerousJunctionDensity(coordinates, sampled, highwayWays);
    if (junctionViolation) violations.push(junctionViolation);

    const tunnelWays = highwayWays.filter((w) => w.tags.tunnel === "yes" || w.tags.tunnel === "building_passage");
    const tunnelViolation = checkTunnelCheck(sampled, tunnelWays);
    if (tunnelViolation) violations.push(tunnelViolation);

    const widthViolation = checkRoadWidthCheck(sampled, highwayWays, discipline);
    if (widthViolation) violations.push(widthViolation);

    const seasonalViolation = checkSeasonalAccess(sampled, highwayWays);
    if (seasonalViolation) violations.push(seasonalViolation);

    // Ford nodes (standalone nodes with ford=yes)
    const fordNodes: [number, number][] = elements
      .filter(
        (el) =>
          el.type === "node" &&
          el.tags?.ford === "yes" &&
          el.lat !== undefined &&
          el.lon !== undefined
      )
      .map((el) => [el.lat!, el.lon!]);

    // Ford ways (road sections that become fords)
    const fordWays = allWays.filter((w) => w.tags.ford === "yes");

    const waterViolation = checkWaterCrossing(sampled, fordNodes, fordWays, discipline);
    if (waterViolation) violations.push(waterViolation);
  }

  const fatalCount = violations.filter((v) => v.severity === "fatal").length;

  return {
    passed: fatalCount === 0,
    violations,
    skipped,
  };
}
