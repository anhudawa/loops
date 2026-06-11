"use client";

/**
 * Map-first route planner (CEO priority #1: draw roughly where you want
 * to go → GPX, easy to edit).
 *
 * Tap the map to drop points; the route snaps through them via
 * POST /api/reroute (same engine + guardrails as drag-to-edit). Drag a
 * pin to move it, tap a pin to remove it — identical UX to RouteEditor.
 * "Loop back to start" closes the ride by appending the start point.
 *
 * Anonymous users can sketch freely; the 401 from /api/reroute surfaces
 * as "Sign in to snap your route" rather than a hard redirect.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface RerouteResult {
  coordinates: [number, number][];
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  gpx_data: string;
  warnings: string[];
}

type Discipline = "road" | "gravel" | "mtb";

const DUBLIN: [number, number] = [53.35, -6.26];
const DEFAULT_ZOOM = 10;
/** /api/reroute accepts max 10 waypoints; keep one spare for the loop-closing point. */
const MAX_POINTS = 9;

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

function ClickToAdd({ onAdd }: { onAdd: (latlng: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/** Pans to the rider's location once, if it arrives before they start drawing. */
function RecenterOnce({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (target && !done.current) {
      done.current = true;
      map.setView(target, 12);
    }
  }, [target, map]);
  return null;
}

export default function MapPlanner() {
  const [points, setPoints] = useState<[number, number][]>([]);
  const [discipline, setDiscipline] = useState<Discipline>("road");
  const [loopBack, setLoopBack] = useState(true);
  const [route, setRoute] = useState<RerouteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [geoCenter, setGeoCenter] = useState<[number, number] | null>(null);
  const requestSeq = useRef(0);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Centre on the rider if they allow it — silently fall back to Dublin.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Don't yank the map away if they've already started drawing.
        if (pointsRef.current.length === 0) {
          setGeoCenter([pos.coords.latitude, pos.coords.longitude]);
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  async function snap(nextPoints: [number, number][], loop: boolean, disc: Discipline) {
    if (nextPoints.length < 2) {
      requestSeq.current++; // invalidate any in-flight response
      setRoute(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    setError(null);
    const seq = ++requestSeq.current;
    try {
      const waypoints = loop ? [...nextPoints, nextPoints[0]] : nextPoints;
      const res = await fetch("/api/reroute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoints, discipline: disc }),
      });
      const body = await res.json();
      if (seq !== requestSeq.current) return; // stale response
      if (res.status === 401) {
        setNeedsAuth(true);
        setRoute(null);
        return;
      }
      if (!res.ok) {
        setError(body?.error ?? "Couldn't route between those points — try moving the pin to a road.");
        return;
      }
      setNeedsAuth(false);
      setRoute(body.data as RerouteResult);
    } catch {
      if (seq === requestSeq.current) setError("Network hiccup — try that again.");
    } finally {
      if (seq === requestSeq.current) setBusy(false);
    }
  }

  function addPoint(latlng: [number, number]) {
    if (points.length >= MAX_POINTS) {
      setError(`Maximum of ${MAX_POINTS} points — drag a pin to fine-tune instead.`);
      return;
    }
    const next = [...points, latlng];
    setPoints(next);
    snap(next, loopBack, discipline);
  }

  function movePoint(idx: number, latlng: [number, number]) {
    const next = points.map((p, i) => (i === idx ? latlng : p)) as [number, number][];
    setPoints(next);
    snap(next, loopBack, discipline);
  }

  function removePoint(idx: number) {
    const next = points.filter((_, i) => i !== idx);
    setPoints(next);
    setError(null);
    snap(next, loopBack, discipline);
  }

  function toggleLoop() {
    const next = !loopBack;
    setLoopBack(next);
    snap(points, next, discipline);
  }

  function pickDiscipline(d: Discipline) {
    if (d === discipline) return;
    setDiscipline(d);
    snap(points, loopBack, d);
  }

  function clearAll() {
    requestSeq.current++;
    setPoints([]);
    setRoute(null);
    setError(null);
    setBusy(false);
  }

  function downloadGpx() {
    if (!route) return;
    const blob = new Blob([route.gpx_data], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loops-planned-${route.distance_km}km.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Dashed sketch line through the raw points until a snapped route exists.
  const sketchLine: [number, number][] =
    !route && points.length >= 2 ? (loopBack ? [...points, points[0]] : points) : [];

  return (
    <div className="flex flex-col" style={{ height: "100%", background: "var(--bg)" }}>
      {/* Planner toolbar — the shared AppHeader sits above (one logo treatment) */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b z-20"
        style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}
      >
        <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Draw a route</span>
        {busy && (
          <span className="text-xs" style={{ color: "var(--accent)" }}>snapping…</span>
        )}
        <span className="flex-1" />
        {route && (
          <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>
            {route.distance_km} km · +{route.elevation_gain_m} m
          </span>
        )}
      </div>

      {/* Banners */}
      {needsAuth && (
        <p className="px-4 py-2 text-xs z-20" style={{ background: "rgba(200,255,0,0.08)", color: "var(--text-secondary)" }}>
          <span className="font-bold" style={{ color: "var(--accent)" }}>Sign in to snap your route.</span>{" "}
          Your sketch stays put — we just need an account to run the routing engine.{" "}
          <Link href="/login?redirect=/plan" className="font-bold underline" style={{ color: "var(--accent)" }}>
            Log in →
          </Link>
        </p>
      )}
      {error && (
        <p className="px-4 py-2 text-xs z-20" style={{ background: "rgba(255,80,80,0.1)", color: "#ff6b6b" }}>
          {error}
        </p>
      )}
      {route && route.warnings.length > 0 && (
        <p className="px-4 py-2 text-xs z-20" style={{ background: "rgba(240,160,80,0.1)", color: "#f0a050" }}>
          ⚠ {route.warnings[0]}
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
          <ClickToAdd onAdd={addPoint} />
          {sketchLine.length > 0 && (
            <Polyline
              positions={sketchLine}
              pathOptions={{ color: "#c8ff00", weight: 3, opacity: 0.55, dashArray: "6 8" }}
            />
          )}
          {route && (
            <Polyline
              positions={route.coordinates.map(([lat, lng]) => [lat, lng] as [number, number])}
              pathOptions={{ color: "#c8ff00", weight: 4, opacity: 0.9 }}
            />
          )}
          {points.map((p, i) => (
            <Marker
              key={`${i}-${p[0]}-${p[1]}`}
              position={p}
              draggable
              icon={i === 0 ? startIcon : anchorIcon}
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  movePoint(i, [ll.lat, ll.lng]);
                },
                click: () => removePoint(i),
              }}
            />
          ))}
        </MapContainer>

        {/* Honest empty state */}
        {points.length === 0 && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none" style={{ zIndex: 1000 }}>
            <div
              className="px-4 py-3 rounded-xl text-sm font-semibold text-center mx-4"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              Tap the map to drop your first point.
              <span className="block text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
                Two points and we&apos;ll snap a rideable route through them.
              </span>
            </div>
          </div>
        )}
        {points.length === 1 && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none" style={{ zIndex: 1000 }}>
            <div
              className="px-4 py-2 rounded-xl text-xs mx-4"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              Drop at least one more point to snap a route.
            </div>
          </div>
        )}
      </div>

      {/* Bottom control bar — mobile-first, ≥44px targets */}
      <div
        className="px-3 pt-2 pb-3 border-t z-20"
        style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}
      >
        <p className="text-[11px] pb-2" style={{ color: "var(--text-muted)" }}>
          tap the map to add · drag a pin to move · tap a pin to remove
        </p>
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
                className="px-3 text-xs font-bold uppercase tracking-wider"
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
            disabled={points.length === 0}
            className="px-3 rounded-xl text-xs font-bold disabled:opacity-40"
            style={{ minHeight: 44, border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Clear all
          </button>

          <button
            type="button"
            onClick={downloadGpx}
            disabled={!route}
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
