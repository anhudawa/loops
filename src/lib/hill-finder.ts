/**
 * Where are the hills? For hill-repeat sessions (VO2 max, anaerobic) the
 * ride must go over a real climb — "4x4 VO2 from Clontarf" means the Ben of
 * Howth. The loop generator alone steers round climbs, so we look for them
 * first, in bundled GeoNames data (named hills, peaks and passes with their
 * height — local and instant, no quota), then aim loops over the best of
 * them. The engine routes every metre to the Road Standard, and the effort
 * stretch is measured on the routed road (effort-repeats.ts), so a hill with
 * no climbable road simply produces no stretch.
 */

import data from "@/data/hills.json";

export interface Hill {
  name: string;
  point: [number, number];
  /** Height of the top (m). */
  elevation_m: number;
  dist_km: number;
  /** A pass: a road goes over it (the best climbs in the mountains). */
  pass: boolean;
}

type Row = [string, number, number, number, string];

const KM_PER_DEG_LAT = 111.32;

function km(a: [number, number], b: [number, number]): number {
  const dy = (b[0] - a[0]) * KM_PER_DEG_LAT, dx = (b[1] - a[1]) * KM_PER_DEG_LAT * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Tops lower than this make no climb worth a VO2 rep. */
const MIN_HEIGHT_M = 60;

/**
 * Named hills within `radiusKm` of the start, best first: a real climb
 * (height, capped — a 2,000 m peak is no better for 4-minute reps and its
 * roads are further away), passes preferred (a road crosses them), and not
 * on top of the start (no warm-up) or at the edge of reach. Pure over the
 * bundled data; `rows` is injectable for tests.
 */
export function findHills(start: [number, number], radiusKm: number, rows: Row[] = (data as unknown as { p: Row[] }).p): Hill[] {
  const out: Array<{ h: Hill; score: number }> = [];
  const latSpan = radiusKm / KM_PER_DEG_LAT;
  for (const r of rows) {
    const lat = r[1] / 1e4, lng = r[2] / 1e4;
    if (Math.abs(lat - start[0]) > latSpan || r[3] < MIN_HEIGHT_M) continue;
    const p: [number, number] = [lat, lng];
    const d = km(start, p);
    if (d < 3 || d > radiusKm) continue;
    const pass = r[4] === "PASS";
    const h: Hill = { name: r[0], point: p, elevation_m: r[3], dist_km: Math.round(d * 10) / 10, pass };
    // No bonus for "passes": in the OSM data most are walkers' cols. Whether
    // a road reaches the top is checked on the engine (summit road).
    out.push({ h, score: Math.min(r[3], 400) / 80 - Math.abs(d - radiusKm * 0.5) / radiusKm });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.h);
}

function bearing(a: [number, number], b: [number, number]): number {
  const la1 = (a[0] * Math.PI) / 180, la2 = (b[0] * Math.PI) / 180, dl = ((b[1] - a[1]) * Math.PI) / 180;
  return ((Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl)) * 180) / Math.PI + 360) % 360;
}

function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}


/** Road km ≈ straight-line km × this on a rural network. */
const ROAD_FACTOR = 1.3;

/**
 * Loops over `hill`, sized for `targetKm` of road: out to the hill and home
 * (the loop builder routes the return off the outbound roads), and — when
 * that is too short — the same via a town (a named place is always on land;
 * a geometric side point can land in the sea round a headland like Howth).
 * `towns` supplies named places near a point.
 */
export function loopsOverHill(
  start: [number, number],
  hill: [number, number],
  targetKm: number,
  towns: (near: [number, number], radiusKm: number) => Array<{ lat: number; lng: number; pop: number }> = () => [],
): [number, number][][] {
  const d = km(start, hill);
  const want = targetKm / ROAD_FACTOR;
  if (2 * d > want * 1.15) return []; // the ride can't get there and back
  const sets: [number, number][][] = [];
  // Crude but local: a straight line whose quarter points all have a town
  // within 4 km runs over land; one across a bay (Dalkey → Howth) does not.
  const overLand = (a: [number, number], b: [number, number]) =>
    [0.25, 0.5, 0.75].every((t) => towns([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], 4).length > 0);
  if (2 * d >= want * 0.75) sets.push([start, hill, start]);
  if (2 * d < want * 0.9) {
    // A town T with start→T→hill→start ≈ want: search the ring round the
    // start for the best fit, preferring bigger places (real roads).
    const cands = towns(start, Math.min(30, want / 2))
      .map((t) => {
        const p: [number, number] = [t.lat, t.lng];
        const per = km(start, p) + km(p, hill) + d;
        return { p, err: Math.abs(per - want) / want - Math.log10(Math.max(500, t.pop)) * 0.02, far: km(p, start) > 2 && km(p, hill) > 2 };
      })
      // Same side of the start as the hill: a town across a bay fits the
      // straight-line sums but the road goes round through the city.
      .filter((c) => c.far && angleBetween(bearing(start, c.p), bearing(start, hill)) <= 75 && overLand(c.p, hill) && overLand(start, c.p))
      .sort((a, b) => a.err - b.err);
    for (const c of cands.slice(0, 2)) {
      if (c.err > 0.35) break;
      sets.push([start, c.p, hill, start], [start, hill, c.p, start]);
    }
  }
  return sets.slice(0, 4);
}
