/**
 * Anchor-First Session Assembly — Corridor Finder (launch spec §3)
 *
 * Finds stretches of road near a start point that can hold a training
 * interval BEFORE any route exists: query the road network around the
 * rider, stitch quiet road segments into continuous corridors, and
 * qualify them against the zone's terrain requirements:
 *
 *   - long enough: ZONES[zone].min_length_km_per_minute × duration
 *   - gradient inside the zone's window, variance under its cap
 *   - zero traffic lights / stop signs on the corridor
 *   - minor junctions ≤ 1 per 10 minutes of effort
 *
 * The route generator then builds the loop AROUND the chosen corridor
 * (warm-up out, efforts on it, recovery turnarounds, cool-down home)
 * instead of generating loops and hoping a clean stretch appears.
 */

import type { IntensityZone } from "./intensity";
import { ZONES } from "./intensity";
import { fetchElevations } from "./elevation";
import { smoothElevations, interpolateNaN } from "./climb-detection";

export interface EffortCorridor {
  /** Polyline of the corridor, [lat, lng], ordered nearest-end first. */
  coords: [number, number][];
  /** Elevation per coordinate (Open-Meteo sampled). */
  elevations: number[];
  length_km: number;
  /** Straight-line distance from the requested start to the near end. */
  dist_from_start_km: number;
  avg_gradient_pct: number;
  max_gradient_pct: number;
  gradient_variance: number;
  minor_junctions: number;
  /** Road classes the corridor uses, for descriptions. */
  road_classes: string[];
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const UA = "loops.ie route generator (https://www.loops.ie)";

/** Road classes a corridor may be built from (quiet, continuous riding). */
const CORRIDOR_CLASSES = new Set(["tertiary", "unclassified", "secondary"]);
/** Road classes that count as junctions when they cross the corridor. */
const JUNCTION_CLASSES = new Set([
  "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
]);

interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string, string> }
interface OsmWay { id: number; nodes: number[]; tags: Record<string, string> }

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const p1 = (a[0] * Math.PI) / 180;
  const p2 = (b[0] * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function bearingDelta(b1: number, b2: number): number {
  let d = Math.abs(b1 - b2);
  if (d > 180) d = 360 - d;
  return d;
}

async function queryRoadNetwork(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<{ nodes: Map<number, OsmNode>; ways: OsmWay[]; controlNodes: Set<number>; yieldNodes: Set<number> }> {
  const radiusM = Math.round(radiusKm * 1000);
  const classes = [...JUNCTION_CLASSES].join("|");
  const query = `
[out:json][timeout:30];
(
  way(around:${radiusM},${lat},${lon})["highway"~"^(${classes})$"];
  node(around:${radiusM},${lat},${lon})["highway"~"^(traffic_signals|stop|give_way)$"];
);
out body;
>;
out skel qt;
`.trim();

  const doFetch = () =>
    fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(30_000),
    });

  let res: Response | null = null;
  for (const backoffMs of [0, 3000, 8000]) {
    if (backoffMs > 0) await new Promise((r) => setTimeout(r, backoffMs + Math.random() * 2000));
    try {
      res = await doFetch();
    } catch {
      res = null; // network/timeout — retry
      continue;
    }
    if (res.status !== 429 && res.status < 500) break;
  }
  if (!res || !res.ok) throw new Error(`Overpass API error: ${res ? `HTTP ${res.status}` : "network timeout"}`);
  const json = (await res.json()) as { elements: Array<Record<string, unknown>> };

  const nodes = new Map<number, OsmNode>();
  const ways: OsmWay[] = [];
  const controlNodes = new Set<number>();
  const yieldNodes = new Set<number>();

  for (const el of json.elements ?? []) {
    if (el.type === "node") {
      const node: OsmNode = {
        id: el.id as number,
        lat: el.lat as number,
        lon: el.lon as number,
        tags: el.tags as Record<string, string> | undefined,
      };
      nodes.set(node.id, node);
      const hw = node.tags?.highway;
      // Signals and stop signs are hard effort-breakers. A give_way node
      // usually marks a SIDE road yielding at a shared junction node —
      // treat it as a minor junction, not a disqualifier (the spec bans
      // lights and stops outright; yields only onto major roads).
      if (hw === "traffic_signals" || hw === "stop") {
        controlNodes.add(node.id);
      } else if (hw === "give_way") {
        yieldNodes.add(node.id);
      }
    } else if (el.type === "way" && el.tags && el.nodes) {
      ways.push({
        id: el.id as number,
        nodes: el.nodes as number[],
        tags: el.tags as Record<string, string>,
      });
    }
  }
  return { nodes, ways, controlNodes, yieldNodes };
}

