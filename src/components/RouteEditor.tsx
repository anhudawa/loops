"use client";

/**
 * Drag-to-edit route editor (Komoot-rival roadmap #2).
 *
 * Shows the route on a real map with draggable via-point markers. On
 * drop, the routing engine rebuilds the line between anchors with the
 * same discipline profile and guardrails as generation. Click the line
 * to add a via point; click a marker to remove it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "@/config/map-provider";

interface RerouteResult {
  coordinates: [number, number][];
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  gpx_data: string;
  warnings: string[];
}

interface RouteEditorProps {
  initialCoordinates: [number, number][];
  initialWaypoints: [number, number][];
  discipline: "road" | "gravel" | "mtb";
  onClose: () => void;
}

const anchorIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#c8ff00;border:2.5px solid #0a0a0c;box-shadow:0 0 0 2px #c8ff00;cursor:grab"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function distToSegmentSq(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  if (dx === 0 && dy === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  const t = Math.max(0, Math.min(1, ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / (dx * dx + dy * dy)));
  const x = a[1] + t * dx;
  const y = a[0] + t * dy;
  return (p[0] - y) ** 2 + (p[1] - x) ** 2;
}

function ClickToAdd({ onAdd }: { onAdd: (latlng: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function RouteEditor({
  initialCoordinates,
  initialWaypoints,
  discipline,
  onClose,
}: RouteEditorProps) {
  // Strip the duplicated closing point if start === end (loops)
  const startAnchors = useMemo(() => {
    const w = [...initialWaypoints];
    if (
      w.length > 2 &&
      Math.abs(w[0][0] - w[w.length - 1][0]) < 1e-6 &&
      Math.abs(w[0][1] - w[w.length - 1][1]) < 1e-6
    ) {
      w.pop();
    }
    return w;
  }, [initialWaypoints]);

  const [anchors, setAnchors] = useState<[number, number][]>(startAnchors);
  const [route, setRoute] = useState<RerouteResult | null>(null);
  const [coords, setCoords] = useState<[number, number][]>(initialCoordinates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const stats = route
    ? { km: route.distance_km, up: route.elevation_gain_m }
    : null;

  async function reroute(nextAnchors: [number, number][]) {
    setBusy(true);
    setError(null);
    const seq = ++requestSeq.current;
    try {
      // Close the loop server-side by repeating the start
      const waypoints = [...nextAnchors, nextAnchors[0]];
      const res = await fetch("/api/reroute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoints, discipline }),
      });
      const body = await res.json();
      if (seq !== requestSeq.current) return; // stale response
      if (!res.ok) {
        setError(body?.error ?? "Couldn't reroute — try a different spot.");
        return;
      }
      const data = body.data as RerouteResult;
      setRoute(data);
      setCoords(data.coordinates);
    } catch {
      if (seq === requestSeq.current) setError("Network hiccup — try that again.");
    } finally {
      if (seq === requestSeq.current) setBusy(false);
    }
  }

  function moveAnchor(idx: number, latlng: [number, number]) {
    const next = anchors.map((a, i) => (i === idx ? latlng : a)) as [number, number][];
    setAnchors(next);
    reroute(next);
  }

  function addAnchor(latlng: [number, number]) {
    if (anchors.length >= 9) {
      setError("Maximum of 9 via points.");
      return;
    }
    // Insert after the nearest segment of the anchor polygon
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const b = anchors[(i + 1) % anchors.length];
      const d = distToSegmentSq(latlng, a, b);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const next = [...anchors.slice(0, best + 1), latlng, ...anchors.slice(best + 1)];
    setAnchors(next);
    reroute(next);
  }

  function removeAnchor(idx: number) {
    if (anchors.length <= 3) {
      setError("A loop needs at least 3 points.");
      return;
    }
    const next = anchors.filter((_, i) => i !== idx);
    setAnchors(next);
    reroute(next);
  }

  function downloadGpx() {
    if (!route) return;
    const blob = new Blob([route.gpx_data], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loops-edited-${route.distance_km}km.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Fit map to the route once
  const bounds = useMemo(() => L.latLngBounds(coords.map(([lat, lng]) => [lat, lng])), []);

  useEffect(() => {
    // Leaflet icon URLs break under bundlers — we use divIcons only.
  }, []);

  return (
    <div className="mt-3 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--accent)" }}>
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
        style={{ background: "var(--bg-raised)", color: "var(--text-secondary)" }}
      >
        <span className="font-bold" style={{ color: "var(--text)" }}>
          Edit route
        </span>
        <span>drag a pin to move · tap the map to add · tap a pin to remove</span>
        {busy && <span style={{ color: "var(--accent)" }}>rerouting…</span>}
        {stats && (
          <span className="font-semibold" style={{ color: "var(--text)" }}>
            {stats.km} km · +{stats.up} m
          </span>
        )}
        <span className="flex-1" />
        {route && (
          <button onClick={downloadGpx} className="font-bold px-2.5 py-1 rounded-lg" style={{ background: "var(--accent)", color: "var(--bg)" }}>
            Download GPX
          </button>
        )}
        <button onClick={onClose} className="font-bold px-2.5 py-1 rounded-lg" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
          Done
        </button>
      </div>

      {error && (
        <p className="px-3 py-1.5 text-xs" style={{ background: "rgba(255,80,80,0.1)", color: "#ff6b6b" }}>
          {error}
        </p>
      )}
      {route && route.warnings.length > 0 && (
        <p className="px-3 py-1.5 text-xs" style={{ background: "rgba(240,160,80,0.1)", color: "#f0a050" }}>
          ⚠ {route.warnings[0]}
        </p>
      )}

      <MapContainer bounds={bounds} style={{ height: 340, width: "100%" }} scrollWheelZoom>
        {MAP_TILE_URL && <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />}
        <ClickToAdd onAdd={addAnchor} />
        <Polyline
          positions={coords.map(([lat, lng]) => [lat, lng] as [number, number])}
          pathOptions={{ color: "#c8ff00", weight: 4, opacity: 0.9 }}
        />
        {anchors.map((a, i) => (
          <Marker
            key={`${i}-${a[0]}-${a[1]}`}
            position={a}
            draggable
            icon={anchorIcon}
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

      <p className="px-3 py-1.5 text-[10px]" style={{ background: "var(--bg-raised)", color: "var(--text-muted)" }}>
        Edits keep the same {discipline} routing rules (no motorways, paved-only for road).
        Surface and quality scores refresh when you save or export.
      </p>
    </div>
  );
}
