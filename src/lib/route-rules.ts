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
  /** Reject loops that contain an out-and-back SPUR (a U-turn finger where
   *  the route retraces the same road). Set for GENERATED loops; leave off for
   *  rider-drawn routes, which may be out-and-back on purpose. */
  rejectSpurs?: boolean;
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


// ──── Spatial index ──────────────────────────────────────────────────────────
//
// findNearestWay/anyWayWithin are called for hundreds of sampled points
// against thousands of ways. The naive scan is O(samples × segments) and
// burned 60-90s of sync CPU per generation, blocking the event loop (and
// the pipeline timeout with it). A coarse grid index makes each lookup
// touch only nearby segments. Indexes are cached per ways-array identity,
// so call sites stay unchanged.

interface IndexedSegment {
  a: [number, number];
  b: [number, number];
  way: ProcessedWay;
}

const GRID_CELL_DEG = 0.005; // ≈ 550 m of latitude

class SegmentGrid {
  private cells = new Map<string, IndexedSegment[]>();

  constructor(ways: ProcessedWay[]) {
    for (const way of ways) {
      for (let i = 0; i + 1 < way.nodes.length; i++) {
        const a: [number, number] = [way.nodes[i].lat, way.nodes[i].lon];
        const b: [number, number] = [way.nodes[i + 1].lat, way.nodes[i + 1].lon];
        const seg: IndexedSegment = { a, b, way };
        const minX = Math.floor(Math.min(a[1], b[1]) / GRID_CELL_DEG);
        const maxX = Math.floor(Math.max(a[1], b[1]) / GRID_CELL_DEG);
        const minY = Math.floor(Math.min(a[0], b[0]) / GRID_CELL_DEG);
        const maxY = Math.floor(Math.max(a[0], b[0]) / GRID_CELL_DEG);
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            const key = `${x},${y}`;
            const list = this.cells.get(key);
            if (list) list.push(seg);
            else this.cells.set(key, [seg]);
          }
        }
      }
    }
  }

  /** Segments in all cells overlapping a maxKm neighbourhood of pt. */
  near(pt: [number, number], maxKm: number): IndexedSegment[] {
    const degLat = maxKm / 111;
    const degLng = maxKm / (111 * Math.max(0.2, Math.cos((pt[0] * Math.PI) / 180)));
    const minX = Math.floor((pt[1] - degLng) / GRID_CELL_DEG);
    const maxX = Math.floor((pt[1] + degLng) / GRID_CELL_DEG);
    const minY = Math.floor((pt[0] - degLat) / GRID_CELL_DEG);
    const maxY = Math.floor((pt[0] + degLat) / GRID_CELL_DEG);
    const out: IndexedSegment[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const list = this.cells.get(`${x},${y}`);
        if (list) out.push(...list);
      }
    }
    return out;
  }
}

const gridCache = new WeakMap<ProcessedWay[], SegmentGrid>();

function gridFor(ways: ProcessedWay[]): SegmentGrid {
  let grid = gridCache.get(ways);
  if (!grid) {
    grid = new SegmentGrid(ways);
    gridCache.set(ways, grid);
  }
  return grid;
}

