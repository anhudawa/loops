import { withAutoTitle } from "@/lib/route-title";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRouteOnce as getRoute } from "@/lib/db";
import { formatRideWhen, cleanMeet } from "@/lib/ride-invite";
import RouteDetailView from "@/components/RouteDetailView";
import { initialRouteForPage } from "@/lib/public-route";
import { withBundleCorrection } from "@/lib/bundle-corrections";
import { freeGpxPhrase, gpxIsPublic } from "@/lib/copy";

/**
 * A group-ride link: the route page plus the ride's day, time and meeting
 * point, which travel in the URL (?t=2026-09-26T09:00&m=Clontarf Rd). The
 * metadata is built here, server-side, so WhatsApp's link preview says
 * "Sat 26 Sep · 9:00 · Meet: Clontarf Rd" — a new preview every week.
 */
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;
  const t = one(sp.t);
  const when = formatRideWhen(t);
  const meet = cleanMeet(one(sp.m));

  let route: Awaited<ReturnType<typeof getRoute>> = undefined;
  try {
    route = await getRoute(id);
    if (route) route = withAutoTitle(route);
  } catch {
    return { title: "Group ride | LOOPS" };
  }
  if (!route) return { title: "Ride not found | LOOPS" };

  const stats = `${route.distance_km} km · ${route.elevation_gain_m} m climbing`;
  const title = when ? `${route.name} — ${when}` : route.name;
  const description = [when && `Group ride ${when}`, meet && `Meet: ${meet}`, stats, gpxIsPublic("ride") ? "Route, elevation and GPX for your bike computer." : `Route and elevation — ${freeGpxPhrase()}.`]
    .filter(Boolean)
    .join(" · ");
  const og = new URLSearchParams();
  if (when && t) og.set("t", t);
  if (meet) og.set("m", meet);
  const ogImage = `https://www.loops.ie/api/og/${id}${og.toString() ? `?${og}` : ""}`;

  return {
    title: `${title} | LOOPS`,
    description,
    alternates: { canonical: `https://www.loops.ie/routes/${id}` },
    robots: { index: false, follow: true }, // weekly invites are not search pages
    openGraph: {
      title,
      description,
      siteName: "LOOPS",
      type: "article",
      locale: "en_IE",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function RidePage({ params, searchParams }: Props) {
  // A route that definitively does not exist is a real 404. A DB error is
  // not: the client view keeps its own fail-soft retry UI.
  const { id } = await params;
  let missing = false;
  let initialRoute: Record<string, unknown> | null = null;
  try {
    const r0 = await getRoute(id);
    const r = r0 ? withAutoTitle(await withBundleCorrection(r0)) : r0;
    missing = r === undefined;
    if (r) initialRoute = initialRouteForPage(r as unknown as Record<string, unknown>);
  } catch {
    missing = false;
  }
  if (missing) notFound();

  const sp = await searchParams;
  const t = one(sp.t);
  const when = formatRideWhen(t);
  const meet = cleanMeet(one(sp.m));
  return <RouteDetailView initialRoute={initialRoute as never} ride={when || meet ? { when, meet, t: when ? t : null } : null} />;
}
