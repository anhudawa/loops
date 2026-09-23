import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, pageOpenGraph, siteUrl } from "@/lib/site-meta";
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
    alternates: { canonical: siteUrl(`/cycling/${dest.slug}`) },
    openGraph: pageOpenGraph({ path: `/cycling/${dest.slug}`, title, description }),
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE.url],
    },
  };
}

export default async function DestinationLayout({ params, children }: Props) {
  const { destination } = await params;
  const dest = getDestinationBySlug(destination);
  if (!dest) notFound();

  return <>{children}</>;
}
