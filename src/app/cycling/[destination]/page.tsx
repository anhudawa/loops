import { notFound } from "next/navigation";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { generateBreadcrumbJsonLd, generateFaqJsonLd } from "@/lib/seo";
import { getDestinationBySlug, type Destination } from "@/content/destinations";

interface Props {
  params: Promise<{ destination: string }>;
}

function placeJsonLd(dest: Destination) {
  return {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: `Cycling in ${dest.name}`,
    description: `${dest.tagline}. ${dest.riding[0]?.slice(0, 200)}...`,
    url: `https://www.loops.ie/cycling/${dest.slug}`,
    touristType: {
      "@type": "Audience",
      audienceType: "Cyclists",
    },
    geo: {
      "@type": "GeoCoordinates",
      addressCountry: dest.country,
    },
    containedInPlace: {
      "@type": "Country",
      name: dest.country,
    },
  };
}

export default async function DestinationPage({ params }: Props) {
  const { destination } = await params;
  const dest = getDestinationBySlug(destination);
  if (!dest) notFound();

  const breadcrumb = generateBreadcrumbJsonLd([
    { name: "Home", url: "https://www.loops.ie" },
    { name: "Destinations", url: "https://www.loops.ie/cycling" },
    { name: dest.name, url: `https://www.loops.ie/cycling/${dest.slug}` },
  ]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={placeJsonLd(dest)} />
      <JsonLd data={generateFaqJsonLd(dest.faqs)} />
      <JsonLd data={breadcrumb} />

      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href="/"
            className="font-black text-xl tracking-tight"
            style={{ color: "var(--accent)" }}
          >
            LOOPS
          </Link>
          <span style={{ color: "var(--border-light)" }} aria-hidden="true">
            /
          </span>
          <span
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text)" }}
          >
            {dest.name}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{
                color: "var(--text)",
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              {dest.country}
            </span>
          </div>

          <h1
            className="text-3xl md:text-4xl font-black tracking-tight mb-3 leading-tight"
            style={{ color: "var(--text)" }}
          >
            Cycling in {dest.name}
          </h1>

          <p
            className="text-lg leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            {dest.tagline}
          </p>
        </div>

        {/* Best time to ride */}
        <section className="mb-10">
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-4"
            style={{ color: "var(--text)" }}
          >
            Best time to ride
          </h2>
          <div
            className="rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
            }}
          >
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Best months
              </p>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                {dest.bestMonths}
              </p>
            </div>
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Temperature
              </p>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                {dest.avgTemp}
              </p>
            </div>
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Rainfall
              </p>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                {dest.rainfall}
              </p>
            </div>
          </div>
        </section>

        {/* The riding */}
        <section className="mb-10">
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-4"
            style={{ color: "var(--text)" }}
          >
            The riding
          </h2>
          <div className="space-y-4">
            {dest.riding.map((paragraph, i) => (
              <p
                key={i}
                className="text-base leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        {/* Key climbs & routes */}
        <section className="mb-10">
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-4"
            style={{ color: "var(--text)" }}
          >
            Key climbs &amp; routes
          </h2>
          <ul className="space-y-3">
            {dest.climbs.map((climb, i) => {
              const dashIdx = climb.indexOf(" — ");
              const name = dashIdx !== -1 ? climb.slice(0, dashIdx) : climb;
              const desc =
                dashIdx !== -1 ? climb.slice(dashIdx + 3) : undefined;

              return (
                <li
                  key={i}
                  className="rounded-lg px-4 py-3"
                  style={{
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    className="text-sm font-bold"
                    style={{ color: "var(--text)" }}
                  >
                    {name}
                  </span>
                  {desc && (
                    <span
                      className="text-sm ml-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {" "}
                      &mdash; {desc}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Practical info */}
        <section className="mb-10">
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-4"
            style={{ color: "var(--text)" }}
          >
            Practical info
          </h2>
          <div className="space-y-4">
            <div
              className="rounded-lg px-4 py-3"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Getting there
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {dest.practical.airport}
              </p>
            </div>
            <div
              className="rounded-lg px-4 py-3"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Bike hire
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {dest.practical.bikeHire}
              </p>
            </div>
            <div
              className="rounded-lg px-4 py-3"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Where to stay
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {dest.practical.accommodation}
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          className="mb-10 pt-8 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <h2
            className="text-xl md:text-2xl font-black tracking-tight mb-6"
            style={{ color: "var(--text)" }}
          >
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {dest.faqs.map((faq, i) => (
              <div key={i}>
                <h3
                  className="text-base font-bold mb-1"
                  style={{ color: "var(--text)" }}
                >
                  {faq.question}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Collection link */}
        {dest.collectionSlug && (
          <div
            className="mb-6 rounded-xl p-5 text-center"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
            }}
          >
            <p
              className="text-sm mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              Browse our curated routes in {dest.name}
            </p>
            <Link
              href={`/collections/${dest.collectionSlug}`}
              className="inline-flex items-center justify-center font-bold text-sm px-5 py-2.5 rounded-lg"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text)",
                background: "var(--bg-card)",
              }}
            >
              View {dest.name} routes
            </Link>
          </div>
        )}

        {/* CTA */}
        <div
          className="rounded-xl p-6 text-center"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
          }}
        >
          <h2
            className="text-xl font-black tracking-tight mb-2"
            style={{ color: "var(--text)" }}
          >
            Plan a ride in {dest.name}
          </h2>
          <p
            className="text-sm leading-relaxed mb-4 max-w-md mx-auto"
            style={{ color: "var(--text-muted)" }}
          >
            Tell our AI where you are, how long you want to ride and the
            terrain you prefer &mdash; get a route that fits.
          </p>
          <Link
            href="/generate"
            className="inline-flex items-center justify-center font-bold text-sm px-6 py-3 rounded-lg"
            style={{ background: "var(--accent)", color: "#0a0a0a" }}
          >
            Generate a route
          </Link>
        </div>
      </main>
    </div>
  );
}
