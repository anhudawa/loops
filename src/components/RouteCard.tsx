"use client";

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
    cover_photo?: string | null;
    is_verified?: number;
  };
  isSelected?: boolean;
  onHover?: (id: string | null) => void;
}

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  easy: { label: "Easy", color: "#00ff88", bg: "rgba(0, 255, 136, 0.1)" },
  moderate: { label: "Moderate", color: "#ffbb00", bg: "rgba(255, 187, 0, 0.1)" },
  hard: { label: "Hard", color: "#ff3355", bg: "rgba(255, 51, 85, 0.1)" },
  expert: { label: "Expert", color: "#bb44ff", bg: "rgba(187, 68, 255, 0.1)" },
};

export default function RouteCard({ route, isSelected, onHover }: RouteCardProps) {
  const diff = DIFFICULTY_CONFIG[route.difficulty] || DIFFICULTY_CONFIG.easy;

  return (
    <Link href={`/routes/${route.id}`}>
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
        {/* Cover image or gradient placeholder */}
        <div className="aspect-[21/9] relative overflow-hidden">
          <img
            src={route.cover_photo ? `/photos/${route.cover_photo}` : `/api/og/${route.id}`}
            alt={route.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Difficulty badge overlaid on image */}
          <span
            className="absolute top-3 right-3 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded neon-badge"
            style={{ color: diff.color, background: diff.bg, backdropFilter: "blur(8px)" }}
          >
            {diff.label}
          </span>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <h3 className="font-bold tracking-tight" style={{ color: "var(--text)" }}>{route.name}</h3>
            {route.is_verified === 1 && (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#00ff88">
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
            <span style={{ color: "var(--border-light)" }}>|</span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              {route.elevation_gain_m}m
            </span>
            <span style={{ color: "var(--border-light)" }}>|</span>
            <span className="capitalize">{route.surface_type}</span>
            <span style={{ color: "var(--border-light)" }}>|</span>
            <span>{route.county}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
