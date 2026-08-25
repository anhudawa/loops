import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { destinations } from "@/content/destinations";

export const metadata: Metadata = {
  title: "Cycling Destinations — Route Guides | LOOPS",
  description:
    "Human-ridden road cycling routes in Ireland, with Girona and Mallorca next in the LOOPS commercial rollout.",
  alternates: { canonical: "https://loops.ie/cycling" },
};

export default function CyclingIndexPage() {
  const ireland = destinations.filter((d) => d.country === "Ireland");
  const nextMarkets = destinations.filter((d) => d.slug === "girona" || d.slug === "mallorca");

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <h1 className="text-3xl md:text-4xl font-extrabold mb-3" style={{ color: "var(--text)" }}>
          Cycling Destinations
        </h1>
        <p className="text-sm leading-relaxed mb-8 max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Ireland is first. Every published loop must be ridden, permissioned and
          reviewed. Girona follows when the Irish beta passes its gates, then Mallorca.
        </p>

        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
          Active beta · Ireland
        </h2>
        <DestGrid items={ireland} />

        {nextMarkets.length > 0 && (
          <>
            <h2 className="text-sm font-bold uppercase tracking-wider mt-10 mb-4" style={{ color: "var(--text-muted)" }}>
              Next · after Ireland
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {nextMarkets.map((d, index) => (
                <div key={d.slug} className="rounded-2xl p-5 opacity-75" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>
                    Phase {index + 2}
                  </p>
                  <h3 className="text-lg font-extrabold mb-1" style={{ color: "var(--text)" }}>{d.name}</h3>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{d.country} · Planned, not yet launched</p>
                </div>
              ))}
            </div>
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