/** Find the nearest way within maxKm, returning it or null. */
function findNearestWay(
  pt: [number, number],
  ways: ProcessedWay[],
  maxKm = 0.05
): ProcessedWay | null {
  let bestDist = maxKm;
  let bestWay: ProcessedWay | null = null;
  for (const seg of gridFor(ways).near(pt, maxKm)) {
    const d = pointToSegmentKm(pt, seg.a, seg.b);
    if (d < bestDist) {
      bestDist = d;
      bestWay = seg.way;
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
  for (const seg of gridFor(ways).near(pt, maxKm)) {
    if (pointToSegmentKm(pt, seg.a, seg.b) < maxKm) return seg.way;
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
  // The engine emits OSM nodes only, so a straight rural road can legitimately
  // have consecutive points 0.5-1 km apart (Spanish straights tripped 500 m on
  // 3-4 of 5 candidates). A genuinely broken route jumps kilometres, so the
  // threshold is a real disconnect, not node spacing.
  const GAP_THRESHOLD_KM = 3.0; // long straight roads carry sparse nodes (2.4 km seen on Tenerife primaries)
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm(coords[i - 1], coords[i]);
    if (d > GAP_THRESHOLD_KM) {
      return {
        rule: "CONNECTIVITY",
        message: `Gap of ${(d * 1000).toFixed(0)}m between points ${i - 1} and ${i} (max: 1500m)`,
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
 * RULE 5b: SPUR_UTURN
 * A loop that reaches out along a road, U-turns, and retraces the SAME road
 * back is a spur — nobody would take a friend on it. checkDeadEnd only catches
 * a PURE out-and-back (<15% unique), so a 2-3 km finger on an otherwise fine
 * 50 km loop sails through. This finds the longest CONTIGUOUS retraced stretch
 * and rejects the route if it exceeds SPUR_MAX_KM. Loop closure (the end
 * returning to the start) is excluded, as is a modest shared access road.
 */
const SPUR_SAMPLE_M = 40;      // path sampling
const SPUR_NEAR_KM = 0.035;    // "same road" = within 35 m of an earlier point
const SPUR_GAP_PTS = 5;        // ignore the last ~200 m of path (gentle curves)
const SPUR_MAX_KM = 0.4;       // longest MID-ROUTE retraced stretch allowed
// Start/finish access: a retrace whose outbound half lies in the first
// ACCESS_ZONE_KM and whose return half lies in the last ACCESS_ZONE_KM. Covers
// a causeway or peninsula start AND the one quiet road out of a city (Girona's
// north exit is shared out/back for ~2 km, 4 km from the start). Reported
// honestly as ACCESS_RETRACE, never silently.
const ACCESS_ZONE_KM = 6.0;

export interface SpurReport {
  /** Longest retrace that is NOT the start/finish access road — a true spur. */
  spurKm: number;
  spurAt: [number, number] | null;
  /** Longest retrace that IS the start/finish access road (out at the start,
   *  back at the end along the same road). Unavoidable when the ride starts on
   *  a causeway or peninsula; allowed, but reported honestly. */
  accessKm: number;
}

/**
 * Spatial grid over a point list so "which points lie within `nearKm` of
 * this one" is a lookup of the 9 surrounding cells, not a scan of every
 * point. The spur detector and repair were O(n²) over every coordinate — a
 * 100 km loop has ~4 000 points and the loop-shaping code runs them dozens
 * of times per candidate, which alone pushed requests past the timeout.
 */
class PointGrid {
  private cells = new Map<string, number[]>();
  private readonly cellDeg: number;
  private readonly lngScale: number;
  constructor(private pts: [number, number][], nearKm: number) {
    // Cell edge ≥ nearKm in both axes (lat degrees; lng shrinks with cos φ).
    const midLat = pts.length ? pts[Math.floor(pts.length / 2)][0] : 53;
    this.lngScale = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
    this.cellDeg = nearKm / 111.32;
    for (let i = 0; i < pts.length; i++) {
      const key = this.key(pts[i]);
      let b = this.cells.get(key);
      if (!b) { b = []; this.cells.set(key, b); }
      b.push(i);
    }
  }
  private key(p: [number, number]): string {
    return `${Math.floor(p[0] / this.cellDeg)}:${Math.floor((p[1] * this.lngScale) / this.cellDeg)}`;
  }
  /** Indices of points in the 9 cells around `p` (superset of the true neighbours). */
  near(p: [number, number]): number[] {
    const a = Math.floor(p[0] / this.cellDeg);
    const b = Math.floor((p[1] * this.lngScale) / this.cellDeg);
    const out: number[] = [];
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      const bucket = this.cells.get(`${a + da}:${b + db}`);
      if (bucket) for (const i of bucket) out.push(i);
    }
    return out;
  }
}

/**
 * Owner rule (2026-09-22): "If it's a road to go get to the loop it's
 * fine." A lollipop — ride out along a stem, ride a loop, come home the
 * same stem — is a legitimate route. Returns the stem length in km: the
 * longest stretch at the START that the FINISH retraces in mirror order
 * (as the finish walks back, it matches ever-earlier start points).
 * Capped so a real loop remains: the loop part must be ≥ 25 % of the ride,
 * otherwise it is an out-and-back, not a lollipop.
 */
export function stemLengthKm(coords: [number, number][]): number {
  if (coords.length < 10) return 0;
  const s = sampleCoords(coords, SPUR_SAMPLE_M);
  const n = s.length;
  if (n < SPUR_GAP_PTS * 4) return 0;
  const grid = new PointGrid(s, SPUR_NEAR_KM);
  const SLACK = 12;      // sample points (~0.5 km) of misalignment tolerated
  const MAX_GAP = 3;     // unmatched samples tolerated inside the stem
  let gaps = 0;
  let stemPts = 0;
  for (let k = 0; k < n / 2; k++) {
    const i = n - 1 - k; // walking back from the finish
    let ok = false;
    for (const j of grid.near(s[i])) {
      if (j < i - SPUR_GAP_PTS && j <= k + SLACK && j >= k - SLACK && haversineKm(s[i], s[j]) < SPUR_NEAR_KM) { ok = true; break; }
    }
    if (ok) { stemPts = k + 1; gaps = 0; }
    else if (++gaps > MAX_GAP) break;
  }
  let stemKm = 0;
  for (let k = 1; k < Math.min(stemPts, n); k++) stemKm += haversineKm(s[k - 1], s[k]);
  let totalKm = 0;
  for (let k = 1; k < n; k++) totalKm += haversineKm(s[k - 1], s[k]);
  if (totalKm - 2 * stemKm < totalKm * 0.25) return 0; // no real loop → out-and-back
  return stemKm;
}

export function findLongestSpur(coords: [number, number][]): SpurReport | null {
  if (coords.length < 10) return null;
  const s = sampleCoords(coords, SPUR_SAMPLE_M);
  const n = s.length;
  if (n < SPUR_GAP_PTS * 4) return null;
  const accessKmZone = Math.max(ACCESS_ZONE_KM, stemLengthKm(coords) + 0.5);
  const accessPts = Math.round((accessKmZone * 1000) / SPUR_SAMPLE_M);

  // For each sampled point, the EARLIEST earlier point it retraces (if any).
  const grid = new PointGrid(s, SPUR_NEAR_KM);
  const match = new Array<number>(n).fill(-1);
  for (let i = SPUR_GAP_PTS; i < n; i++) {
    let best = -1;
    for (const j of grid.near(s[i])) {
      if (j > i - SPUR_GAP_PTS) continue;
      if ((best < 0 || j < best) && haversineKm(s[i], s[j]) < SPUR_NEAR_KM) best = j;
    }
    match[i] = best;
  }

  // Walk contiguous retraced runs and classify each: an ACCESS retrace has all
  // its points near the finish matching points near the start; anything else
  // is a mid-route spur.
  let spurKm = 0, accessKm = 0, spurAt: [number, number] | null = null;
  let i = 1;
  while (i < n) {
    if (match[i] < 0) { i++; continue; }
    const runStart = i; let runKm = 0; let isAccess = true;
    while (i < n && match[i] >= 0) {
      runKm += haversineKm(s[i - 1], s[i]);
      if (!(match[i] < accessPts && i > n - 1 - accessPts)) isAccess = false;
      i++;
    }
    if (isAccess) accessKm = Math.max(accessKm, runKm);
    else if (runKm > spurKm) { spurKm = runKm; spurAt = s[runStart]; }
  }
  return spurKm > 0 || accessKm > 0 ? { spurKm, spurAt, accessKm } : null;
}

/**
 * Repair via-point spurs instead of discarding the candidate. The generator
 * places waypoints slightly off the natural path and the engine routes out
 * to each and straight back — a U-turn finger. Because such an excursion
 * returns to (within 35 m of) where it left, splicing it out leaves a
 * continuous loop. Only MID-ROUTE excursions are removed; the start/finish
 * access retrace (causeway/peninsula) is kept and reported. Returns the
 * repaired coords and the total metres removed.
 */
export function repairSpurs(coords: [number, number][]): { coords: [number, number][]; keep: number[]; removedKm: number } {
  if (coords.length < 20) return { coords, keep: coords.map((_, i) => i), removedKm: 0 };
  const n = coords.length;
  const NEAR = SPUR_NEAR_KM;
  const MIN_EXCURSION_KM = 0.15;   // ignore tiny wiggles
  const accessPts = Math.round((ACCESS_ZONE_KM * 1000) / SPUR_SAMPLE_M);
  // The stem to a loop (lollipop) is access, however long, as long as a
  // real loop remains at its end.
  const accessZoneKm = Math.max(ACCESS_ZONE_KM, stemLengthKm(coords) + 0.5);
  // cumulative distance for zone tests
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + haversineKm(coords[i - 1], coords[i]));
  const total = cum[n - 1];
  const out: [number, number][] = [];
  const keep: number[] = [];
  let removedKm = 0;
  let i = 0;
  const grid = new PointGrid(coords, NEAR);
  while (i < n) {
    out.push(coords[i]);
    keep.push(i);
    // look ahead for the FURTHEST later point that returns to within NEAR of coords[i]
    // with a meaningful excursion in between — that's an out-and-back finger.
    let j = -1;
    for (const k of grid.near(coords[i])) {
      if (k <= i + 1 || k <= j) continue;
      if (cum[k] - cum[i] < MIN_EXCURSION_KM) continue;
      if (haversineKm(coords[i], coords[k]) < NEAR) j = k;
    }
    if (j > 0) {
      // Skip if this is the start/finish access retrace (keep + report elsewhere).
      const isAccess = cum[i] < accessZoneKm && (total - cum[j]) < accessZoneKm;
      // Only treat as a spur if the excursion really retraces itself: its
      // midpoint must be far from both ends (a genuine finger), and it must
      // not be most of the loop (a loop closing on itself is not a spur).
      const excursion = cum[j] - cum[i];
      if (!isAccess && excursion < total * 0.5) {
        removedKm += excursion;
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  void accessPts;
  return { coords: out, keep, removedKm };
}

function checkSpur(coords: [number, number][]): RuleViolation[] {
  const r = findLongestSpur(coords);
  if (!r) return [];
  const out: RuleViolation[] = [];
  if (r.spurKm > SPUR_MAX_KM && r.spurAt) {
    out.push({
      rule: "SPUR_UTURN",
      message: `${Math.round(r.spurKm * 1000)} m out-and-back spur — the loop U-turns and retraces the same road near ${r.spurAt[0].toFixed(4)}, ${r.spurAt[1].toFixed(4)}`,
      severity: "fatal",
    });
  }
  // Trust rule: an unavoidable access out-and-back is fine, but never silent.
  if (r.accessKm > SPUR_MAX_KM) {
    out.push({
      rule: "ACCESS_RETRACE",
      message: `${Math.round(r.accessKm * 1000)} m out-and-back on the access road at the start/finish (e.g. a causeway or peninsula start)`,
      severity: "warning",
    });
  }
  return out;
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
 * Fatal if elevation gain exceeds 40 m per km of distance (impossibly steep average).
 * Warning if route is labelled "minimum climbing" but has >500m elevation gain.
 */
function checkElevationSanity(
  elevationGain: number | undefined,
  distanceKm: number,
  labeledMinClimbing = false
): RuleViolation | null {
  if (elevationGain === undefined || distanceKm === 0) return null;

  // 20 m/km declined every real mountain loop (Sóller/Tramuntana runs
  // 25–30 m/km; Sa Calobra out-and-backs more). GPS garbage sits far above
  // 40 m/km, which is where this now bites.
  const gainPerKm = elevationGain / distanceKm;
  if (gainPerKm > 40) {
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

  // Generated loops only: a U-turn spur is a bad route, full stop.
  if (options?.rejectSpurs) {
    violations.push(...checkSpur(coordinates));
  }

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
