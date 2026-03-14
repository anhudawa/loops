import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountries, getCountryStats, getRoutesByCountrySlug } from "@/lib/db";
import { slugify, generateItemListJsonLd, generateBreadcrumbJsonLd, generateFaqJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";

export const revalidate = 3600;

export async function generateStaticParams() {
  const countries = await getCountries();
  return countries.map((country) => ({ country: slugify(country) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string }>;
}): Promise<Metadata> {
  const { country: countrySlug } = await params;
  const stats = await getCountryStats(countrySlug);
  if (!stats) return { title: "Not Found - LOOPS" };

  const title = `Cycling Routes in ${stats.displayName} — ${stats.routeCount} Routes | LOOPS`;
  const description = `Discover ${stats.routeCount} cycling routes in ${stats.displayName}. Browse ${stats.disciplines.join(", ")} routes with free GPX downloads. Community rated.`;

  return {
    title,
    description,
    alternates: { canonical: `https://loops.ie/routes/country/${countrySlug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      siteName: "LOOPS",
      type: "website",
      locale: "en_IE",
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
  const stats = await getCountryStats(countrySlug);
  if (!stats) notFound();

  const routes = await getRoutesByCountrySlug(countrySlug);
  const featuredRoutes = routes.slice(0, 6);

  const breadcrumbItems = [
    { name: "LOOPS", url: "https://loops.ie" },
    { name: stats.displayName },
  ];

  const faqItems = [
    {
      question: `What are the best cycling routes in ${stats.displayName}?`,
      answer: featuredRoutes.length > 0
        ? `Top rated routes include: ${featuredRoutes.slice(0, 3).map((r) => `${r.name} (${r.distance_km}km)`).join(", ")}.`
        : `Browse all ${stats.routeCount} routes on LOOPS to find the best rides.`,
    },
    {
      question: `How many cycling routes are in ${stats.displayName}?`,
      answer: `There are ${stats.routeCount} cycling routes in ${stats.displayName} on LOOPS, covering ${stats.disciplines.join(", ")} disciplines across ${stats.difficulties.join(", ")} difficulty levels.`,
    },
    {
      question: `Can I download GPX files for routes in ${stats.displayName}?`,
      answer: `Yes — all ${stats.routeCount} routes in ${stats.displayName} include free GPX file downloads. Load them into Strava, Komoot, Wahoo, or Garmin.`,
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={generateBreadcrumbJsonLd(breadcrumbItems)} />
      <JsonLd data={generateItemListJsonLd(`Cycling Routes in ${stats.displayName}`, routes)} />
      <JsonLd data={generateFaqJsonLd(faqItems)} />

      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:opacity-80" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <Link href="/">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <Breadcrumbs items={[
          { label: "LOOPS", href: "/" },
          { label: stats.displayName },
        ]} />

        <h1 className="text-3xl md:text-4xl font-extrabold mt-3 mb-4" style={{ color: "var(--text)" }}>
          Cycling Routes in {stats.displayName}
        </h1>

        <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--text-secondary)" }}>
          {stats.routeCount} cycling routes in {stats.displayName} on LOOPS.
          Browse {stats.disciplines.join(", ")} routes across {stats.regions.length} regions.
          Free GPX downloads, community ratings.
        </p>

        {/* Stats bar */}
        <div className="flex gap-6 mb-8 flex-wrap">
          <div>
            <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.routeCount}</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Routes</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.totalDistanceKm.toLocaleString()}</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Total km</div>
          </div>
          {stats.avgRating > 0 && (
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
                  key={region.name}
                  href={`/routes/country/${countrySlug}/${slugify(region.name)}`}
                  className="px-4 py-3 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
                >
                  <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{region.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>{region.routeCount} routes</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Featured routes */}
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
          {featuredRoutes.length < routes.length ? "Top Rated Routes" : "All Routes"}
        </h2>
        <div className="grid gap-3 mb-10">
          {routes.map((route) => (
            <Link
              key={route.id}
              href={`/routes/${route.id}`}
              className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors hover:opacity-80"
              style={{ background: "var(--bg-raised)" }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{route.name}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {route.distance_km}km · {route.elevation_gain_m}m climbing{route.region ? ` · ${route.region}` : ""}
                </div>
              </div>
              <span
                className="text-xs font-bold uppercase"
                style={{ color: route.difficulty === "easy" ? "var(--success)" : route.difficulty === "moderate" ? "var(--warning)" : route.difficulty === "hard" ? "var(--danger)" : "var(--purple)" }}
              >
                {route.difficulty}
              </span>
            </Link>
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
