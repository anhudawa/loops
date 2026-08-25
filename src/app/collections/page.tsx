import type { Metadata } from "next";
import { getCollections } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import CollectionCard from "@/components/CollectionCard";

export const metadata: Metadata = {
  title: "Ireland Road Collections | LOOPS",
  description: "Reviewed, human-ridden road cycling collections from the LOOPS Ireland beta.",
  alternates: { canonical: "/collections" },
  openGraph: {
    title: "Ireland Road Collections | LOOPS",
    description: "Reviewed, human-ridden road cycling collections from the LOOPS Ireland beta.",
    url: "https://www.loops.ie/collections",
  },
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

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: "var(--text)" }}>Collections</h1>
          <p className="text-base" style={{ color: "var(--text-muted)" }}>
            Reviewed Irish road loops grouped for easier discovery. Girona and Mallorca follow only after Ireland passes its launch gates.
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
