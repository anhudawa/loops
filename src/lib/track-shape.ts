/**
 * What a stored track actually is, measured — not what its name claims.
 * A route called "Loop" that rides 94 % of its roads twice is a broken
 * import, and a rider who rides it posts it as a joke. Unknown/over-limit
 * tracks are flagged so pages can warn and Generate can skip them.
 */

export type TrackShape = "loop" | "lollipop" | "out-and-back";

export interface TrackCheck {
  shape: TrackShape;
  /** Share of the distance ridden on road the track also uses elsewhere (0–100). */
  retracePct: number;
  /** Largest straight-line jump between consecutive points (km) — a gap in the data. */
  maxJumpKm: number;
  /** Start-to-finish distance (km); > 5 km means point-to-point. */
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
  const shape: TrackShape = retracePct >= 75 ? "out-and-back" : retracePct >= 25 ? "lollipop" : "loop";
  let broken: string | null = null;
  if (maxJump > 2) broken = `the track has a ${maxJump.toFixed(1)} km gap`;
  else if (/\bloop\b/i.test(name) && retracePct > 50) broken = `it is called a loop but ${retracePct}% of it rides the same roads twice`;
  return { shape, retracePct, maxJumpKm: Math.round(maxJump * 100) / 100, endsApartKm, broken };
}

/** "Loop", "Out and back · 94% ridden both ways", "Loop with an out-and-back section · 41% …". */
export function shapeLabel(c: TrackCheck): string {
  if (c.endsApartKm > 5) return "Point to point";
  if (c.shape === "loop") return "Loop";
  if (c.shape === "out-and-back") return `Out and back · ${c.retracePct}% ridden both ways`;
  return `Loop with an out-and-back section · ${c.retracePct}% ridden both ways`;
}
