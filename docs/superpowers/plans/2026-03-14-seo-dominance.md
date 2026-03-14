# SEO Dominance Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LOOPS the authoritative cycling route platform across Google and AI search — from zero organic traffic to consistent discovery via search.

**Architecture:** Technical SEO foundation (robots.txt, sitemap, JSON-LD), programmatic landing pages (country/region), AI search optimisation (llms.txt, FAQ schema), internal linking (breadcrumbs, related routes), and homepage public access. All server-rendered where possible for crawlability.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vercel Postgres, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-14-seo-dominance-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/seo.ts` | Create | SEO utilities: `slugify()`, JSON-LD generators |
| `src/lib/__tests__/seo.test.ts` | Create | Unit tests for SEO utilities |
| `src/app/robots.ts` | Create | robots.txt generation |
| `src/app/sitemap.ts` | Create | Dynamic XML sitemap |
| `public/llms.txt` | Create | AI crawler info file |
| `src/components/JsonLd.tsx` | Create | Reusable JSON-LD `<script>` component |
| `src/components/Breadcrumbs.tsx` | Create | Breadcrumb nav + structured data |
| `src/components/RouteFaq.tsx` | Create | Auto-generated FAQ section with schema |
| `src/components/RelatedRoutes.tsx` | Create | "More routes in {Region}" section |
| `src/app/routes/country/[country]/page.tsx` | Create | Country landing page (server component) |
| `src/app/routes/country/[country]/[region]/page.tsx` | Create | Region landing page (server component) |
| `src/lib/db.ts` | Modify | Add 6 new queries for SEO features |
| `middleware.ts` | Modify | Make homepage + info pages public |
| `src/app/routes/[id]/layout.tsx` | Modify | Add JSON-LD, improve metadata |
| `src/app/routes/[id]/page.tsx` | Modify | Add Breadcrumbs, RouteFaq, RelatedRoutes |
| `src/app/layout.tsx` | Modify | Add WebSite JSON-LD, og:locale |
| `src/app/page.tsx` | Modify | Add SEO content section |
| `next.config.ts` | Modify | Add security headers |

---

## Chunk 1: Foundation — SEO Utilities, robots.txt, sitemap, llms.txt

### Task 1: SEO Utility Functions

**Files:**
- Create: `src/lib/seo.ts`
- Create: `src/lib/__tests__/seo.test.ts`

- [ ] **Step 1: Write tests for `slugify()`**

```typescript
// src/lib/__tests__/seo.test.ts
import { describe, it, expect } from "vitest";
import { slugify, generateRouteJsonLd, generateBreadcrumbJsonLd, generateFaqJsonLd, generateItemListJsonLd } from "@/lib/seo";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Ireland")).toBe("ireland");
    expect(slugify("United Kingdom")).toBe("united-kingdom");
    expect(slugify("West Cork")).toBe("west-cork");
  });

  it("handles already-slugified input", () => {
    expect(slugify("ireland")).toBe("ireland");
  });

  it("transliterates accented characters", () => {
    expect(slugify("Rhône-Alpes")).toBe("rhone-alpes");
    expect(slugify("São Paulo")).toBe("sao-paulo");
  });

  it("preserves existing hyphens in names", () => {
    expect(slugify("Castlebar-Westport")).toBe("castlebar-westport");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("New  South  Wales")).toBe("new-south-wales");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify(" Ireland ")).toBe("ireland");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/seo.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `slugify()` and JSON-LD generators**

```typescript
// src/lib/seo.ts

// ── Slug utilities ──

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── JSON-LD generators ──

interface RouteJsonLdInput {
  id: string;
  name: string;
  description: string | null;
  start_lat: number;
  start_lng: number;
  county: string;
  country: string;
  region: string | null;
  distance_km: number;
  elevation_gain_m: number;
  difficulty: string;
  surface_type: string;
  discipline: string;
  rating?: { average: number; count: number };
}

export function generateRouteJsonLd(route: RouteJsonLdInput) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: route.name,
    description: route.description || `${route.difficulty} ${route.discipline} route in ${route.region || route.county}, ${route.country}`,
    url: `https://loops.ie/routes/${route.id}`,
    geo: {
      "@type": "GeoCoordinates",
      latitude: route.start_lat,
      longitude: route.start_lng,
    },
    address: {
      "@type": "PostalAddress",
      addressRegion: route.region || route.county,
      addressCountry: route.country,
    },
    sport: "Cycling",
    image: `https://loops.ie/api/og/${route.id}`,
    additionalProperty: [
      { "@type": "PropertyValue", name: "Distance", value: `${route.distance_km} km` },
      { "@type": "PropertyValue", name: "Elevation Gain", value: `${route.elevation_gain_m} m` },
      { "@type": "PropertyValue", name: "Difficulty", value: route.difficulty.charAt(0).toUpperCase() + route.difficulty.slice(1) },
      { "@type": "PropertyValue", name: "Surface", value: route.surface_type.charAt(0).toUpperCase() + route.surface_type.slice(1) },
      { "@type": "PropertyValue", name: "Discipline", value: route.discipline.charAt(0).toUpperCase() + route.discipline.slice(1) },
    ],
  };

  if (route.rating && route.rating.count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: route.rating.average,
      reviewCount: route.rating.count,
    };
  }

  return jsonLd;
}

interface BreadcrumbItem {
  name: string;
  url?: string;
}

export function generateBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => {
      const element: Record<string, unknown> = {
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
      };
      if (item.url) {
        element.item = item.url;
      }
      return element;
    }),
  };
}

interface FaqItem {
  question: string;
  answer: string;
}

export function generateFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

interface ItemListRoute {
  name: string;
  id: string;
}

