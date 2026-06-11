import type { Metadata } from "next";
import Link from "next/link";
import { destinations, LAUNCH_DESTINATION_SLUGS } from "@/content/destinations";

export const metadata: Metadata = {
  title: "Cycling Destinations — Route Guides | LOOPS",
  description:
    "Complete cycling guides for the world's best riding destinations: Mallorca, Girona, Tenerife, the Algarve and more. Climbs, best months, bike hire and ready-to-ride routes.",
  alternates: { canonical: "https://loops.ie/cycling" },
};

export default function CyclingIndexPage() {
  const launchSet = new Set<string>(LAUNCH_DESTINATION_SLUGS);
  const featured = destinations.filter((d) => launchSet.has(d.slug));
  const homeTurf = destinations.filter((d) => !launchSet.has(d.slug));

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto">
          <Link href="/">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <h1 className="text-3xl md:text-4xl font-extrabold mb-3" style={{ color: "var(--text)" }}>
          Cycling Destinations
        </h1>
        <p className="text-sm leading-relaxed mb-8 max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          The training-camp circuit, covered properly: where to ride, when to go,
          which climbs matter and the loops worth packing a bike box for.
        </p>

        <DestGrid items={featured} />

        {homeTurf.length > 0 && (
          <>
            <h2 className="text-sm font-bold uppercase tracking-wider mt-10 mb-4" style={{ color: "var(--text-muted)" }}>
              Home turf
            </h2>
            <DestGrid items={homeTurf} />
          </>
        )}
      </div>
    </main>
  );
}

function DestGrid({ items }: { items: typeof destinations }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((d) => (
        <Link
          key={d.slug}
          href={`/cycling/${d.slug}`}
          className="rounded-2xl p-5 transition-transform hover:scale-[1.01]"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-lg font-extrabold mb-1" style={{ color: "var(--text)" }}>
            {d.name}
          </h2>
          <p className="text-xs mb-2" style={{ color: "var(--accent)" }}>{d.tagline}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {d.country} · Best: {d.bestMonths}
          </p>
        </Link>
      ))}
    </div>
  );
}
