import Link from "next/link";
import { getCountries, getRoutes } from "@/lib/db";
import { slugify, generateItemListJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export default async function HomeSeoContent() {
  // Fail soft: a DB outage degrades this SEO section to its static copy
  // instead of taking down the homepage (or the build).
  let countries: string[] = [];
  let featuredRoutes: Awaited<ReturnType<typeof getRoutes>> = [];
  try {
    [countries, featuredRoutes] = await Promise.all([
      getCountries(),
      getRoutes({ limit: 20 }),
    ]);
  } catch {
    // render without dynamic data
  }

  return (
    <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 mt-8" style={{ borderTop: "1px solid var(--border)" }}>
      <JsonLd data={generateItemListJsonLd("Cycling Routes on LOOPS", featuredRoutes)} />
      <h2 className="text-2xl font-extrabold mb-4" style={{ color: "var(--text)" }}>
        Human-Ridden Road Cycling Routes in Ireland
      </h2>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
        LOOPS matches your location, available time and training session to Irish road loops that
        a real rider has completed. Every published route is reviewed, versioned and permissioned.
        When there is no credible match, LOOPS says so rather than inventing one.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {countries.map((country) => (
          <Link
            key={country}
            href={`/routes/country/${slugify(country)}`}
            className="px-4 py-3 rounded-lg transition-colors hover:opacity-80 text-sm"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {country}
          </Link>
        ))}
      </div>
    </section>
  );
}
