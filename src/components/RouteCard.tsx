"use client";

import { useState } from "react";
import Link from "next/link";

interface RouteCardProps {
  route: {
    id: string;
    name: string;
    description: string | null;
    distance_km: number;
    elevation_gain_m: number;
    surface_type: string;
    county: string;
    country?: string;
    region?: string | null;
    discipline?: string;
    cover_photo?: string | null;
    is_verified?: number;
    distance_km_away?: number;
    estimated_minutes?: number;
    avg_score?: number;
    rating_count?: number;
    created_by?: string | null;
    creator_name?: string | null;
    creator_avatar?: string | null;
    creator_rating?: number;
    creator_rating_count?: number;
    comment_count?: number;
    operator_name?: string | null;
    operator_url?: string | null;
    ridden_by_name?: string | null;
    last_ridden_at?: string | null;
  };
  isSelected?: boolean;
  onHover?: (id: string | null) => void;
  showDistance?: boolean;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

const DISCIPLINE_LABELS: Record<string, { icon: string; label: string }> = {
  road: { icon: "\uD83D\uDEB2", label: "Road" },
  gravel: { icon: "\uD83E\uDEA8", label: "Gravel" },
  mtb: { icon: "\uD83C\uDFD4\uFE0F", label: "MTB" },
};

export default function RouteCard({ route, showDistance }: RouteCardProps) {
  const [imgError, setImgError] = useState(false);
  const discipline = route.discipline ? DISCIPLINE_LABELS[route.discipline] : null;
  const locationText = route.region || route.county;
  const countryText = route.country ? `, ${route.country}` : "";
  const hasRating = route.avg_score !== undefined && Number(route.avg_score) > 0;

  return (
    <Link
      href={`/routes/${route.id}`}
      aria-label={`${route.name} — ${route.distance_km} km ${route.discipline || ""} route in ${locationText}${countryText}`}
    >
      <div
        className="card-hover rounded-xl overflow-hidden"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Cover image */}
        <div className="aspect-[3/1] md:aspect-[21/9] relative overflow-hidden" style={{ background: "var(--bg-raised)" }}>
          {!imgError ? (
            <img
              src={`/api/og/${route.id}`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-1"
              style={{
                background:
                  "radial-gradient(ellipse 90% 70% at 50% 30%, rgba(200,255,0,0.08) 0%, var(--bg-card) 70%)",
              }}
            >
              <span className="logo-mark text-lg" style={{ color: "var(--accent)", opacity: 0.7 }}>
                LOOPS
              </span>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                {route.distance_km} km {discipline?.label ?? ""}
              </span>
            </div>
          )}

          {/* Discipline badge — only on desktop */}
          {discipline && (
            <div className="absolute top-3 right-3 hidden md:flex items-center gap-1.5">
              <span
                className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded neon-badge"
                style={{ color: "var(--text)", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
                aria-label={`${discipline.label} discipline`}
              >
                {discipline.icon} {discipline.label}
              </span>
            </div>
          )}

          {/* Proximity badge */}
          {showDistance && route.distance_km_away !== undefined && (
            <span
              className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ color: "var(--text)", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
            >
              {route.distance_km_away < 1
                ? "< 1 km away"
                : `${Math.round(route.distance_km_away)} km away`}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-2.5 md:p-4">
          {/* Mobile: name, the "should I ride this?" stats, then meta row.
              Built to be scannable at a glance (discovery-v2, 2026-06-11). */}
          <div className="md:hidden">
            <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
              <h3 className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                {route.name}
              </h3>
              {route.is_verified === 1 && (
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="var(--success)" aria-label="Human-ridden route">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
            </div>
            {/* Primary stats: distance, climbing, surface, discipline */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] mb-1">
              <span className="font-bold" style={{ color: "var(--accent)" }}>{route.distance_km} km</span>
              <span aria-hidden="true" style={{ color: "var(--border-light)" }}>·</span>
              <span style={{ color: "var(--text-secondary)" }}>{route.elevation_gain_m} m climb</span>
              <span aria-hidden="true" style={{ color: "var(--border-light)" }}>·</span>
              <span className="capitalize" style={{ color: "var(--text-secondary)" }}>{route.surface_type}</span>
              {discipline && (
                <>
                  <span aria-hidden="true" style={{ color: "var(--border-light)" }}>·</span>
                  <span style={{ color: "var(--text-secondary)" }}>{discipline.icon} {discipline.label}</span>
                </>
              )}
            </div>
            {/* Meta row: location + distance-away, rating */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                {locationText}{countryText}
                {showDistance && route.distance_km_away !== undefined && (
                  <span style={{ color: "var(--accent)" }}>
                    {" · "}
                    {route.distance_km_away < 1 ? "< 1 km away" : `${Math.round(route.distance_km_away)} km away`}
                  </span>
                )}
              </span>
              {hasRating && (
                <span className="flex items-center gap-0.5 text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="var(--warning)" aria-hidden="true">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {Number(route.avg_score).toFixed(1)}
                  {route.rating_count !== undefined && (
                    <span style={{ color: "var(--text-muted)" }}>({route.rating_count})</span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Desktop: full content */}
          <div className="hidden md:block">
            {/* Name row: title left, rating right */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="font-bold tracking-tight truncate" style={{ color: "var(--text)" }}>{route.name}</h3>
                {route.is_verified === 1 && (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="var(--success)" aria-label="Human-ridden route">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                )}
              </div>
              {hasRating && (
                <span className="flex items-center gap-1 shrink-0 text-sm">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="var(--warning)" aria-hidden="true">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span className="font-semibold" style={{ color: "var(--text)" }}>{Number(route.avg_score).toFixed(1)}</span>
                  {route.rating_count !== undefined && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>({route.rating_count})</span>
                  )}
                </span>
              )}
            </div>

            {route.description && (
              <p className="text-[13px] mb-3 line-clamp-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>{route.description}</p>
            )}

            {route.is_verified === 1 && route.ridden_by_name && route.last_ridden_at && (
              <p className="text-[11px] mb-2" style={{ color: "var(--success)" }}>
                Ridden by {route.ridden_by_name} · {new Date(route.last_ridden_at).toLocaleDateString("en-IE", { month: "short", year: "numeric" })}
              </p>
            )}

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-1 font-bold" style={{ color: "var(--accent)" }}>
                {route.distance_km} km
              </span>
              {route.estimated_minutes !== undefined && route.estimated_minutes > 0 && (
                <>
                  <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
                  <span className="font-bold" style={{ color: "var(--accent)" }}>
                    ~{formatDuration(route.estimated_minutes)}
                  </span>
                </>
              )}
              <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                {route.elevation_gain_m}m
              </span>
              <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
              <span className="capitalize">{route.surface_type}</span>
              <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
              <span>{locationText}{countryText}</span>
              {showDistance && route.distance_km_away !== undefined && (
                <>
                  <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
                  <span className="font-bold" style={{ color: "var(--accent)" }}>
                    {route.distance_km_away < 1 ? "< 1 km away" : `${Math.round(route.distance_km_away)} km away`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