interface StitchedCorridor {
  nodeIds: number[];
  classes: Set<string>;
}

/**
 * Stitch corridor-class ways into continuous chains. Pure function over
 * the parsed network — exported for unit testing.
 *
 * Walk: start from each corridor way; at each chain end, continue onto
 * the corridor-class way whose direction change is < 40° and which does
 * not pass through a signal/stop node. Stop once long enough or no
 * continuation exists.
 */
export function stitchCorridors(
  nodes: Map<number, OsmNode>,
  ways: OsmWay[],
  controlNodes: Set<number>,
  needKm: number
): StitchedCorridor[] {
  const corridorWays = ways.filter((w) => CORRIDOR_CLASSES.has(w.tags.highway));
  // Endpoint index: node id → corridor ways touching it at an endpoint
  const endpointIndex = new Map<number, OsmWay[]>();
  for (const w of corridorWays) {
    for (const nid of [w.nodes[0], w.nodes[w.nodes.length - 1]]) {
      const list = endpointIndex.get(nid) ?? [];
      list.push(w);
      endpointIndex.set(nid, list);
    }
  }

  const coordOf = (nid: number): [number, number] | null => {
    const n = nodes.get(nid);
    return n ? [n.lat, n.lon] : null;
  };

  const chainLengthKm = (nodeIds: number[]): number => {
    let total = 0;
    for (let i = 1; i < nodeIds.length; i++) {
      const a = coordOf(nodeIds[i - 1]);
      const b = coordOf(nodeIds[i]);
      if (a && b) total += haversineKm(a, b);
    }
    return total;
  };

  const corridors: StitchedCorridor[] = [];
  const seedUsed = new Set<number>();

  for (const seed of corridorWays) {
    if (seedUsed.has(seed.id)) continue;

    let chain = [...seed.nodes];
    const classes = new Set([seed.tags.highway]);
    const usedWays = new Set([seed.id]);

    // Extend in both directions
    for (const dir of ["tail", "head"] as const) {
      let extended = true;
      while (extended && chainLengthKm(chain) < needKm * 1.3) {
        extended = false;
        const endNode = dir === "tail" ? chain[chain.length - 1] : chain[0];
        const prevNode = dir === "tail" ? chain[chain.length - 2] : chain[1];
        if (controlNodes.has(endNode)) break; // never continue through a light/stop
        const endCoord = coordOf(endNode);
        const prevCoord = coordOf(prevNode);
        if (!endCoord || !prevCoord) break;
        const incoming = bearingDeg(prevCoord, endCoord);

        const candidates = (endpointIndex.get(endNode) ?? []).filter(
          (w) => !usedWays.has(w.id)
        );
        let best: { way: OsmWay; reversed: boolean; delta: number } | null = null;
        for (const w of candidates) {
          const forward = w.nodes[0] === endNode;
          const nextId = forward ? w.nodes[1] : w.nodes[w.nodes.length - 2];
          const nextCoord = coordOf(nextId);
          if (!nextCoord) continue;
          const outgoing = bearingDeg(endCoord, nextCoord);
          const delta = bearingDelta(incoming, outgoing);
          if (delta < 40 && (!best || delta < best.delta)) {
            best = { way: w, reversed: !forward, delta };
          }
        }
        if (best) {
          const addNodes = best.reversed ? [...best.way.nodes].reverse() : best.way.nodes;
          if (dir === "tail") chain = [...chain, ...addNodes.slice(1)];
          else chain = [...addNodes.slice(0, -1), ...chain];
          usedWays.add(best.way.id);
          seedUsed.add(best.way.id);
          classes.add(best.way.tags.highway);
          extended = true;
        }
      }
    }

    if (chainLengthKm(chain) >= needKm) {
      corridors.push({ nodeIds: chain, classes });
      seedUsed.add(seed.id);
    }
  }

  return corridors;
}

