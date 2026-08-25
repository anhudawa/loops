import { notFound } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import JsonLd from "@/components/JsonLd";
import { generateBreadcrumbJsonLd, slugify } from "@/lib/seo";
import { destinations, getDestinationBySlug } from "@/content/destinations";

interface Props {
  params: Promise<{ destination: string }>;
}

const ROADMAP_DESTINATIONS = new Set(["girona", "mallorca"]);

export function generateStaticParams() {
  return destinations
    .filter((destination) => destination.country === "Ireland" || ROADMAP_DESTINATIONS.has(destination.slug))
    .map((destination) => ({ destination: destination.slug }));
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 py-12 md:py-20">{children}</main>
    </div>
  );
}

export default async function DestinationPage({ params }: Props) {
  const { destination } = await params;
  const dest = getDestinationBySlug(destination);
  if (!dest) notFound();
  if (dest.country !== "Ireland" && !ROADMAP_DESTINATIONS.has(dest.slug)) notFound();

  const active = dest.country === "Ireland";
  const breadcrumb = generateBreadcrumbJsonLd([
    { name: "Home", url: "https://www.loops.ie" },
    { name: "Destinations", url: "https://www.loops.ie/cycling" },
    { name: dest.name, url: `https://www.loops.ie/cycling/${dest.slug}` },
  ]);

  if (!active) {
    const launchRequirements = [
      "Ireland keeps a 100% provenance and workout-assessment trust record.",
      "Ireland passes the route-action, confirmed-ride and four-week-retention gates.",
      `A named ${dest.name} operator or supply partner signs the contributor and rights terms.`,
      `Local contributors provide 20–30 permissioned road loops they personally rode.`,
      "A local review, freshness and incident-response workflow is operational.",
      "An operator agrees to a paid or explicitly time-boxed pilot.",
    ];

    return (
      <>
        <JsonLd data={breadcrumb} />
        <PageShell>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: "var(--accent)" }}>
            Planned market · not yet launched
          </p>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4" style={{ color: "var(--text)" }}>
            {dest.name} comes after Ireland
          </h1>
          <p className="text-base md:text-lg leading-relaxed max-w-2xl" style={{ color: "var(--text-secondary)" }}>
            LOOPS is not publishing route or road-condition guidance for {dest.name} yet.
            The market opens only when local riders have supplied completed-ride evidence,
            independent reviewers have approved the exact route versions, and the operating
            and commercial gates below are met.
          </p>

          <section className="mt-10 rounded-2xl p-5 md:p-7" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
            <h2 className="text-lg font-extrabold mb-4" style={{ color: "var(--text)" }}>What must happen first</h2>
            <ol className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {launchRequirements.map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="font-black" style={{ color: "var(--accent)" }}>{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-wrap gap-3 mt-8">
            <Link href="/cycling" className="btn-accent px-5 py-3 rounded-xl text-sm font-bold">
              View the rollout
            </Link>
            <Link href="/feedback#market-partners" className="px-5 py-3 rounded-xl text-sm font-bold" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              I&apos;m a local rider or operator
            </Link>
          </div>
        </PageShell>
      </>
    );
  }

  const routeLibraryHref = dest.routesCountry && dest.routesRegion
    ? `/routes/country/${slugify(dest.routesCountry)}/${slugify(dest.routesRegion)}`
    : "/";
  const evidenceItems = [
    "A named contributor rode the exact published geometry.",
    "A separate curator approved the recording, rights and route version.",
    "The last-ridden date and current evidence are visible.",
    "Workout claims appear only for separately assessed stretches.",
  ];

  const destinationJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Reviewed road cycling routes near ${dest.name}`,
    description: `Human-ridden, independently reviewed Ireland road loops near ${dest.name}.`,
    url: `https://www.loops.ie/cycling/${dest.slug}`,
  };

  return (
    <>
      <JsonLd data={destinationJsonLd} />
      <JsonLd data={breadcrumb} />
      <PageShell>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: "var(--accent)" }}>
          Active market · Ireland road beta
        </p>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4" style={{ color: "var(--text)" }}>
          Find a reviewed loop near {dest.name}
        </h1>
        <p className="text-base md:text-lg leading-relaxed max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Tell LOOPS where you want to start, how much time you have and what kind
          of ride or supported session you need. Route recommendations come only
          from the reviewed library—this page does not invent or generalise local loops.
        </p>

        <div className="flex flex-wrap gap-3 mt-7">
          <Link href="/generate" className="btn-accent px-5 py-3 rounded-xl text-sm font-bold">
            Find a human-ridden loop
          </Link>
          <Link href={routeLibraryHref} className="px-5 py-3 rounded-xl text-sm font-bold" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            Browse reviewed routes
          </Link>
        </div>

        <section className="mt-12 rounded-2xl p-5 md:p-7" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
          <h2 className="text-lg font-extrabold mb-4" style={{ color: "var(--text)" }}>What every result must prove</h2>
          <ul className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {evidenceItems.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="font-black" style={{ color: "var(--accent)" }}>✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-2xl p-5 md:p-7" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-lg font-extrabold mb-2" style={{ color: "var(--text)" }}>Know a useful Irish road loop?</h2>
          <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
            Founding contributors apply first, then upload their own timestamped completed-ride file through the protected workflow. Public links and planned routes are not accepted as proof.
          </p>
          <Link href="/beta" className="font-bold text-sm underline underline-offset-4" style={{ color: "var(--accent)" }}>
            Apply as a contributor
          </Link>
        </section>
      </PageShell>
    </>
  );
}
