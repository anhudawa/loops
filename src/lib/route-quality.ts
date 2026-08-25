/**
 * Route Quality Scoring Module
 *
 * Scores a cycling route 0–100 by querying OpenStreetMap via the Overpass API.
 * Breakdown (raw values — normalized to 100 for the total):
 *   gps_quality_score       (0–20)  – duplicate points, spikes, impossible jumps
 *   surface_score           (0–25)  – road classification & surface suitability
 *   safety_score            (0–35)  – proximity to dangerous roads
 *   scenic_score            (0–20)  – water, forests, peaks, coastline nearby
 *   traffic_volume_score    (0–15)  – highway classification as traffic proxy
 *   scenic_diversity_score  (0–10)  – variety of terrain types along route
 *   waypoint_interest_score (0–10)  – viewpoints, cafes, historic sites within 500m
 *   gradient_comfort_score  (0–10)  – elevation profile smoothness
 *   road_continuity_score   (0–5)   – penalise frequent highway type changes
 *   bicycle_access_score    (0–15)  – checks for bicycle=no / access=private / access=no
 *
 * Max raw = 165 → normalized total = round(rawSum / 165 * 100)
 */

import { validateRouteRules, RouteValidationOptions } from "./route-rules";

export type Discipline = "road" | "gravel" | "mtb";

export interface QualityBreakdown {
  surface_score: number;           // 0–25
  safety_score: number;            // 0–35
  scenic_score: number;            // 0–20
  gps_quality_score: number;       // 0–20
  traffic_volume_score: number;    // 0–15
  scenic_diversity_score: number;  // 0–10
  waypoint_interest_score: number; // 0–10
  gradient_comfort_score: number;  // 0–10
  road_continuity_score: number;   // 0–5
  bicycle_access_score: number;    // 0–15
}

const MAX_RAW_SCORE = 165; // sum of all max breakdown values

export interface QualityScore {
  total: number;                               // 0–100 normalized
  breakdown: QualityBreakdown;
  flags: string[];                             // human-readable issues
  confidence: number;                          // 0–1: OSM coverage ratio
  confidence_level: "high" | "medium" | "low";
  low_coverage_warning: boolean;               // true if >30% of route unmatched in OSM
  osm_cached: boolean;
  /** Paved/unpaved/unknown share of sampled points ("know before you go"). */
  surface_breakdown?: { paved_pct: number; unpaved_pct: number; unknown_pct: number };
  /** Road-class share (% of sampled points per OSM highway class). */
  road_class_breakdown?: Record<string, number>;
}

// ──── Types for OSM data ────────────────────────────────────────────────────

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

interface OsmNodeMap {
  [id: number]: { lat: number; lon: number };
}

interface ProcessedWay {
  tags: Record<string, string>;
  nodes: Array<{ lat: number; lon: number }>;
}

// ──── In-memory cache for Overpass results ───────────────────────────────────

interface CacheEntry {
  elements: OsmElement[];
  expires: number;
}

const osmCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function getCacheKey(bbox: BoundingBox): string {
  return `${bbox.minLat.toFixed(3)},${bbox.minLng.toFixed(3)},${bbox.maxLat.toFixed(3)},${bbox.maxLng.toFixed(3)}`;
}

// ──── Geometry helpers ───────────────────────────────────────────────────────

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export type Coord = [number, number] | [number, number, number] | [number, number, number?];

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

/** Bounding box with padding in degrees. */
function routeBbox(coords: Coord[], paddingDeg = 0.01): BoundingBox {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const c of coords) {
    if (c[0] < minLat) minLat = c[0];
    if (c[0] > maxLat) maxLat = c[0];
    if (c[1] < minLng) minLng = c[1];
    if (c[1] > maxLng) maxLng = c[1];
  }
  return {
    minLat: minLat - paddingDeg,
    maxLat: maxLat + paddingDeg,
    minLng: minLng - paddingDeg,
    maxLng: maxLng + paddingDeg,
  };
}

/** Sample coords evenly by distance, aiming for ~intervalMeters between samples. */
function sampleCoords(coords: Coord[], intervalMeters = 200): Coord[] {
  if (coords.length < 2) return coords;
  const sampled: Coord[] = [coords[0]];
  let accumulated = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm([coords[i - 1][0], coords[i - 1][1]], [coords[i][0], coords[i][1]]) * 1000;
    accumulated += d;
    if (accumulated >= intervalMeters) {
      sampled.push(coords[i]);
      accumulated = 0;
    }
  }
  if (sampled[sampled.length - 1] !== coords[coords.length - 1]) {
    sampled.push(coords[coords.length - 1]);
  }
  return sampled;
}

/** Distance from point to a way segment (in km). */
function pointToSegmentDist(
  pt: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const [px, py] = [pt[1], pt[0]]; // use lng/lat as x/y
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

/** Find the nearest processed way within maxKm of a point. */
function findNearestWay(
  pt: [number, number],
  ways: ProcessedWay[],
  maxKm = 0.05
): ProcessedWay | null {
  let bestDist = maxKm;
  let bestWay: ProcessedWay | null = null;
  for (const seg of gridFor(ways).near(pt, maxKm)) {
    const d = pointToSegmentDist(pt, seg.a, seg.b);
    if (d < bestDist) {
      bestDist = d;
      bestWay = seg.way;
    }
  }
  return bestWay;
}

/** Check if any way is within maxKm of a point. */
function anyWayWithin(
  pt: [number, number],
  ways: ProcessedWay[],
  maxKm: number
): ProcessedWay | null {
  for (const seg of gridFor(ways).near(pt, maxKm)) {
    if (pointToSegmentDist(pt, seg.a, seg.b) < maxKm) return seg.way;
  }
  return null;
}

// ──── Overpass API ───────────────────────────────────────────────────────────

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Overpass etiquette gate: the public API allows ~2 concurrent requests
 * per client. Without this, scoring 15-30 candidates in parallel gets
 * most of them rate-limited and silently dropped — fewer, worse routes.
 * Retries once on 429 after a short backoff.
 */
const OVERPASS_MAX_CONCURRENT = 2;
let overpassActive = 0;
const overpassQueue: Array<() => void> = [];

async function overpassGate(run: () => Promise<Response>): Promise<Response> {
  // Loop, don't assume: a woken waiter must re-check the limit, otherwise
  // a freshly arriving caller can slip in alongside it.
  while (overpassActive >= OVERPASS_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => overpassQueue.push(resolve));
  }
  overpassActive++;
  try {
    let resp = await run();
    if (resp.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
      resp = await run();
    }
    return resp;
  } finally {
    overpassActive--;
    overpassQueue.shift()?.();
  }
}
const OVERPASS_TIMEOUT_S = 30;

