/**
 * Route Quality Scoring Module
 *
 * Scores a cycling route 0–100 by querying OpenStreetMap via the Overpass API.
 * Breakdown:
 *   gps_quality_score  (0–20)  – duplicate points, spikes, impossible jumps
 *   surface_score      (0–25)  – road classification & surface suitability
 *   safety_score       (0–35)  – proximity to dangerous roads
 *   scenic_score       (0–20)  – water, forests, peaks, coastline nearby
 */

export type Discipline = "road" | "gravel" | "mtb";

export interface QualityBreakdown {
  surface_score: number;   // 0–25
  safety_score: number;    // 0–35
  scenic_score: number;    // 0–20
  gps_quality_score: number; // 0–20
}

export interface QualityScore {
  total: number;            // 0–100 weighted sum
  breakdown: QualityBreakdown;
  flags: string[];          // human-readable issues
  confidence: number;       // 0–1: how much OSM coverage was found
  osm_cached: boolean;
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

/** Find the nearest processed way within maxKm of a point. */
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
      const d = pointToSegmentDist(pt, a, b);
      if (d < bestDist) {
        bestDist = d;
        bestWay = way;
      }
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
  for (const way of ways) {
    for (let i = 0; i + 1 < way.nodes.length; i++) {
      const a: [number, number] = [way.nodes[i].lat, way.nodes[i].lon];
      const b: [number, number] = [way.nodes[i + 1].lat, way.nodes[i + 1].lon];
      if (pointToSegmentDist(pt, a, b) < maxKm) return way;
    }
  }
  return null;
}

// ──── Overpass API ───────────────────────────────────────────────────────────

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT_S = 25;

async function queryOverpass(bbox: BoundingBox): Promise<OsmElement[]> {
  const key = getCacheKey(bbox);
  const cached = osmCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.elements;

  // Single query fetches all relevant data: roads, natural features, waterways
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;

  const query = `
[out:json][timeout:${OVERPASS_TIMEOUT_S}];
(
  way["highway"](${bboxStr});
  way["natural"~"water|forest|wood|peak|coastline"](${bboxStr});
  way["waterway"~"river|stream|canal"](${bboxStr});
  way["landuse"~"forest|wood|grass|meadow|nature_reserve"](${bboxStr});
  way["leisure"="nature_reserve"](${bboxStr});
  node["natural"="peak"](${bboxStr});
);
out body;
>;
out skel qt;
`.trim();

  const resp = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(30_000),
  });

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

function scoreSurface(
  sampledCoords: Coord[],
  highwayWays: ProcessedWay[],
  discipline: Discipline
): { score: number; flags: string[] } {
  const flags: string[] = [];
  const di = disciplineIndex(discipline);
  const scores: number[] = [];
  let motorwayCount = 0;
  let unmatchedCount = 0;

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];
    const nearest = findNearestWay(pt, highwayWays, 0.05);
    if (!nearest) {
      unmatchedCount++;
      scores.push(15); // neutral for unmatched
      continue;
    }

    const hw = nearest.tags.highway ?? "";
    const surface = nearest.tags.surface ?? "";

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
  return { score: Math.round(avg), flags };
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

  for (const coord of sampledCoords) {
    const pt: [number, number] = [coord[0], coord[1]];

    // Check for dangerous roads within 30m
    for (const way of highwayWays) {
      if (!way.tags.highway) continue;
      const hw = way.tags.highway;
      for (let i = 0; i + 1 < way.nodes.length; i++) {
        const a: [number, number] = [way.nodes[i].lat, way.nodes[i].lon];
        const b: [number, number] = [way.nodes[i + 1].lat, way.nodes[i + 1].lon];
        const d = pointToSegmentDist(pt, a, b);

        if (dangerousHighways.has(hw) && d < 0.03) {
          const flagKey = `danger:${hw}`;
          if (!checkedFlags.has(flagKey)) {
            flags.push(`Route near ${hw} — high-speed traffic danger`);
            checkedFlags.add(flagKey);
          }
          deductions += 3;
          break;
        }
        if (warningHighways.has(hw) && d < 0.02) {
          const flagKey = `warning:${hw}`;
          if (!checkedFlags.has(flagKey)) {
            flags.push(`Route uses primary road — moderate traffic`);
            checkedFlags.add(flagKey);
          }
          deductions += 1;
          break;
        }
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

// ──── Main Export ─────────────────────────────────────────────────────────────

export interface ScoreRouteOptions {
  /** How many metres between sampled points for OSM checks. Default: 200 */
  sampleIntervalMeters?: number;
}

export async function scoreRoute(
  coordinates: Coord[],
  discipline: Discipline,
  options: ScoreRouteOptions = {}
): Promise<QualityScore> {
  const { sampleIntervalMeters = 200 } = options;
  const allFlags: string[] = [];

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
    allFlags.push("OSM data unavailable — surface/safety/scenic scores estimated");
    console.error("[route-quality] Overpass query failed:", err);
  }

  const nodeMap = buildNodeMap(elements);
  const allWays = buildProcessedWays(elements, nodeMap);
  const highwayWays = allWays.filter((w) => !!w.tags.highway);

  // Confidence: ratio of sampled points that matched an OSM way
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

  // 4. Score each dimension
  let surface_score: number;
  let safety_score: number;
  let scenic_score: number;

  if (overpassFailed) {
    // Fallback: neutral scores
    surface_score = 15;
    safety_score = 20;
    scenic_score = 10;
  } else {
    const surf = scoreSurface(sampled, highwayWays, discipline);
    const safe = scoreSafety(sampled, highwayWays);
    const scenic = scoreScenic(bbox, elements, nodeMap, sampled);

    surface_score = surf.score;
    safety_score = safe.score;
    scenic_score = scenic.score;

    allFlags.push(...surf.flags, ...safe.flags, ...scenic.flags);
  }

  // 5. Weighted total
  const total = Math.round(
    surface_score + safety_score + scenic_score + gps_quality_score
  );

  return {
    total: Math.max(0, Math.min(100, total)),
    breakdown: { surface_score, safety_score, scenic_score, gps_quality_score },
    flags: [...new Set(allFlags)], // deduplicate
    confidence,
    osm_cached,
  };
}

/** Synchronous GPS-only score (no Overpass) — useful for quick pre-upload checks. */
export function scoreRouteGpsOnly(coordinates: Coord[]): Pick<QualityScore, "breakdown" | "flags"> {
  const { score: gps_quality_score, flags } = scoreGpsQuality(coordinates);
  return {
    breakdown: {
      gps_quality_score,
      surface_score: 0,
      safety_score: 0,
      scenic_score: 0,
    },
    flags,
  };
}
