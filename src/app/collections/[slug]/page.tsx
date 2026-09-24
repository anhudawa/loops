import type { Metadata } from "next";
import { cache } from "react";
import { DEFAULT_OG_IMAGE, pageOpenGraph, siteUrl } from "@/lib/site-meta";
import { routeCard } from "@/lib/public-route";
import { placeLabel, plural } from "@/lib/copy";
import { notFound } from "next/navigation";
import { getCollectionBySlug, getCollections } from "@/lib/db";
import RouteCard from "@/components/RouteCard";
import JsonLd from "@/components/JsonLd";
import { generateCollectionJsonLd, generateBreadcrumbJsonLd } from "@/lib/seo";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { listDiscipline, listedRoutes, mentionsHiddenDiscipline } from "@/app/routes/country/library";

// Collections change rarely: cache for an hour (was rendered per request).
export const revalidate = 3600;

// Pre-render the known collections so a tap is a cached page, not a
// per-request render (they were no-store / MISS on every hit). Fail soft:
// with the DB down at build time, pages render on demand.
export async function generateStaticParams() {
  try {
    return (await getCollections()).map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * The collection and the routes a rider can open (v1 disciplines, no broken
 * tracks). The count, the numbering, the badge and the JSON-LD all come
 * from this list. Shared by metadata and the page.
 */
const loadCollection = cache(async (slug: string) => {
  const collection = await getCollectionBySlug(slug);
  if (!collection) return null;
  const routes = listedRoutes(collection.routes);
  return { ...collection, routes, total_routes_count: routes.length };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  let collection: Awaited<ReturnType<typeof loadCollection>> = null;
  try {
    collection = await loadCollection(slug);
  } catch {
    return {};
  }
  if (!collection) return {};

  const title = collection.seo_title || `${collection.name} — LOOPS Collections`;
  const generated = `${plural(collection.total_routes_count, "curated road route")}${collection.location ? ` in ${collection.location}` : ""}.`;
  // Stored copy written before v1 went road-only can promise gravel the
  // page does not list: use the generated line then.
  const stored = [collection.seo_description, collection.description].find((d) => d && !mentionsHiddenDiscipline(d));
  const description = stored || generated;

  return {
    title,
    description,
    alternates: { canonical: siteUrl(`/collections/${slug}`) },
    openGraph: pageOpenGraph({
      path: `/collections/${slug}`,
      title,
      description,
      images: collection.cover_image_url
        ? [{ url: collection.cover_image_url, width: 1200, height: 630, alt: collection.name }]
        : undefined,
    }),
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [collection.cover_image_url ?? DEFAULT_OG_IMAGE.url],
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
  let collection: Awaited<ReturnType<typeof loadCollection>> = null;
  try {
    collection = await loadCollection(slug);
  } catch {
    // DB outage is not a 404 — show an honest degraded state.
    return (
      <main id="main-content" className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
            This collection is taking a breather
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            We couldn&apos;t load it just now. Give it a minute and refresh.
          </p>
        </div>
      </main>
    );
  }
  if (!collection) notFound();

  // v1 plans road only: the list shows the disciplines LOOPS plans, and no
  // broken tracks (RouteCard hides those — an empty numbered bubble before).
  const routes = collection.routes;
  // The badge describes what is listed, not the stored label ("Mixed" over
  // a road-only list).
  const disc = DISCIPLINE_LABELS[listDiscipline(routes, collection.discipline)] ?? DISCIPLINE_LABELS.mixed;
  const locationText = placeLabel(collection.location, collection.country);

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: "Home", url: siteUrl("/") },
    { name: "Collections", url: siteUrl("/collections") },
    { name: collection.name },
  ]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={generateCollectionJsonLd(collection)} />
      <JsonLd data={breadcrumbJsonLd} />

      <AppHeader />
      <nav aria-label="Breadcrumb" className="max-w-5xl mx-auto px-4 pt-3 text-xs flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
        <Link href="/collections" className="font-semibold hover:opacity-80 min-h-[44px] inline-flex items-center pr-1">Collections</Link>
        <span aria-hidden="true" style={{ color: "var(--border-light)" }}>/</span>
        <span className="font-semibold truncate" style={{ color: "var(--text)" }}>{collection.name}</span>
      </nav>

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

      <main id="main-content" className="max-w-5xl mx-auto px-4 py-10">
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
              {plural(routes.length, "route")}
            </span>
            {locationText && (
              <>
                <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
                <span>{locationText}</span>
              </>
            )}
          </div>

          {collection.description && (() => {
            // Stored with blank-line paragraph breaks: lead paragraph shown,
            // the rest behind "Read more" so the routes are near the top.
            const paras = collection.description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
            return (
              <div className="max-w-2xl text-base leading-relaxed space-y-3" style={{ color: "var(--text-muted)" }}>
                <p>{paras[0]}</p>
                {paras.length > 1 && (
                  <details className="group">
                    <summary className="text-sm font-bold cursor-pointer select-none min-h-[44px] flex items-center" style={{ color: "var(--accent)" }}>
                      <span className="group-open:hidden">Read more</span>
                      <span className="hidden group-open:inline">Show less</span>
                    </summary>
                    <div className="space-y-3 mt-2">
                      {paras.slice(1).map((p, i) => <p key={i}>{p}</p>)}
                    </div>
                  </details>
                )}
              </div>
            );
          })()}
        </div>

        {/* Route list */}
        {routes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No routes in this collection yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {routes.map((route, index) => (
              <div key={route.id} className="flex items-start gap-3 min-w-0">
                <span
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mt-3"
                  style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <RouteCard route={routeCard(route as unknown as Record<string, unknown>) as never} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
