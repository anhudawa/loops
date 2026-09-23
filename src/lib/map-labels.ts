/**
 * Town names for a route's preview map: the start town plus the largest
 * places the route actually passes (within ~2 km of the line). Server-only
 * (the named-places file is ~0.8 MB).
 */
import data from "@/data/place-names.json";

export interface MapLabel { name: string; lat: number; lng: number; pop: number; start: boolean }

type Row = [string, number, number, number];
const CELL = 0.1;
let grid: Map<string, Row[]> | null = null;

function index(): Map<string, Row[]> {
  if (grid) return grid;
  grid = new Map();
  for (const r of (data as unknown as { p: Row[] }).p) {
    const k = `${Math.floor(r[1] / 1e4 / CELL)}:${Math.floor(r[2] / 1e4 / CELL)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(r);
  }
  return grid;
}

function km(a: [number, number], b: [number, number]): number {
  const dy = (b[0] - a[0]) * 111.32, dx = (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Candidate places near the track, nearest-to-track distance attached. */
function nearTrack(coords: [number, number][], radiusKm: number): Map<string, { row: Row; d: number }> {
  const g = index();
  const found = new Map<string, { row: Row; d: number }>();
  let last: [number, number] | null = null;
  for (const p of coords) {
    if (last && km(last, p) < 0.8) continue; // sample ~ every 0.8 km
    last = p;
    const a = Math.floor(p[0] / CELL), b = Math.floor(p[1] / CELL);
    for (let i = a - 1; i <= a + 1; i++) for (let j = b - 1; j <= b + 1; j++) {
      for (const r of g.get(`${i}:${j}`) ?? []) {
        const d = km(p, [r[1] / 1e4, r[2] / 1e4]);
        if (d > radiusKm) continue;
        const key = `${r[0]}@${r[1]},${r[2]}`;
        const prev = found.get(key);
        if (!prev || d < prev.d) found.set(key, { row: r, d });
      }
    }
  }
  return found;
}

export function labelsForRoute(coords: [number, number][], max = 4): MapLabel[] {
  if (coords.length < 2) return [];
  const cands = [...nearTrack(coords, 2.2).values()];
  if (!cands.length) return [];
  const start = coords[0];
  const toLabel = (r: Row, isStart: boolean): MapLabel => ({ name: r[0], lat: r[1] / 1e4, lng: r[2] / 1e4, pop: r[3], start: isStart });
  const out: MapLabel[] = [];
  // Start town: the nearest named place within 3 km of the start.
  const startC = cands.map((c) => ({ ...c, ds: km(start, [c.row[1] / 1e4, c.row[2] / 1e4]) })).filter((c) => c.ds < 3).sort((a, b) => a.ds - b.ds)[0];
  if (startC) out.push(toLabel(startC.row, true));
  // Then places along the way, spread round the loop: each pick balances
  // size (log population) against distance from the labels already chosen,
  // so the far side of a loop gets a name too, not just the big towns near
  // the start.
  const minGapKm = 4;
  while (out.length < max) {
    let best: { row: Row; score: number } | null = null;
    for (const c of cands) {
      const p: [number, number] = [c.row[1] / 1e4, c.row[2] / 1e4];
      if (out.some((l) => l.name === c.row[0])) continue;
      const gap = out.length ? Math.min(...out.map((l) => km([l.lat, l.lng], p))) : 15;
      if (gap < minGapKm) continue;
      const score = Math.log10(c.row[3]) + 0.2 * Math.min(gap, 25);
      if (!best || score > best.score) best = { row: c.row, score };
    }
    if (!best) break;
    out.push(toLabel(best.row, false));
  }
  // Coverage: when part of the loop is far from every label (villages too
  // small to name), add the biggest town within 6 km of that part, as a map
  // would show it for reference.
  for (let round = 0; round < 2 && out.length < max + 1; round++) {
    let far: [number, number] | null = null, farD = 0;
    for (const p of coords) {
      const d = out.length ? Math.min(...out.map((l) => km([l.lat, l.lng], p))) : Infinity;
      if (d > farD) { farD = d; far = p; }
    }
    if (!far || farD < 12) break;
    const near = [...nearTrack([far], 6).values()]
      .filter((c) => !out.some((l) => l.name === c.row[0]))
      .sort((a, b) => b.row[3] - a.row[3])[0];
    if (!near) break;
    out.push(toLabel(near.row, false));
  }
  return out;
}
