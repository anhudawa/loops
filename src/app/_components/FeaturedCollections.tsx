"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CollectionCard from "@/components/CollectionCard";

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  location: string | null;
  country: string | null;
  cover_image_url: string | null;
  discipline: string;
  total_routes_count: number;
  featured: boolean;
}

export default function FeaturedCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then((json) => {
        const all: Collection[] = json.data ?? [];
        setCollections(all.filter((c) => c.featured).slice(0, 6));
      })
      .catch(() => {});
  }, []);

  if (collections.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-black tracking-tight" style={{ color: "var(--text)" }}>Collections</h2>
        <Link href="/collections" className="text-xs font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {collections.map((c) => (
          <CollectionCard key={c.id} collection={c} />
        ))}
      </div>
    </section>
  );
}