export function generateItemListJsonLd(name: string, routes: ItemListRoute[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: routes.length,
    itemListElement: routes.map((route, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: route.name,
      url: `https://loops.ie/routes/${route.id}`,
    })),
  };
}
```

- [ ] **Step 4: Add JSON-LD generator tests**

Add to `src/lib/__tests__/seo.test.ts`:

```typescript
describe("generateRouteJsonLd", () => {
  const baseRoute: Parameters<typeof generateRouteJsonLd>[0] = {
    id: "abc123",
    name: "Test Route",
    description: "A great route",
    start_lat: 53.5,
    start_lng: -7.5,
    county: "Cork",
    country: "Ireland",
    region: "West Cork",
    distance_km: 45,
    elevation_gain_m: 620,
    difficulty: "moderate",
    surface_type: "gravel",
    discipline: "gravel",
  };

  it("generates valid SportsActivityLocation schema", () => {
    const result = generateRouteJsonLd(baseRoute);
    expect(result["@type"]).toBe("SportsActivityLocation");
    expect(result.url).toBe("https://loops.ie/routes/abc123");
    expect(result.sport).toBe("Cycling");
  });

  it("includes aggregateRating only when count > 0", () => {
    const withRating = generateRouteJsonLd({ ...baseRoute, rating: { average: 4.2, count: 8 } });
    expect(withRating.aggregateRating).toBeDefined();

    const withoutRating = generateRouteJsonLd(baseRoute);
    expect(withoutRating.aggregateRating).toBeUndefined();

    const zeroRating = generateRouteJsonLd({ ...baseRoute, rating: { average: 0, count: 0 } });
    expect(zeroRating.aggregateRating).toBeUndefined();
  });

  it("falls back to county when region is null", () => {
    const result = generateRouteJsonLd({ ...baseRoute, region: null });
    const address = result.address as { addressRegion: string };
    expect(address.addressRegion).toBe("Cork");
  });
});

describe("generateBreadcrumbJsonLd", () => {
  it("generates correct positions and omits item for last entry", () => {
    const result = generateBreadcrumbJsonLd([
      { name: "LOOPS", url: "https://loops.ie" },
      { name: "Ireland", url: "https://loops.ie/routes/country/ireland" },
      { name: "Route Name" },
    ]);
    expect(result.itemListElement).toHaveLength(3);
    expect(result.itemListElement[0].position).toBe(1);
    expect(result.itemListElement[2].item).toBeUndefined();
  });
});

describe("generateFaqJsonLd", () => {
  it("generates FAQPage schema", () => {
    const result = generateFaqJsonLd([
      { question: "How long?", answer: "45km" },
    ]);
    expect(result["@type"]).toBe("FAQPage");
    expect(result.mainEntity).toHaveLength(1);
    expect(result.mainEntity[0]["@type"]).toBe("Question");
  });
});

describe("generateItemListJsonLd", () => {
  it("generates ItemList with correct count and URLs", () => {
    const result = generateItemListJsonLd("Test List", [
      { name: "Route 1", id: "r1" },
      { name: "Route 2", id: "r2" },
    ]);
    expect(result.numberOfItems).toBe(2);
    expect(result.itemListElement[0].url).toBe("https://loops.ie/routes/r1");
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/seo.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/seo.ts src/lib/__tests__/seo.test.ts
git commit -m "feat: add SEO utility functions with slugify and JSON-LD generators"
```

---

### Task 2: JsonLd Component

**Files:**
- Create: `src/components/JsonLd.tsx`

- [ ] **Step 1: Create reusable JsonLd component**

```tsx
// src/components/JsonLd.tsx

export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/JsonLd.tsx
git commit -m "feat: add reusable JsonLd component"
```

---

### Task 3: robots.txt

**Files:**
- Create: `src/app/robots.ts`

- [ ] **Step 1: Create robots.ts**

```typescript
// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/upload", "/messages", "/profile/edit"],
      },
      {
        userAgent: "GPTBot",
        allow: "/",
      },
      {
        userAgent: "ClaudeBot",
        allow: "/",
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
      },
    ],
    sitemap: "https://loops.ie/sitemap.xml",
  };
}
```

- [ ] **Step 2: Verify robots.txt renders**

Run: `npx next build && npx next start &`
Then: `curl http://localhost:3000/robots.txt`
Expected: Output matching the rules above. Kill the server after.

Alternatively, just run `npx next dev &` and `curl http://localhost:3000/robots.txt`.

- [ ] **Step 3: Commit**

```bash
git add src/app/robots.ts
git commit -m "feat: add robots.txt with AI crawler allowlisting"
```

---

### Task 4: Database Queries for SEO

**Files:**
- Modify: `src/lib/db.ts` (add after the existing `getAllRoutes` function around line 859)

- [ ] **Step 1: Add `getAllRoutesForSitemap()`**

Add to `src/lib/db.ts` after the `getAllRoutes` function:

```typescript
// ──── SEO Queries ────

export async function getAllRoutesForSitemap(): Promise<{ id: string; created_at: string }[]> {
  const { rows } = await sql`SELECT id, created_at FROM routes ORDER BY created_at DESC`;
  return rows as { id: string; created_at: string }[];
}
```

- [ ] **Step 2: Add `getRoutesByCountrySlug()`**

