"use client";

/** Full-bleed Leaflet view of one route — the tap-to-view target for
 * generated candidates. */

import { useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "@/config/map-provider";

const startIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#c8ff00;border:3px solid #0a0a0c"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export default function RouteViewerMap({ coordinates }: { coordinates: [number, number][] }) {
  const bounds = useMemo(
    () => L.latLngBounds(coordinates.map(([lat, lng]) => [lat, lng] as [number, number])),
    [coordinates]
  );
  return (
    <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      {MAP_TILE_URL && <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />}
      <Polyline
        positions={coordinates.map(([lat, lng]) => [lat, lng] as [number, number])}
        pathOptions={{ color: "#c8ff00", weight: 4, opacity: 0.95 }}
      />
      <Marker position={coordinates[0]} icon={startIcon} />
    </MapContainer>
  );
}
