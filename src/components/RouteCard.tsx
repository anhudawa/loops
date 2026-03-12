"use client";

import { useState } from "react";
import Link from "next/link";

interface RouteCardProps {
  route: {
    id: string;
    name: string;
    description: string | null;
    difficulty: string;
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
  };
  isSelected?: boolean;
  onHover?: (id: string | null) => void;
  showDistance?: boolean;
}

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  easy: { label: "Easy", color: "var(--success)", bg: "rgba(0, 255, 136, 0.1)" },
  moderate: { label: "Moderate", color: "var(--warning)", bg: "rgba(255, 187, 0, 0.1)" },
  hard: { label: "Hard", color: "var(--danger)", bg: "rgba(255, 51, 85, 0.1)" },
  expert: { label: "Expert", color: "var(--purple)", bg: "rgba(187, 68, 255, 0.1)" },
};

const DISCIPLINE_LABELS: Record<string, { icon: string; label: string }> = {
  road: { icon: "\uD83D\uDEB2", label: "Road" },
  gravel: { icon: "\uD83E\uDEA8", label: "Gravel" },
  mtb: { icon: "\uD83C\uDFD4\uFE0F", label: "MTB" },
};

export default function RouteCard({ route, isSelected, onHover, showDistance }: RouteCardProps) {
  const [imgError, setImgError] = useState(false);
  const diff = DIFFICULTY_CONFIG[route.difficulty] || DIFFICULTY_CONFIG.easy;
  const discipline = route.discipline ? DISCIPLINE_LABELS[route.discipline] : null;
  const locationText = route.region || route.county;
  const countryText = route.country ? `, ${route.country}` : "";

  return (
    <Link
      href={`/routes/${route.id}`}
      aria-label={`${route.name} — ${route.distance_km} km ${diff.label} ${route.discipline || ""} route in ${locationText}${countryText}`}
    >
      <div
        className="card-hover rounded-xl overflow-hidden"
        style={{
          background: isSelected ? "var(--bg-card-hover)" : "var(--bg-card)",
          border: isSelected ? "1px solid rgba(200, 255, 0, 0.3)" : "1px solid var(--border)",
          boxShadow: isSelected ? "0 0 20px rgba(200, 255, 0, 0.08)" : "none",
        }}
        onMouseEnter={() => onHover?.(route.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        {/* Cover image */}
        <div className="aspect-[21/9] relative overflow-hidden" style={{ background: "var(--bg-raised)" }}>
          {!imgError ? (
            <img
              src={route.cover_photo ? `/photos/${route.cover_photo}` : `/api/og/${route.id}`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-card)" }}>
              <svg className="w-8 h-8" style={{ color: "var(--border-light)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            {discipline && (
              <span
                className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded neon-badge"
                style={{ color: "var(--text)", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
                aria-label={`${discipline.label} discipline`}
              >
                {discipline.icon} {discipline.label}
              </span>
            )}
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded neon-badge"
              style={{ color: diff.color, background: diff.bg, backdropFilter: "blur(8px)" }}
              aria-label={`${diff.label} difficulty`}
            >
              {diff.label}
            </span>
          </div>

          {/* Distance badge */}
          {showDistance && route.distance_km_away !== undefined && (
            <span
              className="absolute top-3 left-3 text-[11px] font-bold px-2 py-0.5 rounded"
              style={{ color: "var(--accent)", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
            >
              {Math.round(route.distance_km_away)} km away
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <h3 className="font-bold tracking-tight" style={{ color: "var(--text)" }}>{route.name}</h3>
            {route.is_verified === 1 && (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="var(--success)" aria-label="Verified route">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )}
          </div>

          {route.description && (
            <p className="text-[13px] mb-3 line-clamp-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>{route.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1 font-bold" style={{ color: "var(--accent)" }}>
              {route.distance_km} km
            </span>
            <span style={{ color: "var(--border-light)" }} aria-hidden="true">|</span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              {route.elevation_gain_m}m
            </span>
            <span style={{ color: "var(--border-light)" }} aria-hidden="true">|</span>
            <span className="capitalize">{route.surface_type}</span>
            <span style={{ color: "var(--border-light)" }} aria-hidden="true">|</span>
            <span>{locationText}{countryText}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
