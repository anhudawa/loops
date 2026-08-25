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
  const active = dest.country === "Ireland";

  const title = active
    ? `Cycling in ${dest.name} | LOOPS Ireland`
    : `Cycling in ${dest.name} | Planned LOOPS market`;
  const description = active
    ? `${dest.tagline}. Discover reviewed, human-ridden Irish road loops.`
    : `${dest.name} is planned after the Ireland beta passes its trust and usage gates.`;

  return {
    title,
    description,
    alternates: { canonical: `/cycling/${dest.slug}` },
    robots: active ? undefined : { index: false, follow: true },
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