/**
 * Count effort-interrupting junctions on the corridor interior.
 *
 * A side road ENDING at a corridor node is a T-junction where the side
 * road yields — it does not interrupt a through rider. What interrupts:
 *   - crossroads: another real road passing THROUGH the node (the rider
 *     may face a yield) → minor junction
 *   - a trunk/primary crossing → disqualifying (yield-onto-major)
 *   - signals/stops anywhere on the interior → disqualifying
 */
function countMinorJunctions(
  chain: number[],
  ways: OsmWay[],
  controlNodes: Set<number>,
  yieldNodes: Set<number>
): { minor: number; controls: number } {
  const chainSet = new Set(chain);
  // node id → classes of OTHER ways for which this node is interior
  const crossings = new Map<number, string[]>();
  for (const w of ways) {
    if (!JUNCTION_CLASSES.has(w.tags.highway)) continue;
    for (let i = 1; i < w.nodes.length - 1; i++) {
      const nid = w.nodes[i];
      if (!chainSet.has(nid)) continue;
      const list = crossings.get(nid) ?? [];
      list.push(w.tags.highway);
      crossings.set(nid, list);
    }
  }
  let minor = 0;
  let controls = 0;
  const interior = chain.slice(1, -1);
  const interiorSet = new Set(interior);
  for (const nid of interior) {
    if (controlNodes.has(nid)) {
      controls++;
      continue;
    }
    if (yieldNodes.has(nid)) {
      minor++;
      continue;
    }
    const crossing = crossings.get(nid);
    if (!crossing || crossing.length === 0) continue;
    // The corridor's own ways register here too (the node is interior to
    // them) — only count classes when more ways use the node than the
    // corridor itself contributes. Corridor contributes exactly 1
    // interior usage per node, so >1 usages = a real crossing.
    const others = crossing.length - 1;
    if (others <= 0) continue;
    if (crossing.some((c) => c === "trunk" || c === "primary")) controls++;
    else minor++;
  }
  void interiorSet;
  return { minor, controls };
}

function gradientStats(
  coords: [number, number][],
  elevations: number[]
): { avg: number; max: number; variance: number } {
  const grads: number[] = [];
  let cum = 0;
  let lastEle = elevations[0];
  let lastAt = 0;
  for (let i = 1; i < coords.length; i++) {
    cum += haversineKm(coords[i - 1], coords[i]);
    // Sample gradient every ~250m to smooth GPS/elevation noise
    if (cum - lastAt >= 0.25) {
      const rise = elevations[i] - lastEle;
      grads.push((rise / ((cum - lastAt) * 1000)) * 100);
      lastEle = elevations[i];
      lastAt = cum;
    }
  }
  if (grads.length === 0) return { avg: 0, max: 0, variance: 0 };
  const avg = grads.reduce((s, g) => s + g, 0) / grads.length;
  const max = Math.max(...grads);
  const variance = Math.sqrt(
    grads.reduce((s, g) => s + (g - avg) ** 2, 0) / grads.length
  );
  return { avg, max, variance };
}

/**
 * Find corridors near `start` that can hold `durationMin` at `zone`.
 * Returns up to `limit` corridors sorted by distance from start.
 */
