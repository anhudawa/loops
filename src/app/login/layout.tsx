import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, pageOpenGraph, siteUrl } from "@/lib/site-meta";

const TAGLINE = "Routes and GPX are free forever. Pro (coming) adds training intelligence.";

export const metadata: Metadata = {
  title: "Sign In — LOOPS",
  description: `Sign in to LOOPS: real cycling routes from riders who know the roads. ${TAGLINE} Gravel, road & MTB loops, ready for Strava, Komoot, Wahoo & Garmin.`,
  alternates: { canonical: siteUrl("/login") },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: pageOpenGraph({
    path: "/login",
    title: "LOOPS — Routes Worth Riding",
    description: `Real routes from real riders. ${TAGLINE} Works with Strava, Komoot, Wahoo & Garmin.`,
    images: [{ ...DEFAULT_OG_IMAGE, alt: "LOOPS — Discover free cycling routes worldwide" }],
  }),
  twitter: {
    card: "summary_large_image",
    title: "LOOPS — Routes Worth Riding",
    description: `Real routes from real riders. ${TAGLINE}`,
    images: [DEFAULT_OG_IMAGE.url],
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
