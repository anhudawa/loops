"use client";

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
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from "react-leaflet";
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
}

type Discipline = "road" | "gravel" | "mtb";

const DUBLIN: LatLng = [53.35, -6.26];
const DEFAULT_ZOOM = 10;
/** Each leg is its own 2-waypoint call, so the old 10-waypoint API cap
 * no longer limits the route — this is purely a sanity ceiling. */
const MAX_POINTS = 50;

const anchorIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#c8ff00;border:2.5px solid #0a0a0c;box-shadow:0 0 0 2px #c8ff00;cursor:grab"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const startIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#0a0a0c;border:3px solid #c8ff00;box-shadow:0 0 0 2px #0a0a0c;cursor:grab"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/** Small hollow handle on the middle of a snapped leg — grab and drag it to
 * insert a via-point there (Strava's signature mid-leg reshape). */
const handleIcon = L.divIcon({
  className: "",
  html: `<div style="width:11px;height:11px;border-radius:50%;background:#0a0a0c;border:2px solid #c8ff00;opacity:0.85;cursor:grab"></div>`,
  iconSize: [11, 11],
  iconAnchor: [5.5, 5.5],
});

function ClickToAdd({ onAdd }: { onAdd: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/** Pans to the rider's location once, if it arrives before they start drawing. */
/** Centres the map each time a new target is set (on load if allowed, or on "Use my location"). */
function RecenterOnce({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView(target, 12);
  }, [target, map]);
  return null;
}

export default function MapPlanner() {
  const [anchors, setAnchors] = useState<LatLng[]>([]);
  /** legs[i] connects anchors[i] → anchors[i+1]. */
  const [legs, setLegs] = useState<PlanLeg[]>([]);
  /** Closing leg (last anchor → first anchor) when loop is on. */
  const [loopLeg, setLoopLeg] = useState<PlanLeg | null>(null);
  const [discipline, setDiscipline] = useState<Discipline>("road");
  const [loopBack, setLoopBack] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [resnapNote, setResnapNote] = useState<string | null>(null);
  const [geoCenter, setGeoCenter] = useState<LatLng | null>(null);
  const [locBlocked, setLocBlocked] = useState(false);
  const [locating, setLocating] = useState(false);
  // On a phone the elevation panel + controls left the map as a thin strip
  // mid-draw, so it starts collapsed there (one tap to open) and is shorter.
  const compact = typeof window !== "undefined" && window.innerWidth < 768;
  const [showProfile, setShowProfile] = useState(!compact);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const router = useRouter();

  const legIdRef = useRef(0);
  const seqRef = useRef(0);
  const needsAuthRef = useRef(false);
  const anchorsRef = useRef(anchors);
  anchorsRef.current = anchors;
  const legsRef = useRef(legs);
  legsRef.current = legs;
  const loopLegRef = useRef(loopLeg);
  loopLegRef.current = loopLeg;
  // Snapped geometry per leg, written synchronously when a snap lands, so a
  // leg routed right after another can avoid its roads before React renders.
  const snappedCoordsRef = useRef(new Map<number, LatLng[]>());
  const recentLegIdsRef = useRef(new Map<number, number>()); // id → created at
  const snapDoneRef = useRef(new Map<number, Promise<void>>());

  /** Roads the rest of the route already uses (other legs' snapped geometry). */
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
      // Don't yank the map away if they've already started drawing.
      if (!cancelled && p && anchorsRef.current.length === 0) setGeoCenter([p.lat, p.lng]);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Per-leg snapping ───────────────────────────────────────────────────────

  /** Apply a result to the leg with this id, only if seq is still current. */
  function applyLegResult(id: number, seq: number, patch: Partial<PlanLeg>) {
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
      const res = await fetch("/api/reroute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Avoid the roads the rest of the route already uses, so a stop
        // like Blessington becomes part of a loop, not an out-and-back.
        body: JSON.stringify({ waypoints: [from, to], discipline: disc, avoid: roadsInUse(id) }),
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

  // ── Anchor operations (all incremental — never re-route the whole set) ────

  function addAnchor(latlng: LatLng) {
    const current = anchorsRef.current;
    if (current.length >= MAX_POINTS) {
      setError(`Maximum of ${MAX_POINTS} points — drag a pin to fine-tune instead.`);
      return;
    }
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

  /** Most-used control: remove the last anchor and its leg. */
  function undo() {
    const current = anchorsRef.current;
    if (current.length === 0) return;
    removeAnchor(current.length - 1);
  }

  function toggleLoop() {
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
    snappedCoordsRef.current.clear();
    recentLegIdsRef.current.clear();
    if (anchorsRef.current.length > 0 && !window.confirm("Clear the whole route?")) return;
    seqRef.current++;
    setAnchors([]);
    setLegs([]);
    setLoopLeg(null);
    setError(null);
    setResnapNote(null);
    setSaveError(null);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const allLegs = [...legs, ...(loopLeg ? [loopLeg] : [])];
  const totals = legTotals(allLegs);
  const snapping = allLegs.some((l) => l.status === "pending");
  const failedCount = allLegs.filter((l) => l.status === "failed").length;
  const allSnapped = allLegs.length > 0 && allLegs.every((l) => l.status === "snapped");
  // Road Standard across the drawn route (trust rule: a compromise is shown
  // while drawing, never discovered on the road).
  const standardKnown = allSnapped && allLegs.every((l) => l.standard_met !== undefined);
  const compromises = allLegs.flatMap((l) => l.compromises ?? []).sort((a, b) => b.meters - a.meters);

  // Live elevation profile: rebuild the [lat,lng,ele] track whenever a leg's
  // geometry changes. ElevationProfile renders its own empty state when the
  // route carries no real elevation (anonymous / unsnapped), so we never fake
  // a flat line.
  const profileCoords = useMemo(() => legGeometryForChart(allLegs), [allLegs]);
  const hasElevation = useMemo(
    () => profileCoords.length >= 2 && profileCoords.some((c) => c[2] !== 0),
    [profileCoords]
  );

  function downloadGpx() {
    if (!allSnapped) return;
    const { coords, elevations } = concatLegGeometry(allLegs);
    const gpx = buildPlanGpx(
      coords,
      elevations,
      `LOOPS planned ${discipline} route — ${totals.distance_km} km`,
      discipline
    );
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loops-planned-${totals.distance_km}km.gpx`;
    a.click();
    URL.revokeObjectURL(url);
    // Funnel: a drawn route was exported (client-side GPX + draw milestone).
    track(ANALYTICS_EVENTS.GPX_DOWNLOADED, { source: "draw" });
    track(ANALYTICS_EVENTS.PLAN_DRAWN, { via: "download", distance_km: totals.distance_km });
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
    const name = `Planned ${discipline} route — ${totals.distance_km} km`;
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
      if (id) router.push(`/routes/${id}`);
      else setSaveError("Saved, but couldn't open the route page.");
    } catch {
      setSaveError("Network hiccup while saving — try again.");
    } finally {
      setSaving(false);
    }
  }

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
          disabled={anchors.length === 0}
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
        <p className="px-4 py-2 text-xs z-20" style={{ background: "rgba(200,255,0,0.08)", color: "var(--text-secondary)" }}>
          <span className="font-bold" style={{ color: "var(--accent)" }}>Sign in to snap to roads.</span>{" "}
          You can keep drawing — distances are straight-line until then.{" "}
          <Link href="/login?redirect=/plan" className="font-bold underline" style={{ color: "var(--accent)" }}>
            Log in →
          </Link>
        </p>
      )}
      {failedCount > 0 && (
        <p className="px-4 py-2 text-xs z-20 flex items-center gap-2" style={{ background: "rgba(255,80,80,0.1)", color: "#ff6b6b" }}>
          <span>
            {failedCount === 1 ? "One leg" : `${failedCount} legs`} couldn&apos;t snap — shown dashed as straight lines (total is approximate).
          </span>
          <button
            type="button"
            onClick={retryFailedLegs}
            className="px-2 py-1 rounded-lg font-bold underline"
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
      <div className="relative flex-1 min-h-0">
        <MapContainer
          center={DUBLIN}
          zoom={DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterOnce target={geoCenter} />
          <ClickToAdd onAdd={addAnchor} />
          {/* Each leg renders itself: solid = genuine snapped geometry,
              dashed = pending / failed / anonymous straight line. */}
          {allLegs.map((l) =>
            l.status === "snapped" ? (
              <Polyline
                key={l.id}
                positions={l.coords}
                pathOptions={{ color: "#c8ff00", weight: 4, opacity: 0.9 }}
              />
            ) : (
              <Polyline
                key={l.id}
                positions={[l.from, l.to]}
                pathOptions={{
                  color: l.status === "failed" ? "#ff6b6b" : "#c8ff00",
                  weight: 2.5,
                  opacity: 0.65,
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
            <Marker
              key={`${i}-${p[0]}-${p[1]}`}
              position={p}
              draggable
              icon={i === 0 ? startIcon : anchorIcon}
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  moveAnchor(i, [ll.lat, ll.lng]);
                },
                click: () => removeAnchor(i),
              }}
            />
          ))}
        </MapContainer>
        <button
          onClick={async () => {
            const pending = requestLocation(); // straight from the tap (iOS)
            setLocating(true);
            const p = await pending;
            setLocating(false);
            if (p) { setGeoCenter([p.lat, p.lng]); setLocBlocked(false); } else setLocBlocked(true);
          }}
          disabled={locating}
          className="absolute bottom-3 right-3 z-[500] min-h-[44px] px-3 rounded-lg text-xs font-bold shadow"
          style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
          aria-label="Centre the map on my location"
        >
          {locating ? "Locating…" : "Use my location"}
        </button>
        {locBlocked && (
          <div className="absolute bottom-16 right-3 left-3 z-[500] sm:left-auto sm:w-96">
            <LocationHelp onRetry={async () => { const p = await requestLocation(); if (p) { setGeoCenter([p.lat, p.lng]); setLocBlocked(false); } }} onDismiss={() => setLocBlocked(false)} />
          </div>
        )}

        {/* Honest empty state */}
        {anchors.length === 0 && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none" style={{ zIndex: 1000 }}>
            <div
              className="px-4 py-3 rounded-xl text-sm font-semibold text-center mx-4"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              Tap the map to drop your first point.
              <span className="block text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
                Every point after that snaps a new leg to the road, instantly.
              </span>
            </div>
          </div>
        )}
        {anchors.length === 1 && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none" style={{ zIndex: 1000 }}>
            <div
              className="px-4 py-2 rounded-xl text-xs mx-4"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              Drop your next point — we&apos;ll snap that leg to the road.
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
            className="w-full flex items-center justify-between px-3 py-1.5"
            aria-expanded={showProfile}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Elevation · +{totals.gain_m} m / -{totals.loss_m} m
            </span>
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
      {standardKnown && (
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
              : `Compromise: ${compromises.slice(0, 2).map(describeCompromise).join("; ")}${compromises.length > 2 ? ` (+${compromises.length - 2} more)` : ""}.`}
          </span>
        </div>
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
            tap the map to add · drag a pin to move · drag the middle of a leg to reshape · tap a pin to remove
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--border)" }}
            role="group"
            aria-label="Discipline"
          >
            {(["road", "gravel", "mtb"] as Discipline[]).map((d) => (
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
            Loop back to start {loopBack ? "✓" : ""}
          </button>

          <span className="flex-1" />

          <button
            type="button"
            onClick={clearAll}
            disabled={anchors.length === 0}
            className="px-3 rounded-xl text-xs font-bold disabled:opacity-40"
            style={{ minHeight: 44, border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Clear all
          </button>

          <button
            type="button"
            onClick={saveRoute}
            disabled={!allSnapped || saving}
            title={allSnapped ? undefined : "Every leg must be snapped to a road before saving"}
            className="px-4 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-40"
            style={{ minHeight: 44, border: "1px solid var(--accent)", background: "var(--bg-card)", color: "var(--accent)" }}
          >
            {saving ? "Saving…" : "Save route"}
          </button>

          <button
            type="button"
            onClick={downloadGpx}
            disabled={!allSnapped}
            title={allSnapped ? undefined : "Every leg must be snapped to a road before export"}
            className="px-4 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-40"
            style={{ minHeight: 44, background: "var(--accent)", color: "var(--bg)" }}
          >
            Download GPX
          </button>
        </div>
      </div>
    </div>
  );
}
