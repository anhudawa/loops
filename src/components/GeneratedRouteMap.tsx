"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DISCIPLINE_COLORS: Record<string, string> = {
  road: "#c8ff00",
  gravel: "#ff6633",
  mtb: "#bb44ff",
};

interface HighlightRange {
  start_index: number;
  end_index: number;
}

interface GeneratedRouteMapProps {
  coordinates: [number, number][];
  discipline?: string;
  highlights?: HighlightRange[];
  height?: number | string;
  className?: string;
}

export default function GeneratedRouteMap({
  coordinates,
  discipline = "road",
  highlights = [],
  height = 360,
  className,
}: GeneratedRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || coordinates.length < 2) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      dragging: true,
      attributionControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 18 }
    ).addTo(map);

    const color = DISCIPLINE_COLORS[discipline] || DISCIPLINE_COLORS.road;
    const latLngs: L.LatLngExpression[] = coordinates.map(([lat, lng]) => [lat, lng]);

    L.polyline(latLngs, {
      color,
      weight: 3,
      opacity: 0.7,
    }).addTo(map);

    for (const h of highlights) {
      const slice = coordinates.slice(h.start_index, h.end_index + 1);
      if (slice.length < 2) continue;
      L.polyline(
        slice.map(([lat, lng]) => [lat, lng] as L.LatLngExpression),
        { color: "#ff3355", weight: 5, opacity: 0.9 }
      ).addTo(map);
    }

    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    L.circleMarker([start[0], start[1]], {
      radius: 6,
      color,
      fillColor: color,
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);

    L.circleMarker([end[0], end[1]], {
      radius: 5,
      color,
      fillColor: "#0a0a0a",
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);

    map.fitBounds(L.latLngBounds(latLngs), { padding: [30, 30] });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [coordinates, discipline, highlights]);

  if (coordinates.length < 2) return null;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height,
        width: "100%",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    />
  );
}
