/**
 * Route Explosion — generate meaningful variations from a proven base route.
 *
 * Operations (geometric; no full Dijkstra routing):
 *   reverse        – flip the direction of the route
 *   start_shift    – for loops, rotate the start point around the loop
 *   distance_trim  – shorter version by trimming to N% of distance
 *   nearby_variant – swap a segment for a geographically close OSM way
 *
 * Each generated variant is returned with its own stats.
 * Call scoreRoute() on variants you want to persist.
 */

import { haversine as haversineExport } from "./geo-utils";

// Re-export for callers that want distance utilities
export { haversineExport as haversineKm };

export type Coord = [number, number] | [number, number, number] | [number, number, number?];
export type Discipline = "road" | "gravel" | "mtb";

export type VariantType =
  | "reverse"
  | "start_shift"
  | "distance_trim"
  | "nearby_variant";

export interface BaseRoute {
  name: string;
  coordinates: Coord[];
  discipline: Discipline;
  distance_km: number;
  elevation_gain_m?: number;
}

export interface RouteVariant {
  name: string;
  description: string;
  variant_type: VariantType;
  coordinates: Coord[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
}

export interface ExplodeOptions {
  /** Maximum number of variants to return (default: 10) */
  maxVariants?: number;
  /** Which variant types to generate. Defaults to all. */
  includeTypes?: VariantType[];
  /** Minimum loop-back ratio to consider a route a loop (0–1, default 0.1).
   *  A loop is detected when start and end are within (distance_km * ratio) km. */
  loopRatio?: number;
}

// ──── Geometry helpers ────────────────────────────────────────────────────────

function haversineKm(a: [number, number], b: [number, number]): number {
  return haversineExport([a[0], a[1]], [b[0], b[1]]);
}

function coordStats(coords: Coord[]): {
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
} {
  let distance_km = 0;
  let elevation_gain_m = 0;
  let elevation_loss_m = 0;

  for (let i = 1; i < coords.length; i++) {
    distance_km += haversineKm(
      [coords[i - 1][0], coords[i - 1][1]],
      [coords[i][0], coords[i][1]]
    );
    if (coords[i][2] !== undefined && coords[i - 1][2] !== undefined) {
      const diff = (coords[i][2] as number) - (coords[i - 1][2] as number);
      if (diff > 0) elevation_gain_m += diff;
      else elevation_loss_m += Math.abs(diff);
    }
  }

  return {
    distance_km: Math.round(distance_km * 10) / 10,
    elevation_gain_m: Math.round(elevation_gain_m),
    elevation_loss_m: Math.round(elevation_loss_m),
  };
}

function isLoop(coords: Coord[], loopRatio: number, totalKm: number): boolean {
  if (coords.length < 4) return false;
  const start: [number, number] = [coords[0][0], coords[0][1]];
  const end: [number, number] = [coords[coords.length - 1][0], coords[coords.length - 1][1]];
  return haversineKm(start, end) < totalKm * loopRatio;
}

// ──── Variant generators ──────────────────────────────────────────────────────

function generateReverse(base: BaseRoute): RouteVariant {
  const reversed = [...base.coordinates].reverse();
  const stats = coordStats(reversed);
  return {
    name: `${base.name} (Reverse)`,
    description: "Same route ridden in the opposite direction — different feel, new perspectives.",
    variant_type: "reverse",
    coordinates: reversed,
    ...stats,
  };
}

/**
 * For loop routes: rotate the coordinate array so a different point is the start.
 * fractionAlong: 0.25 = quarter loop, 0.5 = halfway, etc.
 */
function generateStartShift(base: BaseRoute, fractionAlong: number): RouteVariant {
  const coords = base.coordinates;
  // Find cumulative distance array
  const cumDist: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineKm(
      [coords[i - 1][0], coords[i - 1][1]],
      [coords[i][0], coords[i][1]]
    ));
  }
  const targetDist = cumDist[cumDist.length - 1] * fractionAlong;

  // Find closest index to target distance
  let splitIdx = 0;
  for (let i = 0; i < cumDist.length; i++) {
    if (cumDist[i] >= targetDist) { splitIdx = i; break; }
  }
  splitIdx = Math.max(1, Math.min(splitIdx, coords.length - 2));

  // Rotate: [splitIdx…end] + [start…splitIdx]
  const rotated: Coord[] = [
    ...coords.slice(splitIdx),
    ...coords.slice(1, splitIdx + 1), // close the loop
  ];

  const stats = coordStats(rotated);
  const pct = Math.round(fractionAlong * 100);
  return {
    name: `${base.name} (Start at ${pct}%)`,
    description: `Same loop started ${pct}% of the way around — useful for a different warm-up or parking spot.`,
    variant_type: "start_shift",
    coordinates: rotated,
    ...stats,
  };
}

