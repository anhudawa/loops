"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import ElevationProfile from "@/components/ElevationProfile";
import StarRating from "@/components/StarRating";
import Comments from "@/components/Comments";
import PhotoGallery from "@/components/PhotoGallery";
import ConditionReports from "@/components/ConditionReports";
import RideActions from "@/components/RideActions";
import ShareRide from "@/components/ShareRide";
import WeatherCard from "@/components/WeatherCard";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

interface Route {
  id: string;
  name: string;
  description: string | null;
  difficulty: string;
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  surface_type: string;
  county: string;
  start_lat: number;
  start_lng: number;
  gpx_filename: string | null;
  coordinates: string;
  created_at: string;
  is_verified?: number;
}

const DIFF: Record<string, { label: string; color: string; bg: string }> = {
  easy: { label: "Easy", color: "#00ff88", bg: "rgba(0, 255, 136, 0.1)" },
  moderate: { label: "Moderate", color: "#ffbb00", bg: "rgba(255, 187, 0, 0.1)" },
  hard: { label: "Hard", color: "#ff3355", bg: "rgba(255, 51, 85, 0.1)" },
  expert: { label: "Expert", color: "#bb44ff", bg: "rgba(187, 68, 255, 0.1)" },
};

export default function RouteDetail() {
  const params = useParams();
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [windData, setWindData] = useState<{ direction: number; speed: number } | null>(null);
  const [windOverlayEnabled, setWindOverlayEnabled] = useState(false);
  const [travelOverlayEnabled, setTravelOverlayEnabled] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetch(`/api/routes/${params.id}`)
        .then((r) => r.json())
        .then((data) => {
          setRoute(data);
          setLoading(false);
        });
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full" style={{ background: "var(--border)" }} />
          <div className="h-3 rounded w-24" style={{ background: "var(--border)" }} />
        </div>
      </div>
    );
  }

  if (!route || !route.coordinates) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-center">
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>Route not found</p>
          <Link href="/" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
            Back to routes
          </Link>
        </div>
      </div>
    );
  }

  const coordinates: [number, number][] = JSON.parse(route.coordinates);
  const diff = DIFF[route.difficulty] || DIFF.easy;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="hover:opacity-80 transition-opacity" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <Link href="/">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
        </div>
      </header>

      {/* Hero: Map full-bleed */}
      <div className="h-[280px] md:h-[360px] relative">
        <MapView routes={[route]} selectedRouteId={route.id} windOverlay={windOverlayEnabled && windData ? windData : null} travelOverlay={travelOverlayEnabled} />
        <div className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none z-[1]" style={{ background: "linear-gradient(to top, var(--bg), transparent)" }} />
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 -mt-8 relative z-[2]">
        {/* Weather */}
        <div className="mb-4">
          <WeatherCard
            routeId={route.id}
            windOverlayEnabled={windOverlayEnabled}
            onWindToggle={setWindOverlayEnabled}
            travelOverlayEnabled={travelOverlayEnabled}
            onTravelToggle={setTravelOverlayEnabled}
            onWeatherLoaded={(wind) => setWindData(wind)}
            coordinates={coordinates}
          />
        </div>

        {/* Title card */}
        <div className="rounded-2xl p-5 md:p-7 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                <span>{route.county}</span>
                <span>·</span>
                <span>Ireland</span>
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{route.name}</h1>
                {route.is_verified === 1 && (
                  <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg shrink-0" style={{ color: "#00ff88", background: "rgba(0, 255, 136, 0.1)" }}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Verified
                  </span>
                )}
              </div>
            </div>
            <span
              className="shrink-0 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg neon-badge"
              style={{ color: diff.color, background: diff.bg }}
            >
              {diff.label}
            </span>
          </div>

          <div className="mb-4">
            <StarRating routeId={route.id} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            {[
              { label: "Distance", value: `${route.distance_km}km` },
              { label: "Gain", value: `${route.elevation_gain_m}m` },
              { label: "Loss", value: `${route.elevation_loss_m}m` },
              { label: "Surface", value: route.surface_type },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-lg md:text-xl font-extrabold capitalize" style={{ color: "var(--accent)" }}>{stat.value}</p>
                <p className="text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="rounded-2xl p-5 md:p-6 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <PhotoGallery routeId={route.id} />
        </div>

        {/* Ride Actions */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <RideActions routeId={route.id} routeName={route.name} />
          <ShareRide route={route} />
        </div>

        {/* Description & Elevation */}
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="rounded-2xl p-5 md:p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-xs font-extrabold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>About this route</h2>
            {route.description ? (
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{route.description}</p>
            ) : (
              <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>No description provided</p>
            )}
          </div>

          <div className="rounded-2xl p-5 md:p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-xs font-extrabold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Elevation Profile</h2>
            <ElevationProfile
              coordinates={coordinates}
              elevationGain={route.elevation_gain_m}
              elevationLoss={route.elevation_loss_m}
            />
          </div>
        </div>

        {/* Trail Conditions */}
        <div className="rounded-2xl p-5 md:p-6 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <ConditionReports routeId={route.id} />
        </div>

        {/* Comments */}
        <div className="rounded-2xl p-5 md:p-6 mb-8" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <Comments routeId={route.id} />
        </div>
      </div>
    </div>
  );
}
