import type { Metadata } from "next";
import { pageOpenGraph, siteUrl } from "@/lib/site-meta";
import { getCollections } from "@/lib/db";
import AppHeader from "@/components/AppHeader";

// Cached for an hour (was rendered per request).
export const revalidate = 3600;
import CollectionCard from "@/components/CollectionCard";

export const metadata: Metadata = {
  title: "Collections — LOOPS | Curated Cycling Route Packs",
  description: "Curated cycling route collections: Girona, Mallorca, Calpe and Dublin & Wicklow — hand-picked routes for every discipline.",
  alternates: { canonical: siteUrl("/collections") },
  openGraph: pageOpenGraph({
    path: "/collections",
    title: "Collections — Curated Cycling Route Packs",
    description: "Hand-picked route packs from the best cycling destinations worldwide.",
  }),
};

export default async function CollectionsPage() {
  let collections: Awaited<ReturnType<typeof getCollections>> = [];
  try {
    collections = await getCollections();
  } catch {
    // DB unavailable — render empty state
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <AppHeader />

      <main id="main-content" className="max-w-5xl mx-auto px-4 py-10">
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