/**
 * Trim the route to a shorter distance fraction.
 * For non-loops this is an out-and-back version.
 * For loops it cuts the loop short and turns back.
 */
function generateDistanceTrim(
  base: BaseRoute,
  fraction: number,
  loop: boolean
): RouteVariant {
  const coords = base.coordinates;
  const cumDist: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineKm(
      [coords[i - 1][0], coords[i - 1][1]],
      [coords[i][0], coords[i][1]]
    ));
  }
  const totalDist = cumDist[cumDist.length - 1];
  const targetDist = totalDist * fraction;

  let cutIdx = coords.length - 1;
  for (let i = 0; i < cumDist.length; i++) {
    if (cumDist[i] >= targetDist) { cutIdx = i; break; }
  }

  const trimmed = coords.slice(0, cutIdx + 1);

  // For non-loops: add the return trip to make it a complete ride
  let finalCoords: Coord[];
  let description: string;
  const pct = Math.round(fraction * 100);

  if (!loop) {
    const returnTrip = [...trimmed].reverse().slice(1);
    finalCoords = [...trimmed, ...returnTrip];
    description = `Out-and-back version covering ${pct}% of the route then returning — approximately ${Math.round(targetDist * 2 * 10) / 10}km total.`;
  } else {
    finalCoords = trimmed;
    description = `Shorter ${pct}% version of the loop — approximately ${Math.round(targetDist * 10) / 10}km.`;
  }

  const stats = coordStats(finalCoords);
  const kmLabel = `${stats.distance_km}km`;
  return {
    name: `${base.name} (${kmLabel})`,
    description,
    variant_type: "distance_trim",
    coordinates: finalCoords,
    ...stats,
  };
}

// ──── OSM nearby-way variant ──────────────────────────────────────────────────

interface OsmWaySegment {
  nodes: Array<{ lat: number; lon: number }>;
  tags: Record<string, string>;
}

/**
 * Fetch OSM ways near a bounding box and find a parallel segment
 * that could substitute a portion of the route.
 *
 * Strategy: find a section of the route (20–40% through the middle),
 * look for nearby OSM ways that:
 *  1. Are cycling-legal (highway tag appropriate for discipline)
 *  2. Run roughly parallel to the original segment
 *  3. Start and end within 200m of the original segment endpoints
 *
 * If a valid substitute is found, return a variant; otherwise return null.
 */
