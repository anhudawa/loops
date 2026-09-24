/**
 * The drawing in progress on /plan, kept on this device (localStorage, for
 * DRAFT_TTL_MS) so a nav tap, Back, a reload or a sign-in round-trip never
 * wipes it — including the magic link, which opens in a NEW tab (a
 * per-tab sessionStorage draft was lost there). Snapped legs come back
 * exactly as drawn — no re-routing, no different roads.
 */

import type { LatLng, PlanLeg } from "@/lib/plan-legs";

export const DRAFT_KEY = "loops:plan:draft";
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

/** The drawing before one edit — what Undo puts back. */
export interface PlanSnapshot {
  anchors: LatLng[];
  legs: PlanLeg[];
  loopLeg: PlanLeg | null;
  loopBack: boolean;
}

export interface PlanDraft {
  anchors: LatLng[];
  legs: PlanLeg[];
  loopLeg: PlanLeg | null;
  loopBack: boolean;
  discipline: string;
  at: number;
  /** Undo history, oldest first (a reload keeps Undo working). */
  undo?: PlanSnapshot[];
}

/** Undo steps kept with the draft (the page keeps more in memory). */
export const DRAFT_UNDO_KEEP = 20;

/**
 * Snapshots share most legs, so the stored history lists each leg once
 * (`pool`) and a snapshot names its legs by index there.
 */
type StoredSnapshot = { anchors: LatLng[]; legs: number[]; loopLeg: number | null; loopBack: boolean };

function packUndo(undo: PlanSnapshot[]): { pool: PlanLeg[]; steps: StoredSnapshot[] } {
  const pool: PlanLeg[] = [];
  const index = new Map<PlanLeg, number>();
  const ref = (l: PlanLeg) => {
    let i = index.get(l);
    if (i === undefined) { i = pool.length; pool.push(l); index.set(l, i); }
    return i;
  };
  const steps = undo.slice(-DRAFT_UNDO_KEEP).map((u) => ({
    anchors: u.anchors,
    legs: u.legs.map(ref),
    loopLeg: u.loopLeg ? ref(u.loopLeg) : null,
    loopBack: u.loopBack,
  }));
  return { pool, steps };
}

function unpackUndo(raw: unknown): PlanSnapshot[] {
  const r = raw as { pool?: unknown; steps?: unknown } | null;
  if (!r || !Array.isArray(r.pool) || !Array.isArray(r.steps) || !r.pool.every(isLeg)) return [];
  const pool = r.pool as PlanLeg[];
  const out: PlanSnapshot[] = [];
  for (const st of r.steps as StoredSnapshot[]) {
    if (!st || !Array.isArray(st.anchors) || !st.anchors.every(isLatLng) || !Array.isArray(st.legs)) return [];
    const legs = st.legs.map((i) => pool[i]);
    const loopLeg = st.loopLeg === null ? null : pool[st.loopLeg];
    if (legs.some((l) => !l) || loopLeg === undefined) return [];
    if (legs.length !== Math.max(0, st.anchors.length - 1)) return [];
    out.push({ anchors: st.anchors, legs, loopLeg, loopBack: st.loopBack !== false });
  }
  return out;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const isLatLng = (p: unknown): p is LatLng =>
  Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number";

function isLeg(l: unknown): l is PlanLeg {
  const v = l as PlanLeg;
  return !!v && typeof v.id === "number" && typeof v.seq === "number" &&
    isLatLng(v.from) && isLatLng(v.to) && Array.isArray(v.coords) &&
    typeof v.status === "string" && typeof v.distance_km === "number";
}

export function readDraft(s: StorageLike | null = store(), now = Date.now()): PlanDraft | null {
  try {
    const raw = s?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as PlanDraft;
    if (!d || typeof d.at !== "number" || now - d.at > DRAFT_TTL_MS) return null;
    if (!Array.isArray(d.anchors) || d.anchors.length === 0 || !d.anchors.every(isLatLng)) return null;
    if (!Array.isArray(d.legs) || !d.legs.every(isLeg)) return null;
    // One leg per pair of anchors, or the drawing is not what was left.
    if (d.legs.length !== Math.max(0, d.anchors.length - 1)) return null;
    if (d.loopLeg !== null && !isLeg(d.loopLeg)) return null;
    return {
      anchors: d.anchors,
      legs: d.legs,
      loopLeg: d.loopLeg,
      loopBack: d.loopBack !== false,
      discipline: typeof d.discipline === "string" ? d.discipline : "road",
      at: d.at,
      // A history that does not read back is dropped — never the drawing.
      undo: unpackUndo((d as unknown as { history?: unknown }).history),
    };
  } catch {
    return null;
  }
}

export function writeDraft(d: Omit<PlanDraft, "at">, s: StorageLike | null = store(), now = Date.now()): void {
  const { undo, ...drawing } = d;
  try {
    s?.setItem(DRAFT_KEY, JSON.stringify({ ...drawing, at: now, ...(undo?.length ? { history: packUndo(undo) } : {}) }));
  } catch {
    // Too big with the history (quota): keep the drawing without it.
    try {
      s?.setItem(DRAFT_KEY, JSON.stringify({ ...drawing, at: now }));
    } catch {
      /* quota / private mode — the drawing just isn't kept */
    }
  }
}

export function clearDraft(s: StorageLike | null = store()): void {
  try {
    s?.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
