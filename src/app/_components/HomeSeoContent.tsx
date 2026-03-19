import Link from "next/link";
import { getCountries } from "@/lib/db";
import { slugify } from "@/lib/seo";

export default async function HomeSeoContent() {
  const countries = await getCountries();

  return (
    <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 mt-8" style={{ borderTop: "1px solid var(--border)" }}>
      <h2 className="text-2xl font-extrabold mb-4" style={{ color: "var(--text)" }}>
        Discover Cycling Routes Worldwide
      </h2>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
        LOOPS is a free cycling route discovery platform. Every route has been ridden and uploaded by a real cyclist.
        Browse gravel, road, and MTB routes, download free GPX files, and find your next ride.
        Works with Strava, Komoot, Wahoo, and Garmin.
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
