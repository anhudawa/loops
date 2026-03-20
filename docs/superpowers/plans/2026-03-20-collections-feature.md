# Collections Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "collections" feature — curated packs of routes (e.g., "The Girona Collection") with DB schema, API routes, index/detail pages, homepage featured strip, and SEO.

**Architecture:** Collections and a junction table `collection_routes` are added to `db.ts` via `migrateDb()`. Four new API routes handle CRUD. Two new pages (`/collections` index, `/collections/[slug]` detail) are server components wrapping client components. The homepage gets a `FeaturedCollections` strip above the route list.

**Tech Stack:** Next.js 15 App Router, raw SQL via `@vercel/postgres`, Tailwind CSS 4, `src/lib/seo.ts` for JSON-LD, `src/lib/api-utils.ts` for error helpers, `requireAdmin()` from `src/lib/admin.ts` for protected endpoints.

---

## Chunk 1: DB Schema + Query Functions

### Task 1: Add collections tables to migrateDb()

**Files:**
- Modify: `src/lib/db.ts` — add two `CREATE TABLE IF NOT EXISTS` blocks + indexes at end of `migrateDb()`

- [ ] Add the following at the **end of `migrateDb()`** (before the closing brace), after the `oauth_states` block:

```typescript
// Collections
await sql`
  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    location TEXT,
    country TEXT,
    cover_image_url TEXT,
    discipline TEXT NOT NULL DEFAULT 'mixed' CHECK(discipline IN ('road', 'gravel', 'mtb', 'mixed')),
    difficulty_range TEXT,
    total_routes_count INTEGER NOT NULL DEFAULT 0,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    seo_title TEXT,
    seo_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS collection_routes (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (collection_id, route_id)
  )
`;

await sql`CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections(slug)`;
await sql`CREATE INDEX IF NOT EXISTS idx_collections_featured ON collections(featured)`;
await sql`CREATE INDEX IF NOT EXISTS idx_collection_routes_collection_id ON collection_routes(collection_id)`;
```

### Task 2: Add Collection types to db.ts

**Files:**
- Modify: `src/lib/db.ts` — add types after existing type block

- [ ] Add after the `Route` interface (around line 219):

```typescript
export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  location: string | null;
  country: string | null;
  cover_image_url: string | null;
  discipline: "road" | "gravel" | "mtb" | "mixed";
  difficulty_range: string | null;
  total_routes_count: number;
  featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionWithRoutes extends Collection {
  routes: Route[];
}
```

### Task 3: Add query functions to db.ts

**Files:**
- Modify: `src/lib/db.ts` — add 5 new exported functions at end of file

- [ ] Add at the end of `db.ts`:

```typescript
// ──── Collections ────

export async function getCollections(): Promise<Collection[]> {
  const { rows } = await sql`
    SELECT * FROM collections ORDER BY featured DESC, created_at DESC
  `;
  return rows as Collection[];
}

export async function getFeaturedCollections(): Promise<Collection[]> {
  const { rows } = await sql`
    SELECT * FROM collections WHERE featured = TRUE ORDER BY created_at DESC LIMIT 6
  `;
  return rows as Collection[];
}

export async function getCollectionBySlug(slug: string): Promise<CollectionWithRoutes | null> {
  const { rows: collRows } = await sql`
    SELECT * FROM collections WHERE slug = ${slug} LIMIT 1
  `;
  if (collRows.length === 0) return null;
  const collection = collRows[0] as Collection;

  const { rows: routeRows } = await sql`
    SELECT r.*, cr.display_order
    FROM routes r
    JOIN collection_routes cr ON cr.route_id = r.id
    WHERE cr.collection_id = ${collection.id}
    ORDER BY cr.display_order ASC, r.created_at ASC
  `;

  return { ...collection, routes: routeRows as Route[] };
}

export async function insertCollection(data: {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  location?: string | null;
  country?: string | null;
  cover_image_url?: string | null;
  discipline: string;
  difficulty_range?: string | null;
  featured?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
}): Promise<Collection> {
  const { rows } = await sql`
    INSERT INTO collections (
      id, name, slug, description, location, country, cover_image_url,
      discipline, difficulty_range, featured, seo_title, seo_description
    ) VALUES (
      ${data.id}, ${data.name}, ${data.slug}, ${data.description ?? null},
      ${data.location ?? null}, ${data.country ?? null}, ${data.cover_image_url ?? null},
      ${data.discipline}, ${data.difficulty_range ?? null}, ${data.featured ?? false},
      ${data.seo_title ?? null}, ${data.seo_description ?? null}
    )
    RETURNING *
  `;
  return rows[0] as Collection;
}

export async function addRouteToCollection(collectionId: string, routeId: string, displayOrder: number): Promise<void> {
  await sql`
    INSERT INTO collection_routes (collection_id, route_id, display_order)
    VALUES (${collectionId}, ${routeId}, ${displayOrder})
    ON CONFLICT (collection_id, route_id) DO UPDATE SET display_order = EXCLUDED.display_order
  `;
  // Keep total_routes_count in sync
  await sql`
    UPDATE collections
    SET total_routes_count = (
      SELECT COUNT(*) FROM collection_routes WHERE collection_id = ${collectionId}
    ), updated_at = NOW()
    WHERE id = ${collectionId}
  `;
}
```

