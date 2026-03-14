import type { Metadata } from "next";
import { getRoute, getRouteRating } from "@/lib/db";
import { generateRouteJsonLd, generateBreadcrumbJsonLd, slugify } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const route = await getRoute(id);

  if (!route) {
    return { title: "Route Not Found - LOOPS" };
  }

  const location = route.region || route.county;
  const title = `${route.name} — ${route.distance_km}km ${route.difficulty} ${route.discipline} route in ${location}, ${route.country} | LOOPS`;
  const description = route.description
    ? `${route.description.slice(0, 120)}. ${route.distance_km}km ${route.difficulty} ${route.discipline} route in ${location}, ${route.country}. ${route.elevation_gain_m}m climbing. Free GPX download.`
    : `${route.distance_km}km ${route.difficulty} ${route.discipline} route in ${location}, ${route.country}. ${route.elevation_gain_m}m climbing. Free GPX download.`;

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
      title: `${route.name} - LOOPS`,
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
  const route = await getRoute(id);

  if (!route) return children;

  const rating = await getRouteRating(id);

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
    difficulty: route.difficulty,
    surface_type: route.surface_type,
    discipline: route.discipline,
    rating: { average: rating.average, count: rating.count },
  });

  const breadcrumbItems = [
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

  return (
    <>
      <JsonLd data={routeJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      {children}
    </>
  );
}
