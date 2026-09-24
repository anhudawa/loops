import type { Metadata } from "next";
import { getRouteOnce as getRoute, getRouteRating } from "@/lib/db";
import { withAutoTitle } from "@/lib/route-title";
import {
  generateRouteJsonLd,
  generateBreadcrumbJsonLd,
  generateSportsActivityLocationJsonLd,
  generateFaqJsonLd,
  buildRouteFaqs,
  slugify,
} from "@/lib/seo";
import { gpxIsPublic } from "@/lib/copy";
import JsonLd from "@/components/JsonLd";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let route: Awaited<ReturnType<typeof getRoute>> = undefined;
  try {
    route = await getRoute(id);
    if (route) route = withAutoTitle(route);
  } catch {
    return { title: "Cycling Route | LOOPS" };
  }

  if (!route) {
    return { title: "Route not found | LOOPS", robots: { index: false } };
  }

  const location = route.region || route.county;
  const gpxLine = gpxIsPublic() ? "GPX for your bike computer." : "Road Standard report, ride time and GPX with a free LOOPS account.";
  const title = `${route.name} — ${route.distance_km} km ${route.discipline} route in ${location}, ${route.country} | LOOPS`;
  const description = route.description
    ? `${route.description.slice(0, 120).replace(/[.\s]+$/, "")}. ${route.distance_km} km ${route.discipline} route in ${location}, ${route.country}. ${route.elevation_gain_m} m climbing. ${gpxLine}`
    : `${route.distance_km} km ${route.discipline} route in ${location}, ${route.country}. ${route.elevation_gain_m} m climbing. ${gpxLine}`;

  return {
    title,
    description,
    alternates: { canonical: `https://www.loops.ie/routes/${id}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${route.name} — ${route.distance_km} km ${route.discipline} route in ${location}, ${route.country}`,
      description,
      url: `https://www.loops.ie/routes/${id}`,
      siteName: "LOOPS",
      type: "article",
      locale: "en_IE",
      images: [`/api/og/${id}`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/api/og/${id}`],
    },
  };
}

export default async function RouteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Fail soft: without the DB we render the page shell (the client page
  // shows its own retry UI) and just skip the JSON-LD enrichment.
  let route: Awaited<ReturnType<typeof getRoute>> = undefined;
  let rating = { average: 0, count: 0 };
  try {
    route = await getRoute(id);
    if (route) route = withAutoTitle(route);
    if (route) rating = await getRouteRating(id);
  } catch {
    return children;
  }

  // The route definitively does not exist (the DB answered, no row): the
  // page answers with a real 404 (its not-found.tsx keeps the app header).
  // A DB hiccup (catch above) still renders the shell, fail-soft.
  if (!route) return children;

  const routeJsonLd = generateRouteJsonLd({
    id: route.id,
    name: route.name,
    description: route.description,
    start_lat: route.start_lat,
    start_lng: route.start_lng,
    county: route.county,
    country: route.country,
    region: route.region,
    distance_km: route.distance_km,
    elevation_gain_m: route.elevation_gain_m,
    surface_type: route.surface_type,
    discipline: route.discipline,
    rating: { average: rating.average, count: rating.count },
  });

  const breadcrumbItems: { name: string; url?: string }[] = [
    { name: "LOOPS", url: "https://www.loops.ie" },
    { name: route.country, url: `https://www.loops.ie/routes/country/${slugify(route.country)}` },
  ];
  if (route.region) {
    breadcrumbItems.push({
      name: route.region,
      url: `https://www.loops.ie/routes/country/${slugify(route.country)}/${slugify(route.region)}`,
    });
  }
  breadcrumbItems.push({ name: route.name });

  const breadcrumbJsonLd = generateBreadcrumbJsonLd(breadcrumbItems);

  const sportsActivityJsonLd = generateSportsActivityLocationJsonLd({
    id: route.id,
    name: route.name,
    description: route.description,
    start_lat: route.start_lat,
    start_lng: route.start_lng,
    county: route.county,
    country: route.country,
    region: route.region,
    distance_km: route.distance_km,
    elevation_gain_m: route.elevation_gain_m,
    surface_type: route.surface_type,
    discipline: route.discipline,
    rating: { average: rating.average, count: rating.count },
  });

  // FAQPage JSON-LD mirrors the visible <RouteFaq> block exactly (same builder).
  const faqJsonLd = generateFaqJsonLd(
    buildRouteFaqs({
      name: route.name,
      distance_km: route.distance_km,
      elevation_gain_m: route.elevation_gain_m,
      surface_type: route.surface_type,
      discipline: route.discipline,
    })
  );

  return (
    <>
      <JsonLd data={routeJsonLd} />
      <JsonLd data={sportsActivityJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={faqJsonLd} />
      {children}
    </>
  );
}
