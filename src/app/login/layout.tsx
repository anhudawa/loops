import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LOOPS — Routes Worth Riding | Free Cycling Route Discovery",
  description:
    "Discover real cycling routes shared by real riders. Free GPX downloads, no paywall, no subscription. Browse gravel, road & MTB loops worldwide — human-curated, community-rated, open to everyone.",
  openGraph: {
    title: "LOOPS — Routes Worth Riding",
    description:
      "Real routes from real riders. Free GPX downloads, community ratings, no paywall, no lock-in. Works with Strava, Komoot, Wahoo & Garmin.",
    siteName: "LOOPS",
    type: "website",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "LOOPS — Discover free cycling routes worldwide",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LOOPS — Routes Worth Riding",
    description:
      "Real routes from real riders. Free GPX downloads, community ratings, no paywall. Works with Strava, Komoot, Wahoo & Garmin.",
    images: ["/api/og"],
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
