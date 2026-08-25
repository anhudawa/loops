import type { Metadata } from "next";
import { getRoute, getRouteRating } from "@/lib/db";
import {
  generateRouteJsonLd,
  generateBreadcrumbJsonLd,
  generateSportsActivityLocationJsonLd,
  generateFaqJsonLd,
  buildRouteFaqs,
  slugify,
} from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import { isEligibleForPublicLibrary } from "@/config/route-policy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let route: Awaited<ReturnType<typeof getRoute>> = undefined;
  try {
    route = await getRoute(id);
  } catch {
    return { title: "Cycling Route | LOOPS" };
  }

  if (!route || route.is_verified !== 1 || !isEligibleForPublicLibrary(route)) {
    return {
      title: "Private route review | LOOPS",
      robots: { index: false, follow: false, noarchive: true },
    };
  }

  const location = route.region || route.county;
  const title = `${route.name} — ${route.distance_km}km ${route.discipline} route in ${location}, ${route.country} | LOOPS`;
  const description = route.description
    ? `${route.description.slice(0, 120)}. ${route.distance_km}km human-ridden road route in ${location}, ${route.country}. ${route.elevation_gain_m}m climbing.`
    : `${route.distance_km}km human-ridden road route in ${location}, ${route.country}. ${route.elevation_gain_m}m climbing.`;

  return {
    title,
    description,
    alternates: { canonical: `https://loops.ie/routes/${id}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${route.name} — ${route.distance_km}km ${route.discipline} route in ${location}, ${route.country}`,
      description,
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
    if (route) rating = await getRouteRating(id);
  } catch {
    return children;
  }

  if (!route || route.is_verified !== 1 || !isEligibleForPublicLibrary(route)) return children;

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
    { name: "LOOPS", url: "https://loops.ie" },
    { name: route.country, url: `https://loops.ie/routes/country/${slugify(route.country)}` },
  ];
  if (route.region) {
    breadcrumbItems.push({
      name: route.region,
      url: `https://loops.ie/routes/country/${slugify(route.country)}/${slugify(route.region)}`,
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
