"use client";

import { ENABLED_DISCIPLINES } from "@/config/constants";

/**
 * Map-first route planner — Strava-standard incremental legs.
 *
 * The route is an ordered list of LEGS, one per pair of anchors. When a
 * point is added we snap ONLY the new leg (previous anchor → new point)
 * via POST /api/reroute with exactly those two waypoints and append its
 * geometry — one small fast call per click, the route grows under the
 * cursor. Dragging an anchor re-snaps only its two adjacent legs;
 * dragging the MIDDLE of a leg inserts a via-point and re-snaps only the
 * two halves; removing one merges by re-snapping a single leg; the loop
 * toggle adds or removes a closing leg. The whole set is never re-routed.
 *
 * Totals (sum of legs) live in the toolbar and update the moment each
 * leg returns, alongside a live elevation profile that redraws per leg.
 * While a leg snaps, just that leg is a thin dashed straight line — the
 * rest of the route stays solid and real. The displayed solid polyline is
 * ALWAYS genuine snapped geometry.
 *
 * Honesty: anonymous users (401) draw dashed straight legs with running
 * straight-line distance and a persistent sign-in banner; a failed leg
 * keeps its dashed segment with a retry affordance; any unsnapped leg
 * marks the total "~" approximate; the elevation profile shows its empty
 * state rather than a faked flat line. Leg math lives in plan-legs.ts.
 *
 * Surface/way-type: deliberately NOT shown here. The per-leg /api/reroute
 * response carries no surface tags (surface_breakdown only comes from the
 * rate-limited whole-route Overpass scan), so per our honesty principle we
 * skip it rather than guess a paved/unpaved hint we can't stand behind.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ElevationProfile from "@/components/ElevationProfile";
import {
  haversineKm,
  legTotals,
  formatTotals,
  concatLegGeometry,
  legGeometryForChart,
  legHandlePoint,
  insertAnchorAtLeg,
  buildPlanGpx,
  type LatLng,
  type PlanLeg,
} from "@/lib/plan-legs";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@/lib/metrics";
import { locationIfAllowed, requestLocation } from "@/lib/location";
import LocationHelp from "@/components/LocationHelp";
import { describeCompromise, type Compromise } from "@/lib/road-segments";
import { useAuth } from "@/components/AuthProvider";
import { KNOWN_PLACES, lookupKnownPlace } from "@/lib/places-known";
import { readDraft, writeDraft, clearDraft, type PlanSnapshot } from "@/app/plan/plan-draft";
import { planCompromises, detourLegs, exportBlockedReason } from "@/app/plan/plan-checks";
import { gpxFileName, titleWithKm } from "@/lib/gpx-name";
import { retraceSummary } from "@/lib/track-shape";

interface RerouteResult {
  coordinates: [number, number][];
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m?: number | null;
  road_report?: {
    standard_met: boolean;
    compromises: Compromise[];
  };
  /** Road km ÷ straight-line km for the leg, when the server measures it. */
  detour_ratio?: number | null;
}

/** A leg plus what the planner keeps beside it (not stored in the draft's schema). */
type DrawnLeg = PlanLeg & { detour_ratio?: number | null };

type Discipline = "road" | "gravel" | "mtb";

const DUBLIN: LatLng = [53.35, -6.26];
const DEFAULT_ZOOM = 10;
/** Each leg is its own 2-waypoint call, so the old 10-waypoint API cap
 * no longer limits the route — this is purely a sanity ceiling. */
const MAX_POINTS = 50;

/** A small visible dot inside a transparent 44 × 44 px grab area — a thumb
 * that lands near the dot still gets the pin, not the map. */
function hitIcon(dot: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:grab">${dot}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

const anchorIcon = hitIcon(
  `<div style="width:14px;height:14px;border-radius:50%;background:#c8ff00;border:2.5px solid #0a0a0c;box-shadow:0 0 0 2px #c8ff00"></div>`
);

const startIcon = hitIcon(
  `<div style="width:16px;height:16px;border-radius:50%;background:#0a0a0c;border:3px solid #c8ff00;box-shadow:0 0 0 2px #0a0a0c"></div>`
);

/** Small hollow handle on the middle of a snapped leg — grab and drag it to
 * insert a via-point there (Strava's signature mid-leg reshape). */
const handleIcon = hitIcon(
  `<div style="width:11px;height:11px;border-radius:50%;background:#0a0a0c;border:2px solid #c8ff00;opacity:0.85"></div>`
);

/** The drawing as it stood before an edit — what Undo puts back (kept with the draft). */
type Snapshot = PlanSnapshot;
const MAX_UNDO = 50;

/**
 * A tap on a pin's popup ("Remove this point") must never also drop a new
 * pin where the button was: map clicks are ignored briefly after one.
 */
let ignoreMapClicksUntil = 0;
const POPUP_ACTION_GUARD_MS = 400;

function ClickToAdd({ onAdd }: { onAdd: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      if (Date.now() < ignoreMapClicksUntil) return;
      onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/** Tells the planner while a pin's popup is open (the live-distance chip makes way for it). */
function PopupWatch({ onChange }: { onChange: (open: boolean) => void }) {
  useMapEvents({
    popupopen() { onChange(true); },
    popupclose() { onChange(false); },
  });
  return null;
}

/** Pans to the rider's location once, if it arrives before they start drawing. */
/**
 * A route pin. Desktop: drag it. Phone: press and hold ~0.35 s — the pin
 * lifts (glow + buzz), the map stops panning, and it follows the finger
 * until released. A quick tap opens "Remove this point" (it used to delete
 * the pin outright, so a missed drag lost it).
 */
function AnchorMarker({ position, icon, onMove, onRemove }: {
  position: LatLng;
  icon: L.DivIcon | L.Icon;
  onMove: (p: LatLng) => void;
  onRemove: () => void;
}) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  useEffect(() => {
    if (!coarse) return;
    const m = markerRef.current;
    const el = m?.getElement();
    if (!m || !el) return;
    let timer: number | null = null;
    let lifted = false, moved = false, sx = 0, sy = 0;
    const point = (e: TouchEvent) => e.touches[0] ?? e.changedTouches[0];
    const start = (e: TouchEvent) => {
      const p = point(e); sx = p.clientX; sy = p.clientY; moved = false; lifted = false;
      timer = window.setTimeout(() => {
        lifted = true;
        map.dragging.disable();
        el.classList.add("pin-lifted");
        navigator.vibrate?.(15);
      }, 350);
    };
    const move = (e: TouchEvent) => {
      const p = point(e);
      if (!lifted) {
        if (timer && Math.hypot(p.clientX - sx, p.clientY - sy) > 8) { clearTimeout(timer); timer = null; }
        return;
      }
      e.preventDefault();
      moved = true;
      const r = map.getContainer().getBoundingClientRect();
      m.setLatLng(map.containerPointToLatLng([p.clientX - r.left, p.clientY - r.top]));
    };
    const end = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!lifted) return;
      lifted = false;
      el.classList.remove("pin-lifted");
      map.dragging.enable();
      setTimeout(() => m.closePopup(), 0); // the release is not a tap
      if (moved) { const ll = m.getLatLng(); onMoveRef.current([ll.lat, ll.lng]); }
    };
    el.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, [map, coarse]);

  return (
    <Marker
      ref={markerRef}
      position={position}
      draggable={!coarse}
      icon={icon}
      // Pins sit above the mid-leg handles, whose grab areas can overlap.
      zIndexOffset={1000}
      eventHandlers={{
        dragend: (e) => {
          const ll = (e.target as L.Marker).getLatLng();
          onMoveRef.current([ll.lat, ll.lng]);
        },
      }}
    >
      <Popup closeButton={false} className="pin-popup">
        <div ref={(el) => { if (el) L.DomEvent.disableClickPropagation(el); }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            ignoreMapClicksUntil = Date.now() + POPUP_ACTION_GUARD_MS;
            markerRef.current?.closePopup();
            onRemove();
          }}
          className="min-h-[44px] px-3 rounded-lg text-xs font-bold"
          style={{ background: "#f5a524", color: "#0a0a0a" }}
        >
          Remove this point
        </button>
        <p className="text-[11px] mt-1.5" style={{ color: "#b9bdb0" }}>{coarse ? "Press and hold a pin to move it." : "Drag a pin to move it."}</p>
        </div>
      </Popup>
    </Marker>
  );
}

