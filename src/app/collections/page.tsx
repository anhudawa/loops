import type { Metadata } from "next";
import { getCollections } from "@/lib/db";
import CollectionCard from "@/components/CollectionCard";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Collections — LOOPS | Curated Cycling Route Packs",
  description: "Curated cycling route collections from around the world. Girona, Mallorca, Wild Atlantic Way and more — hand-picked routes for every discipline.",
  alternates: { canonical: "/collections" },
  openGraph: {
    title: "Collections — Curated Cycling Route Packs",
    description: "Hand-picked route packs from the best cycling destinations worldwide.",
    url: "https://www.loops.ie/collections",
  },
};

export default async function CollectionsPage() {
  const collections = await getCollections();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/" className="font-black text-xl tracking-tight" style={{ color: "var(--accent)" }}>
            LOOPS
          </Link>
          <span style={{ color: "var(--border-light)" }} aria-hidden="true">/</span>
          <span className="font-semibold text-sm" style={{ color: "var(--text)" }}>Collections</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: "var(--text)" }}>Collections</h1>
          <p className="text-base" style={{ color: "var(--text-muted)" }}>
            Curated route packs from the world&apos;s best cycling destinations.
          </p>
        </div>

        {collections.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No collections yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
