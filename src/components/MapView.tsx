"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Route {
  id: string;
  name: string;
  difficulty: string;
  distance_km: number;
  county: string;
  start_lat: number;
  start_lng: number;
  coordinates: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "#00ff88",
  moderate: "#ffbb00",
  hard: "#ff3355",
  expert: "#bb44ff",
};

export default function MapView({
  routes,
  selectedRouteId,
  onRouteSelect,
  windOverlay,
  travelOverlay,
}: {
  routes: Route[];
  selectedRouteId?: string;
  onRouteSelect?: (id: string) => void;
  windOverlay?: { direction: number; speed: number } | null;
  travelOverlay?: boolean;
}) {
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const windLayerRef = useRef<L.LayerGroup | null>(null);
  const travelLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = L.map("map", {
      center: [53.5, -7.5],
      zoom: 7,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 18,
    }).addTo(mapRef.current);

    layersRef.current = L.layerGroup().addTo(mapRef.current);
    windLayerRef.current = L.layerGroup().addTo(mapRef.current);
    travelLayerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layersRef.current) return;
    layersRef.current.clearLayers();

    routes.forEach((route) => {
      const coords: [number, number][] = JSON.parse(route.coordinates);
      const color = DIFFICULTY_COLORS[route.difficulty] || "#666";
      const isSelected = route.id === selectedRouteId;

      const polyline = L.polyline(coords, {
        color,
        weight: isSelected ? 5 : 3,
        opacity: isSelected ? 1 : 0.7,
      }).addTo(layersRef.current!);

      const marker = L.circleMarker([route.start_lat, route.start_lng], {
        radius: isSelected ? 8 : 6,
        fillColor: color,
        color: "#0a0a0a",
        weight: 2,
        fillOpacity: 1,
      }).addTo(layersRef.current!);

      marker.bindPopup(`
        <div style="font-family: 'Inter', system-ui; min-width: 180px; background: #1a1a1a; color: #f5f5f5; padding: 2px;">
          <strong style="font-size: 14px; letter-spacing: -0.02em;">${route.name}</strong><br/>
          <span style="color: ${color}; font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">${route.difficulty}</span>
          &middot; <span style="color: #c8ff00; font-weight: 700;">${route.distance_km} km</span><br/>
          <span style="color: #666;">${route.county}</span><br/>
          <a href="/routes/${route.id}" style="color: #c8ff00; text-decoration: none; font-size: 13px; font-weight: 600;">View details &rarr;</a>
        </div>
      `);

      if (onRouteSelect) {
        marker.on("click", () => onRouteSelect(route.id));
        polyline.on("click", () => onRouteSelect(route.id));
      }
    });

    if (selectedRouteId) {
      const selected = routes.find((r) => r.id === selectedRouteId);
      if (selected) {
        const coords: [number, number][] = JSON.parse(selected.coordinates);
        mapRef.current.flyToBounds(L.latLngBounds(coords), {
          padding: [60, 60],
          duration: 0.8,
          maxZoom: 13,
        });
      }
    } else if (routes.length > 0) {
      const allCoords = routes.flatMap((r) => JSON.parse(r.coordinates) as [number, number][]);
      if (allCoords.length > 0) {
        mapRef.current.fitBounds(L.latLngBounds(allCoords), { padding: [30, 30] });
      }
    }
  }, [routes, selectedRouteId, onRouteSelect]);

  // Helper: bearing between two lat/lng points in degrees
  const bearing = (a: [number, number], b: [number, number]) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;
    const dLng = toRad(b[1] - a[1]);
    const y = Math.sin(dLng) * Math.cos(toRad(b[0]));
    const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  };

  // Wind overlay
  useEffect(() => {
    if (!windLayerRef.current) return;
    windLayerRef.current.clearLayers();

    if (!windOverlay) return;

    const selected = routes.find((r) => r.id === selectedRouteId) || routes[0];
    if (!selected) return;

    const coords: [number, number][] = JSON.parse(selected.coordinates);
    if (coords.length < 2) return;

    const count = Math.min(12, Math.max(5, Math.floor(coords.length / 4)));
    const step = Math.floor(coords.length / (count + 1));
    const windBlowingTo = (windOverlay.direction + 180) % 360;

    for (let i = 1; i <= count; i++) {
      const idx = Math.min(i * step, coords.length - 1);
      const [lat, lng] = coords[idx];

      const icon = L.divIcon({
        className: "wind-arrow-icon",
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
          <div style="transform:rotate(${windBlowingTo}deg);width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);border-radius:50%;border:2px solid #ff3355;box-shadow:0 0 10px rgba(255,51,85,0.5);">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ff3355" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </div>
          <div style="font-size:10px;font-weight:800;color:#fff;white-space:nowrap;text-shadow:0 0 4px rgba(0,0,0,1),0 0 8px rgba(255,51,85,0.6);margin-top:2px;">${Math.round(windOverlay.speed)} km/h</div>
        </div>`,
        iconSize: [48, 56],
        iconAnchor: [24, 28],
      });

      L.marker([lat, lng], { icon, interactive: false }).addTo(windLayerRef.current!);
    }
  }, [windOverlay, routes, selectedRouteId]);

  // Travel direction overlay
  useEffect(() => {
    if (!travelLayerRef.current) return;
    travelLayerRef.current.clearLayers();

    if (!travelOverlay) return;

    const selected = routes.find((r) => r.id === selectedRouteId) || routes[0];
    if (!selected) return;

    const coords: [number, number][] = JSON.parse(selected.coordinates);
    if (coords.length < 2) return;

    const count = Math.min(14, Math.max(6, Math.floor(coords.length / 3)));
    const step = Math.floor(coords.length / (count + 1));

    for (let i = 1; i <= count; i++) {
      const idx = Math.min(i * step, coords.length - 1);
      const prev = coords[Math.max(0, idx - 1)];
      const next = coords[Math.min(coords.length - 1, idx + 1)];
      const travelDeg = bearing(prev, next);

      const icon = L.divIcon({
        className: "wind-arrow-icon",
        html: `<div style="transform:rotate(${travelDeg}deg);width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);border-radius:50%;border:2px solid #c8ff00;box-shadow:0 0 8px rgba(200,255,0,0.4);">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c8ff00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="5 12 12 5 19 12"/>
          </svg>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker(coords[idx], { icon, interactive: false }).addTo(travelLayerRef.current!);
    }
  }, [travelOverlay, routes, selectedRouteId]);

  return <div id="map" className="w-full h-full rounded-lg" />;
}