```typescript
export async function getRoutesByCountrySlug(slug: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count
     FROM routes r
     LEFT JOIN ratings rt ON rt.route_id = r.id
     WHERE LOWER(REPLACE(r.country, ' ', '-')) = $1 -- Note: accented DB values may not match. Current data is ASCII-only; if non-ASCII countries are added, migrate to a slug column.
     GROUP BY r.id
     ORDER BY COALESCE(AVG(rt.score), 0) DESC, r.created_at DESC`,
    [slug]
  );
  return rows as Route[];
}
```

- [ ] **Step 3: Add `getRoutesByRegionSlug()`**

```typescript
export async function getRoutesByRegionSlug(countrySlug: string, regionSlug: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count
     FROM routes r
     LEFT JOIN ratings rt ON rt.route_id = r.id
     WHERE LOWER(REPLACE(r.country, ' ', '-')) = $1 -- Note: accented DB values may not match. Current data is ASCII-only; if non-ASCII countries are added, migrate to a slug column.
       AND LOWER(REPLACE(r.region, ' ', '-')) = $2
     GROUP BY r.id
     ORDER BY COALESCE(AVG(rt.score), 0) DESC, r.created_at DESC`,
    [countrySlug, regionSlug]
  );
  return rows as Route[];
}
```

- [ ] **Step 4: Add `getCountryStats()`**

```typescript
export async function getCountryStats(countrySlug: string): Promise<{
  routeCount: number;
  totalDistanceKm: number;
  avgRating: number;
  disciplines: string[];
  difficulties: string[];
  displayName: string;
  regions: { name: string; routeCount: number }[];
} | null> {
  const { rows } = await sql.query(
    `SELECT
       COUNT(*) as route_count,
       COALESCE(SUM(distance_km), 0) as total_distance,
       COALESCE((SELECT AVG(rt.score) FROM ratings rt JOIN routes r2 ON rt.route_id = r2.id WHERE LOWER(REPLACE(r2.country, ' ', '-')) = $1), 0) as avg_rating,
       MIN(country) as display_name
     FROM routes
     WHERE LOWER(REPLACE(country, ' ', '-')) = $1`,
    [countrySlug]
  );

  if (!rows[0] || Number(rows[0].route_count) === 0) return null;

  const { rows: disciplineRows } = await sql.query(
    `SELECT DISTINCT discipline FROM routes WHERE LOWER(REPLACE(country, ' ', '-')) = $1 ORDER BY discipline`,
    [countrySlug]
  );

  const { rows: difficultyRows } = await sql.query(
    `SELECT DISTINCT difficulty FROM routes WHERE LOWER(REPLACE(country, ' ', '-')) = $1 ORDER BY difficulty`,
    [countrySlug]
  );

  const { rows: regionRows } = await sql.query(
    `SELECT region as name, COUNT(*) as route_count
     FROM routes
     WHERE LOWER(REPLACE(country, ' ', '-')) = $1 AND region IS NOT NULL
     GROUP BY region
     ORDER BY region`,
    [countrySlug]
  );

  return {
    routeCount: Number(rows[0].route_count),
    totalDistanceKm: Math.round(Number(rows[0].total_distance)),
    avgRating: Number(Number(rows[0].avg_rating).toFixed(1)),
    disciplines: disciplineRows.map((r) => r.discipline),
    difficulties: difficultyRows.map((r) => r.difficulty),
    displayName: rows[0].display_name,
    regions: regionRows.map((r) => ({ name: r.name, routeCount: Number(r.route_count) })),
  };
}
```

- [ ] **Step 5: Add `getRegionStats()`**

```typescript
export async function getRegionStats(countrySlug: string, regionSlug: string): Promise<{
  routeCount: number;
  totalDistanceKm: number;
  avgRating: number;
  disciplines: string[];
  difficulties: string[];
  displayName: string;
  countryDisplayName: string;
} | null> {
  const { rows } = await sql.query(
    `SELECT
       COUNT(*) as route_count,
       COALESCE(SUM(distance_km), 0) as total_distance,
       COALESCE((SELECT AVG(rt.score) FROM ratings rt JOIN routes r2 ON rt.route_id = r2.id WHERE LOWER(REPLACE(r2.country, ' ', '-')) = $1 AND LOWER(REPLACE(r2.region, ' ', '-')) = $2), 0) as avg_rating,
       MIN(region) as display_name,
       MIN(country) as country_display_name
     FROM routes
     WHERE LOWER(REPLACE(country, ' ', '-')) = $1
       AND LOWER(REPLACE(region, ' ', '-')) = $2`,
    [countrySlug, regionSlug]
  );

  if (!rows[0] || Number(rows[0].route_count) === 0) return null;

  const { rows: disciplineRows } = await sql.query(
    `SELECT DISTINCT discipline FROM routes WHERE LOWER(REPLACE(country, ' ', '-')) = $1 AND LOWER(REPLACE(region, ' ', '-')) = $2 ORDER BY discipline`,
    [countrySlug, regionSlug]
  );

  const { rows: difficultyRows } = await sql.query(
    `SELECT DISTINCT difficulty FROM routes WHERE LOWER(REPLACE(country, ' ', '-')) = $1 AND LOWER(REPLACE(region, ' ', '-')) = $2 ORDER BY difficulty`,
    [countrySlug, regionSlug]
  );

  return {
    routeCount: Number(rows[0].route_count),
    totalDistanceKm: Math.round(Number(rows[0].total_distance)),
    avgRating: Number(Number(rows[0].avg_rating).toFixed(1)),
    disciplines: disciplineRows.map((r) => r.discipline),
    difficulties: difficultyRows.map((r) => r.difficulty),
    displayName: rows[0].display_name,
    countryDisplayName: rows[0].country_display_name,
  };
}
```

- [ ] **Step 6: Add `getRelatedRoutes()`**

```typescript
export async function getRelatedRoutes(
  routeId: string,
  country: string,
  region: string | null,
  limit: number
): Promise<Route[]> {
  if (region) {
    const { rows } = await sql.query(
      `SELECT * FROM routes WHERE country = $1 AND region = $2 AND id != $3 ORDER BY created_at DESC LIMIT $4`,
      [country, region, routeId, limit]
    );
    if (rows.length > 0) return rows as Route[];
  }
  // Fall back to same country
  const { rows } = await sql.query(
    `SELECT * FROM routes WHERE country = $1 AND id != $2 ORDER BY created_at DESC LIMIT $3`,
    [country, routeId, limit]
  );
  return rows as Route[];
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add SEO database queries for sitemap, landing pages, and related routes"
```

---

### Task 5: XML Sitemap

**Files:**
- Create: `src/app/sitemap.ts`

- [ ] **Step 1: Create sitemap.ts**

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { getAllRoutesForSitemap, getCountries, getRegions } from "@/lib/db";
import { slugify } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [routes, countries] = await Promise.all([
    getAllRoutesForSitemap(),
    getCountries(),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: "https://loops.ie", changeFrequency: "weekly", priority: 1.0 },
    { url: "https://loops.ie/login", changeFrequency: "monthly", priority: 0.3 },
    { url: "https://loops.ie/about", changeFrequency: "monthly", priority: 0.2 },
    { url: "https://loops.ie/privacy", changeFrequency: "monthly", priority: 0.2 },
    { url: "https://loops.ie/terms", changeFrequency: "monthly", priority: 0.2 },
  ];

  const routePages: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `https://loops.ie/routes/${route.id}`,
    lastModified: new Date(route.created_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const countryPages: MetadataRoute.Sitemap = countries.map((country) => ({
    url: `https://loops.ie/routes/country/${slugify(country)}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Get regions for each country
  const regionPages: MetadataRoute.Sitemap = [];
  for (const country of countries) {
    const regions = await getRegions(country);
    for (const region of regions) {
      regionPages.push({
        url: `https://loops.ie/routes/country/${slugify(country)}/${slugify(region)}`,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return [...staticPages, ...routePages, ...countryPages, ...regionPages];
}
```

- [ ] **Step 2: Verify sitemap renders**

Run: `npx next dev &` then `curl http://localhost:3000/sitemap.xml | head -50`
Expected: Valid XML with `<urlset>` containing route URLs.

- [ ] **Step 3: Commit**

```bash
git add src/app/sitemap.ts
git commit -m "feat: add dynamic XML sitemap with routes, countries, and regions"
```

---

### Task 6: llms.txt

**Files:**
- Create: `public/llms.txt`

- [ ] **Step 1: Create llms.txt**

```text
# LOOPS — Cycling Route Discovery Platform
> Find and share the best road, gravel, and MTB cycling routes worldwide.

LOOPS is a free cycling route platform where every route has been ridden and uploaded by a real cyclist. Routes include GPX downloads, elevation profiles, community ratings, and conditions reports.

## Key Pages
- Homepage: https://loops.ie — Browse all cycling routes with filters
- Routes by Country: https://loops.ie/routes/country/{country} — Cycling routes in a specific country
- Route Detail: https://loops.ie/routes/{id} — Individual route with map, elevation, GPX download
- About: https://loops.ie/about — About the platform

## Route Data Available
Each route includes: name, description, difficulty (easy/moderate/hard/expert), distance (km), elevation gain (m), surface type (gravel/mixed/trail/road), discipline (road/gravel/mtb), county, country, region, GPS coordinates, community ratings, user comments, condition reports, and free GPX file download.

## Coverage
Routes available in: Ireland, United Kingdom, and expanding worldwide. Community-uploaded with editorial curation.
```

- [ ] **Step 2: Commit**

```bash
git add public/llms.txt
git commit -m "feat: add llms.txt for AI crawler discovery"
```

---

### Task 7: Middleware Update — Make Pages Public

**Files:**
- Modify: `middleware.ts:69-72`

- [ ] **Step 1: Update middleware public routes**

In `middleware.ts`, replace the current public pages check (lines 69-72):

```typescript
  // Public pages — login + shared route links
  if (pathname.startsWith("/login") || pathname.startsWith("/routes/")) {
    return NextResponse.next();
  }
```

With:

```typescript
  // Public pages — homepage, info pages, login, route pages
  const publicExactPaths = ["/", "/about", "/privacy", "/terms", "/feedback"];
  if (
    publicExactPaths.includes(pathname) ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/routes/")
  ) {
    return NextResponse.next();
  }
```

- [ ] **Step 2: Verify homepage is accessible without auth**

Run: `npx next dev &`
Then: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`
Expected: `200` (not `307` redirect)

Also verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/about`
Expected: `200`

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: make homepage and info pages public for SEO"
```

---

### Task 8: Security Headers

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add security headers**

Update `next.config.ts` to add a catch-all headers entry:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "feat: add security headers for SEO trust signals"
```

---

## Chunk 2: JSON-LD, Metadata, Breadcrumbs, FAQ, Related Routes

### Task 9: Route Page JSON-LD and Metadata Improvements

**Files:**
- Modify: `src/app/routes/[id]/layout.tsx`

- [ ] **Step 1: Update layout with JSON-LD and improved metadata**

Replace the entire file `src/app/routes/[id]/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { getRoute, getRouteRating } from "@/lib/db";
import { generateRouteJsonLd, generateBreadcrumbJsonLd, slugify } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const route = await getRoute(id);

  if (!route) {
    return { title: "Route Not Found - LOOPS" };
  }

  const location = route.region || route.county;
  const title = `${route.name} — ${route.distance_km}km ${route.difficulty} ${route.discipline} route in ${location}, ${route.country} | LOOPS`;
  const description = route.description
    ? `${route.description.slice(0, 120)}. ${route.distance_km}km ${route.difficulty} ${route.discipline} route in ${location}, ${route.country}. ${route.elevation_gain_m}m climbing. Free GPX download.`
    : `${route.distance_km}km ${route.difficulty} ${route.discipline} route in ${location}, ${route.country}. ${route.elevation_gain_m}m climbing. Free GPX download.`;

  return {
    title,
    description,
    alternates: { canonical: `https://loops.ie/routes/${id}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${route.name} — ${route.distance_km}km ${route.discipline} route in ${location}, ${route.country}`,
      description,
      siteName: "LOOPS",
      type: "article",
      locale: "en_IE",
      images: [`/api/og/${id}`],
    },
    twitter: {
      card: "summary_large_image",
      title: `${route.name} - LOOPS`,
      description,
      images: [`/api/og/${id}`],
    },
  };
}

export default async function RouteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const route = await getRoute(id);

  if (!route) return children;

  const rating = await getRouteRating(id);

  const routeJsonLd = generateRouteJsonLd({
    id: route.id,
    name: route.name,
    description: route.description,
    start_lat: route.start_lat,
    start_lng: route.start_lng,
    county: route.county,
    country: route.country,
    region: route.region,
    distance_km: route.distance_km,
    elevation_gain_m: route.elevation_gain_m,
    difficulty: route.difficulty,
    surface_type: route.surface_type,
    discipline: route.discipline,
    rating: { average: rating.average, count: rating.count },
  });

  const breadcrumbItems = [
    { name: "LOOPS", url: "https://loops.ie" },
    { name: route.country, url: `https://loops.ie/routes/country/${slugify(route.country)}` },
  ];
  if (route.region) {
    breadcrumbItems.push({
      name: route.region,
      url: `https://loops.ie/routes/country/${slugify(route.country)}/${slugify(route.region)}`,
    });
  }
  breadcrumbItems.push({ name: route.name });

  const breadcrumbJsonLd = generateBreadcrumbJsonLd(breadcrumbItems);

  return (
    <>
      <JsonLd data={routeJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      {children}
    </>
  );
}
```

- [ ] **Step 2: Verify JSON-LD renders on a route page**

Run dev server, then: `curl http://localhost:3000/routes/<any-route-id> | grep 'application/ld+json'`
Expected: Two `<script type="application/ld+json">` tags — one for SportsActivityLocation, one for BreadcrumbList.

- [ ] **Step 3: Commit**

```bash
git add src/app/routes/[id]/layout.tsx
git commit -m "feat: add JSON-LD structured data and improved metadata to route pages"
```

---

### Task 10: Breadcrumbs Component

**Files:**
- Create: `src/components/Breadcrumbs.tsx`

- [ ] **Step 1: Create Breadcrumbs component**

```tsx
// src/components/Breadcrumbs.tsx
import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs flex items-center gap-1 flex-wrap" style={{ color: "var(--text-muted)" }}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:underline" style={{ color: "var(--text-muted)" }}>
              {item.label}
            </Link>
          ) : (
            <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Breadcrumbs.tsx
git commit -m "feat: add Breadcrumbs navigation component"
```

---

### Task 11: RouteFaq Component

**Files:**
- Create: `src/components/RouteFaq.tsx`

- [ ] **Step 1: Create RouteFaq component**

```tsx
// src/components/RouteFaq.tsx
"use client";

import { useState } from "react";
import JsonLd from "@/components/JsonLd";
import { generateFaqJsonLd } from "@/lib/seo";

interface RouteFaqProps {
  routeName: string;
  distanceKm: number;
  elevationGainM: number;
  surfaceType: string;
  discipline: string;
  difficulty: string;
}

const DIFFICULTY_CONTEXT: Record<string, string> = {
  easy: "Suitable for beginners and casual riders. Mostly flat or gentle gradients.",
  moderate: "Some climbing and varied terrain. Good fitness recommended.",
  hard: "Significant climbing and technical sections. Strong fitness required.",
  expert: "Extreme terrain and sustained climbing. For experienced cyclists only.",
};

export default function RouteFaq({
  routeName,
  distanceKm,
  elevationGainM,
  surfaceType,
  discipline,
  difficulty,
}: RouteFaqProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: `How long is ${routeName}?`,
      answer: `${distanceKm}km with ${elevationGainM}m of climbing.`,
    },
    {
      question: `What surface is ${routeName}?`,
      answer: `${surfaceType.charAt(0).toUpperCase() + surfaceType.slice(1)}. Suitable for ${discipline} bikes.`,
    },
    {
      question: `How do I ride ${routeName}?`,
      answer: `Download the free GPX file and load it into Strava, Komoot, Wahoo, or Garmin.`,
    },
    {
      question: `What difficulty is ${routeName}?`,
      answer: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}. ${DIFFICULTY_CONTEXT[difficulty] || ""}`,
    },
  ];

  return (
    <div>
      <JsonLd data={generateFaqJsonLd(faqs)} />
      <h3 className="text-sm font-bold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        FAQ
      </h3>
      <div className="space-y-1">
        {faqs.map((faq, i) => (
          <div key={i} className="rounded-lg" style={{ background: "var(--bg-raised)" }}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium"
              style={{ color: "var(--text)" }}
            >
              {faq.question}
              <svg
                className={`w-4 h-4 transition-transform ${openIndex === i ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openIndex === i && (
              <div className="px-4 pb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RouteFaq.tsx
git commit -m "feat: add RouteFaq component with FAQPage JSON-LD schema"
```

---

### Task 12: RelatedRoutes Component

**Files:**
- Create: `src/components/RelatedRoutes.tsx`

- [ ] **Step 1: Create RelatedRoutes component**

```tsx
// src/components/RelatedRoutes.tsx
import Link from "next/link";
import { slugify } from "@/lib/seo";

interface RelatedRoute {
  id: string;
  name: string;
  distance_km: number;
  difficulty: string;
  discipline: string;
  elevation_gain_m: number;
}

interface RelatedRoutesProps {
  routes: RelatedRoute[];
  regionOrCountry: string;
  country: string;
  isRegion: boolean;
}

const DIFF_COLORS: Record<string, string> = {
  easy: "var(--success)",
  moderate: "var(--warning)",
  hard: "var(--danger)",
  expert: "var(--purple)",
};

export default function RelatedRoutes({ routes, regionOrCountry, country, isRegion }: RelatedRoutesProps) {
  if (routes.length === 0) return null;

  const linkHref = isRegion
    ? `/routes/country/${slugify(country)}/${slugify(regionOrCountry)}`
    : `/routes/country/${slugify(country)}`;

  return (
    <div>
      <h3 className="text-sm font-bold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        More routes in {regionOrCountry}
      </h3>
      <div className="grid gap-2">
        {routes.map((route) => (
          <Link
            key={route.id}
            href={`/routes/${route.id}`}
            className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors hover:opacity-80"
            style={{ background: "var(--bg-raised)" }}
          >
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {route.name}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {route.distance_km}km · {route.elevation_gain_m}m climbing
              </div>
            </div>
            <span
              className="text-xs font-bold uppercase"
              style={{ color: DIFF_COLORS[route.difficulty] || "var(--text-muted)" }}
            >
              {route.difficulty}
            </span>
          </Link>
        ))}
      </div>
      <Link
        href={linkHref}
        className="inline-block mt-3 text-sm font-semibold hover:opacity-80"
        style={{ color: "var(--accent)" }}
      >
        View all routes in {regionOrCountry} &rarr;
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RelatedRoutes.tsx
git commit -m "feat: add RelatedRoutes component for internal linking"
```

---

### Task 13: Integrate Breadcrumbs, FAQ, and Related Routes into Route Detail Page

**Files:**
- Modify: `src/app/routes/[id]/page.tsx`

- [ ] **Step 1: Add imports at the top of the file**

Add these imports to the existing import block at the top of `src/app/routes/[id]/page.tsx`:

```typescript
import Breadcrumbs from "@/components/Breadcrumbs";
import RouteFaq from "@/components/RouteFaq";
import RelatedRoutes from "@/components/RelatedRoutes";
import { slugify } from "@/lib/seo";
```

- [ ] **Step 2: Add data fetching for related routes**

Inside the `RouteDetail` component, after the existing `useEffect` that fetches the route (around line 86), add:

```typescript
  const [relatedRoutes, setRelatedRoutes] = useState<Route[]>([]);

  useEffect(() => {
    if (!route) return;
    fetch(`/api/routes?country=${encodeURIComponent(route.country)}`)
      .then((r) => r.json())
      .then((data) => {
        const all = data.data || data;
        // Prefer same region, fall back to same country
        const sameRegion = route.region
          ? all.filter((r: Route) => r.id !== route.id && r.region === route.region)
          : [];
        const filtered = sameRegion.length > 0
          ? sameRegion.slice(0, 4)
          : all.filter((r: Route) => r.id !== route.id).slice(0, 4);
        setRelatedRoutes(filtered);
      })
      .catch(() => {});
  }, [route?.id, route?.country, route?.region]);
```

**Note:** The existing `/api/routes` endpoint supports `country` filter but not `region` directly. We fetch all routes in the same country, then filter client-side for same region. The `getRelatedRoutes` DB function is available for server components (landing pages) where direct DB access is possible.

- [ ] **Step 3: Add Breadcrumbs to the page**

Find the route name heading section in the JSX (it will be an `<h1>` with the route name). Add Breadcrumbs immediately above it:

```tsx
<Breadcrumbs
  items={[
    { label: "LOOPS", href: "/" },
    { label: route.country, href: `/routes/country/${slugify(route.country)}` },
    ...(route.region
      ? [{ label: route.region, href: `/routes/country/${slugify(route.country)}/${slugify(route.region)}` }]
      : []),
    { label: route.name },
  ]}
/>
```

- [ ] **Step 4: Add RouteFaq and RelatedRoutes sections**

After the existing "About this route" section in the JSX, add:

```tsx
{/* FAQ */}
<RouteFaq
  routeName={route.name}
  distanceKm={route.distance_km}
  elevationGainM={route.elevation_gain_m}
  surfaceType={route.surface_type}
  discipline={route.discipline}
  difficulty={route.difficulty}
/>

{/* Related Routes */}
<RelatedRoutes
  routes={relatedRoutes}
  regionOrCountry={route.region || route.country}
  country={route.country}
  isRegion={!!route.region}
/>
```

- [ ] **Step 5: Verify route page renders with new sections**

Open any route detail page in the browser. Verify:
- Breadcrumbs appear above the route name
- FAQ section appears with collapsible items
- Related routes appear with links to other routes

- [ ] **Step 6: Commit**

```bash
git add src/app/routes/[id]/page.tsx
git commit -m "feat: add breadcrumbs, FAQ, and related routes to route detail page"
```

---

### Task 14: Homepage Metadata and WebSite JSON-LD

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add og:locale to root layout metadata**

In `src/app/layout.tsx`, update the `metadata` export. Add `locale` to the openGraph object:

```typescript
  openGraph: {
    title: "LOOPS — Routes Worth Riding",
    description: "Discover and share the best gravel, road & MTB loops worldwide. Built by riders, for riders.",
    siteName: "LOOPS",
    type: "website",
    locale: "en_IE",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "LOOPS — Discover cycling routes worldwide" }],
  },
```

- [ ] **Step 2: Add WebSite JSON-LD to root layout**

Add the `JsonLd` import and WebSite schema to the layout. After the opening `<body>` tag, add:

```tsx
import JsonLd from "@/components/JsonLd";
```

Then inside the `<body>`, at the top (before `<ToastProvider>`):

```tsx
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "LOOPS",
  url: "https://loops.ie",
  description: "Find and share the best cycling routes worldwide",
}} />
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: add WebSite JSON-LD and og:locale to root layout"
```

---

## Chunk 3: Programmatic Landing Pages and Homepage SEO Content

### Task 15: Country Landing Page

**Files:**
- Create: `src/app/routes/country/[country]/page.tsx`

- [ ] **Step 1: Create country landing page**

```tsx
// src/app/routes/country/[country]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountries, getCountryStats, getRoutesByCountrySlug } from "@/lib/db";
import { slugify, generateItemListJsonLd, generateBreadcrumbJsonLd, generateFaqJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";

export const revalidate = 3600;

export async function generateStaticParams() {
  const countries = await getCountries();
  return countries.map((country) => ({ country: slugify(country) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string }>;
}): Promise<Metadata> {
  const { country: countrySlug } = await params;
  const stats = await getCountryStats(countrySlug);
  if (!stats) return { title: "Not Found - LOOPS" };

  const title = `Cycling Routes in ${stats.displayName} — ${stats.routeCount} Routes | LOOPS`;
  const description = `Discover ${stats.routeCount} cycling routes in ${stats.displayName}. Browse ${stats.disciplines.join(", ")} routes with free GPX downloads. Community rated.`;

  return {
    title,
    description,
    alternates: { canonical: `https://loops.ie/routes/country/${countrySlug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      siteName: "LOOPS",
      type: "website",
      locale: "en_IE",
      images: ["/api/og"],
    },
  };
}

export default async function CountryPage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country: countrySlug } = await params;
  const stats = await getCountryStats(countrySlug);
  if (!stats) notFound();

  const routes = await getRoutesByCountrySlug(countrySlug);
  const featuredRoutes = routes.slice(0, 6);

  const breadcrumbItems = [
    { name: "LOOPS", url: "https://loops.ie" },
    { name: stats.displayName },
  ];

  const faqItems = [
    {
      question: `What are the best cycling routes in ${stats.displayName}?`,
      answer: featuredRoutes.length > 0
        ? `Top rated routes include: ${featuredRoutes.slice(0, 3).map((r) => `${r.name} (${r.distance_km}km)`).join(", ")}.`
        : `Browse all ${stats.routeCount} routes on LOOPS to find the best rides.`,
    },
    {
      question: `How many cycling routes are in ${stats.displayName}?`,
      answer: `There are ${stats.routeCount} cycling routes in ${stats.displayName} on LOOPS, covering ${stats.disciplines.join(", ")} disciplines across ${stats.difficulties.join(", ")} difficulty levels.`,
    },
    {
      question: `Can I download GPX files for routes in ${stats.displayName}?`,
      answer: `Yes — all ${stats.routeCount} routes in ${stats.displayName} include free GPX file downloads. Load them into Strava, Komoot, Wahoo, or Garmin.`,
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={generateBreadcrumbJsonLd(breadcrumbItems)} />
      <JsonLd data={generateItemListJsonLd(`Cycling Routes in ${stats.displayName}`, routes)} />
      <JsonLd data={generateFaqJsonLd(faqItems)} />

      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:opacity-80" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <Link href="/">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <Breadcrumbs items={[
          { label: "LOOPS", href: "/" },
          { label: stats.displayName },
        ]} />

        <h1 className="text-3xl md:text-4xl font-extrabold mt-3 mb-4" style={{ color: "var(--text)" }}>
          Cycling Routes in {stats.displayName}
        </h1>

        <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--text-secondary)" }}>
          {stats.routeCount} cycling routes in {stats.displayName} on LOOPS.
          Browse {stats.disciplines.join(", ")} routes across {stats.regions.length} regions.
          Free GPX downloads, community ratings.
        </p>

        {/* Stats bar */}
        <div className="flex gap-6 mb-8 flex-wrap">
          <div>
            <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.routeCount}</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Routes</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.totalDistanceKm.toLocaleString()}</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Total km</div>
          </div>
          {stats.avgRating > 0 && (
            <div>
              <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.avgRating}</div>
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Avg rating</div>
            </div>
          )}
        </div>

        {/* Region cards */}
        {stats.regions.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
              Regions
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {stats.regions.map((region) => (
                <Link
                  key={region.name}
                  href={`/routes/country/${countrySlug}/${slugify(region.name)}`}
                  className="px-4 py-3 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
                >
                  <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{region.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>{region.routeCount} routes</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Featured routes */}
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
          {featuredRoutes.length < routes.length ? "Top Rated Routes" : "All Routes"}
        </h2>
        <div className="grid gap-3 mb-10">
          {routes.map((route) => (
            <Link
              key={route.id}
              href={`/routes/${route.id}`}
              className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors hover:opacity-80"
              style={{ background: "var(--bg-raised)" }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{route.name}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {route.distance_km}km · {route.elevation_gain_m}m climbing{route.region ? ` · ${route.region}` : ""}
                </div>
              </div>
              <span
                className="text-xs font-bold uppercase"
                style={{ color: route.difficulty === "easy" ? "var(--success)" : route.difficulty === "moderate" ? "var(--warning)" : route.difficulty === "hard" ? "var(--danger)" : "var(--purple)" }}
              >
                {route.difficulty}
              </span>
            </Link>
          ))}
        </div>

        {/* FAQ */}
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
          Frequently Asked Questions
        </h2>
        <div className="space-y-3 mb-10">
          {faqItems.map((faq, i) => (
            <div key={i} className="px-4 py-3 rounded-lg" style={{ background: "var(--bg-raised)" }}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>{faq.question}</h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify country page renders**

Run: `npx next dev &`
Then visit: `http://localhost:3000/routes/country/ireland` (or whichever country exists in your DB)
Expected: Server-rendered page with route listings, stats, region cards, and FAQ.

- [ ] **Step 3: Commit**

```bash
git add src/app/routes/country/[country]/page.tsx
git commit -m "feat: add country landing page with SEO metadata, JSON-LD, and FAQ"
```

---

### Task 16: Region Landing Page

**Files:**
- Create: `src/app/routes/country/[country]/[region]/page.tsx`

**Spec deviations (deferred):**
- **Map:** Spec calls for MapView on region pages, but MapView requires client-side Leaflet (SSR disabled). Adding it to a server-rendered page requires a client boundary wrapper. Defer to follow-up.
- **Neighbouring regions:** Spec calls for links to neighbouring regions. Requires additional queries. Defer to follow-up.

- [ ] **Step 1: Create region landing page**

```tsx
// src/app/routes/country/[country]/[region]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountries, getRegions, getRegionStats, getRoutesByRegionSlug } from "@/lib/db";
import { slugify, generateItemListJsonLd, generateBreadcrumbJsonLd, generateFaqJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";

export const revalidate = 3600;

export async function generateStaticParams() {
  const countries = await getCountries();
  const params: { country: string; region: string }[] = [];
  for (const country of countries) {
    const regions = await getRegions(country);
    for (const region of regions) {
      params.push({ country: slugify(country), region: slugify(region) });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string; region: string }>;
}): Promise<Metadata> {
  const { country: countrySlug, region: regionSlug } = await params;
  const stats = await getRegionStats(countrySlug, regionSlug);
  if (!stats) return { title: "Not Found - LOOPS" };

  const title = `Cycling Routes in ${stats.displayName}, ${stats.countryDisplayName} — ${stats.routeCount} Routes | LOOPS`;
  const description = `Discover ${stats.routeCount} cycling routes in ${stats.displayName}, ${stats.countryDisplayName}. Free GPX downloads, community ratings.`;

  return {
    title,
    description,
    alternates: { canonical: `https://loops.ie/routes/country/${countrySlug}/${regionSlug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      siteName: "LOOPS",
      type: "website",
      locale: "en_IE",
      images: ["/api/og"],
    },
  };
}

export default async function RegionPage({
  params,
}: {
  params: Promise<{ country: string; region: string }>;
}) {
  const { country: countrySlug, region: regionSlug } = await params;
  const stats = await getRegionStats(countrySlug, regionSlug);
  if (!stats) notFound();

  const routes = await getRoutesByRegionSlug(countrySlug, regionSlug);

  const breadcrumbItems = [
    { name: "LOOPS", url: "https://loops.ie" },
    { name: stats.countryDisplayName, url: `https://loops.ie/routes/country/${countrySlug}` },
    { name: stats.displayName },
  ];

  const faqItems = [
    {
      question: `What are the best cycling routes in ${stats.displayName}, ${stats.countryDisplayName}?`,
      answer: routes.length > 0
        ? `Top routes include: ${routes.slice(0, 3).map((r) => `${r.name} (${r.distance_km}km)`).join(", ")}.`
        : `Browse all routes on LOOPS to find rides in ${stats.displayName}.`,
    },
    {
      question: `How many cycling routes are in ${stats.displayName}?`,
      answer: `There are ${stats.routeCount} cycling routes in ${stats.displayName}, ${stats.countryDisplayName} on LOOPS.`,
    },
    {
      question: `Can I download GPX files for routes in ${stats.displayName}?`,
      answer: `Yes — all routes in ${stats.displayName} include free GPX downloads. Works with Strava, Komoot, Wahoo, and Garmin.`,
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <JsonLd data={generateBreadcrumbJsonLd(breadcrumbItems)} />
      <JsonLd data={generateItemListJsonLd(`Cycling Routes in ${stats.displayName}, ${stats.countryDisplayName}`, routes)} />
      <JsonLd data={generateFaqJsonLd(faqItems)} />

      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href={`/routes/country/${countrySlug}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:opacity-80" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <Link href="/">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <Breadcrumbs items={[
          { label: "LOOPS", href: "/" },
          { label: stats.countryDisplayName, href: `/routes/country/${countrySlug}` },
          { label: stats.displayName },
        ]} />

        <h1 className="text-3xl md:text-4xl font-extrabold mt-3 mb-4" style={{ color: "var(--text)" }}>
          Cycling Routes in {stats.displayName}, {stats.countryDisplayName}
        </h1>

        <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--text-secondary)" }}>
          {stats.routeCount} cycling routes in {stats.displayName}, {stats.countryDisplayName} on LOOPS.
          Browse {stats.disciplines.join(", ")} routes with free GPX downloads.
        </p>

        {/* Stats bar */}
        <div className="flex gap-6 mb-8 flex-wrap">
          <div>
            <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.routeCount}</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Routes</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.totalDistanceKm.toLocaleString()}</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Total km</div>
          </div>
          {stats.avgRating > 0 && (
            <div>
              <div className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stats.avgRating}</div>
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Avg rating</div>
            </div>
          )}
        </div>

        {/* All routes */}
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
          All Routes
        </h2>
        <div className="grid gap-3 mb-10">
          {routes.map((route) => (
            <Link
              key={route.id}
              href={`/routes/${route.id}`}
              className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors hover:opacity-80"
              style={{ background: "var(--bg-raised)" }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{route.name}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {route.distance_km}km · {route.elevation_gain_m}m climbing
                </div>
              </div>
              <span
                className="text-xs font-bold uppercase"
                style={{ color: route.difficulty === "easy" ? "var(--success)" : route.difficulty === "moderate" ? "var(--warning)" : route.difficulty === "hard" ? "var(--danger)" : "var(--purple)" }}
              >
                {route.difficulty}
              </span>
            </Link>
          ))}
        </div>

        {/* FAQ */}
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
          Frequently Asked Questions
        </h2>
        <div className="space-y-3 mb-10">
          {faqItems.map((faq, i) => (
            <div key={i} className="px-4 py-3 rounded-lg" style={{ background: "var(--bg-raised)" }}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>{faq.question}</h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify region page renders**

Visit: `http://localhost:3000/routes/country/ireland/<region-slug>`
Expected: Server-rendered page with route listings, stats, breadcrumbs, and FAQ.

Also test 404: `http://localhost:3000/routes/country/narnia`
Expected: 404 page

- [ ] **Step 3: Commit**

```bash
git add src/app/routes/country/[country]/[region]/page.tsx
git commit -m "feat: add region landing page with SEO metadata, JSON-LD, and FAQ"
```

---

### Task 17: Homepage SEO Content Section

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add SEO content section to homepage**

The homepage is a client component (`"use client"`), so adding content inside it means it's client-rendered. For maximum crawlability, create a thin server wrapper that renders the SEO text, then renders the existing client homepage below it.

**Option: Server wrapper approach.** Create `src/app/_components/HomeSeoContent.tsx` as a server component:

```tsx
// src/app/_components/HomeSeoContent.tsx
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
```

Then in `src/app/page.tsx`, this server component cannot be directly imported into a client component. Instead, restructure the homepage to use a layout-like pattern:

1. Rename the current `src/app/page.tsx` content into a client component `src/app/_components/HomeClient.tsx`
2. Make `src/app/page.tsx` a server component that composes both:

```tsx
// src/app/page.tsx (server component — NO "use client")
import HomeClient from "./_components/HomeClient";
import HomeSeoContent from "./_components/HomeSeoContent";

export default function HomePage() {
  return (
    <>
      <HomeClient />
      <HomeSeoContent />
    </>
  );
}
```

This ensures the SEO content section is server-rendered in the HTML response, visible to crawlers that don't execute JS. The interactive route explorer remains client-rendered above it.

**Implementation steps:**
1. Move the existing `src/app/page.tsx` content to `src/app/_components/HomeClient.tsx` (keep the `"use client"` directive)
2. Create `src/app/_components/HomeSeoContent.tsx` (server component)
3. Replace `src/app/page.tsx` with the server component wrapper above

- [ ] **Step 2: Update homepage metadata**

The homepage metadata is in `src/app/layout.tsx` as the default. Since the homepage is the root route, update the root layout metadata title and description:

In `src/app/layout.tsx`, update:

```typescript
  title: "LOOPS — Cycling Routes Worldwide | Free GPX Downloads",
  description: "Discover cycling routes worldwide. Free GPX downloads, community ratings, elevation profiles. Gravel, road & MTB routes from real riders.",
```

- [ ] **Step 3: Verify homepage has crawlable text**

Run dev server, then: `curl http://localhost:3000/ | grep "Discover Cycling Routes"`
Expected: The SEO content section text appears in the HTML.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx
git commit -m "feat: add SEO content section to homepage with country links"
```

---

### Task 18: Final Verification

- [ ] **Step 1: Run unit tests**

Run: `npx vitest run`
Expected: All tests pass (including new SEO tests and existing climb-detection tests).

- [ ] **Step 2: Run build**

Run: `npx next build`
Expected: Build succeeds. Static params generate for country/region pages. No TypeScript errors.

- [ ] **Step 3: Verify sitemap**

Run: `npx next start &` then `curl http://localhost:3000/sitemap.xml`
Expected: Valid XML with all route URLs, country landing page URLs, and region landing page URLs.

- [ ] **Step 4: Verify robots.txt**

Run: `curl http://localhost:3000/robots.txt`
Expected: Rules matching spec — disallow API/admin, allow AI crawlers.

- [ ] **Step 5: Verify JSON-LD on route page**

Run: `curl http://localhost:3000/routes/<route-id> | python3 -m json.tool` (pipe through grep for `ld+json` first)
Expected: Valid SportsActivityLocation, BreadcrumbList, and FAQPage JSON-LD.

- [ ] **Step 6: Verify country/region pages**

Visit country and region pages in browser. Verify:
- Correct H1, breadcrumbs, stats, route list, FAQ
- 404 for invalid slugs
- View source shows server-rendered HTML (not client-side JS)

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address any issues found during final verification"
```
