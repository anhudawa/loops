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
import { useAuth } from "@/components/AuthProvider";

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
  country: string;
  region: string | null;
  discipline: string;
  start_lat: number;
  start_lng: number;
  gpx_filename: string | null;
  coordinates: string;
  created_by: string | null;
  created_at: string;
  is_verified?: number;
  creator_name?: string | null;
  creator_avatar?: string | null;
  creator_rating?: number;
  creator_rating_count?: number;
}

const DIFF: Record<string, { label: string; color: string; bg: string }> = {
  easy: { label: "Easy", color: "var(--success)", bg: "rgba(0, 255, 136, 0.1)" },
  moderate: { label: "Moderate", color: "var(--warning)", bg: "rgba(255, 187, 0, 0.1)" },
  hard: { label: "Hard", color: "var(--danger)", bg: "rgba(255, 51, 85, 0.1)" },
  expert: { label: "Expert", color: "var(--purple)", bg: "rgba(187, 68, 255, 0.1)" },
};

export default function RouteDetail() {
  const params = useParams();
  const { user } = useAuth();
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [windData, setWindData] = useState<{ direction: number; speed: number } | null>(null);
  const [windOverlayEnabled, setWindOverlayEnabled] = useState(false);
  const [travelOverlayEnabled, setTravelOverlayEnabled] = useState(false);
  const [isFollowingCreator, setIsFollowingCreator] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [isFavourited, setIsFavourited] = useState(false);
  const [favCount, setFavCount] = useState(0);
  const [favLoading, setFavLoading] = useState(false);

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

  // Check favourite status
  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/routes/${params.id}/favourite`)
      .then((r) => r.json())
      .then((data) => {
        setIsFavourited(data.favourited);
        setFavCount(data.count);
      })
      .catch(() => {});
  }, [params.id]);

  // Check if viewer follows the route creator
  useEffect(() => {
    if (!route?.created_by || !user || user.id === route.created_by) return;
    fetch(`/api/users/${route.created_by}/follow`)
      .then((r) => r.json())
      .then((data) => setIsFollowingCreator(data.following))
      .catch(() => {});
  }, [route?.created_by, user]);

  const handleFollowCreator = async () => {
    if (!route?.created_by || followLoading) return;
    // Optimistic: toggle immediately
    const wasFollowing = isFollowingCreator;
    setIsFollowingCreator(!wasFollowing);
    setFollowLoading(true);
    try {
      const method = wasFollowing ? "DELETE" : "POST";
      const res = await fetch(`/api/users/${route.created_by}/follow`, { method });
      if (!res.ok) setIsFollowingCreator(wasFollowing);
    } catch {
      setIsFollowingCreator(wasFollowing);
    }
    setFollowLoading(false);
  };

  const handleFavourite = async () => {
    if (favLoading || !user) return;
    // Optimistic: toggle immediately
    const wasFavourited = isFavourited;
    const prevCount = favCount;
    setIsFavourited(!wasFavourited);
    setFavCount(wasFavourited ? prevCount - 1 : prevCount + 1);
    setFavLoading(true);
    try {
      const res = await fetch(`/api/routes/${params.id}/favourite`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIsFavourited(data.favourited);
        setFavCount(data.count);
      } else {
        setIsFavourited(wasFavourited);
        setFavCount(prevCount);
      }
    } catch {
      setIsFavourited(wasFavourited);
      setFavCount(prevCount);
    }
    setFavLoading(false);
  };

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
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <span className="logo-mark text-gradient text-5xl mb-6">LOOPS</span>
        <h1 className="text-6xl font-extrabold mb-2" style={{ color: "var(--text)" }}>Route not found</h1>
        <p className="text-lg mb-8" style={{ color: "var(--text-muted)" }}>
          This loop doesn&apos;t exist — yet.
        </p>
        <Link
          href="/"
          className="btn-accent px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-wider"
        >
          Back to exploring
        </Link>
      </div>
    );
  }

  const rawCoords: number[][] = JSON.parse(route.coordinates);
  const coordinates: [number, number][] = rawCoords.map((c) => [c[0], c[1]]);
  const elevations: number[] = rawCoords.map((c) => c[2] ?? 0);
  const diff = DIFF[route.difficulty] || DIFF.easy;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:opacity-80 transition-opacity" style={{ color: "var(--text-muted)" }}>
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
      <div className="h-[200px] md:h-[360px] relative">
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
        <div className="rounded-2xl p-4 md:p-7 mb-4 md:mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                <span>{route.region || route.county}</span>
                <span>·</span>
                <span>{route.country || "Ireland"}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-2xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{route.name}</h1>
                {route.is_verified === 1 && (
                  <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg shrink-0" style={{ color: "var(--success)", background: "rgba(0, 255, 136, 0.1)" }}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Verified
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg neon-badge"
                style={{ color: diff.color, background: diff.bg }}
              >
                {diff.label}
              </span>
              <button
                onClick={handleFavourite}
                disabled={favLoading || !user}
                className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded-lg transition-all"
                style={{
                  background: isFavourited ? "rgba(255, 51, 85, 0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isFavourited ? "rgba(255, 51, 85, 0.3)" : "var(--border)"}`,
                  opacity: favLoading ? 0.5 : 1,
                  cursor: user ? "pointer" : "default",
                }}
                title={user ? (isFavourited ? "Remove from favourites" : "Add to favourites") : "Sign in to favourite"}
              >
                <svg
                  className="w-4 h-4 transition-transform"
                  viewBox="0 0 24 24"
                  fill={isFavourited ? "var(--danger)" : "none"}
                  stroke={isFavourited ? "var(--danger)" : "var(--text-muted)"}
                  strokeWidth={2}
                  style={{ transform: isFavourited ? "scale(1.1)" : "scale(1)" }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {favCount > 0 && (
                  <span className="text-[11px] font-bold" style={{ color: isFavourited ? "var(--danger)" : "var(--text-muted)" }}>
                    {favCount}
                  </span>
                )}
              </button>
            </div>
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
                <p className="text-base md:text-xl font-extrabold capitalize" style={{ color: "var(--accent)" }}>{stat.value}</p>
                <p className="text-[9px] md:text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Uploaded by */}
        {route.created_by && route.creator_name && (
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 mb-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <Link href={`/profile/${route.created_by}`} className="shrink-0">
              {route.creator_avatar ? (
                <img
                  src={route.creator_avatar}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover"
                  style={{ border: "2px solid var(--border)" }}
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "2px solid var(--border)" }}
                >
                  {route.creator_name.charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                Uploaded by
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={`/profile/${route.created_by}`}
                  className="text-sm font-bold hover:opacity-80 transition-opacity truncate"
                  style={{ color: "var(--text)" }}
                >
                  {route.creator_name}
                </Link>
                {route.creator_rating !== undefined && Number(route.creator_rating) > 0 && (
                  <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="var(--warning)" aria-hidden="true">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span className="font-bold">{(Math.round(Number(route.creator_rating) * 10) / 10).toFixed(1)}</span>
                    <span style={{ opacity: 0.5 }}>({route.creator_rating_count})</span>
                  </span>
                )}
              </div>
            </div>
            {user && user.id !== route.created_by && (
              <button
                onClick={handleFollowCreator}
                disabled={followLoading}
                className="shrink-0 text-xs font-bold uppercase tracking-wider px-4 py-2.5 min-h-[44px] rounded-lg transition-all hover:scale-[1.03]"
                style={
                  isFollowingCreator
                    ? { background: "rgba(200, 255, 0, 0.1)", color: "var(--accent)", border: "1px solid rgba(200, 255, 0, 0.3)" }
                    : { background: "var(--accent)", color: "var(--bg)", border: "1px solid var(--accent)" }
                }
              >
                {isFollowingCreator ? "Following" : "Follow"}
              </button>
            )}
          </div>
        )}

        {/* Photos */}
        <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <PhotoGallery routeId={route.id} />
        </div>

        {/* Share Ride — prominent CTA */}
        <div className="mb-4">
          <ShareRide route={route} />
        </div>

        {/* Ride Actions */}
        <div className="mb-6">
          <RideActions routeId={route.id} routeName={route.name} />
        </div>

        {/* Description & Elevation */}
        <div className="grid md:grid-cols-2 gap-3 md:gap-4 mb-4">
          <div className="rounded-2xl p-4 md:p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-xs font-extrabold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>About this route</h2>
            {route.description ? (
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{route.description}</p>
            ) : (
              <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>No description provided</p>
            )}
          </div>

          <div className="rounded-2xl p-4 md:p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-xs font-extrabold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Elevation Profile</h2>
            <ElevationProfile
              elevations={elevations}
              coordinates={coordinates}
              distanceKm={route.distance_km}
              elevationGain={route.elevation_gain_m}
              elevationLoss={route.elevation_loss_m}
            />
          </div>
        </div>

        {/* Trail Conditions */}
        <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <ConditionReports routeId={route.id} />
        </div>

        {/* Comments */}
        <div className="rounded-2xl p-4 md:p-6 mb-6 md:mb-8" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <Comments routeId={route.id} />
        </div>
      </div>
    </div>
  );
}
