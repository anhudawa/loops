import type { Metadata } from "next";
import { getRoute, getRouteRating } from "@/lib/db";

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

  const rating = await getRouteRating(id);
  const ratingText = rating.count > 0 ? ` | ${rating.average}/5 (${rating.count} ratings)` : "";
  const description = route.description
    ? route.description.slice(0, 160)
    : `${route.difficulty} gravel route in ${route.county}. ${route.distance_km}km, ${route.elevation_gain_m}m elevation gain.`;

  return {
    title: `${route.name} - LOOPS`,
    description: `${description}${ratingText}`,
    openGraph: {
      title: `${route.name} | ${route.distance_km}km ${route.difficulty} gravel route`,
      description,
      siteName: "LOOPS",
      type: "article",
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

export default function RouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
