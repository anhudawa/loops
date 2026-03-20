import Link from "next/link";

const DISCIPLINE_LABELS: Record<string, { icon: string; label: string }> = {
  road: { icon: "🚲", label: "Road" },
  gravel: { icon: "🪨", label: "Gravel" },
  mtb: { icon: "🏔️", label: "MTB" },
  mixed: { icon: "🗺️", label: "Mixed" },
};

interface CollectionCardProps {
  collection: {
    name: string;
    slug: string;
    description: string | null;
    location: string | null;
    country: string | null;
    cover_image_url: string | null;
    discipline: string;
    total_routes_count: number;
  };
}

export default function CollectionCard({ collection }: CollectionCardProps) {
  const disc = DISCIPLINE_LABELS[collection.discipline] ?? DISCIPLINE_LABELS.mixed;
  const locationText = [collection.location, collection.country].filter(Boolean).join(", ");

  return (
    <Link href={`/collections/${collection.slug}`} aria-label={`${collection.name} — ${collection.total_routes_count} routes`}>
      <div
        className="card-hover rounded-xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Cover image */}
        <div className="aspect-[16/9] relative overflow-hidden" style={{ background: "var(--bg-raised)" }}>
          {collection.cover_image_url ? (
            <img
              src={collection.cover_image_url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-10 h-10" style={{ color: "var(--border-light)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
            </div>
          )}

          {/* Discipline badge */}
          <div className="absolute top-3 right-3">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded neon-badge"
              style={{ color: "var(--text)", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            >
              {disc.icon} {disc.label}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-bold tracking-tight mb-1" style={{ color: "var(--text)" }}>{collection.name}</h3>
          {collection.description && (
            <p className="text-[13px] mb-3 line-clamp-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {collection.description}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="font-bold" style={{ color: "var(--accent)" }}>
              {collection.total_routes_count} route{collection.total_routes_count !== 1 ? "s" : ""}
            </span>
            {locationText && (
              <>
                <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
                <span>{locationText}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