/**
 * Snap a bbox OUTWARD to a coarse grid (~0.05° ≈ 5 km). Candidates from
 * the same start point then share one cache entry and one Overpass query
 * instead of five near-identical mega-queries — the single biggest
 * latency cost in generation.
 */
function quantizeBbox(bbox: BoundingBox, gridDeg = 0.05): BoundingBox {
  return {
    minLat: Math.floor(bbox.minLat / gridDeg) * gridDeg,
    minLng: Math.floor(bbox.minLng / gridDeg) * gridDeg,
    maxLat: Math.ceil(bbox.maxLat / gridDeg) * gridDeg,
    maxLng: Math.ceil(bbox.maxLng / gridDeg) * gridDeg,
  };
}

async function queryOverpass(rawBbox: BoundingBox): Promise<OsmElement[]> {
  const bbox = quantizeBbox(rawBbox);
  const key = getCacheKey(bbox);
  const cached = osmCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.elements;

  const { minLat, minLng, maxLat, maxLng } = bbox;
  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;

  // Comprehensive query: roads + scenic + POIs + diversity + fords
  const query = `
[out:json][timeout:${OVERPASS_TIMEOUT_S}];
(
  way["highway"](${bboxStr});
  way["natural"~"water|forest|wood|peak|coastline|scrub|heath|beach"](${bboxStr});
  way["waterway"~"river|stream|canal"](${bboxStr});
  way["landuse"~"forest|wood|grass|meadow|nature_reserve|vineyard|farmland|orchard|allotments"](${bboxStr});
  way["leisure"="nature_reserve"](${bboxStr});
  way["ford"="yes"](${bboxStr});
  node["natural"="peak"](${bboxStr});
  node["ford"="yes"](${bboxStr});
  node["tourism"="viewpoint"](${bboxStr});
  node["amenity"~"cafe|restaurant|pub|drinking_water|toilets|fountain"](${bboxStr});
  node["historic"](${bboxStr});
);
out body;
>;
out skel qt;
`.trim();

  const resp = await overpassGate(async () =>
    fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "User-Agent": "loops.ie route generator (https://www.loops.ie)", "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(35_000),
    })
  );

  if (!resp.ok) {
    throw new Error(`Overpass API error: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json() as { elements: OsmElement[] };
  const elements = json.elements ?? [];

  osmCache.set(key, { elements, expires: Date.now() + CACHE_TTL_MS });
  return elements;
}

function buildNodeMap(elements: OsmElement[]): OsmNodeMap {
  const map: OsmNodeMap = {};
  for (const el of elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      map[el.id] = { lat: el.lat, lon: el.lon };
    }
  }
  return map;
}

function buildProcessedWays(elements: OsmElement[], nodeMap: OsmNodeMap): ProcessedWay[] {
  const ways: ProcessedWay[] = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.nodes || !el.tags) continue;
    const nodes = el.nodes
      .map((id) => nodeMap[id])
      .filter((n): n is { lat: number; lon: number } => n !== undefined);
    if (nodes.length >= 2) {
      ways.push({ tags: el.tags, nodes });
    }
  }
  return ways;
}

// ──── Elevation helpers ───────────────────────────────────────────────────────

/** Compute total elevation gain from 3-D coordinates. Returns undefined if no elevation data. */
function computeElevationGain(coords: Coord[]): number | undefined {
  let gain = 0;
  let hasElevation = false;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1][2];
    const curr = coords[i][2];
    if (prev !== undefined && curr !== undefined) {
      hasElevation = true;
      const diff = (curr as number) - (prev as number);
      if (diff > 0) gain += diff;
    }
  }
  return hasElevation ? gain : undefined;
}

/** Compute total distance from 2-D coordinates. */
function totalDistanceKm(coords: Coord[]): number {
  let dist = 0;
  for (let i = 1; i < coords.length; i++) {
    dist += haversineKm([coords[i - 1][0], coords[i - 1][1]], [coords[i][0], coords[i][1]]);
  }
  return dist;
}

// ──── GPS Quality Scoring (pure, no API) ────────────────────────────────────

function scoreGpsQuality(coords: Coord[]): { score: number; flags: string[] } {
  const flags: string[] = [];
  let deductions = 0;

  if (coords.length < 10) {
    flags.push("Very few GPS points — route may be incomplete");
    deductions += 10;
  }

  // Duplicate consecutive points
  let dupes = 0;
  for (let i = 1; i < coords.length; i++) {
    if (coords[i][0] === coords[i - 1][0] && coords[i][1] === coords[i - 1][1]) dupes++;
  }
  if (dupes > 0) {
    const pct = (dupes / coords.length) * 100;
    flags.push(`${dupes} duplicate GPS points (${pct.toFixed(0)}%)`);
    deductions += Math.min(8, Math.round(pct / 2));
  }

  // Impossible coordinate jumps (> 1 km between consecutive points for <100km route)
  let spikes = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm([coords[i - 1][0], coords[i - 1][1]], [coords[i][0], coords[i][1]]);
    if (d > 1) spikes++;
  }
  if (spikes > 0) {
    flags.push(`${spikes} suspicious GPS jumps detected`);
    deductions += Math.min(10, spikes * 3);
  }

  // Elevation spikes (> 100m between consecutive points)
  let elevSpikes = 0;
  for (let i = 1; i < coords.length; i++) {
    if (coords[i][2] !== undefined && coords[i - 1][2] !== undefined) {
      const diff = Math.abs((coords[i][2] as number) - (coords[i - 1][2] as number));
      if (diff > 100) elevSpikes++;
    }
  }
  if (elevSpikes > 0) {
    flags.push(`${elevSpikes} elevation spikes (>100m between points)`);
    deductions += Math.min(8, elevSpikes * 2);
  }

  return { score: Math.max(0, 20 - deductions), flags };
}

// ──── Surface Scoring ────────────────────────────────────────────────────────

// Highway type suitability per discipline: [road, gravel, mtb] → [bonus, penalty]
const HIGHWAY_WEIGHTS: Record<string, [number, number, number]> = {
  // [road score, gravel score, mtb score] – out of 25
  cycleway:     [25, 20, 18],
  path:         [ 8, 18, 22],
  track:        [ 5, 20, 25],
  bridleway:    [ 3, 16, 22],
  footway:      [ 3, 10, 15],
  residential:  [20, 18, 12],
  service:      [15, 15, 10],
  unclassified: [18, 20, 18],
  tertiary:     [22, 20, 12],
  secondary:    [18, 15,  8],
  primary:      [10,  8,  5],
  trunk:        [ 3,  2,  2],
  motorway:     [ 0,  0,  0],
};

// Surface tag adjustments (additive)
const SURFACE_ADJUSTMENTS: Record<string, Record<Discipline, number>> = {
  asphalt:   { road:  5, gravel:  2, mtb: -2 },
  paved:     { road:  4, gravel:  2, mtb: -2 },
  concrete:  { road:  3, gravel:  1, mtb: -2 },
  gravel:    { road: -5, gravel:  5, mtb:  3 },
  unpaved:   { road: -5, gravel:  4, mtb:  3 },
  compacted: { road:  2, gravel:  5, mtb:  3 },
  dirt:      { road: -8, gravel:  2, mtb:  5 },
  grass:     { road:-10, gravel: -3, mtb:  4 },
  sand:      { road:-10, gravel: -5, mtb: -2 },
  mud:       { road:-10, gravel: -8, mtb: -3 },
};

function disciplineIndex(d: Discipline): 0 | 1 | 2 {
  return d === "road" ? 0 : d === "gravel" ? 1 : 2;
}

/** Surfaces that mean tarmac/sealed for a road bike. */
const PAVED_SURFACE_SET = new Set([
  "asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes",
  "paving_stones", "sett", "metal", "wood",
]);
const UNPAVED_SURFACE_SET = new Set([
  "unpaved", "gravel", "fine_gravel", "compacted", "dirt", "earth", "grass",
  "ground", "mud", "sand", "woodchips", "pebblestone", "rock", "cobblestone",
]);
/** Highway classes assumed paved when no surface tag exists. */
const PAVED_CLASS_SET = new Set([
  "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
  "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
  "service", "living_street", "cycleway",
]);
const UNPAVED_CLASS_SET = new Set(["track", "path", "bridleway"]);

export interface SurfaceBreakdown {
  paved_pct: number;
  unpaved_pct: number;
  unknown_pct: number;
}

function scoreSurface(
  sampledCoords: Coord[],
  highwayWays: ProcessedWay[],
  discipline: Discipline
): {
  score: number;
  flags: string[];
  surface: SurfaceBreakdown;
  roadClasses: Record<string, number>;
} {
  const flags: string[] = [];
  const di = disciplineIndex(discipline);
  const scores: number[] = [];
  let motorwayCount = 0;
  let unmatchedCount = 0;
  let paved = 0, unpaved = 0, unknown = 0;
  const classCounts: Record<string, number> = {};

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];
    const nearest = findNearestWay(pt, highwayWays, 0.05);
    if (!nearest) {
      unmatchedCount++;
      unknown++;
      scores.push(15); // neutral for unmatched
      continue;
    }

    const hw = nearest.tags.highway ?? "";
    const surface = nearest.tags.surface ?? "";

    classCounts[hw || "unknown"] = (classCounts[hw || "unknown"] ?? 0) + 1;
    if (PAVED_SURFACE_SET.has(surface)) paved++;
    else if (UNPAVED_SURFACE_SET.has(surface)) unpaved++;
    else if (PAVED_CLASS_SET.has(hw)) paved++;
    else if (UNPAVED_CLASS_SET.has(hw)) unpaved++;
    else unknown++;

    const weights = HIGHWAY_WEIGHTS[hw];
    let baseScore = weights ? weights[di] : 15;

    // Check for motorway — immediate dangerous flag
    if (hw === "motorway" || hw === "motorway_link") {
      motorwayCount++;
      scores.push(0);
      continue;
    }

    // Surface adjustment
    const surfAdj = SURFACE_ADJUSTMENTS[surface];
    if (surfAdj) baseScore += surfAdj[discipline];

    scores.push(Math.max(0, Math.min(25, baseScore)));
  }

  if (motorwayCount > 0) {
    flags.push(`Route crosses motorway (${motorwayCount} points) — dangerous for cycling`);
  }
  if (unmatchedCount > sampledCoords.length * 0.3) {
    flags.push("Low OSM road coverage for this area");
  }

  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 15;
  const total = Math.max(1, paved + unpaved + unknown);
  const pct = (n: number) => Math.round((n / total) * 100);
  const roadClasses: Record<string, number> = {};
  const classTotal = Math.max(1, Object.values(classCounts).reduce((a, b) => a + b, 0));
  for (const [k, v] of Object.entries(classCounts)) {
    roadClasses[k] = Math.round((v / classTotal) * 100);
  }
  return {
    score: Math.round(avg),
    flags,
    surface: { paved_pct: pct(paved), unpaved_pct: pct(unpaved), unknown_pct: pct(unknown) },
    roadClasses,
  };
}

// ──── Safety Scoring ─────────────────────────────────────────────────────────

function scoreSafety(
  sampledCoords: Coord[],
  highwayWays: ProcessedWay[]
): { score: number; flags: string[] } {
  const flags: string[] = [];
  let deductions = 0;
  let bonuses = 0;
  const checkedFlags = new Set<string>();

  const dangerousHighways = new Set(["motorway", "motorway_link", "trunk", "trunk_link"]);
  const warningHighways = new Set(["primary", "primary_link"]);
  const safeHighways = new Set(["cycleway", "path", "track", "residential", "service"]);

  // Grid-indexed proximity (see SegmentGrid above): the naive
  // O(samples × all segments) scan here burned 60-90s of sync CPU per
  // generation and blocked the event loop. Same semantics: each way can
  // deduct at most once per sampled point.
  const grid = gridFor(highwayWays);

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];

    // Check for dangerous roads within 30m (warning roads within 20m)
    const countedWays = new Set<ProcessedWay>();
    for (const seg of grid.near(pt, 0.03)) {
      const way = seg.way;
      if (countedWays.has(way)) continue;
      const hw = way.tags.highway;
      if (!hw) continue;
      const isDanger = dangerousHighways.has(hw);
      const isWarning = warningHighways.has(hw);
      if (!isDanger && !isWarning) continue;

      const d = pointToSegmentDist(pt, seg.a, seg.b);
      if (isDanger && d < 0.03) {
        const flagKey = `danger:${hw}`;
        if (!checkedFlags.has(flagKey)) {
          flags.push(`Route near ${hw} — high-speed traffic danger`);
          checkedFlags.add(flagKey);
        }
        deductions += 3;
        countedWays.add(way);
      } else if (isWarning && d < 0.02) {
        const flagKey = `warning:${hw}`;
        if (!checkedFlags.has(flagKey)) {
          flags.push(`Route uses primary road — moderate traffic`);
          checkedFlags.add(flagKey);
        }
        deductions += 1;
        countedWays.add(way);
      }
    }

    // Bonus for safe infrastructure nearby
    const nearest = findNearestWay(pt, highwayWays, 0.03);
    if (nearest && safeHighways.has(nearest.tags.highway ?? "")) bonuses += 0.5;
  }

  const normalised = Math.max(
    0,
    Math.min(35, 25 - deductions / Math.max(1, sampledCoords.length) * 10 + bonuses / Math.max(1, sampledCoords.length) * 5)
  );
  return { score: Math.round(normalised), flags };
}

// ──── Scenic Scoring ─────────────────────────────────────────────────────────

function scoreScenic(
  bbox: BoundingBox,
  elements: OsmElement[],
  nodeMap: OsmNodeMap,
  sampledCoords: Coord[]
): { score: number; flags: string[] } {
  const flags: string[] = [];

  // Separate scenic ways and nodes
  const scenicWays: ProcessedWay[] = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.nodes) continue;
    const t = el.tags ?? {};
    const isScenic =
      t.natural === "water" ||
      t.natural === "forest" ||
      t.natural === "wood" ||
      t.natural === "coastline" ||
      t.waterway === "river" ||
      t.waterway === "stream" ||
      t.waterway === "canal" ||
      t.landuse === "forest" ||
      t.landuse === "wood" ||
      t.landuse === "grass" ||
      t.landuse === "meadow" ||
      t.leisure === "nature_reserve" ||
      t.landuse === "nature_reserve";

    if (isScenic) {
      const nodes = el.nodes
        .map((id) => nodeMap[id])
        .filter((n): n is { lat: number; lon: number } => n !== undefined);
      if (nodes.length >= 2) scenicWays.push({ tags: t, nodes });
    }
  }

  // Peak nodes
  const peakNodes: [number, number][] = elements
    .filter((el) => el.type === "node" && el.tags?.natural === "peak" && el.lat !== undefined)
    .map((el) => [el.lat!, el.lon!]);

  let bonusPoints = 0;
  const foundFeatures = new Set<string>();

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];

    // Check scenic ways within 150m
    const nearby = anyWayWithin(pt, scenicWays, 0.15);
    if (nearby) {
      const t = nearby.tags;
      if (t.natural === "coastline" && !foundFeatures.has("coast")) {
        foundFeatures.add("coast");
        bonusPoints += 20;
        flags.push("Coastal route");
      } else if ((t.natural === "water" || t.waterway) && !foundFeatures.has("water")) {
        foundFeatures.add("water");
        bonusPoints += 15;
        flags.push("Route near water");
      } else if ((t.natural === "forest" || t.natural === "wood" || t.landuse === "forest") && !foundFeatures.has("forest")) {
        foundFeatures.add("forest");
        bonusPoints += 10;
        flags.push("Route through forest");
      } else if ((t.landuse === "grass" || t.landuse === "meadow") && !foundFeatures.has("meadow")) {
        foundFeatures.add("meadow");
        bonusPoints += 5;
      }
    }

    // Check peaks within 1km
    for (const peak of peakNodes) {
      if (!foundFeatures.has("peak") && haversineKm(pt, peak) < 1) {
        foundFeatures.add("peak");
        bonusPoints += 20;
        flags.push("Mountain / peak terrain");
      }
    }
  }

  void bbox; // bbox available for future use (e.g. elevation data)

  const score = Math.min(20, Math.round(bonusPoints));
  return { score, flags };
}

// ──── Traffic Volume Scoring (NEW) ──────────────────────────────────────────

/**
 * TRAFFIC_VOLUME_SCORE (0–15)
 * Uses OSM highway classification as a proxy for traffic volume.
 * Quiet roads score high; busy arterials score low.
 */
const TRAFFIC_SCORES: Record<string, number> = {
  cycleway:       15,
  path:           14,
  track:          14,
  bridleway:      13,
  footway:        12,
  living_street:  13,
  residential:    11,
  service:        10,
  unclassified:   10,
  tertiary_link:   7,
  tertiary:        7,
  secondary_link:  4,
  secondary:       4,
  primary_link:    2,
  primary:         2,
  trunk_link:      0,
  trunk:           0,
  motorway_link:   0,
  motorway:        0,
};

function scoreTrafficVolume(
  sampledCoords: Coord[],
  highwayWays: ProcessedWay[]
): { score: number; flags: string[] } {
  const flags: string[] = [];
  const scores: number[] = [];
  let busyCount = 0;

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];
    const nearest = findNearestWay(pt, highwayWays, 0.05);
    if (!nearest) {
      scores.push(8); // neutral when unmatched
      continue;
    }
    const hw = nearest.tags.highway ?? "";
    const s = TRAFFIC_SCORES[hw] ?? 8;
    scores.push(s);
    if (s <= 4) busyCount++;
  }

  if (busyCount > sampledCoords.length * 0.2) {
    flags.push(`${Math.round((busyCount / sampledCoords.length) * 100)}% of route is on busy arterial roads`);
  }

  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 8;
  return { score: Math.round(avg), flags };
}

// ──── Scenic Diversity Scoring (NEW) ─────────────────────────────────────────

/**
 * SCENIC_DIVERSITY_SCORE (0–10)
 * Routes that pass through varied landscapes score higher than monotonous ones.
 * Each unique terrain type contributes its weight; score is capped at 10.
 */
const TERRAIN_WEIGHTS: Record<string, number> = {
  coastline:      2.5,
  beach:          2.0,
  vineyard:       2.0,
  heath:          1.5,
  peak:           1.5,
  nature_reserve: 1.5,
  scrub:          1.0,
  water:          1.5,
  river:          1.5,
  forest:         1.5,
  meadow:         1.0,
  farmland:       1.0,
  orchard:        1.0,
  allotments:     0.5,
};

function scenicDiversityKey(tags: Record<string, string>): string | null {
  if (tags.natural === "coastline") return "coastline";
  if (tags.natural === "beach") return "beach";
  if (tags.landuse === "vineyard") return "vineyard";
  if (tags.natural === "heath") return "heath";
  if (tags.natural === "scrub") return "scrub";
  if (tags.natural === "water" || tags.waterway === "river") return "water";
  if (tags.waterway === "stream" || tags.waterway === "canal") return "river";
  if (tags.natural === "forest" || tags.natural === "wood" || tags.landuse === "forest" || tags.landuse === "wood") return "forest";
  if (tags.landuse === "meadow" || tags.landuse === "grass") return "meadow";
  if (tags.landuse === "farmland") return "farmland";
  if (tags.landuse === "orchard") return "orchard";
  if (tags.landuse === "allotments") return "allotments";
  if (tags.leisure === "nature_reserve" || tags.landuse === "nature_reserve") return "nature_reserve";
  return null;
}

function scoreScenicDiversity(
  elements: OsmElement[],
  nodeMap: OsmNodeMap,
  sampledCoords: Coord[]
): { score: number; flags: string[] } {
  const flags: string[] = [];

  // Build terrain ways from all non-highway elements
  const terrainWays: ProcessedWay[] = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.nodes || !el.tags) continue;
    if (el.tags.highway) continue; // skip roads
    const key = scenicDiversityKey(el.tags);
    if (!key) continue;
    const nodes = el.nodes
      .map((id) => nodeMap[id])
      .filter((n): n is { lat: number; lon: number } => n !== undefined);
    if (nodes.length >= 2) terrainWays.push({ tags: el.tags, nodes });
  }

  // Check for peaks (nodes)
  const peakNodes: [number, number][] = elements
    .filter((el) => el.type === "node" && el.tags?.natural === "peak" && el.lat !== undefined)
    .map((el) => [el.lat!, el.lon!]);

  const foundTypes = new Set<string>();

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];

    // Terrain within 300m
    const nearby = anyWayWithin(pt, terrainWays, 0.3);
    if (nearby) {
      const key = scenicDiversityKey(nearby.tags);
      if (key) foundTypes.add(key);
    }

    // Peak within 2km
    for (const peak of peakNodes) {
      if (haversineKm(pt, peak) < 2) {
        foundTypes.add("peak");
        break;
      }
    }
  }

  let rawScore = 0;
  for (const type of foundTypes) {
    rawScore += TERRAIN_WEIGHTS[type] ?? 0.5;
  }

  const score = Math.min(10, Math.round(rawScore));
  if (foundTypes.size >= 3) flags.push(`Diverse landscape: ${[...foundTypes].slice(0, 4).join(", ")}`);
  if (foundTypes.size <= 1 && sampledCoords.length > 10) flags.push("Monotonous terrain — route passes through very similar landscape throughout");

  return { score, flags };
}

// ──── Waypoint Interest Scoring (NEW) ────────────────────────────────────────

/**
 * WAYPOINT_INTEREST_SCORE (0–10)
 * Routes that pass interesting POIs within 500m score higher.
 */
const POI_WEIGHTS: Record<string, number> = {
  viewpoint:      3.0,
  historic:       2.0,
  cafe:           1.5,
  restaurant:     1.0,
  pub:            1.0,
  drinking_water: 1.5,
  toilets:        0.5,
  fountain:       0.5,
};

function waypointInterestKey(tags: Record<string, string>): string | null {
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.historic) return "historic";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.amenity === "pub") return "pub";
  if (tags.amenity === "drinking_water") return "drinking_water";
  if (tags.amenity === "toilets") return "toilets";
  if (tags.amenity === "fountain") return "fountain";
  return null;
}

function scoreWaypointInterest(
  elements: OsmElement[],
  sampledCoords: Coord[]
): { score: number; flags: string[] } {
  const flags: string[] = [];

  // Collect POI nodes with lat/lon
  const pois: Array<{ pt: [number, number]; key: string }> = [];
  for (const el of elements) {
    if (el.type !== "node" || el.lat === undefined || el.lon === undefined || !el.tags) continue;
    const key = waypointInterestKey(el.tags);
    if (key) pois.push({ pt: [el.lat, el.lon], key });
  }

  if (pois.length === 0) return { score: 5, flags }; // neutral when no POI data

  const foundTypes = new Set<string>();

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];
    for (const poi of pois) {
      if (haversineKm(pt, poi.pt) < 0.5) { // 500m radius
        foundTypes.add(poi.key);
      }
    }
  }

  let rawScore = 0;
  const highlights: string[] = [];
  for (const key of foundTypes) {
    rawScore += POI_WEIGHTS[key] ?? 0.5;
    if (key === "viewpoint") highlights.push("viewpoints");
    if (key === "historic") highlights.push("historic sites");
    if (key === "cafe" || key === "restaurant" || key === "pub") highlights.push("cafes/restaurants");
    if (key === "drinking_water") highlights.push("water stops");
  }

  const score = Math.min(10, Math.round(rawScore));
  if (highlights.length > 0) {
    flags.push(`Route has ${[...new Set(highlights)].join(", ")} nearby`);
  }

  return { score, flags };
}

// ──── Gradient Comfort Scoring (NEW) ─────────────────────────────────────────

/**
 * GRADIENT_COMFORT_SCORE (0–10)
 * Analyzes the elevation profile for sustained steep gradients.
 * Gentle, rolling terrain scores high; repeated steep pitches score low.
 */
function scoreGradientComfort(coords: Coord[]): { score: number; flags: string[] } {
  const flags: string[] = [];

  // Check if we have elevation data
  const hasElev = coords.some((c) => c[2] !== undefined);
  if (!hasElev) return { score: 5, flags }; // neutral when no elevation

  let score = 10;
  let steepSegments = 0;
  let steepDistM = 0;
  let totalDistM = 0;
  let sustainedSteepM = 0;
  let maxSustainedSteepM = 0;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    if (curr[2] === undefined || prev[2] === undefined) continue;

    const distM = haversineKm([prev[0], prev[1]], [curr[0], curr[1]]) * 1000;
    const elevDiff = (curr[2] as number) - (prev[2] as number);
    totalDistM += distM;

    if (distM < 1) continue; // skip noise

    const gradient = (elevDiff / distM) * 100; // %
    const absGrad = Math.abs(gradient);

    if (absGrad > 10) {
      steepSegments++;
      steepDistM += distM;
      sustainedSteepM += distM;
    } else {
      maxSustainedSteepM = Math.max(maxSustainedSteepM, sustainedSteepM);
      sustainedSteepM = 0;
    }

    // Severe penalty for very steep sections
    if (absGrad > 15) score -= 0.5;
    else if (absGrad > 10) score -= 0.2;
  }
  maxSustainedSteepM = Math.max(maxSustainedSteepM, sustainedSteepM);

  // Penalty for long sustained steep sections (>500m at >10%)
  if (maxSustainedSteepM > 500) {
    score -= 2;
    flags.push(`${Math.round(maxSustainedSteepM)}m sustained steep section (>10%)`);
  }

  // Penalty for high proportion of steep terrain
  if (totalDistM > 0) {
    const steepPct = steepDistM / totalDistM;
    if (steepPct > 0.3) {
      score -= 2;
      flags.push(`${Math.round(steepPct * 100)}% of route is steep (>10% gradient)`);
    }
  }

  return { score: Math.max(0, Math.min(10, Math.round(score))), flags };
}

// ──── Road Continuity Scoring (NEW) ──────────────────────────────────────────

/**
 * ROAD_CONTINUITY_SCORE (0–5)
 * Penalises routes that frequently change highway type between sampled points.
 * Smooth, consistent road type = better ride experience.
 */
function scoreRoadContinuity(
  sampledCoords: Coord[],
  highwayWays: ProcessedWay[]
): { score: number; flags: string[] } {
  const flags: string[] = [];
  const types: string[] = [];

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];
    const nearest = findNearestWay(pt, highwayWays, 0.05);
    if (nearest) types.push(nearest.tags.highway ?? "unknown");
  }

  if (types.length < 2) return { score: 5, flags };

  let changes = 0;
  for (let i = 1; i < types.length; i++) {
    if (types[i] !== types[i - 1]) changes++;
  }

  const changeRate = changes / (types.length - 1);

  let score: number;
  if (changeRate < 0.15) score = 5;
  else if (changeRate < 0.30) score = 4;
  else if (changeRate < 0.45) score = 3;
  else if (changeRate < 0.60) score = 2;
  else score = 1;

  if (changeRate >= 0.45) {
    flags.push("Route frequently switches road type — choppy ride experience likely");
  }

  return { score, flags };
}

// ──── Bicycle Access Scoring ─────────────────────────────────────────────

/**
 * BICYCLE_ACCESS_SCORE (0–15)
 * Deducts points when the route passes through ways tagged as inaccessible
 * to cyclists: bicycle=no, access=private, access=no, or
 * motor_vehicle=designated (implies bicycle-excluded).
 */
const RESTRICTED_ACCESS_TAGS: Array<(tags: Record<string, string>) => boolean> = [
  (t) => t.bicycle === "no",
  (t) => t.access === "no",
  (t) => t.access === "private",
  (t) => t.motor_vehicle === "designated" && !t.bicycle,
];

function scoreBicycleAccess(
  sampledCoords: Coord[],
  highwayWays: ProcessedWay[]
): { score: number; flags: string[] } {
  const flags: string[] = [];
  let restrictedCount = 0;

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];
    const nearest = findNearestWay(pt, highwayWays, 0.05);
    if (!nearest) continue;

    const tags = nearest.tags;
    for (const check of RESTRICTED_ACCESS_TAGS) {
      if (check(tags)) {
        restrictedCount++;
        break;
      }
    }
  }

  if (restrictedCount === 0) return { score: 15, flags };

  const pct = restrictedCount / sampledCoords.length;
  const deduction = Math.min(15, Math.round(pct * 30));

  flags.push(
    `Route passes through bicycle-restricted road (${restrictedCount} of ${sampledCoords.length} sample points)`
  );
  if (pct > 0.5) {
    flags.push("Majority of route is on roads restricted to cyclists");
  }

  return { score: Math.max(0, 15 - deduction), flags };
}

// ──── Composite Confidence (NEW) ─────────────────────────────────────────────

/**
 * Determine confidence level from OSM coverage ratio.
 * High: ≥70% of sampled points matched an OSM way
 * Medium: 30–70%
 * Low: <30% — warning badge triggered
 */
function computeConfidenceLevel(
  confidence: number
): { level: "high" | "medium" | "low"; lowCoverageWarning: boolean } {
  if (confidence >= 0.7) return { level: "high", lowCoverageWarning: false };
  if (confidence >= 0.3) return { level: "medium", lowCoverageWarning: false };
  return { level: "low", lowCoverageWarning: true };
}

// ──── Main Export ─────────────────────────────────────────────────────────────

export interface ScoreRouteOptions {
  /** How many metres between sampled points for OSM checks. Default: 200 */
  sampleIntervalMeters?: number;
  /** Whether the route is labelled as "minimum climbing" (for elevation sanity rule). */
  labeledMinClimbing?: boolean;
}

export async function scoreRoute(
  coordinates: Coord[],
  discipline: Discipline,
  options: ScoreRouteOptions = {}
): Promise<QualityScore> {
  const { sampleIntervalMeters = 200, labeledMinClimbing = false } = options;
  const allFlags: string[] = [];

  // 0a. Compute elevation gain and distance from 3-D coordinates
  const elevationGain = computeElevationGain(coordinates);
  const distanceKm = totalDistanceKm(coordinates);

  const ruleOptions: RouteValidationOptions = {
    elevationGain,
    distanceKm,
    labeledMinClimbing,
  };

  // 0b. Hard rules pre-check (GPS-only — fail fast before Overpass)
  const gpsRulesResult = validateRouteRules(
    coordinates.map((c) => [c[0], c[1]] as [number, number]),
    discipline,
    null,
    ruleOptions
  );
  if (!gpsRulesResult.passed) {
    const fatalViolations = gpsRulesResult.violations.filter((v) => v.severity === "fatal");
    return {
      total: 0,
      breakdown: {
        surface_score: 0,
        safety_score: 0,
        scenic_score: 0,
        gps_quality_score: 0,
        traffic_volume_score: 0,
        scenic_diversity_score: 0,
        waypoint_interest_score: 0,
        gradient_comfort_score: 0,
        road_continuity_score: 0,
        bicycle_access_score: 0,
      },
      flags: fatalViolations.map((v) => `[${v.rule}] ${v.message}`),
      confidence: 0,
      confidence_level: "low",
      low_coverage_warning: true,
      osm_cached: false,
    };
  }
  for (const v of gpsRulesResult.violations) {
    if (v.severity === "warning") allFlags.push(`[${v.rule}] ${v.message}`);
  }

  // 1. GPS quality (pure local — no API)
  const { score: gps_quality_score, flags: gpsFlags } = scoreGpsQuality(coordinates);
  allFlags.push(...gpsFlags);

  // 2. Sample coordinates for OSM checks
  const sampled = sampleCoords(coordinates, sampleIntervalMeters);

  // 3. Query Overpass
  const bbox = routeBbox(coordinates);
  let elements: OsmElement[] = [];
  let overpassFailed = false;
  let osm_cached = false;

  try {
    const key = getCacheKey(bbox);
    const cacheHit = osmCache.get(key);
    if (cacheHit && cacheHit.expires > Date.now()) osm_cached = true;
    elements = await queryOverpass(bbox);
  } catch (err) {
    overpassFailed = true;
    allFlags.push("Road data unavailable — could not verify this route");
    console.error("[route-quality] Overpass query failed:", err);
  }

  const nodeMap = buildNodeMap(elements);
  const allWays = buildProcessedWays(elements, nodeMap);
  const highwayWays = allWays.filter((w) => !!w.tags.highway);

  // 3b. OSM-dependent hard rules (now we have the data)
  if (!overpassFailed && elements.length > 0) {
    const osmRulesResult = validateRouteRules(
      coordinates.map((c) => [c[0], c[1]] as [number, number]),
      discipline,
      { elements },
      ruleOptions
    );
    if (!osmRulesResult.passed) {
      const fatalViolations = osmRulesResult.violations.filter((v) => v.severity === "fatal");
      return {
        total: 0,
        breakdown: {
          surface_score: 0,
          safety_score: 0,
          scenic_score: 0,
          gps_quality_score,
          traffic_volume_score: 0,
          scenic_diversity_score: 0,
          waypoint_interest_score: 0,
          gradient_comfort_score: 0,
          road_continuity_score: 0,
          bicycle_access_score: 0,
        },
        flags: [
          ...allFlags,
          ...fatalViolations.map((v) => `[${v.rule}] ${v.message}`),
        ],
        confidence: 0,
        confidence_level: "low",
        low_coverage_warning: true,
        osm_cached,
      };
    }
    for (const v of osmRulesResult.violations) {
      if (v.severity === "warning") allFlags.push(`[${v.rule}] ${v.message}`);
    }
  }

  // 4. Confidence: ratio of sampled points that matched an OSM highway way
  let matchedCount = 0;
  if (!overpassFailed && highwayWays.length > 0) {
    for (const c of sampled) {
      if (findNearestWay([c[0], c[1]], highwayWays, 0.05)) matchedCount++;
    }
  }
  const confidence = overpassFailed
    ? 0
    : sampled.length > 0
    ? matchedCount / sampled.length
    : 0;

  const { level: confidence_level, lowCoverageWarning: low_coverage_warning } =
    computeConfidenceLevel(confidence);

  if (low_coverage_warning) {
    allFlags.push("Low OSM coverage (>30% of route unmatched) — scores may be less accurate");
  }

  // 5. Score each dimension
  let surfaceBreakdown: QualityScore["surface_breakdown"];
  let roadClassBreakdown: QualityScore["road_class_breakdown"];
  let surface_score: number;
  let safety_score: number;
  let scenic_score: number;
  let traffic_volume_score: number;
  let scenic_diversity_score: number;
  let waypoint_interest_score: number;
  let road_continuity_score: number;
  let bicycle_access_score: number;

  if (overpassFailed) {
    // Honesty principle: with no OSM data we cannot verify surface, safety
    // or access. Neutral guesses previously summed above QUALITY_FLOOR, so
    // unverified routes shipped labelled good. Zero the OSM-dependent
    // dimensions — total lands at 0 below, and generation's floor check
    // rejects these candidates (honest decline beats unverified serve).
    surface_score = 0;
    safety_score = 0;
    scenic_score = 0;
    traffic_volume_score = 0;
    scenic_diversity_score = 0;
    waypoint_interest_score = 0;
    road_continuity_score = 0;
    bicycle_access_score = 0;
  } else {
    const surf = scoreSurface(sampled, highwayWays, discipline);
    surfaceBreakdown = surf.surface;
    roadClassBreakdown = surf.roadClasses;
    const safe = scoreSafety(sampled, highwayWays);
    const scenic = scoreScenic(bbox, elements, nodeMap, sampled);
    const traffic = scoreTrafficVolume(sampled, highwayWays);
    const diversity = scoreScenicDiversity(elements, nodeMap, sampled);
    const waypoint = scoreWaypointInterest(elements, sampled);
    const continuity = scoreRoadContinuity(sampled, highwayWays);
    const access = scoreBicycleAccess(sampled, highwayWays);

    surface_score = surf.score;
    safety_score = safe.score;
    scenic_score = scenic.score;
    traffic_volume_score = traffic.score;
    scenic_diversity_score = diversity.score;
    waypoint_interest_score = waypoint.score;
    road_continuity_score = continuity.score;
    bicycle_access_score = access.score;

    allFlags.push(
      ...surf.flags,
      ...safe.flags,
      ...scenic.flags,
      ...traffic.flags,
      ...diversity.flags,
      ...waypoint.flags,
      ...continuity.flags,
      ...access.flags,
    );
  }

  // Gradient comfort is always computed from local elevation data (no Overpass needed)
  const gradient = scoreGradientComfort(coordinates);
  const gradient_comfort_score = gradient.score;
  allFlags.push(...gradient.flags);

  // 6. Normalize total to 0–100
  const rawSum =
    surface_score +
    safety_score +
    scenic_score +
    gps_quality_score +
    traffic_volume_score +
    scenic_diversity_score +
    waypoint_interest_score +
    gradient_comfort_score +
    road_continuity_score +
    bicycle_access_score;

  // OSM down → quality 0: we could not verify the route, so we never
  // label it good. Callers' QUALITY_FLOOR checks then decline honestly.
  const total = overpassFailed
    ? 0
    : Math.max(0, Math.min(100, Math.round((rawSum / MAX_RAW_SCORE) * 100)));

  return {
    total,
    breakdown: {
      surface_score,
      safety_score,
      scenic_score,
      gps_quality_score,
      traffic_volume_score,
      scenic_diversity_score,
      waypoint_interest_score,
      gradient_comfort_score,
      road_continuity_score,
      bicycle_access_score,
    },
    flags: [...new Set(allFlags)], // deduplicate
    surface_breakdown: surfaceBreakdown,
    road_class_breakdown: roadClassBreakdown,
    confidence,
    confidence_level,
    low_coverage_warning,
    osm_cached,
  };
}

/** Synchronous GPS-only score (no Overpass) — useful for quick pre-upload checks. */
export function scoreRouteGpsOnly(coordinates: Coord[]): Pick<QualityScore, "breakdown" | "flags"> {
  const { score: gps_quality_score, flags: gpsFlags } = scoreGpsQuality(coordinates);
  const { score: gradient_comfort_score, flags: gradientFlags } = scoreGradientComfort(coordinates);
  return {
    breakdown: {
      gps_quality_score,
      surface_score: 0,
      safety_score: 0,
      scenic_score: 0,
      traffic_volume_score: 0,
      scenic_diversity_score: 0,
      waypoint_interest_score: 0,
      gradient_comfort_score,
      road_continuity_score: 0,
      bicycle_access_score: 0,
    },
    flags: [...gpsFlags, ...gradientFlags],
  };
}