/** Centres the map each time a new target is set (on load if allowed, or on "Use my location"). */
function RecenterOnce({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView(target, 12);
  }, [target, map]);
  return null;
}

/** At most two leg snaps in flight; the rest wait their turn. */
let snapsInFlight = 0;
const snapWaiters: Array<() => void> = [];
async function snapQueue<T>(run: () => Promise<T>): Promise<T> {
  while (snapsInFlight >= 2) await new Promise<void>((ok) => snapWaiters.push(ok));
  snapsInFlight++;
  try { return await run(); } finally { snapsInFlight--; snapWaiters.shift()?.(); }
}

export default function MapPlanner() {
  // A drawing left on this device (nav tap, Back, reload, sign-in in a new tab) comes back.
  const [draft] = useState(() => readDraft());
  const [anchors, setAnchors] = useState<LatLng[]>(draft?.anchors ?? []);
  /** legs[i] connects anchors[i] → anchors[i+1]. */
  const [legs, setLegs] = useState<PlanLeg[]>(draft?.legs ?? []);
  /** Closing leg (last anchor → first anchor) when loop is on. */
  const [loopLeg, setLoopLeg] = useState<PlanLeg | null>(draft?.loopLeg ?? null);
  const [discipline, setDiscipline] = useState<Discipline>(
    (ENABLED_DISCIPLINES as readonly string[]).includes(draft?.discipline ?? "") ? (draft!.discipline as Discipline) : "road"
  );
  const [loopBack, setLoopBack] = useState(draft?.loopBack ?? true);
  const [undoStack, setUndoStack] = useState<Snapshot[]>(draft?.undo ?? []);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [resnapNote, setResnapNote] = useState<string | null>(null);
  const [geoCenter, setGeoCenter] = useState<LatLng | null>(null);
  /** Where the rider is (shown as a dot once they share it). */
  const [here, setHere] = useState<LatLng | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeMiss, setPlaceMiss] = useState<string | null>(null);
  /** Place search opened again mid-drawing (it folds to an icon once a pin is down). */
  const [searchOpen, setSearchOpen] = useState(false);
  /** Save asks for a name first (prefilled); null = not naming. */
  const [naming, setNaming] = useState<string | null>(null);
  const [locBlocked, setLocBlocked] = useState(false);
  const [locating, setLocating] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [allCompromisesShown, setAllCompromisesShown] = useState(false);
  // On a phone the elevation panel + controls left the map as a thin strip
  // mid-draw, so it starts collapsed there (one tap to open) and is shorter.
  const compact = typeof window !== "undefined" && window.innerWidth < 768;
  const [showProfile, setShowProfile] = useState(!compact);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Why a tap on Save/GPX did nothing yet (cleared as soon as the drawing changes). */
  const [blockedNote, setBlockedNote] = useState<string | null>(null);

  const router = useRouter();
  const { user, loading: authLoading, authError } = useAuth();
  const signedOut = !authLoading && !user && !authError;

  const legIdRef = useRef(0);
  const seqRef = useRef(0);
  const needsAuthRef = useRef(false);
  const anchorsRef = useRef(anchors);
  anchorsRef.current = anchors;
  const legsRef = useRef(legs);
  legsRef.current = legs;
  const loopLegRef = useRef(loopLeg);
  loopLegRef.current = loopLeg;
  const loopBackRef = useRef(loopBack);
  loopBackRef.current = loopBack;
  const savedRef = useRef(false);
  // Snapped geometry per leg, written synchronously when a snap lands, so a
  // leg routed right after another can avoid its roads before React renders.
  const snappedCoordsRef = useRef(new Map<number, LatLng[]>());
  const recentLegIdsRef = useRef(new Map<number, number>()); // id → created at
  const snapDoneRef = useRef(new Map<number, Promise<void>>());

  /** Roads the rest of the route already uses (other legs' snapped geometry). */
  /** The last stretch of the snapped leg that ends at `point` (none for the start). */
  function arrivingAt(point: LatLng, exceptId: number): LatLng[] | undefined {
    const all = [...legsRef.current, ...(loopLegRef.current ? [loopLegRef.current] : [])];
    const leg = all.find((l) => l.id !== exceptId && l.status === "snapped" &&
      Math.abs(l.to[0] - point[0]) < 1e-5 && Math.abs(l.to[1] - point[1]) < 1e-5);
    return leg && leg.coords.length >= 2 ? leg.coords.slice(-150) : undefined;
  }

  function roadsInUse(exceptId: number): LatLng[][] {
    const live = new Set<number>([...legsRef.current.map((l) => l.id), ...(loopLegRef.current ? [loopLegRef.current.id] : [])]);
    const now = Date.now();
    for (const [id, at] of recentLegIdsRef.current) {
      if (now - at < 15_000) live.add(id); else recentLegIdsRef.current.delete(id);
    }
    const out: LatLng[][] = [];
    for (const [id, c] of snappedCoordsRef.current) {
      if (!live.has(id)) { snappedCoordsRef.current.delete(id); continue; }
      if (id !== exceptId && c.length > 2) out.push(c);
    }
    return out;
  }

  // Centre on the rider only if location is already allowed (or cached) —
  // never prompt on load; silently fall back to Dublin.
  useEffect(() => {
    let cancelled = false;
    locationIfAllowed().then((p) => {
      if (cancelled || !p) return;
      setHere([p.lat, p.lng]);
      // Don't yank the map away if they've already started drawing.
      if (anchorsRef.current.length === 0) setGeoCenter([p.lat, p.lng]);
    });
    return () => { cancelled = true; };
  }, []);

  // Signed out: say so before the first tap (legs stay straight lines until
  // sign-in), instead of promising snapped legs and then drawing straight.
  useEffect(() => {
    if (signedOut) {
      needsAuthRef.current = true;
      setNeedsAuth(true);
    }
  }, [signedOut]);

  // A kept drawing: its snapped legs are back as they were; anything that
  // was mid-snap (or straight because signed out) is snapped now.
  useEffect(() => {
    if (!draft) return;
    const all = [...draft.legs, ...(draft.loopLeg ? [draft.loopLeg] : [])];
    // Legs only in the undo history still own their ids (Undo brings them back).
    const kept = [...all, ...(draft.undo ?? []).flatMap((u) => [...u.legs, ...(u.loopLeg ? [u.loopLeg] : [])])];
    legIdRef.current = Math.max(legIdRef.current, ...kept.map((l) => l.id));
    seqRef.current = Math.max(seqRef.current, ...kept.map((l) => l.seq));
    for (const l of all) {
      if (l.status === "snapped") snappedCoordsRef.current.set(l.id, l.coords);
      else if (l.status === "pending" || l.status === "straight") void resnapLeg(l, l.from, l.to, discipline);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the drawing on this device while it changes (plan-draft.ts).
  useEffect(() => {
    if (savedRef.current) return;
    if (anchors.length === 0) clearDraft();
    else writeDraft({ anchors, legs, loopLeg, loopBack, discipline, undo: undoStack });
  }, [anchors, legs, loopLeg, loopBack, discipline, undoStack]);

  // Closing the tab with an unsaved drawing asks first.
  const hasDrawing = anchors.length > 0;
  useEffect(() => {
    if (!hasDrawing) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (savedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDrawing]);

  // ── Per-leg snapping ───────────────────────────────────────────────────────

  /** Apply a result to the leg with this id, only if seq is still current. */
  function applyLegResult(id: number, seq: number, patch: Partial<DrawnLeg>) {
    if (patch.status === "snapped" && patch.coords) snappedCoordsRef.current.set(id, patch.coords as LatLng[]);
    else if (patch.status && patch.status !== "pending") snappedCoordsRef.current.delete(id);
    setLegs((prev) =>
      prev.map((l) => (l.id === id && l.seq === seq ? { ...l, ...patch } : l))
    );
    setLoopLeg((prev) =>
      prev && prev.id === id && prev.seq === seq ? { ...prev, ...patch } : prev
    );
  }

  function straightPatch(from: LatLng, to: LatLng): Partial<PlanLeg> {
    return {
      coords: [from, to],
      elevations: [],
      distance_km: Math.round(haversineKm(from, to) * 10) / 10,
      gain_m: 0,
      loss_m: 0,
    };
  }

  /** One small call: snap a single leg (exactly 2 waypoints). */
  async function performSnap(
    id: number,
    seq: number,
    from: LatLng,
    to: LatLng,
    disc: Discipline
  ): Promise<void> {
    try {
      // Queued (two legs at a time) and retried quietly on a busy/rate-limited
      // answer, so tapping out a loop quickly never leaves dashed legs.
      const res = await snapQueue(async () => {
        let r: Response | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt) await new Promise((ok) => setTimeout(ok, [0, 1500, 4000, 8000][attempt]));
          r = await fetch("/api/reroute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Avoid the roads the rest of the route already uses, so a stop
            // like Blessington becomes part of a loop, not an out-and-back.
            // …and the end of the leg arriving at `from`, so a pin in a town
            // is ridden through, not turned round at (Ashbourne).
            body: JSON.stringify({ waypoints: [from, to], discipline: disc, avoid: roadsInUse(id), arrive: arrivingAt(from, id) }),
          }).catch(() => null);
          if (r && (r.ok || r.status === 401 || r.status === 400 || r.status === 422)) break;
        }
        return r ?? new Response(null, { status: 503 });
      });
      const body = await res.json().catch(() => null);
      if (res.status === 401) {
        needsAuthRef.current = true;
        setNeedsAuth(true);
        applyLegResult(id, seq, { ...straightPatch(from, to), status: "straight" });
        return;
      }
      if (!res.ok) {
        applyLegResult(id, seq, {
          ...straightPatch(from, to),
          status: "failed",
          error:
            body?.error ?? "Couldn't route that leg — tap it to retry, or move the pin to a road.",
        });
        return;
      }
      const data = body.data as RerouteResult;
      applyLegResult(id, seq, {
        coords: data.coordinates.map(([lat, lng]) => [lat, lng] as LatLng),
        elevations: data.elevations,
        distance_km: data.distance_km,
        gain_m: data.elevation_gain_m,
        loss_m: typeof data.elevation_loss_m === "number" ? data.elevation_loss_m : 0,
        status: "snapped",
        error: undefined,
        standard_met: data.road_report?.standard_met,
        compromises: data.road_report?.compromises ?? [],
        detour_ratio: typeof data.detour_ratio === "number" ? data.detour_ratio : undefined,
      });
    } catch {
      applyLegResult(id, seq, {
        ...straightPatch(from, to),
        status: "failed",
        error: "Network hiccup on that leg — tap it to retry.",
      });
    }
  }

  /** Build a new leg and kick off its snap (or keep it straight if anonymous). */
  function makeLeg(from: LatLng, to: LatLng, disc: Discipline, after?: Promise<void>): PlanLeg {
    const id = ++legIdRef.current;
    const seq = ++seqRef.current;
    recentLegIdsRef.current.set(id, Date.now());
    const anonymous = needsAuthRef.current;
    const newLeg: PlanLeg = {
      id,
      seq,
      from,
      to,
      ...straightPatch(from, to),
      status: anonymous ? "straight" : "pending",
    } as PlanLeg;
    if (!anonymous) {
      const run = () => performSnap(id, seq, from, to, disc);
      snapDoneRef.current.set(id, after ? after.then(run, run) : run());
    }
    return newLeg;
  }

  /** Re-snap an existing leg in place (drag / retry / discipline change). */
  function resnapLeg(legToSnap: PlanLeg, from: LatLng, to: LatLng, disc: Discipline, after?: Promise<void>): Promise<void> {
    const seq = ++seqRef.current;
    const anonymous = needsAuthRef.current;
    const patch: Partial<PlanLeg> = {
      seq,
      from,
      to,
      ...straightPatch(from, to),
      status: anonymous ? "straight" : "pending",
      error: undefined,
    };
    setLegs((prev) => prev.map((l) => (l.id === legToSnap.id ? { ...l, ...patch } : l)));
    setLoopLeg((prev) => (prev && prev.id === legToSnap.id ? { ...prev, ...patch } : prev));
    if (anonymous) return Promise.resolve();
    const run = () => performSnap(legToSnap.id, seq, from, to, disc);
    const p = after ? after.then(run, run) : run();
    snapDoneRef.current.set(legToSnap.id, p);
    return p;
  }

  // ── Undo: every edit is a step back ────────────────────────────────────────

  /** Remember the drawing as it is now, before an edit changes it. */
  function remember() {
    const snap: Snapshot = {
      anchors: anchorsRef.current,
      legs: legsRef.current,
      loopLeg: loopLegRef.current,
      loopBack: loopBackRef.current,
    };
    setUndoStack((st) => [...st.slice(-(MAX_UNDO - 1)), snap]);
  }

  /** Put back the drawing before the last edit — pins, legs, loop and all. */
  function undo() {
    const snap = undoStack[undoStack.length - 1];
    if (!snap) return;
    setUndoStack((st) => st.slice(0, -1));
    setAnchors(snap.anchors);
    setLegs(snap.legs);
    setLoopLeg(snap.loopLeg);
    setLoopBack(snap.loopBack);
    setError(null);
    setSaveError(null);
    // Snapped legs come back as they were; a leg that was still snapping
    // when the snapshot was taken is snapped again.
    for (const l of [...snap.legs, ...(snap.loopLeg ? [snap.loopLeg] : [])]) {
      recentLegIdsRef.current.set(l.id, Date.now());
      if (l.status === "snapped") snappedCoordsRef.current.set(l.id, l.coords);
      else if (l.status === "pending" || (l.status === "straight" && !needsAuthRef.current)) {
        void resnapLeg(l, l.from, l.to, discipline);
      }
    }
  }

  // ── Anchor operations (all incremental — never re-route the whole set) ────

  function addAnchor(latlng: LatLng) {
    const current = anchorsRef.current;
    if (current.length >= MAX_POINTS) {
      setError(`Maximum of ${MAX_POINTS} points — drag a pin to fine-tune instead.`);
      return;
    }
    remember();
    setError(null);
    const prev = current[current.length - 1];
    setAnchors([...current, latlng]);
    if (!prev) return; // first anchor — no leg yet
    // Snap ONLY the new leg and append it (makeLeg starts the fetch, so
    // keep it out of the setState updater — updaters can run twice).
    const newLeg = makeLeg(prev, latlng, discipline);
    setLegs((ls) => [...ls, newLeg]);
    // The closing leg now starts from the new last anchor.
    if (loopBack) {
      // The way home waits for the new leg, so it can avoid that road.
      const first = current[0];
      const existing = loopLegRef.current;
      const newDone = snapDoneRef.current.get(newLeg.id);
      if (existing) {
        void resnapLeg(existing, latlng, first, discipline, newDone);
      } else {
        setLoopLeg(makeLeg(latlng, first, discipline, newDone));
      }
    }
  }

  function moveAnchor(idx: number, latlng: LatLng) {
    remember();
    const current = anchorsRef.current;
    const next = current.map((p, i) => (i === idx ? latlng : p)) as LatLng[];
    setAnchors(next);
    const currentLegs = legsRef.current;
    // Re-snap ONLY the two adjacent legs.
    if (idx > 0 && currentLegs[idx - 1]) {
      void resnapLeg(currentLegs[idx - 1], next[idx - 1], latlng, discipline);
    }
    if (idx < currentLegs.length && currentLegs[idx]) {
      void resnapLeg(currentLegs[idx], latlng, next[idx + 1], discipline);
    }
    const loop = loopLegRef.current;
    if (loop) {
      if (idx === 0) void resnapLeg(loop, next[next.length - 1], latlng, discipline);
      else if (idx === next.length - 1) void resnapLeg(loop, latlng, next[0], discipline);
    }
  }

  /**
   * Mid-leg reshape (Strava's signature edit): a via-point dropped on the
   * line splits exactly that leg into two and re-snaps ONLY those two. Every
   * other leg is untouched — our per-leg model makes the non-destructive
   * behaviour Strava had to rebuild structurally free.
   *
   * `legIndex` in [0, legs.length-1] is a normal leg; `legIndex === legs.length`
   * is the closing loop leg (last anchor → first anchor), which becomes a new
   * trailing leg plus a re-snapped loop back to the start.
   */
  function insertViaInLeg(legIndex: number, via: LatLng) {
    const current = anchorsRef.current;
    const currentLegs = legsRef.current;
    if (current.length >= MAX_POINTS) {
      setError(`Maximum of ${MAX_POINTS} points — drag a pin to fine-tune instead.`);
      return;
    }
    const closing = legIndex === currentLegs.length && !!loopLegRef.current;
    if (legIndex < 0 || (legIndex >= currentLegs.length && !closing)) return;
    remember();
    setError(null);

    const loop = loopLegRef.current;
    // Closing-leg handle: append the via as a new last anchor.
    if (loop && legIndex === currentLegs.length) {
      const last = current[current.length - 1];
      const first = current[0];
      setAnchors([...current, via]);
      const newLeg = makeLeg(last, via, discipline); // last → via (real leg)
      setLegs((ls) => [...ls, newLeg]);
      void resnapLeg(loop, via, first, discipline); // via → first (loop)
      return;
    }

    if (legIndex < 0 || legIndex >= currentLegs.length) return;
    const a = current[legIndex];
    const b = current[legIndex + 1];
    setAnchors(insertAnchorAtLeg(current, legIndex, via));
    // Replace the single leg with two fresh, independently-snapped legs.
    const first = makeLeg(a, via, discipline);
    const second = makeLeg(via, b, discipline);
    setLegs((ls) => [
      ...ls.slice(0, legIndex),
      first,
      second,
      ...ls.slice(legIndex + 1),
    ]);
  }

  function removeAnchor(idx: number) {
    remember();
    const current = anchorsRef.current;
    const next = current.filter((_, i) => i !== idx);
    setAnchors(next);
    setError(null);
    if (next.length < 2) {
      // Not enough anchors for any leg.
      setLegs([]);
      setLoopLeg(null);
      return;
    }
    const currentLegs = legsRef.current;
    const loop = loopLegRef.current;
    if (idx === 0) {
      // Drop the first leg; the closing leg now ends at the new first anchor.
      setLegs(currentLegs.slice(1));
      if (loop) void resnapLeg(loop, next[next.length - 1], next[0], discipline);
    } else if (idx === current.length - 1) {
      // Drop the last leg; the closing leg now starts at the new last anchor.
      setLegs(currentLegs.slice(0, -1));
      if (loop) void resnapLeg(loop, next[next.length - 1], next[0], discipline);
    } else {
      // Interior anchor: merge its two legs by re-snapping ONE new leg.
      const merged = makeLeg(current[idx - 1], current[idx + 1], discipline);
      setLegs([...currentLegs.slice(0, idx - 1), merged, ...currentLegs.slice(idx + 1)]);
    }
  }

  function toggleLoop() {
    remember();
    const next = !loopBack;
    setLoopBack(next);
    const current = anchorsRef.current;
    if (next && current.length >= 2) {
      setLoopLeg(makeLeg(current[current.length - 1], current[0], discipline));
    } else {
      setLoopLeg(null);
    }
  }

  /** Changing discipline re-snaps every leg sequentially with a progress note. */
  async function pickDiscipline(d: Discipline) {
    if (d === discipline || resnapNote) return;
    setDiscipline(d);
    if (needsAuthRef.current) return; // straight legs — nothing to re-snap
    const all = [...legsRef.current, ...(loopLegRef.current ? [loopLegRef.current] : [])];
    if (all.length === 0) return;
    for (let i = 0; i < all.length; i++) {
      setResnapNote(`Re-snapping for ${d} — leg ${i + 1} of ${all.length}…`);
      await resnapLeg(all[i], all[i].from, all[i].to, d);
    }
    setResnapNote(null);
  }

  // A leg that failed (engine busy, a pin off the road network) is retried
  // once on its own as soon as nothing else is snapping — the rider should
  // not have to spot a dashed line and tap Retry.
  const autoRetriedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const all = [...legs, ...(loopLeg ? [loopLeg] : [])];
    if (all.some((l) => l.status === "pending")) return;
    const t = setTimeout(() => {
      for (const l of all) {
        if (l.status === "failed" && !autoRetriedRef.current.has(l.id)) {
          autoRetriedRef.current.add(l.id);
          void resnapLeg(l, l.from, l.to, discipline);
        }
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs, loopLeg]);

  function retryFailedLegs() {
    const all = [...legsRef.current, ...(loopLegRef.current ? [loopLegRef.current] : [])];
    for (const l of all) {
      if (l.status === "failed") void resnapLeg(l, l.from, l.to, discipline);
    }
  }

  function retryLeg(id: number) {
    const all = [...legsRef.current, ...(loopLegRef.current ? [loopLegRef.current] : [])];
    const l = all.find((x) => x.id === id);
    if (l && l.status === "failed") void resnapLeg(l, l.from, l.to, discipline);
  }

  function clearAll() {
    if (anchorsRef.current.length > 0 && !window.confirm("Clear the whole route?")) return;
    remember(); // Undo brings it back
    snappedCoordsRef.current.clear();
    recentLegIdsRef.current.clear();
    seqRef.current++;
    setAnchors([]);
    setLegs([]);
    setLoopLeg(null);
    setError(null);
    setResnapNote(null);
    setSaveError(null);
    setNaming(null);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const allLegs = [...legs, ...(loopLeg ? [loopLeg] : [])];
  const totals = legTotals(allLegs);
  const snapping = allLegs.some((l) => l.status === "pending");
  const failedCount = allLegs.filter((l) => l.status === "failed").length;
  const allSnapped = allLegs.length > 0 && allLegs.every((l) => l.status === "snapped");
  // The reason a blocked tap gave is stale once the drawing moves on.
  useEffect(() => { setBlockedNote(null); }, [allSnapped, anchors.length, needsAuth, failedCount]);
  // Road Standard across the drawn route (trust rule: a compromise is shown
  // while drawing, never discovered on the road).
  const standardKnown = allSnapped && allLegs.every((l) => l.standard_met !== undefined);
  // Worst first (a fast N-road before a long quiet primary); "near the
  // start" measured from the ride's start, not each leg's own ends.
  const compromises = planCompromises(allLegs, anchors, !!loopLeg);
  // The same road twice (two pins with Loop back on is an out-and-back):
  // measured on the whole snapped ride, as stored tracks are.
  const retrace = useMemo(
    () => (allSnapped ? retraceSummary(concatLegGeometry(allLegs).coords) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [legs, loopLeg, allSnapped]
  );
  const longWayLegs = allSnapped ? detourLegs(allLegs as DrawnLeg[]) : [];

  // Live elevation profile: rebuild the [lat,lng,ele] track whenever a leg's
  // geometry changes. ElevationProfile renders its own empty state when the
  // route carries no real elevation (anonymous / unsnapped), so we never fake
  // a flat line.
  const profileCoords = useMemo(() => legGeometryForChart(allLegs), [allLegs]);
  const hasElevation = useMemo(
    () => profileCoords.length >= 2 && profileCoords.some((c) => c[2] !== 0),
    [profileCoords]
  );
  /** The Road Standard is met, said in the elevation row (a strip of its own only when there is a compromise). */
  const roadStandardClean = standardKnown && compromises.length === 0 && hasElevation;

  async function downloadGpx() {
    // Signed out: the banner above already says why — the tap goes to sign
    // in (the drawing is kept) instead of stacking a second banner.
    if (needsAuth && anchors.length > 0) { window.location.href = "/login?redirect=/plan"; return; }
    const blocked = exportBlockedReason({ anchors: anchors.length, needsAuth, snapping, failed: failedCount, allSnapped }, "export");
    if (blocked) { setBlockedNote(blocked); return; }
    const { coords, elevations } = concatLegGeometry(allLegs);
    // The same place name Save suggests (what the Garmin shows); the generic
    // name only when the town list cannot answer.
    const name = (await Promise.race([placeTitle(), new Promise<null>((r) => setTimeout(() => r(null), 2000))])) ?? suggestedName;
    const gpx = buildPlanGpx(coords, elevations, name, discipline);
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gpxFileName(name);
    a.click();
    URL.revokeObjectURL(url);
    // Funnel: a drawn route was exported (client-side GPX + draw milestone).
    track(ANALYTICS_EVENTS.GPX_DOWNLOADED, { source: "draw" });
    track(ANALYTICS_EVENTS.PLAN_DRAWN, { via: "download", distance_km: totals.distance_km });
  }

  const suggestedName = `Planned ${discipline} route — ${totals.distance_km.toFixed(1)} km`;
  // The rider's title for the drawn route — "Clontarf – Raheny – Clontarf ·
  // 10.7 km", the toolbar's distance — from the server's town list. Asked
  // once per finished drawing and shared by Save and GPX; null when it
  // cannot answer.
  const titleKey = allSnapped
    ? `${totals.distance_km}|${anchors.map((a) => a.join(",")).join(";")}|${loopLeg ? 1 : 0}`
    : null;
  const titleRef = useRef<{ key: string; title: Promise<string | null> } | null>(null);
  function placeTitle(): Promise<string | null> {
    if (!titleKey) return Promise.resolve(null);
    if (titleRef.current?.key === titleKey) return titleRef.current.title;
    const coords = legGeometryForChart(allLegs).map((p) => [p[0], p[1]] as LatLng);
    const km = totals.distance_km.toFixed(1);
    const title: Promise<string | null> = coords.length < 2
      ? Promise.resolve(null)
      : fetch("/api/route-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coordinates: coords, distance_km: totals.distance_km }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => (typeof j?.data?.title === "string" ? titleWithKm(j.data.title, km) : null))
          .catch(() => null);
    titleRef.current = { key: titleKey, title };
    return title;
  }
  // Ready before the rider taps GPX (a download started long after the tap
  // can be blocked on a phone).
  useEffect(() => {
    if (titleKey) void placeTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleKey]);

  // Save asks for a name prefilled with that title; the generic name shows
  // only until it answers (or if it can't).
  function openNaming() {
    // Signed out: the banner above already says why — the tap goes to sign
    // in (the drawing is kept) instead of stacking a second banner.
    if (needsAuth && anchors.length > 0) { window.location.href = "/login?redirect=/plan"; return; }
    const blocked = exportBlockedReason({ anchors: anchors.length, needsAuth, snapping, failed: failedCount, allSnapped }, "save");
    if (blocked) { setBlockedNote(blocked); return; }
    setSaveError(null);
    setNaming(suggestedName);
    void placeTitle().then((title) => {
      if (title) setNaming((cur) => (cur === suggestedName ? title : cur));
    });
  }

  /** Save the drawn route to the rider's library, then open its detail page.
   * Same payload shape /generate posts; sign-in is gated by the 401 the
   * endpoint returns (we surface the existing sign-in banner, never lie). */
  async function saveRoute() {
    if (!allSnapped || saving) return;
    setSaving(true);
    setSaveError(null);
    const { coords, elevations } = concatLegGeometry(allLegs);
    const cleanElevations = elevations.map((e) => (Number.isNaN(e) ? 0 : e));
    const name = (naming ?? "").trim().slice(0, 80) || suggestedName;
    try {
      const res = await fetch("/api/routes/from-generated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: "Drawn on the LOOPS map planner",
          coordinates: coords,
          elevations: cleanElevations,
          distance_km: totals.distance_km,
          elevation_gain_m: totals.gain_m,
          elevation_loss_m: totals.loss_m,
          discipline,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // Anonymous — reuse the persistent sign-in banner, don't pretend to save.
        needsAuthRef.current = true;
        setNeedsAuth(true);
        setSaveError("Sign in to save this route to your library.");
        return;
      }
      if (!res.ok) {
        setSaveError(body?.error ?? "Couldn't save that route — try again.");
        return;
      }
      const id = body?.data?.id;
      // Funnel: drawn route saved (server records ROUTE_SAVED; this marks the
      // draw milestone specifically). Pass source so ROUTE_SAVED is separable.
      track(ANALYTICS_EVENTS.PLAN_DRAWN, { via: "save", distance_km: totals.distance_km });
      // Saved: the kept drawing has done its job.
      savedRef.current = true;
      clearDraft();
      setNaming(null);
      if (id) router.push(`/routes/${id}`);
      else setSaveError("Saved, but couldn't open the route page.");
    } catch {
      setSaveError("Network hiccup while saving — try again.");
    } finally {
      setSaving(false);
    }
  }

  /** "Go to a place": the launch destinations and home towns we know. */
  function goToPlace(e: { preventDefault: () => void }) {
    e.preventDefault();
    const q = placeQuery.trim();
    if (!q) return;
    const hit = lookupKnownPlace(q);
    if (hit) {
      setGeoCenter([hit.point[0], hit.point[1]]);
      setPlaceQuery("");
      setSearchOpen(false);
      setPlaceMiss(null);
    } else {
      setPlaceMiss(`We don't know "${q}" yet — pan the map there, or pick a place from the list.`);
    }
  }

  const coarsePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  // A kept drawing opens framed on its pins; otherwise Dublin until located.
  const [initialView] = useState(() =>
    draft && draft.anchors.length >= 2
      ? { bounds: L.latLngBounds(draft.anchors).pad(0.15) }
      : { center: draft?.anchors[0] ?? DUBLIN, zoom: draft ? 12 : DEFAULT_ZOOM }
  );

  return (
    <div className="flex flex-col" style={{ height: "100%", background: "var(--bg)" }}>
      {/* Planner toolbar — totals always visible, Undo is the hero control */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 border-b z-20"
        style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}
      >
        <span className="text-lg font-extrabold tabular-nums whitespace-nowrap" style={{ color: "var(--text)" }}>
          {formatTotals(totals)}
        </span>
        {snapping && (
          <span className="text-xs" style={{ color: "var(--accent)" }}>snapping…</span>
        )}
        {resnapNote && (
          <span className="text-xs" style={{ color: "var(--accent)" }}>{resnapNote}</span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={undo}
          disabled={undoStack.length === 0}
          aria-label="Undo the last change"
          className="px-4 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-40"
          style={{
            minHeight: 44,
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text)",
          }}
        >
          ↩ Undo
        </button>
      </div>

      {/* Banners */}
      {needsAuth && (
        // One slim row beside the Log in link: on a phone every line here is map lost.
        <p className="px-4 py-0.5 text-xs z-20 flex items-center gap-2" style={{ background: "rgba(200,255,0,0.08)", color: "var(--text-secondary)" }}>
          <span className="flex-1 min-w-0">
            <span className="font-bold" style={{ color: "var(--accent)" }}>Sign in to snap to roads</span>
            {" "}— straight lines until then; your drawing is kept.
          </span>
          <Link
            href="/login?redirect=/plan"
            className="inline-flex items-center min-h-[44px] px-1 font-bold underline shrink-0"
            style={{ color: "var(--accent)" }}
          >
            Log in →
          </Link>
        </p>
      )}
      {blockedNote && (
        <p className="px-4 py-2 text-xs z-20" style={{ background: "rgba(245,165,36,0.1)", color: "#f5a524" }} role="status" data-testid="plan-blocked">
          {blockedNote}
        </p>
      )}
      {failedCount > 0 && (
        <p className="px-4 py-2 text-xs z-20 flex items-center gap-2" style={{ background: "rgba(255,80,80,0.1)", color: "#ff6b6b" }}>
          <span>
            {failedCount === 1 ? "One leg" : `${failedCount} legs`} couldn&apos;t snap — shown dashed as straight lines (total is approximate).
            {/* Why, in the engine's words: busy, rate-limited, or a pin off the roads. */}
            {(() => { const why = allLegs.find((l) => l.status === "failed")?.error; return why ? <span className="block opacity-90">{why}</span> : null; })()}
          </span>
          <button
            type="button"
            onClick={retryFailedLegs}
            className="min-h-[44px] px-3 rounded-lg font-bold underline shrink-0"
            style={{ color: "#ff6b6b" }}
          >
            Retry
          </button>
        </p>
      )}
      {saveError && (
        <p className="px-4 py-2 text-xs z-20" style={{ background: "rgba(255,80,80,0.1)", color: "#ff6b6b" }}>
          {saveError}
        </p>
      )}
      {error && (
        <p className="px-4 py-2 text-xs z-20" style={{ background: "rgba(255,80,80,0.1)", color: "#ff6b6b" }}>
          {error}
        </p>
      )}

      {/* Map */}
      <div className="relative flex-1 min-h-[300px] md:min-h-[420px]">
        <MapContainer
          {...initialView}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
          // Every tap is a pin: two quick taps are two points, not a zoom
          // (zoom stays on +/−, pinch and the wheel).
          doubleClickZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterOnce target={geoCenter} />
          <PopupWatch onChange={setPopupOpen} />
          {/* Hidden while a pin's popup is open: on a phone the chip (z 1000)
              sat over "Remove this point". */}
          {allLegs.length > 0 && !popupOpen && !searchOpen && (
            // Live distance where the eyes are while plotting: every tap
            // updates it (straight-line until a leg snaps, marked "~").
            <div className="leaflet-top w-full flex justify-center pointer-events-none" style={{ zIndex: 1000 }}>
              <div
                className="mt-2 px-3 py-1.5 rounded-xl text-center shadow-lg"
                style={{ background: "rgba(10,10,10,0.88)", border: "1px solid var(--border)" }}
                role="status"
                aria-live="polite"
                data-testid="plan-live-distance"
              >
                <span className="block text-xl font-extrabold tabular-nums leading-tight" style={{ color: "var(--accent)" }}>
                  {totals.approx ? "~" : ""}{totals.distance_km.toFixed(1)} km
                </span>
                <span className="block text-[11px] tabular-nums" style={{ color: "#d4d4d4" }}>
                  {needsAuth ? "climb after sign-in" : totals.approx && totals.gain_m === 0 ? "climb unknown" : `+${totals.gain_m} m`}{loopLeg ? ` · incl. ${loopLeg.distance_km.toFixed(1)} km back to start` : ""}
                </span>
              </div>
            </div>
          )}
          {/* You are here — not interactive, so a tap on it drops a point there. */}
          {here && (
            <CircleMarker
              center={here}
              radius={8}
              interactive={false}
              pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#3b82f6", fillOpacity: 1 }}
            />
          )}
          <ClickToAdd onAdd={addAnchor} />
          {/* Each leg renders itself: solid = genuine snapped geometry,
              dashed = pending / failed / anonymous straight line. */}
          {/* Dark casing first, the line on top: neon on a light map needs an
              edge to stand out. */}
          {allLegs.map((l) => (
            <Polyline
              key={`casing-${l.id}-${l.status}`}
              positions={l.status === "snapped" ? l.coords : [l.from, l.to]}
              interactive={false}
              pathOptions={{ color: "#0a0a0a", weight: l.status === "snapped" ? 9 : 6, opacity: l.status === "snapped" ? 0.85 : 0.5 }}
            />
          ))}
          {allLegs.map((l) =>
            l.status === "snapped" ? (
              // Keyed by status: Leaflet keeps a dash pattern across a style
              // update, so a leg that snapped must be a fresh, solid line.
              <Polyline
                key={`${l.id}-snapped`}
                positions={l.coords}
                pathOptions={{ color: "#c8ff00", weight: 5, opacity: 1, dashArray: undefined }}
              />
            ) : (
              <Polyline
                key={`${l.id}-${l.status}`}
                positions={[l.from, l.to]}
                pathOptions={{
                  color: l.status === "failed" ? "#ff6b6b" : "#c8ff00",
                  weight: 3,
                  opacity: 0.9,
                  dashArray: "6 8",
                }}
                eventHandlers={l.status === "failed" ? { click: () => retryLeg(l.id) } : undefined}
              />
            )
          )}
          {/* Mid-leg drag handles — grab the middle of a snapped leg and drag
              to insert a via-point, splitting only that leg. Snapped legs with
              real interior geometry only; an unsnapped leg has no line to grab. */}
          {allLegs.map((l, i) =>
            l.status === "snapped" && l.coords.length >= 3 ? (
              <Marker
                key={`h-${l.id}`}
                position={legHandlePoint(l)}
                draggable
                icon={handleIcon}
                eventHandlers={{
                  dragend: (e) => {
                    const ll = (e.target as L.Marker).getLatLng();
                    insertViaInLeg(i, [ll.lat, ll.lng]);
                  },
                }}
              />
            ) : null
          )}
          {anchors.map((p, i) => (
            <AnchorMarker
              key={`${i}-${p[0]}-${p[1]}`}
              position={p}
              icon={i === 0 ? startIcon : anchorIcon}
              onMove={(ll) => moveAnchor(i, ll)}
              onRemove={() => removeAnchor(i)}
            />
          ))}
        </MapContainer>
        <button
          onClick={async () => {
            const pending = requestLocation(); // straight from the tap (iOS)
            setLocating(true);
            const p = await pending;
            setLocating(false);
            if (p) { setGeoCenter([p.lat, p.lng]); setHere([p.lat, p.lng]); setLocBlocked(false); } else setLocBlocked(true);
          }}
          disabled={locating}
          className="absolute bottom-3 right-3 z-[500] min-h-[44px] px-3 rounded-lg text-xs font-bold shadow"
          style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
          aria-label="Centre the map on my location"
        >
          {locating ? "Locating…" : "Use my location"}
        </button>
        {locBlocked && (
          <div className="absolute bottom-16 right-3 left-3 z-[600] sm:left-auto sm:w-96">
            <LocationHelp
              onRetry={async () => { const p = await requestLocation(); if (p) { setGeoCenter([p.lat, p.lng]); setHere([p.lat, p.lng]); setLocBlocked(false); } }}
              onDismiss={() => setLocBlocked(false)}
              alternative="Or just pan the map and tap where you start."
            />
          </div>
        )}

        {/* Go to a place — riders abroad need not pan from Dublin. Out of the
            way while the location help is open (on a phone its Go button sat
            over the help's Close). Mid-drawing it folds to an icon so the
            route keeps the map, and one tap opens it again. */}
        {anchors.length > 0 && !searchOpen && !locBlocked && (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="absolute top-3 right-3 z-[500] min-w-[44px] min-h-[44px] rounded-lg shadow flex items-center justify-center"
            style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
            aria-label="Go to a place"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        )}
        {(anchors.length === 0 || searchOpen) && !locBlocked && (
          <form
            onSubmit={goToPlace}
            className="absolute top-3 right-3 z-[500] flex flex-col items-end gap-1"
            style={{ width: "min(16rem, calc(100% - 4.5rem))" }}
            role="search"
          >
            <div className="flex w-full rounded-lg overflow-hidden shadow" style={{ border: "1px solid var(--border)" }}>
              <label htmlFor="plan-place" className="sr-only">Go to a place</label>
              <input
                id="plan-place"
                list="plan-places"
                value={placeQuery}
                onChange={(e) => { setPlaceQuery(e.target.value); setPlaceMiss(null); }}
                placeholder="Go to a place…"
                autoComplete="off"
                className="min-w-0 flex-1 min-h-[44px] px-3 text-base sm:text-xs"
                style={{ background: "var(--bg-card)", color: "var(--text)", outline: "none" }}
              />
              <button
                type="submit"
                className="min-h-[44px] min-w-[44px] px-3 text-xs font-bold"
                style={{ background: "var(--bg-raised)", color: "var(--accent)" }}
              >
                Go
              </button>
              {anchors.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setSearchOpen(false); setPlaceMiss(null); }}
                  className="min-h-[44px] min-w-[44px] text-xs"
                  style={{ background: "var(--bg-raised)", color: "var(--text-muted)" }}
                  aria-label="Close place search"
                >
                  ✕
                </button>
              )}
            </div>
            <datalist id="plan-places">
              {KNOWN_PLACES.map((p) => <option key={p.name} value={p.name} />)}
            </datalist>
            {placeMiss && (
              <p className="text-[11px] px-2 py-1 rounded-lg" style={{ background: "var(--bg-raised)", color: "var(--text-secondary)" }} role="status">
                {placeMiss}
              </p>
            )}
          </form>
        )}

        {/* Honest empty state — sits above the location button, and makes
            way for the location help when that is open. */}
        {anchors.length === 0 && !locBlocked && (
          <div className="absolute inset-x-0 bottom-16 flex justify-center pointer-events-none" style={{ zIndex: 1000 }}>
            <div
              className="px-4 py-3 rounded-xl text-sm font-semibold text-center mx-4"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              Tap the map to drop your first point.
              <span className="block text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
                {needsAuth
                  ? "Legs are straight lines until you sign in — then they snap to the road."
                  : "Every point after that snaps a new leg to the road, instantly."}
              </span>
            </div>
          </div>
        )}
        {anchors.length === 1 && !locBlocked && (
          <div className="absolute inset-x-0 bottom-16 flex justify-center pointer-events-none" style={{ zIndex: 1000 }}>
            <div
              className="px-4 py-2 rounded-xl text-xs mx-4"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              {needsAuth
                ? "Drop your next point — a straight line until you sign in."
                : "Drop your next point — we\u2019ll snap that leg to the road."}
            </div>
          </div>
        )}
      </div>

      {/* Live elevation profile — redraws per leg as the route grows. Shown
          only once there's real snapped elevation; collapsible to keep the
          map dominant on small screens. */}
      {hasElevation && (
        <div
          className="border-t z-20"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={() => setShowProfile((v) => !v)}
            className="w-full min-h-[44px] flex items-center justify-between px-3 py-1.5"
            aria-expanded={showProfile}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Elevation · +{totals.gain_m} m / -{totals.loss_m} m
            </span>
            {/* A clean verdict rides in this row (one strip less on a phone);
                compromises keep their own strip below. */}
            {roadStandardClean && (
              <span className="text-[11px] ml-auto mr-3" style={{ color: "var(--text-muted)" }} data-testid="plan-road-standard" title="Every leg meets the Loops road standard.">
                <span aria-hidden="true">✓ </span>Road standard<span className="sr-only">: every leg meets the Loops road standard.</span>
              </span>
            )}
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {showProfile ? "Hide ▾" : "Show ▸"}
            </span>
          </button>
          {showProfile && (
            <div className="px-3 pb-2">
              <ElevationProfile coordinates={profileCoords} distanceKm={totals.distance_km} height={compact ? 120 : 200} />
            </div>
          )}
        </div>
      )}

      {/* Road Standard verdict for the drawn route — from the engine's own
          road tags on every snapped leg. */}
      {standardKnown && !roadStandardClean && (
        <div
          className="px-3 py-1.5 border-t text-xs flex items-start gap-1.5 z-20"
          style={{
            background: "var(--bg-raised)",
            borderColor: "var(--border)",
            color: compromises.length === 0 ? "var(--text-muted)" : "#f5a524",
          }}
          data-testid="plan-road-standard"
        >
          <span aria-hidden="true">{compromises.length === 0 ? "✓" : "⚠"}</span>
          <span>
            {compromises.length === 0
              ? "Every leg meets the Loops road standard."
              : `Compromise: ${(allCompromisesShown ? compromises : compromises.slice(0, 2)).map(describeCompromise).join("; ")}.`}
            {compromises.length > 2 && (
              <button
                type="button"
                onClick={() => setAllCompromisesShown((v) => !v)}
                aria-expanded={allCompromisesShown}
                className="ml-1 px-1 py-3 -my-3 font-bold underline"
                style={{ color: "#f5a524" }}
              >
                {allCompromisesShown ? "Show fewer" : `+${compromises.length - 2} more`}
              </button>
            )}
          </span>
        </div>
      )}

      {/* The same road twice — said while drawing, not found on the ride. */}
      {retrace?.warn && (
        <p
          className="px-3 py-1.5 border-t text-xs flex items-start gap-1.5 z-20"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border)", color: "#f5a524" }}
          data-testid="plan-retrace"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            {retrace.km < 1 ? `${Math.round(retrace.km * 1000)} m` : `${retrace.km.toFixed(1)} km`} of this ride is the same road twice ({retrace.pct}%).
            {" "}Add a pin on another road to make it a loop.
          </span>
        </p>
      )}
      {longWayLegs.length > 0 && (
        <p
          className="px-3 py-1.5 border-t text-xs flex items-start gap-1.5 z-20"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
          data-testid="plan-detour"
        >
          <span aria-hidden="true">↪</span>
          <span>
            {longWayLegs.length === 1 ? `Leg ${longWayLegs[0] + 1} goes` : `Legs ${longWayLegs.map((i) => i + 1).join(", ")} go`} the long way round
            {" "}— the nearest suitable road between those pins. Move a pin or add one to steer it.
          </span>
        </p>
      )}

      {/* Bottom control bar — mobile-first, ≥44px targets */}
      <div
        className="px-3 pt-2 pb-3 border-t z-20"
        style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}
      >
        {/* Gesture hint only until the first point is down — after that it is
            map space on a phone. */}
        {allLegs.length === 0 && (
          <p className="text-[11px] pb-2" style={{ color: "var(--text-muted)" }}>
            {coarsePointer
              ? "tap the map to add · press and hold a pin to move · tap a pin to remove"
              : "click the map to add · drag a pin to move · drag the middle of a leg to reshape · click a pin to remove"}
          </p>
        )}
        {naming !== null && (
          <form
            onSubmit={(e) => { e.preventDefault(); void saveRoute(); }}
            className="flex items-center gap-2 pb-2"
          >
            <label htmlFor="plan-name" className="sr-only">Route name</label>
            <input
              id="plan-name"
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              maxLength={80}
              autoFocus
              className="min-w-0 flex-1 min-h-[44px] px-3 rounded-xl text-base sm:text-sm"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
            />
            <button
              type="submit"
              disabled={saving || !allSnapped}
              className="min-h-[44px] px-4 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setNaming(null)}
              className="min-h-[44px] px-3 rounded-xl text-xs font-bold"
              style={{ border: "1px solid var(--border)", color: "var(--text)" }}
            >
              Cancel
            </button>
          </form>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {/* One discipline in v1 — a one-button "choice" is not a choice. */}
          {ENABLED_DISCIPLINES.length > 1 && (
          <div
            className="flex rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--border)" }}
            role="group"
            aria-label="Discipline"
          >
            {(ENABLED_DISCIPLINES as readonly Discipline[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pickDiscipline(d)}
                aria-pressed={discipline === d}
                disabled={resnapNote !== null}
                className="px-3 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                style={{
                  minHeight: 44,
                  background: discipline === d ? "var(--accent)" : "var(--bg-card)",
                  color: discipline === d ? "var(--bg)" : "var(--text-muted)",
                }}
              >
                {d}
              </button>
            ))}
          </div>
          )}

          <button
            type="button"
            onClick={toggleLoop}
            aria-pressed={loopBack}
            className="px-3 rounded-xl text-xs font-bold"
            style={{
              minHeight: 44,
              background: loopBack ? "var(--accent-glow, rgba(200,255,0,0.12))" : "var(--bg-card)",
              border: `1px solid ${loopBack ? "var(--accent)" : "var(--border)"}`,
              color: loopBack ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            <span className="sm:hidden">Loop back</span>
            <span className="hidden sm:inline">Loop back to start</span> {loopBack ? "✓" : ""}
          </button>

          <span className="flex-1" />

          <button
            type="button"
            onClick={clearAll}
            disabled={anchors.length === 0}
            className="px-3 rounded-xl text-xs font-bold disabled:opacity-40"
            style={{ minHeight: 44, border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Clear<span className="hidden sm:inline"> all</span>
          </button>

          {naming === null && (
          <button
            type="button"
            onClick={() => openNaming()}
            // Tappable while blocked: the tap says why (a phone never shows a tooltip).
            disabled={saving}
            aria-disabled={!allSnapped}
            title={exportBlockedReason({ anchors: anchors.length, needsAuth, snapping, failed: failedCount, allSnapped }, "save") ?? undefined}
            className="px-3 sm:px-4 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-40 aria-disabled:opacity-40"
            style={{ minHeight: 44, border: "1px solid var(--accent)", background: "var(--bg-card)", color: "var(--accent)" }}
          >
            Save<span className="hidden sm:inline"> route</span>
          </button>
          )}

          <button
            type="button"
            onClick={() => void downloadGpx()}
            aria-disabled={!allSnapped}
            title={exportBlockedReason({ anchors: anchors.length, needsAuth, snapping, failed: failedCount, allSnapped }, "export") ?? undefined}
            className="px-3 sm:px-4 rounded-xl text-xs font-bold uppercase tracking-wider aria-disabled:opacity-40"
            style={{ minHeight: 44, background: "var(--accent)", color: "var(--bg)" }}
            aria-label="Download GPX"
          >
            <span className="hidden sm:inline">Download </span>GPX
          </button>
        </div>
      </div>
    </div>
  );
}
