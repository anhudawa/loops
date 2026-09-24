/**
 * What a stored track actually is, measured — not what its name claims.
 * A route called "Loop" that rides 94 % of its roads twice is a broken
 * import, and a rider who rides it posts it as a joke. Unknown/over-limit
 * tracks are flagged so pages can warn and Generate can skip them.
 */

export type TrackShape = "loop" | "lollipop" | "out-and-back" | "point_to_point";

/**
 * Ends further apart than this are A to B (a commute, a traverse), not a
 * training loop — lists and duration chips leave them out (db.ts).
 */
export const POINT_TO_POINT_KM = 1;

export interface TrackCheck {
  shape: TrackShape;
  /** Share of the distance ridden on road the track also uses elsewhere (0–100). */
  retracePct: number;
  /** Largest straight-line jump between consecutive points (km) — a gap in the data. */
  maxJumpKm: number;
  /** Start-to-finish distance (km); > POINT_TO_POINT_KM means point-to-point. */
  endsApartKm: number;
  /** Not fit to ride as served, with the reason. */
  broken: string | null;
}

const km = (a: [number, number], b: [number, number]) =>
  Math.hypot((b[0] - a[0]) * 111.32, (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180));

export function checkTrack(coords: [number, number][], name = ""): TrackCheck | null {
  if (coords.length < 3) return null;
  const cum = [0];
  let maxJump = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = km(coords[i - 1], coords[i]);
    cum.push(cum[i - 1] + d);
    if (d > maxJump) maxJump = d;
  }
  const total = cum[cum.length - 1];
  if (total < 1) return null;
  // Retrace: length within 25 m of a part of the track more than 1 km away along it.
  const cell = (p: [number, number]) => `${Math.round(p[0] / 0.0004)},${Math.round(p[1] / 0.0005)}`;
  const grid = new Map<string, number[]>();
  coords.forEach((p, i) => { const k = cell(p); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
  let shared = 0;
  for (let i = 1; i < coords.length; i++) {
    const [cy, cx] = cell(coords[i]).split(",").map(Number);
    let hit = false;
    for (let a = -1; a <= 1 && !hit; a++) for (let b = -1; b <= 1 && !hit; b++) {
      for (const j of grid.get(`${cy + a},${cx + b}`) ?? []) {
        if (Math.abs(cum[j] - cum[i]) < 1) continue;
        if (km(coords[j], coords[i]) < 0.025) { hit = true; break; }
      }
    }
    if (hit) shared += cum[i] - cum[i - 1];
  }
  const retracePct = Math.round((shared / total) * 100);
  const endsApartKm = Math.round(km(coords[0], coords[coords.length - 1]) * 10) / 10;
  const shape: TrackShape =
    endsApartKm > POINT_TO_POINT_KM ? "point_to_point"
    : retracePct >= 75 ? "out-and-back" : retracePct >= 25 ? "lollipop" : "loop";
  let broken: string | null = null;
  if (maxJump > 2) broken = `the track has a ${maxJump.toFixed(1)} km gap`;
  else if (/\bloop\b/i.test(name) && retracePct > 50) broken = `it is called a loop but ${retracePct}% of it rides the same roads twice`;
  return { shape, retracePct, maxJumpKm: Math.round(maxJump * 100) / 100, endsApartKm, broken };
}

/** "Loop", "Out and back · 94% ridden both ways", "Loop with an out-and-back section · 41% …". */
export function shapeLabel(c: TrackCheck): string {
  if (c.shape === "point_to_point") return "Point to point";
  if (c.shape === "loop") return "Loop";
  if (c.shape === "out-and-back") return `Out and back · ${c.retracePct}% ridden both ways`;
  return `Loop with an out-and-back section · ${c.retracePct}% ridden both ways`;
}

/**
 * How much of a drawn ride is the same road twice: km and share of the
 * distance (the checkTrack measurement). `warn` when it is worth telling
 * the rider — more than 15 % or more than 3 km.
 */
export function retraceSummary(coords: [number, number][]): { km: number; pct: number; warn: boolean } | null {
  const c = checkTrack(coords);
  if (!c) return null;
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += km(coords[i - 1], coords[i]);
  const retraceKm = Math.round(((total * c.retracePct) / 100) * 10) / 10;
  return { km: retraceKm, pct: c.retracePct, warn: c.retracePct > 15 || retraceKm > 3 };
}

/** Share (0–1) of `a`'s points within `tolKm` of some point of `b`. */
export function trackOverlap(a: [number, number][], b: [number, number][], tolKm = 0.1): number {
  if (a.length === 0 || b.length === 0) return 0;
  const cy = 0.001, cx = 0.0015; // ~110 m cells
  const cell = (p: [number, number]) => `${Math.floor(p[0] / cy)},${Math.floor(p[1] / cx)}`;
  const grid = new Map<string, [number, number][]>();
  for (const p of b) { const k = cell(p); (grid.get(k) ?? grid.set(k, []).get(k)!).push(p); }
  let near = 0;
  for (const p of a) {
    const [y, x] = cell(p).split(",").map(Number);
    let hit = false;
    for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) {
      for (const q of grid.get(`${y + i},${x + j}`) ?? []) if (km(p, q) <= tolKm) { hit = true; break; }
    }
    if (hit) near++;
  }
  return near / a.length;
}

/**
 * Near-duplicate library routes (the same ride imported twice under two
 * names: "Els Àngels Loop" / "Els Àngels Loop, Girona"): starts within 3 km
 * and 70 %+ of each track on the other. Keeps the first (the list's order).
 */
export function dedupeRoutes<T>(routes: T[], coordsOf: (r: T) => [number, number][] | null): T[] {
  const kept: Array<{ r: T; c: [number, number][] }> = [];
  for (const r of routes) {
    const c = coordsOf(r);
    if (!c || c.length < 2) { kept.push({ r, c: [] }); continue; }
    const dup = kept.some((k) => k.c.length > 1 && km(k.c[0], c[0]) <= 3 && trackOverlap(c, k.c) >= 0.7 && trackOverlap(k.c, c) >= 0.7);
    if (!dup) kept.push({ r, c });
  }
  return kept.map((k) => k.r);
}