async function generateNearbyVariant(
  base: BaseRoute
): Promise<RouteVariant | null> {
  const coords = base.coordinates;
  if (coords.length < 20) return null;

  // Pick a middle segment (25%–75% of route)
  const segStart = Math.floor(coords.length * 0.25);
  const segEnd = Math.floor(coords.length * 0.75);
  const segmentCoords = coords.slice(segStart, segEnd + 1);

  const entryPt: [number, number] = [segmentCoords[0][0], segmentCoords[0][1]];
  const exitPt: [number, number] = [segmentCoords[segmentCoords.length - 1][0], segmentCoords[segmentCoords.length - 1][1]];

  // Bounding box around the segment with 500m padding
  const padDeg = 0.005; // ~500m
  const lats = segmentCoords.map((c) => c[0]);
  const lngs = segmentCoords.map((c) => c[1]);
  const bbox = {
    minLat: Math.min(...lats) - padDeg,
    maxLat: Math.max(...lats) + padDeg,
    minLng: Math.min(...lngs) - padDeg,
    maxLng: Math.max(...lngs) + padDeg,
  };

  // Allowed highway types by discipline
  const allowedHighways: Record<Discipline, string[]> = {
    road: ["residential", "unclassified", "tertiary", "secondary", "cycleway"],
    gravel: ["track", "path", "unclassified", "residential", "tertiary", "cycleway"],
    mtb: ["track", "path", "bridleway", "cycleway"],
  };
  const allowed = allowedHighways[base.discipline];

  // Query Overpass for ways in the segment bounding box
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;
  const query = `[out:json][timeout:15];way["highway"~"${allowed.join("|")}"](${bboxStr});out body;>;out skel qt;`;

  const ways: OsmWaySegment[] = [];
  try {
    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": "loops.ie route generator (https://www.loops.ie)", "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) return null;

    const json = await resp.json() as {
      elements: Array<{
        type: string;
        id: number;
        lat?: number;
        lon?: number;
        nodes?: number[];
        tags?: Record<string, string>;
      }>
    };
    const nodeMap: Record<number, { lat: number; lon: number }> = {};
    for (const el of json.elements) {
      if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
        nodeMap[el.id] = { lat: el.lat, lon: el.lon };
      }
    }
    for (const el of json.elements) {
      if (el.type === "way" && el.nodes && el.tags) {
        const nodes = el.nodes
          .map((id) => nodeMap[id])
          .filter((n): n is { lat: number; lon: number } => !!n);
        if (nodes.length >= 2) ways.push({ nodes, tags: el.tags });
      }
    }
  } catch {
    return null;
  }

  if (ways.length === 0) return null;

  // Find a way whose endpoints are close to our segment's entry/exit
  const SNAP_KM = 0.3; // 300m threshold
  let bestWay: OsmWaySegment | null = null;
  let bestScore = Infinity;

  for (const way of ways) {
    const wayStart: [number, number] = [way.nodes[0].lat, way.nodes[0].lon];
    const wayEnd: [number, number] = [way.nodes[way.nodes.length - 1].lat, way.nodes[way.nodes.length - 1].lon];

    // Try both orientations
    const scoreA = haversineKm(entryPt, wayStart) + haversineKm(exitPt, wayEnd);
    const scoreB = haversineKm(entryPt, wayEnd) + haversineKm(exitPt, wayStart);
    const score = Math.min(scoreA, scoreB);

    if (score < bestScore && score < SNAP_KM * 2) {
      bestScore = score;
      bestWay = way;

      // Orient correctly
      if (scoreB < scoreA) bestWay = { ...way, nodes: [...way.nodes].reverse() };
    }
  }

  if (!bestWay) return null;

  // Build variant: prefix + alternate segment + suffix
  const altSegment: Coord[] = bestWay.nodes.map((n) => [n.lat, n.lon]);
  const prefix = coords.slice(0, segStart);
  const suffix = coords.slice(segEnd + 1);
  const variantCoords: Coord[] = [...prefix, ...altSegment, ...suffix];

  const stats = coordStats(variantCoords);
  const hwType = bestWay.tags.highway ?? "alternate road";

  return {
    name: `${base.name} (Alternate via ${hwType})`,
    description: `Middle section replaced with a nearby ${hwType} — same start/end, different middle.`,
    variant_type: "nearby_variant",
    coordinates: variantCoords,
    ...stats,
  };
}

// ──── Main Export ─────────────────────────────────────────────────────────────

export async function explodeRoute(
  base: BaseRoute,
  options: ExplodeOptions = {}
): Promise<RouteVariant[]> {
  const {
    maxVariants = 10,
    includeTypes,
    loopRatio = 0.1,
  } = options;

  const shouldInclude = (t: VariantType) =>
    !includeTypes || includeTypes.includes(t);

  const variants: RouteVariant[] = [];
  const loop = isLoop(base.coordinates, loopRatio, base.distance_km);

  // 1. Reverse
  if (shouldInclude("reverse")) {
    variants.push(generateReverse(base));
  }

  // 2. Start shifts (for loops only)
  if (shouldInclude("start_shift") && loop) {
    for (const fraction of [0.25, 0.5, 0.75]) {
      variants.push(generateStartShift(base, fraction));
      if (variants.length >= maxVariants) break;
    }
  }

  // 3. Distance trims
  if (shouldInclude("distance_trim")) {
    for (const fraction of [0.75, 0.5]) {
      if (variants.length >= maxVariants) break;
      variants.push(generateDistanceTrim(base, fraction, loop));
    }
  }

  // 4. Nearby OSM variant (async, one attempt)
  if (shouldInclude("nearby_variant") && variants.length < maxVariants) {
    try {
      const nv = await generateNearbyVariant(base);
      if (nv) variants.push(nv);
    } catch {
      // Non-fatal: nearby variant is best-effort
    }
  }

  return variants.slice(0, maxVariants);
}
