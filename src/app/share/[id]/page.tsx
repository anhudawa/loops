"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import ShareButton from "@/components/ShareButton";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const ROAD_COLOR = "#ffbb00";

interface SharedRoute {
  id: string;
  name: string;
  description: string | null;
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  surface_type: string;
  discipline: string;
  county: string;
  country: string;
  region: string | null;
  start_lat: number;
  start_lng: number;
  coordinates: string;
}

export default function SharePage() {
  const params = useParams();
  const id = params.id as string;
  const [route, setRoute] = useState<SharedRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/routes/${id}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setRoute(data.data || data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full" style={{ background: "var(--bg-card)" }} />
          <div className="h-4 w-48 rounded" style={{ background: "var(--bg-card)" }} />
        </div>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ background: "var(--bg)" }}>
        <h1 className="text-2xl font-extrabold" style={{ color: "var(--text)" }}>Route not found</h1>
        <p style={{ color: "var(--text-muted)" }}>This route may have been removed or the link is invalid.</p>
        <Link
          href="/generate"
          className="px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wider"
          style={{ background: "var(--accent)", color: "#0a0a0a" }}
        >
          Find a reviewed route
        </Link>
      </div>
    );
  }

  let coords: [number, number][] = [];
  try {
    coords = JSON.parse(route.coordinates);
  } catch {
    // invalid coordinates
  }

  const color = ROAD_COLOR;
  const location = route.region || route.county;

  const mapRoutes = coords.length > 0
    ? [{
        id: route.id,
        name: route.name,
        discipline: route.discipline,
        distance_km: route.distance_km,
        county: route.county,
        country: route.country,
        region: route.region,
        start_lat: route.start_lat,
        start_lng: route.start_lng,
        coordinates: route.coordinates,
      }]
    : [];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="text-xl font-black tracking-tight" style={{ color: "var(--text)" }}>
            LOOPS
          </Link>
          <ShareButton routeId={route.id} title={route.name} distance={route.distance_km} />
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-md"
              style={{ color, background: `${color}20` }}
            >
              {route.discipline}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {location}, {route.country}
            </span>
          </div>
          <h1
            className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2"
            style={{ color: "var(--text)" }}
          >
            {route.name}
          </h1>
          {route.description && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {route.description}
            </p>
          )}
        </div>

        <div className="flex gap-6 mb-6">
          <div>
            <p className="text-xs uppercase tracking-wider font-bold mb-1" style={{ color: "var(--text-muted)" }}>
              Distance
            </p>
            <p className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>
              {route.distance_km} <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>km</span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider font-bold mb-1" style={{ color: "var(--text-muted)" }}>
              Elevation
            </p>
            <p className="text-2xl font-extrabold" style={{ color: "var(--text)" }}>
              {route.elevation_gain_m} <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>m</span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider font-bold mb-1" style={{ color: "var(--text-muted)" }}>
              Surface
            </p>
            <p className="text-lg font-bold capitalize" style={{ color: "var(--text-secondary)" }}>
              {route.surface_type}
            </p>
          </div>
        </div>

        {coords.length > 0 && (
          <div
            className="rounded-xl overflow-hidden mb-6"
            style={{ border: "1px solid var(--border)", height: "400px" }}
          >
            <MapView routes={mapRoutes} selectedRouteId={route.id} />
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/generate"
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:brightness-110"
            style={{ background: "var(--accent)", color: "#0a0a0a" }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Find another reviewed route
          </Link>

          <Link
            href="/beta"
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:brightness-110"
            style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Apply to download GPX
          </Link>
        </div>

        <div className="mt-12 pt-6 text-center" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Shared from{" "}
            <Link href="/" className="font-bold hover:underline" style={{ color: "var(--accent)" }}>
              loops.ie
            </Link>
            {" "} — human-ridden road routes worth riding
          </p>
        </div>
      </div>
    </div>
  );
}
