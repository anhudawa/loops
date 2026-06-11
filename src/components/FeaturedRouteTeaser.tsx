"use client";

export interface FeaturedRoute {
  id: string;
  name: string;
  distance_km: number;
  surface_type: string;
  country: string;
  discipline: string;
  avg_score: number;
  rating_count: number;
  cover_photo: string | null;
}

/**
 * Logged-out route teaser card. The "Sign in to explore" overlay is always
 * visible on touch devices and hover-revealed on pointer devices.
 */
export default function FeaturedRouteTeaser({ route, onClick }: { route: FeaturedRoute; onClick: () => void }) {
  return (
    <div
      className="rounded-xl overflow-hidden relative group cursor-pointer"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onClick={onClick}
    >
      <div className="aspect-[16/9] relative overflow-hidden" style={{ background: "var(--bg-raised)" }}>
        <img
          src={route.cover_photo ? (route.cover_photo.startsWith("http") ? route.cover_photo : `/photos/${route.cover_photo}`) : `/api/og/${route.id}`}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div
          className="absolute inset-0 flex items-center justify-center backdrop-blur-[2px] transition-opacity opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg" style={{ background: "var(--accent)", color: "var(--bg)" }}>
            Sign in to explore
          </span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-bold text-sm truncate" style={{ color: "var(--text)" }}>{route.name}</h3>
        <div className="flex items-center gap-2 mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="font-bold" style={{ color: "var(--accent)" }}>{route.distance_km} km</span>
          <span>|</span>
          <span className="capitalize">{route.surface_type}</span>
          <span>|</span>
          <span>{route.country}</span>
        </div>
        {route.avg_score > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="var(--warning)">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>{route.avg_score.toFixed(1)}</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>({route.rating_count})</span>
          </div>
        )}
      </div>
    </div>
  );
}
