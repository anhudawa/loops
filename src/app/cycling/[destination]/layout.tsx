import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDestinationBySlug, getAllDestinationSlugs } from "@/content/destinations";

interface Props {
  params: Promise<{ destination: string }>;
  children: React.ReactNode;
}

export function generateStaticParams() {
  return getAllDestinationSlugs().map((destination) => ({ destination }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { destination } = await params;
  const dest = getDestinationBySlug(destination);
  if (!dest) return {};

  const title = `Cycling in ${dest.name} — Routes, Climbs & Practical Guide | LOOPS`;
  const description = `Plan your cycling trip to ${dest.name}, ${dest.country}. Best months, key climbs, road conditions, bike hire, and route suggestions from riders who know the roads.`;

  return {
    title,
    description,
    alternates: { canonical: `/cycling/${dest.slug}` },
    openGraph: {
      title,
      description,
      url: `https://www.loops.ie/cycling/${dest.slug}`,
      type: "website",
      siteName: "LOOPS",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function DestinationLayout({ params, children }: Props) {
  const { destination } = await params;
  const dest = getDestinationBySlug(destination);
  if (!dest) notFound();

  return <>{children}</>;
}
