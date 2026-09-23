import type { Metadata } from "next";
import { cache } from "react";
import { SOCIAL_FEATURES_ENABLED as SHOW_RATINGS } from "@/config/constants";
import { routeCard } from "@/lib/public-route";
import { freeGpxPhrase, plural } from "@/lib/copy";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountries, getCountryStats, getRoutesByCountrySlug } from "@/lib/db";
import { slugify, generateItemListJsonLd, generateBreadcrumbJsonLd, generateFaqJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";
import AppHeader from "@/components/AppHeader";
import RouteCard from "@/components/RouteCard";
import { disciplineList, measuredCount, regionCards, totalKm, visibleRoutes } from "../library";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * The country's stats and the routes a rider can open. Every count on the
 * page (stat, regions, FAQ, JSON-LD, metadata) comes from the visible list,
 * so the numbers match the cards. Cached per request: metadata and the page
 * share one load.
 */
const loadCountry = cache(async (countrySlug: string) => {
  const stats = await getCountryStats(countrySlug);
  if (!stats) return null;
  const routes = visibleRoutes(await getRoutesByCountrySlug(countrySlug));
  return {
    ...stats,
    routes,
    routeCount: routes.length,
    totalDistanceKm: totalKm(routes),
    regions: regionCards(routes),
  };
});

export const revalidate = 3600;

export async function generateStaticParams() {
  // Fail soft: if the DB is unreachable at build time, render on demand
  // instead of failing the whole build.
  try {
    const countries = await getCountries();
    return countries.map((country) => ({ country: slugify(country) }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string }>;
}): Promise<Metadata> {
  const { country: countrySlug } = await params;
  let stats: Awaited<ReturnType<typeof loadCountry>> = null;
  try {
    stats = await loadCountry(countrySlug);
  } catch {
    return { title: "Cycling Routes | LOOPS" };
  }
  if (!stats) return { title: "Not Found - LOOPS" };

  const title = `Cycling Routes in ${stats.displayName} — ${plural(stats.routeCount, "Route")} | LOOPS`;
  const description = `Discover ${plural(stats.routeCount, "cycling route")} in ${stats.displayName}. ${cap(disciplineList(stats.disciplines))} loops with ${freeGpxPhrase()}.`;

  return {
    title,
    description,
    alternates: { canonical: `https://www.loops.ie/routes/country/${countrySlug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      siteName: "LOOPS",
      type: "website",
      locale: "en_IE",
      images: ["/api/og"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/api/og"],
    },
  };
}

export default async function CountryPage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country: countrySlug } = await params;
  // Fail soft: a DB outage shows an honest message, never a crash page.
  let stats: Awaited<ReturnType<typeof loadCountry>> = null;
  let dbDown = false;
  try {
    stats = await loadCountry(countrySlug);
  } catch {
    dbDown = true;
  }
  if (dbDown) return <RoutesUnavailable />;
  if (!stats) notFound();
  const routes = stats.routes;
  const featuredRoutes = routes.slice(0, 6);
  const measured = measuredCount(routes);

  const breadcrumbItems = [
    { name: "LOOPS", url: "https://www.loops.ie" },
    { name: stats.displayName },
  ];

  const faqItems = [
    {
      question: `What are the best cycling routes in ${stats.displayName}?`,
      answer: featuredRoutes.length > 0
        ? `${SHOW_RATINGS ? "Top rated routes" : "Routes"} include: ${featuredRoutes.slice(0, 3).map((r) => `${r.name} (${r.distance_km} km)`).join(", ")}.`
        : `Browse ${plural(stats.routeCount, "route")} on LOOPS to find the best rides.`,
    },
    {
      question: `How many cycling routes are in ${stats.displayName}?`,
      answer: `There ${Number(stats.routeCount) === 1 ? "is" : "are"} ${plural(stats.routeCount, "cycling route")} in ${stats.displayName} on LOOPS, covering ${disciplineList(stats.disciplines)} ${stats.disciplines.length === 1 ? "riding" : "disciplines"}.`,
    },
    {
      question: `Can I download GPX files for routes in ${stats.displayName}?`,
      answer: `Yes — ${Number(stats.routeCount) === 1 ? "the route" : `all ${stats.routeCount} routes`} in ${stats.displayName} ${Number(stats.routeCount) === 1 ? "comes" : "come"} with ${freeGpxPhrase()}. Load them into Strava, Komoot, Wahoo, or Garmin.`,
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={generateBreadcrumbJsonLd(breadcrumbItems)} />
      <JsonLd data={generateItemListJsonLd(`Cycling Routes in ${stats.displayName}`, routes.map((r) => ({ id: r.id, name: r.name })))} />
      <JsonLd data={generateFaqJsonLd(faqItems)} />

      {/* The shared header: sign-in / account state and the main nav on
          these Google landing pages too. */}
      <AppHeader />

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <Breadcrumbs items={[
          { label: "LOOPS", href: "/" },
          { label: stats.displayName },
        ]} />

        <h1 className="text-3xl md:text-4xl font-extrabold mt-3 mb-4" style={{ color: "var(--text)" }}>
          Cycling Routes in {stats.displayName}
        </h1>

        <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--text-secondary)" }}>
          {plural(stats.routeCount, `${disciplineList(stats.disciplines)} loop`)} across {plural(stats.regions.length, "region")}.{" "}
          {/* Only claim what is measured: many cards still say "Not yet measured". */}
          {measured > 0 && measured === routes.length
            ? "Every loop carries a Road Standard report. "
            : measured > 0
              ? `${measured} of them carry a Road Standard report so far. `
              : ""}
          {cap(freeGpxPhrase())}.
        </p>

        {/* Stats bar */}
        <div className="flex gap-6 mb-8 flex-wrap">
          <div>
            <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.routeCount}</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{Number(stats.routeCount) === 1 ? "Route" : "Routes"}</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.totalDistanceKm.toLocaleString()}</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Total km</div>
          </div>
          {SHOW_RATINGS && stats.avgRating > 0 && (
            <div>
              <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.avgRating}</div>
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Avg rating</div>
            </div>
          )}
        </div>

        {/* Region cards */}
        {stats.regions.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
              Regions
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {stats.regions.map((region) => (
                <Link
                  key={region.slug}
                  href={`/routes/country/${countrySlug}/${region.slug}`}
                  className="px-4 py-3 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
                >
                  <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{region.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>{plural(region.routeCount, "route")}</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Featured routes */}
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
          {plural(routes.length, "route")}
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mb-10">
          {routes.map((route) => (
            <RouteCard key={route.id} route={routeCard(route as unknown as Record<string, unknown>) as never} />
          ))}
        </div>

        {/* FAQ */}
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
          Frequently Asked Questions
        </h2>
        <div className="space-y-3 mb-10">
          {faqItems.map((faq, i) => (
            <div key={i} className="px-4 py-3 rounded-lg" style={{ background: "var(--bg-raised)" }}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>{faq.question}</h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function RoutesUnavailable() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
          Routes are taking a breather
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          We couldn&apos;t load the route library just now. Give it a minute and
          refresh — the roads aren&apos;t going anywhere.
        </p>
      </div>
    </main>
  );
}
