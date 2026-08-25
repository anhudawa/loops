import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find a Human-Ridden Road Loop — LOOPS",
  description:
    "Describe the road ride you want and LOOPS searches human-ridden Irish loops for the best match. Duration, distance, scenery, and structured sessions supported.",
  alternates: { canonical: "/generate" },
  openGraph: {
    title: "Find a Human-Ridden Road Loop — LOOPS",
    description:
      "Describe the road ride you want and LOOPS searches human-ridden Irish loops for the best match.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Find a Human-Ridden Road Loop — LOOPS",
    description:
      "Describe the road ride you want and LOOPS searches human-ridden Irish loops for the best match.",
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
