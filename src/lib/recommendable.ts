/**
 * Which routes LOOPS may recommend (owner, 2026-09-24): an out-and-back
 * "with plenty of other alternative routes shouldn't be shown to anyone —
 * it stays in the rider's profile but never surfaces as a recommendation".
 * Cap de Formentor, where the only way there is out and back, is the
 * exception.
 *
 * recommend_status (routes column):
 *   ok            a loop (or lollipop) — recommend
 *   only-road     out-and-back, and the engine found no other sensible road
 *                 home — recommend (Formentor, a summit road)
 *   alternative   out-and-back although another road home exists — never
 *   unknown       out-and-back the engine could not check (no map data) — never
 *   broken        not fit to ride (checkTrack) — never
 *   null          not checked yet (lists then judge the shape themselves)
 */

import { checkTrack } from "./track-shape";

/** Stored verdicts that may be recommended. */
export const RECOMMENDABLE = new Set(["ok", "only-road"]);
/** Bump when the rule changes: stored verdicts from older rules are re-checked. */
export const RECOMMEND_RULES_VERSION = 1;
/** More than this share ridden twice = an out-and-back. */
export const OUT_AND_BACK_RETRACE_PCT = 50;

export type RecommendStatus = "ok" | "only-road" | "alternative" | "unknown" | "broken";

/** The shape part, from the track alone: ok, broken, or needs the engine. */
export function shapeVerdict(coords: [number, number][], name = ""): "ok" | "broken" | "out-and-back" {
  const t = checkTrack(coords, name);
  if (!t) return "broken";
  if (t.broken) return "broken";
  if (t.retracePct > OUT_AND_BACK_RETRACE_PCT) return "out-and-back";
  return "ok";
}

/**
 * For lists that load the track: may this route be recommended right now?
 * A stored engine verdict decides; without one, an out-and-back is held
 * back (unknown beats wrong) and a broken track never shows.
 */
export function recommendableNow(route: Record<string, unknown>): boolean {
  const stored = typeof route.recommend_status === "string" ? route.recommend_status : null;
  if (stored && !RECOMMENDABLE.has(stored)) return false;
  let coords: [number, number][];
  try {
    const raw = typeof route.coordinates === "string" ? JSON.parse(route.coordinates) : route.coordinates;
    if (!Array.isArray(raw) || raw.length < 3) return true; // no track here: the SQL gate decided
    coords = raw.map((c: number[]) => [Number(c[0]), Number(c[1])] as [number, number]);
  } catch {
    return true;
  }
  const shape = shapeVerdict(coords, String(route.name ?? ""));
  if (shape === "broken") return false;
  if (shape === "out-and-back") return stored === "only-road";
  return true;
}

/** The turnaround of an out-and-back: the track point farthest from the start. */
export function turnaround(coords: [number, number][]): [number, number] {
  const s = coords[0];
  let best = coords[coords.length - 1], bestD = -1;
  for (const p of coords) {
    const dy = p[0] - s[0], dx = (p[1] - s[1]) * Math.cos((s[0] * Math.PI) / 180);
    const d = dx * dx + dy * dy;
    if (d > bestD) { bestD = d; best = p; }
  }
  return best;
}
