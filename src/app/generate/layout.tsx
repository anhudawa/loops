import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plan a Ride — LOOPS",
  description:
    "Describe the ride you want and LOOPS matches it to a verified loop or builds one from country lanes and back roads. Duration, distance, or structured intervals — all handled.",
  alternates: { canonical: "/generate" },
  openGraph: {
    title: "Plan a Ride — LOOPS",
    description:
      "Describe the ride you want and LOOPS matches it to a verified loop or builds one. Duration, distance, or structured intervals — all handled.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Plan a Ride — LOOPS",
    description:
      "Describe the ride you want and LOOPS matches it to a verified loop or builds one.",
  },
  robots: {
    // The planner is behind auth and hits external APIs on every visit —
    // no value in letting crawlers hammer it.
    index: false,
    follow: true,
  },
};

export default function GenerateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
