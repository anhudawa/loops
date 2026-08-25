import type { Metadata } from "next";
import { getRoute } from "@/lib/db";
import polyline from "@mapbox/polyline";
import { isEligibleForPublicLibrary } from "@/config/route-policy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const route = await getRoute(id);

  if (!route || route.is_verified !== 1 || !isEligibleForPublicLibrary(route)) {
    return {
      title: "Route Not Found - LOOPS",
      robots: { index: false, follow: false, noarchive: true },
    };
  }

  const location = route.region || route.county;
  const title = `${route.name} — ${route.distance_km}km ${route.discipline} ride | LOOPS`;
  const description = `${route.distance_km}km human-ridden road route with ${route.elevation_gain_m}m climbing near ${location}, ${route.country}. Independently reviewed on LOOPS.`;

  let encodedCoords = "";
  try {
    const coords: [number, number][] = JSON.parse(route.coordinates);
    const step = Math.max(1, Math.floor(coords.length / 200));
    const simplified = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
    encodedCoords = polyline.encode(simplified);
  } catch {
    // skip encoding
  }

  const ogParams = new URLSearchParams({
    coords: encodedCoords,
    distance: String(route.distance_km),
    elevation: String(route.elevation_gain_m),
    discipline: route.discipline,
    name: route.name,
  });

  const ogImage = `/api/og/generated?${ogParams.toString()}`;

  return {
    title,
    description,
    alternates: { canonical: `https://loops.ie/share/${id}` },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      siteName: "LOOPS",
      type: "article",
      locale: "en_IE",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
