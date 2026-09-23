import type { Metadata } from "next";
import { cache } from "react";
import { routeCard } from "@/lib/public-route";
import { SOCIAL_FEATURES_ENABLED as SHOW_RATINGS } from "@/config/constants";
import { freeGpxPhrase, placeLabel, plural } from "@/lib/copy";
import { notFound } from "next/navigation";
import { getCountries, getRegions, getRegionStats, getRoutesByRegionSlug } from "@/lib/db";
import { slugify, generateItemListJsonLd, generateBreadcrumbJsonLd, generateFaqJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";
import AppHeader from "@/components/AppHeader";
import RouteCard from "@/components/RouteCard";
import { disciplineList, totalKm, visibleRoutes } from "../../library";

export const revalidate = 3600;

/**
 * The region's stats and the routes a rider can open; counts come from the
 * visible list so the heading, stat, FAQ and JSON-LD match the cards.
 */
const loadRegion = cache(async (countrySlug: string, regionSlug: string) => {
  const stats = await getRegionStats(countrySlug, regionSlug);
  if (!stats) return null;
  const routes = visibleRoutes(await getRoutesByRegionSlug(countrySlug, regionSlug));
  return {
    ...stats,
    // "london" and "Tipperary " share a page with "London" / "Tipperary".
    displayName: stats.displayName.trim().charAt(0).toUpperCase() + stats.displayName.trim().slice(1),
    routes,
    routeCount: routes.length,
    totalDistanceKm: totalKm(routes),
  };
});

export async function generateStaticParams() {
  // Fail soft: if the DB is unreachable at build time, render on demand
  // instead of failing the whole build.
  try {
    const countries = await getCountries();
    const params: { country: string; region: string }[] = [];
    for (const country of countries) {
      const regions = await getRegions(country);
      for (const region of regions) {
        params.push({ country: slugify(country), region: slugify(region) });
      }
    }
    // "London" and "london" are one page: one param each.
    const seen = new Set<string>();
    return params.filter((p) => {
      const k = `${p.country}/${p.region}`;
      if (!p.region || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string; region: string }>;
}): Promise<Metadata> {
  const { country: countrySlug, region: regionSlug } = await params;
  let stats: Awaited<ReturnType<typeof loadRegion>> = null;
  try {
    stats = await loadRegion(countrySlug, regionSlug);
  } catch {
    return { title: "Cycling Routes | LOOPS" };
  }
  if (!stats) return { title: "Not Found - LOOPS" };

  const place = placeLabel(stats.displayName, stats.countryDisplayName);
  const title = `Cycling Routes in ${place} — ${plural(stats.routeCount, "Route")} | LOOPS`;
  const description = `Discover ${plural(stats.routeCount, "cycling route")} in ${place}. ${freeGpxPhrase({ title: true })}, elevation profiles and road-quality notes.`;

  return {
    title,
    description,
    alternates: { canonical: `https://www.loops.ie/routes/country/${countrySlug}/${regionSlug}` },
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

export default async function RegionPage({
  params,
}: {
  params: Promise<{ country: string; region: string }>;
}) {
  const { country: countrySlug, region: regionSlug } = await params;
  // Fail soft: a DB outage shows an honest message, never a crash page.
  let stats: Awaited<ReturnType<typeof loadRegion>> = null;
  let dbDown = false;
  try {
    stats = await loadRegion(countrySlug, regionSlug);
  } catch {
    dbDown = true;
  }
  if (dbDown) return <RoutesUnavailable />;
  if (!stats) notFound();
  const routes = stats.routes;

  const place = placeLabel(stats.displayName, stats.countryDisplayName);
  const breadcrumbItems = [
    { name: "LOOPS", url: "https://www.loops.ie" },
    { name: stats.countryDisplayName, url: `https://www.loops.ie/routes/country/${countrySlug}` },
    { name: stats.displayName },
  ];

  const faqItems = [
    {
      question: `What are the best cycling routes in ${place}?`,
      answer: routes.length > 0
        ? `${routes.length === 1 ? "The route here is" : "Routes include"}: ${routes.slice(0, 3).map((r) => `${r.name} (${r.distance_km}km)`).join(", ")}.`
        : `Browse all routes on LOOPS to find rides in ${stats.displayName}.`,
    },
    {
      question: `How many cycling routes are in ${stats.displayName}?`,
      answer: `There ${Number(stats.routeCount) === 1 ? "is" : "are"} ${plural(stats.routeCount, "cycling route")} in ${place} on LOOPS.`,
    },
    {
      question: `Can I download GPX files for routes in ${stats.displayName}?`,
      answer: `Yes — ${Number(stats.routeCount) === 1 ? "the route" : "every route"} in ${stats.displayName} comes with ${freeGpxPhrase()}. Works with Strava, Komoot, Wahoo, and Garmin.`,
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={generateBreadcrumbJsonLd(breadcrumbItems)} />
      <JsonLd data={generateItemListJsonLd(`Cycling Routes in ${place}`, routes.map((r) => ({ id: r.id, name: r.name })))} />
      <JsonLd data={generateFaqJsonLd(faqItems)} />

      {/* The shared header: sign-in / account state and the main nav on
          these Google landing pages too. The breadcrumb below leads up. */}
      <AppHeader />

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <Breadcrumbs items={[
          { label: "LOOPS", href: "/" },
          { label: stats.countryDisplayName, href: `/routes/country/${countrySlug}` },
          { label: stats.displayName },
        ]} />

        <h1 className="text-3xl md:text-4xl font-extrabold mt-3 mb-4" style={{ color: "var(--text)" }}>
          Cycling Routes in {place}
        </h1>

        <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--text-secondary)" }}>
          {plural(stats.routeCount, `${disciplineList(stats.disciplines)} loop`)} in {place} on LOOPS.{" "}
          {freeGpxPhrase({ title: true })}.
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

        {/* All routes */}
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
          {routes.length === 1 ? "The route" : "All Routes"}
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
