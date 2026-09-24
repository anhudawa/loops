import { notFound } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";
import { generateBreadcrumbJsonLd, generateFaqJsonLd, slugify } from "@/lib/seo";
import { plural } from "@/lib/copy";
import { estimateRideMinutes, formatRideTime } from "@/lib/ride-time";
import { getDestinationBySlug, type Destination } from "@/content/destinations";
import { getCollectionBySlug, getRoutesByRegionSlug } from "@/lib/db";
import { listedRoutes, visibleRoutes } from "@/app/routes/country/library";

interface Props {
  params: Promise<{ destination: string }>;
}

// ISR: keep these SEO pages cached/fast, but revalidate hourly so the
// collection-exists check reflects real data (and picks up new collections)
// instead of being frozen at build time.
export const revalidate = 3600;

function placeJsonLd(dest: Destination) {
  return {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: `Cycling in ${dest.name}`,
    description: `${dest.tagline}. ${dest.riding[0]?.slice(0, 200)}...`,
    url: `https://www.loops.ie/cycling/${dest.slug}`,
    touristType: {
      "@type": "Audience",
      audienceType: "Cyclists",
    },
    geo: {
      "@type": "GeoCoordinates",
      addressCountry: dest.country,
    },
    containedInPlace: {
      "@type": "Country",
      name: dest.country,
    },
  };
}