---

## Chunk 2: API Routes

### Task 4: GET + POST /api/collections

**Files:**
- Create: `src/app/api/collections/route.ts`

- [ ] Create the file:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCollections, insertCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { apiError, handleApiError, stripHtml } from "@/lib/api-utils";
import { slugify } from "@/lib/seo";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const collections = await getCollections();
    return NextResponse.json({ data: collections });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { name, description, location, country, cover_image_url, discipline, difficulty_range, featured, seo_title, seo_description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return apiError("name is required", "VALIDATION_ERROR", 400);
    }
    const validDisciplines = ["road", "gravel", "mtb", "mixed"];
    if (discipline && !validDisciplines.includes(discipline)) {
      return apiError("Invalid discipline", "VALIDATION_ERROR", 400);
    }

    const collection = await insertCollection({
      id: uuidv4(),
      name: stripHtml(name.trim()),
      slug: slugify(name.trim()),
      description: description ? stripHtml(description) : null,
      location: location ? stripHtml(location) : null,
      country: country ? stripHtml(country) : null,
      cover_image_url: cover_image_url || null,
      discipline: discipline || "mixed",
      difficulty_range: difficulty_range || null,
      featured: featured ?? false,
      seo_title: seo_title ? stripHtml(seo_title) : null,
      seo_description: seo_description ? stripHtml(seo_description) : null,
    });

    return NextResponse.json({ data: collection }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
```

### Task 5: GET /api/collections/[slug]

**Files:**
- Create: `src/app/api/collections/[slug]/route.ts`

- [ ] Create the file:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCollectionBySlug } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const collection = await getCollectionBySlug(slug);
    if (!collection) {
      return apiError("Collection not found", "NOT_FOUND", 404);
    }
    return NextResponse.json({ data: collection });
  } catch (err) {
    return handleApiError(err);
  }
}
```

### Task 6: POST /api/collections/[slug]/routes

**Files:**
- Create: `src/app/api/collections/[slug]/routes/route.ts`

- [ ] Create the file:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCollectionBySlug, addRouteToCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { slug } = await params;
    const collection = await getCollectionBySlug(slug);
    if (!collection) {
      return apiError("Collection not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const { route_id, display_order } = body;

    if (!route_id || typeof route_id !== "string") {
      return apiError("route_id is required", "VALIDATION_ERROR", 400);
    }

    await addRouteToCollection(collection.id, route_id, display_order ?? 0);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
```

---

## Chunk 3: SEO + Components

### Task 7: Add collection JSON-LD to seo.ts

**Files:**
- Modify: `src/lib/seo.ts` — add `generateCollectionJsonLd()`

- [ ] Add at the end of `src/lib/seo.ts`:

```typescript
interface CollectionJsonLdInput {
  name: string;
  slug: string;
  description: string | null;
  location: string | null;
  country: string | null;
  routes: { id: string; name: string; distance_km: number }[];
}

export function generateCollectionJsonLd(collection: CollectionJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: collection.name,
    description: collection.description || `Curated cycling routes${collection.location ? ` in ${collection.location}` : ""}`,
    url: `https://loops.ie/collections/${collection.slug}`,
    numberOfItems: collection.routes.length,
    itemListElement: collection.routes.map((route, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: route.name,
      url: `https://loops.ie/routes/${route.id}`,
    })),
  };
}
```

### Task 8: CollectionCard component

**Files:**
- Create: `src/components/CollectionCard.tsx`

- [ ] Create the file:

```typescript
import Link from "next/link";

const DISCIPLINE_LABELS: Record<string, { icon: string; label: string }> = {
  road: { icon: "🚲", label: "Road" },
  gravel: { icon: "🪨", label: "Gravel" },
  mtb: { icon: "🏔️", label: "MTB" },
  mixed: { icon: "🗺️", label: "Mixed" },
};

interface CollectionCardProps {
  collection: {
    name: string;
    slug: string;
    description: string | null;
    location: string | null;
    country: string | null;
    cover_image_url: string | null;
    discipline: string;
    total_routes_count: number;
  };
}

export default function CollectionCard({ collection }: CollectionCardProps) {
  const disc = DISCIPLINE_LABELS[collection.discipline] ?? DISCIPLINE_LABELS.mixed;
  const locationText = [collection.location, collection.country].filter(Boolean).join(", ");

  return (
    <Link href={`/collections/${collection.slug}`} aria-label={`${collection.name} — ${collection.total_routes_count} routes`}>
      <div
        className="card-hover rounded-xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Cover image */}
        <div className="aspect-[16/9] relative overflow-hidden" style={{ background: "var(--bg-raised)" }}>
          {collection.cover_image_url ? (
            <img
              src={collection.cover_image_url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-10 h-10" style={{ color: "var(--border-light)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
            </div>
          )}

          {/* Discipline badge */}
          <div className="absolute top-3 right-3">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded neon-badge"
              style={{ color: "var(--text)", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            >
              {disc.icon} {disc.label}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-bold tracking-tight mb-1" style={{ color: "var(--text)" }}>{collection.name}</h3>
          {collection.description && (
            <p className="text-[13px] mb-3 line-clamp-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {collection.description}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="font-bold" style={{ color: "var(--accent)" }}>
              {collection.total_routes_count} route{collection.total_routes_count !== 1 ? "s" : ""}
            </span>
            {locationText && (
              <>
                <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
                <span>{locationText}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
```

---

## Chunk 4: Pages

### Task 9: Collections index page

**Files:**
- Create: `src/app/collections/page.tsx`

- [ ] Create the file:

```typescript
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
```

### Task 10: Collection detail page

**Files:**
- Create: `src/app/collections/[slug]/page.tsx`

- [ ] Create the file:

```typescript
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCollectionBySlug } from "@/lib/db";
import RouteCard from "@/components/RouteCard";
import JsonLd from "@/components/JsonLd";
import { generateCollectionJsonLd } from "@/lib/seo";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return {};

  const title = collection.seo_title || `${collection.name} — LOOPS Collections`;
  const description = collection.seo_description || collection.description || `${collection.total_routes_count} curated cycling routes${collection.location ? ` in ${collection.location}` : ""}.`;

  return {
    title,
    description,
    alternates: { canonical: `/collections/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://www.loops.ie/collections/${slug}`,
      ...(collection.cover_image_url && {
        images: [{ url: collection.cover_image_url, width: 1200, height: 630, alt: collection.name }],
      }),
    },
  };
}

const DISCIPLINE_LABELS: Record<string, { icon: string; label: string }> = {
  road: { icon: "🚲", label: "Road" },
  gravel: { icon: "🪨", label: "Gravel" },
  mtb: { icon: "🏔️", label: "MTB" },
  mixed: { icon: "🗺️", label: "Mixed" },
};

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  const disc = DISCIPLINE_LABELS[collection.discipline] ?? DISCIPLINE_LABELS.mixed;
  const locationText = [collection.location, collection.country].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={generateCollectionJsonLd(collection)} />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/" className="font-black text-xl tracking-tight" style={{ color: "var(--accent)" }}>
            LOOPS
          </Link>
          <span style={{ color: "var(--border-light)" }} aria-hidden="true">/</span>
          <Link href="/collections" className="text-sm font-semibold hover:opacity-80" style={{ color: "var(--text-muted)" }}>
            Collections
          </Link>
          <span style={{ color: "var(--border-light)" }} aria-hidden="true">/</span>
          <span className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{collection.name}</span>
        </div>
      </header>

      {/* Hero */}
      {collection.cover_image_url && (
        <div className="w-full h-56 md:h-80 relative overflow-hidden" style={{ background: "var(--bg-raised)" }}>
          <img src={collection.cover_image_url} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }} />
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* Title block */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded neon-badge"
              style={{ color: "var(--text)", background: "var(--bg-raised)", border: "1px solid var(--border)" }}
            >
              {disc.icon} {disc.label}
            </span>
            {collection.difficulty_range && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ color: "var(--text-muted)", background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
                {collection.difficulty_range}
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2" style={{ color: "var(--text)" }}>
            {collection.name}
          </h1>

          <div className="flex items-center gap-3 text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            <span className="font-bold" style={{ color: "var(--accent)" }}>
              {collection.total_routes_count} route{collection.total_routes_count !== 1 ? "s" : ""}
            </span>
            {locationText && (
              <>
                <span style={{ color: "var(--border-light)" }} aria-hidden="true">·</span>
                <span>{locationText}</span>
              </>
            )}
          </div>

          {collection.description && (
            <p className="text-base leading-relaxed max-w-2xl" style={{ color: "var(--text-muted)" }}>
              {collection.description}
            </p>
          )}
        </div>

        {/* Routes */}
        {collection.routes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No routes in this collection yet.</p>
        ) : (
          <div className="space-y-3">
            {collection.routes.map((route, index) => (
              <div key={route.id} className="flex items-start gap-3">
                <span
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mt-3"
                  style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <RouteCard route={route} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

---

## Chunk 5: Homepage Featured Strip + Nav

### Task 11: FeaturedCollections component

**Files:**
- Create: `src/app/_components/FeaturedCollections.tsx`

- [ ] Create the file:

```typescript
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
}

export default function FeaturedCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then((json) => {
        const all: Collection[] = json.data ?? [];
        setCollections(all.filter((c) => (c as { featured?: boolean }).featured).slice(0, 6));
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
```

### Task 12: Wire FeaturedCollections into HomeClient

**Files:**
- Modify: `src/app/_components/HomeClient.tsx` — import and render FeaturedCollections above the route list

- [ ] Add import at top of `HomeClient.tsx`:
```typescript
import FeaturedCollections from "./FeaturedCollections";
```

- [ ] In `HomeContent`, add `<FeaturedCollections />` directly above `{/* Filter Row */}` (before the DurationStrip section). Find the line that renders `<DurationStrip` and insert before it:
```tsx
<FeaturedCollections />
```

### Task 13: Add Collections to Footer nav

**Files:**
- Modify: `src/components/Footer.tsx` — add Collections link

- [ ] In `Footer.tsx`, find the `navLinks` array that includes `{ label: "About", href: "/about" }` and add Collections as the first item:
```typescript
{ label: "Collections", href: "/collections" },
```

### Task 14: Add Collections to sitemap

**Files:**
- Modify: `src/app/sitemap.ts` — add collection URLs

- [ ] Read the current `sitemap.ts` and add collection entries:
  - Static entry for `/collections`
  - Dynamic entries for each `collection.slug` from `getCollections()`

---

## Chunk 6: Verify

### Task 15: TypeScript compile check

- [ ] Run: `npx tsc --noEmit`
- [ ] Fix any type errors

### Task 16: Commit

- [ ] `git add -A && git commit -m "feat: add collections feature (DB, API, pages, homepage strip)"`
