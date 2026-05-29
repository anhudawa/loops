import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCollectionBySlug } from "@/lib/db";
import RouteCard from "@/components/RouteCard";
import JsonLd from "@/components/JsonLd";
import { generateCollectionJsonLd, generateBreadcrumbJsonLd } from "@/lib/seo";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  let collection: Awaited<ReturnType<typeof getCollectionBySlug>> = null;
  try {
    collection = await getCollectionBySlug(slug);
  } catch {
    return {};
  }
  if (!collection) return {};

  const title = collection.seo_title || `${collection.name} — LOOPS Collections`;
  const description =
    collection.seo_description ||
    collection.description ||
    `${collection.total_routes_count} curated cycling routes${collection.location ? ` in ${collection.location}` : ""}.`;

  return {
    title,
    description,
    alternates: { canonical: `/collections/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://www.loops.ie/collections/${slug}`,
      ...(collection.cover_image_url && {
        images: [{ url: collection.cover_image_url, width: 1200, height: 630, alt: collection.name }],
      }),
    },
  };
}

const DISCIPLINE_LABELS: Record<string, { icon: string; label: string }> = {
  road: { icon: "🚲", label: "Road" },
  gravel: { icon: "🪨", label: "Gravel" },
  mtb: { icon: "🏔️", label: "MTB" },
  mixed: { icon: "🗺️", label: "Mixed" },
};

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  let collection: Awaited<ReturnType<typeof getCollectionBySlug>> = null;
  try {
    collection = await getCollectionBySlug(slug);
  } catch {
    notFound();
  }
  if (!collection) notFound();

  const disc = DISCIPLINE_LABELS[collection.discipline] ?? DISCIPLINE_LABELS.mixed;
  const locationText = [collection.location, collection.country].filter(Boolean).join(", ");

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: "Home", url: "https://loops.ie" },
    { name: "Collections", url: "https://loops.ie/collections" },
    { name: collection.name },
  ]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={generateCollectionJsonLd(collection)} />
      <JsonLd data={breadcrumbJsonLd} />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/" className="font-black text-xl tracking-tight" style={{ color: "var(--accent)" }}>
            LOOPS
          </Link>
          <span style={{ color: "var(--border-light)" }} aria-hidden="true">/</span>
          <Link href="/collections" className="text-sm font-semibold hover:opacity-80" style={{ color: "var(--text-muted)" }}>
            Collections
          </Link>
          <span style={{ color: "var(--border-light)" }} aria-hidden="true">/</span>
          <span className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{collection.name}</span>
        </div>
      </header>

      {/* Hero cover image */}
      {collection.cover_image_url && (
        <div className="w-full h-56 md:h-80 relative overflow-hidden" style={{ background: "var(--bg-raised)" }}>
          <img src={collection.cover_image_url} alt="" className="w-full h-full object-cover" />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }}
          />
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* Title block */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded neon-badge"
              style={{ color: "var(--text)", background: "var(--bg-raised)", border: "1px solid var(--border)" }}
            >
              {disc.icon} {disc.label}
            </span>
            {collection.difficulty_range && (
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded"
                style={{ color: "var(--text-muted)", background: "var(--bg-raised)", border: "1px solid var(--border)" }}
              >
                {collection.difficulty_range}
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2" style={{ color: "var(--text)" }}>
            {collection.name}
          </h1>

          <div className="flex items-center gap-3 text-sm mb-4" style={{ color: "var(--text-muted)" }}>
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

          {collection.description && (
            <p className="text-base leading-relaxed max-w-2xl" style={{ color: "var(--text-muted)" }}>
              {collection.description}
            </p>
          )}
        </div>

        {/* Route list */}
        {collection.routes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No routes in this collection yet.</p>
        ) : (
          <div className="space-y-3">
            {collection.routes.map((route, index) => (
              <div key={route.id} className="flex items-start gap-3">
                <span
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mt-3"
                  style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <RouteCard route={route} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