export default async function DestinationPage({ params }: Props) {
  const { destination } = await params;
  const dest = getDestinationBySlug(destination);
  if (!dest) notFound();

  // Only offer the collection link when the collection actually exists —
  // otherwise the button is a dead link (a missing/unseeded collection 404s).
  // Fail soft: a DB hiccup just hides the button, never breaks the page.
  // The count is the cards the collection page shows (v1 disciplines, no
  // broken tracks), so the button and the page agree.
  let hasCollection = false;
  let collectionRouteCount = 0;
  if (dest.collectionSlug) {
    try {
      const coll = await getCollectionBySlug(dest.collectionSlug);
      collectionRouteCount = coll ? listedRoutes(coll.routes).length : 0;
      hasCollection = collectionRouteCount > 0;
    } catch {
      hasCollection = false;
    }
  }

  // Same for "Browse all <region> routes": only when that region listing
  // exists (Wicklow's link was the only 404 in the site crawl) and holds
  // more than one route — "Browse all" over a single route is a dead end.
  // Counted from the cards the region page shows (broken tracks hidden), not
  // the SQL total, so "8 Gran Canaria loops" opens 8 cards.
  let hasRegion = false;
  let regionRouteCount = 0;
  let topRoutes: Array<{ id: string; name: string; distance_km: number; elevation_gain_m: number }> = [];
  if (dest.routesCountry && dest.routesRegion) {
    try {
      const routes = await getRoutesByRegionSlug(slugify(dest.routesCountry), slugify(dest.routesRegion));
      const shown = visibleRoutes(routes);
      regionRouteCount = shown.length;
      hasRegion = regionRouteCount > 1;
      // A few loops right on the guide (server-rendered links: riders and
      // crawlers reach routes without the list page).
      topRoutes = shown.slice(0, 6).map((r) => ({ id: r.id, name: r.name, distance_km: Number(r.distance_km), elevation_gain_m: Number(r.elevation_gain_m) }));
    } catch {
      hasRegion = false;
    }
  }

  // "Plan a ride in <name>" opens the planner on a loop from the
  // destination's base town (and keeps it through sign-in: /generate carries
  // ?q= through the login redirect) instead of an empty planner.
  const planHref = `/generate?q=${encodeURIComponent(`A 2-hour road loop from ${dest.plannerPlace}`)}`;

  const breadcrumb = generateBreadcrumbJsonLd([
    { name: "Home", url: "https://www.loops.ie" },
    { name: "Destinations", url: "https://www.loops.ie/cycling" },
    { name: dest.name, url: `https://www.loops.ie/cycling/${dest.slug}` },
  ]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={placeJsonLd(dest)} />
      <JsonLd data={generateFaqJsonLd(dest.faqs)} />
      <JsonLd data={breadcrumb} />

      {/* Header */}
      <AppHeader />

      <main id="main-content" className="max-w-3xl mx-auto px-4 pt-4 pb-10">
        <Breadcrumbs items={[{ label: "Destinations", href: "/cycling" }, { label: dest.name }]} />

        {/* Hero */}
        <div className="mb-10 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{
                color: "var(--text)",
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              {dest.country}
            </span>
          </div>

          <h1
            className="text-3xl md:text-4xl font-black tracking-tight mb-3 leading-tight"
            style={{ color: "var(--text)" }}
          >
            Cycling in {dest.name}
          </h1>

          <p
            className="text-lg leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            {dest.tagline}
          </p>

          {/* The routes, up front: on a phone the full CTAs sit ~11,000 px down. */}
          <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="destination-route-strip">
            {hasRegion && dest.routesCountry && dest.routesRegion && (
              <Link
                href={`/routes/country/${slugify(dest.routesCountry)}/${slugify(dest.routesRegion)}`}
                className="inline-flex items-center justify-center min-h-[44px] font-bold text-sm px-4 rounded-lg"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                {regionRouteCount} {dest.name} loops →
              </Link>
            )}
            {/* The collection is usually the same routes: one button when the counts match. */}
            {dest.collectionSlug && hasCollection && !(hasRegion && collectionRouteCount === regionRouteCount) && (
              <Link
                href={`/collections/${dest.collectionSlug}`}
                className="inline-flex items-center justify-center min-h-[44px] font-bold text-sm px-4 rounded-lg"
                style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg-card)" }}
              >
                {plural(collectionRouteCount, "classic loop")} →
              </Link>
            )}
            {/* No library here yet (Wicklow): the way forward is a planned loop. */}
            {!hasRegion && !hasCollection && (
              <Link
                href={planHref}
                className="inline-flex items-center justify-center min-h-[44px] font-bold text-sm px-4 rounded-lg"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                Plan a loop from {dest.plannerPlace} →
              </Link>
            )}
          </div>
        </div>

        {/* Best time to ride */}
        <section className="mb-10">
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-4"
            style={{ color: "var(--text)" }}
          >
            Best time to ride
          </h2>
          <div
            className="rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
            }}
          >
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Best months
              </p>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                {dest.bestMonths}
              </p>
            </div>
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Temperature
              </p>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                {dest.avgTemp}
              </p>
            </div>
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Rainfall
              </p>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                {dest.rainfall}
              </p>
            </div>
          </div>
        </section>

        {/* The riding */}
        <section className="mb-10">
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-4"
            style={{ color: "var(--text)" }}
          >
            The riding
          </h2>
          <div className="space-y-4">
            {dest.riding.map((paragraph, i) => (
              <p
                key={i}
                className="text-base leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        {/* Key climbs & routes */}
        <section className="mb-10">
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-4"
            style={{ color: "var(--text)" }}
          >
            Key climbs &amp; routes
          </h2>
          <ul className="space-y-3">
            {dest.climbs.map((climb, i) => {
              const dashIdx = climb.indexOf(" — ");
              const name = dashIdx !== -1 ? climb.slice(0, dashIdx) : climb;
              const desc =
                dashIdx !== -1 ? climb.slice(dashIdx + 3) : undefined;

              return (
                <li
                  key={i}
                  className="rounded-lg px-4 py-3"
                  style={{
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    className="text-sm font-bold"
                    style={{ color: "var(--text)" }}
                  >
                    {name}
                  </span>
                  {desc && (
                    <span
                      className="text-sm ml-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {" "}
                      &mdash; {desc}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Practical info */}
        <section className="mb-10">
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-4"
            style={{ color: "var(--text)" }}
          >
            Practical info
          </h2>
          <div className="space-y-4">
            <div
              className="rounded-lg px-4 py-3"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Getting there
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {dest.practical.airport}
              </p>
            </div>
            <div
              className="rounded-lg px-4 py-3"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Bike hire
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {dest.practical.bikeHire}
              </p>
            </div>
            <div
              className="rounded-lg px-4 py-3"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Where to stay
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {dest.practical.accommodation}
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          className="mb-10 pt-8 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-6"
            style={{ color: "var(--text)" }}
          >
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {dest.faqs.map((faq, i) => (
              <div key={i}>
                <h3
                  className="text-base font-bold mb-1"
                  style={{ color: "var(--text)" }}
                >
                  {faq.question}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Route library link */}
        {hasRegion && dest.routesCountry && dest.routesRegion && (
          <div
            className="mb-6 rounded-xl p-5 text-center"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
              {plural(regionRouteCount, `${dest.name} loop`)} in the library — elevation profile and climbs for each.
            </p>
            {topRoutes.length > 0 && (
              <ul className="text-left mb-4 grid gap-2">
                {topRoutes.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/routes/${r.id}`}
                      className="flex items-baseline justify-between gap-3 min-h-[44px] px-3 py-2 rounded-lg"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                    >
                      <span className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>{r.name}</span>
                      <span className="text-xs shrink-0 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {Math.round(r.distance_km)} km · +{r.elevation_gain_m} m · {formatRideTime(estimateRideMinutes({ distance_km: r.distance_km, elevation_gain_m: r.elevation_gain_m, discipline: "road" }), { style: "card" })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/routes/country/${slugify(dest.routesCountry)}/${slugify(dest.routesRegion)}`}
              className="inline-flex items-center justify-center font-bold text-sm px-5 min-h-[44px] rounded-lg"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
              }}
            >
              Browse {plural(regionRouteCount, `${dest.name} loop`)}
            </Link>
          </div>
        )}

        {/* Collection link — only when the collection exists (no dead links) */}
        {dest.collectionSlug && hasCollection && (
          <div
            className="mb-6 rounded-xl p-5 text-center"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
            }}
          >
            <p
              className="text-sm mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              Short on time? Our pick of the {dest.name} classics.
            </p>
            <Link
              href={`/collections/${dest.collectionSlug}`}
              className="inline-flex items-center justify-center font-bold text-sm px-5 min-h-[44px] rounded-lg"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text)",
                background: "var(--bg-card)",
              }}
            >
              See the {dest.name} Collection
            </Link>
          </div>
        )}

        {/* CTA */}
        <div
          className="rounded-xl p-6 text-center"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
          }}
        >
          <h2
            className="text-xl font-black tracking-tight mb-2"
            style={{ color: "var(--text)" }}
          >
            Plan a ride in {dest.name}
          </h2>
          <p
            className="text-sm leading-relaxed mb-4 max-w-md mx-auto"
            style={{ color: "var(--text-muted)" }}
          >
            Start with a 2-hour loop from {dest.plannerPlace}, then tell the
            planner how long you want to ride and the terrain you prefer
            &mdash; get a route that fits.
          </p>
          <Link
            href={planHref}
            className="inline-flex items-center justify-center font-bold text-sm px-6 min-h-[44px] rounded-lg"
            style={{ background: "var(--accent)", color: "#0a0a0a" }}
          >
            Plan a loop from {dest.plannerPlace}
          </Link>
        </div>
      </main>
    </div>
  );
}