export async function findEffortCorridors(
  start: [number, number],
  zone: IntensityZone,
  durationMin: number,
  options: { searchRadiusKm?: number; limit?: number } = {}
): Promise<EffortCorridor[]> {
  const terrain = ZONES[zone].terrain;
  const needKm = terrain.min_length_km_per_minute * durationMin;
  const radiusKm = options.searchRadiusKm ?? Math.min(12, Math.max(6, needKm * 1.5));
  const limit = options.limit ?? 3;
  const maxMinorJunctions = Math.max(1, Math.floor(durationMin / 10));

  const debug = (msg: string) => {
    if (process.env.GENERATE_DEBUG) console.error(`[corridors] ${msg}`);
  };

  const { nodes, ways, controlNodes, yieldNodes } = await queryRoadNetwork(start[0], start[1], radiusKm);
  const stitched = stitchCorridors(nodes, ways, controlNodes, needKm);
  debug(`need ${needKm.toFixed(1)}km within ${radiusKm.toFixed(0)}km: ${ways.length} ways → ${stitched.length} stitched chains`);

  // Pre-rank by junction profile and distance, then elevation-check the
  // best few only (Open-Meteo calls cost time).
  const prelim = stitched
    .map((c) => {
      const coords = c.nodeIds
        .map((nid) => nodes.get(nid))
        .filter((n): n is OsmNode => !!n)
        .map((n) => [n.lat, n.lon] as [number, number]);
      const { minor, controls } = countMinorJunctions(c.nodeIds, ways, controlNodes, yieldNodes);
      const nearEndFirst =
        haversineKm(start, coords[0]) <= haversineKm(start, coords[coords.length - 1]);
      const ordered = nearEndFirst ? coords : [...coords].reverse();
      return {
        coords: ordered,
        classes: [...c.classes],
        minor,
        controls,
        dist: haversineKm(start, ordered[0]),
        lengthKm: ordered.reduce(
          (s, p, i) => (i === 0 ? 0 : s + haversineKm(ordered[i - 1], p)),
          0
        ),
      };
    })
    .filter((c) => {
      const ok = c.controls === 0 && c.minor <= maxMinorJunctions;
      if (!ok) debug(`chain dropped: ${c.lengthKm.toFixed(1)}km at ${c.dist.toFixed(1)}km — controls=${c.controls} minor=${c.minor} (max ${maxMinorJunctions})`);
      return ok;
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit * 3);

  const out: EffortCorridor[] = [];
  for (const c of prelim) {
    if (out.length >= limit) break;
    let elevations: number[];
    try {
      elevations = await fetchElevations(c.coords);
    } catch {
      continue; // elevation service unavailable for this one — skip
    }
    // Same smoothing the interval detector uses — raw SRTM noise inflates
    // gradient variance and rejects genuinely steady roads.
    elevations = smoothElevations(interpolateNaN(elevations));
    const stats = gradientStats(c.coords, elevations);
    if (stats.avg < terrain.min_gradient_pct || stats.avg > terrain.max_gradient_pct) {
      debug(`chain dropped: avg gradient ${stats.avg.toFixed(1)}% outside [${terrain.min_gradient_pct}, ${terrain.max_gradient_pct}]`);
      continue;
    }
    if (stats.variance > terrain.max_gradient_variance) {
      debug(`chain dropped: gradient variance ${stats.variance.toFixed(1)} > ${terrain.max_gradient_variance}`);
      continue;
    }
    out.push({
      coords: c.coords,
      elevations,
      length_km: Math.round(c.lengthKm * 10) / 10,
      dist_from_start_km: Math.round(c.dist * 10) / 10,
      avg_gradient_pct: Math.round(stats.avg * 10) / 10,
      max_gradient_pct: Math.round(stats.max * 10) / 10,
      gradient_variance: Math.round(stats.variance * 10) / 10,
      minor_junctions: c.minor,
      road_classes: c.classes,
    });
  }
  return out;
}
