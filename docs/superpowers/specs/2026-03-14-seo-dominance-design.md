# SEO Dominance Strategy — Design Spec

## Goal

Make LOOPS the authoritative cycling route discovery platform across traditional search (Google) and AI search (ChatGPT, Perplexity, Claude, Google AI Overviews). Build from zero organic traffic to a consistent flow of users finding routes via search.

## Current State

- **Domain:** loops.ie (live on Vercel)
- **Public pages:** `/routes/[id]` (individual route detail), `/login` (landing), `/about`, `/privacy`, `/terms`, `/feedback`
- **Auth-gated:** Homepage (`/`) redirects unauthenticated users to `/login`
- **Existing metadata:** Route pages have `generateMetadata()` with dynamic title, description, OG images. Login page has SEO-optimised metadata. Global layout has OG + Twitter Card.
- **Missing:** No `sitemap.xml`, no `robots.txt`, no JSON-LD structured data, no programmatic landing pages, no `llms.txt`, no breadcrumbs
- **Route data:** ~19 routes across multiple countries with fields: name, description, difficulty, distance_km, elevation_gain_m, surface_type, county, country, region, discipline, coordinates, ratings, comments, photos, conditions
- **Database queries:** `getCountries()`, `getRegions(country?)`, `getCounties()`, `getAllRoutes()`, `getRoutes(filters)` already exist

## Design

### 1. Technical SEO Foundation

#### 1a. robots.txt

Create `src/app/robots.ts` using Next.js App Router convention.

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /upload
Disallow: /messages
Disallow: /profile/edit

# AI crawlers — explicitly welcomed
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: https://loops.ie/sitemap.xml
```

Key decisions:
- Block API routes, admin, upload, messages, profile edit (private/functional pages)
- Explicitly allow AI crawlers (many sites block these — we want the opposite)
- Allow `/profile/[id]` pages (public user profiles add content depth)

#### 1b. XML Sitemap

Create `src/app/sitemap.ts` using Next.js App Router convention. Returns a dynamic sitemap.

**Included URLs:**
- `/` (homepage) — priority 1.0, weekly changefreq
- `/login` — priority 0.3 (will be replaced by public homepage later)
- `/about`, `/privacy`, `/terms` — priority 0.2, monthly
- `/routes/[id]` for every route — priority 0.8, weekly, `lastmod` from route's `created_at`
- `/routes/country/[country]` landing pages — priority 0.7, weekly
- `/routes/country/[country]/[region]` landing pages — priority 0.6, weekly

**Data source:** New `getAllRoutesForSitemap()` query (unpaginated, returns only `id` and `created_at` — lightweight) + `getCountries()` + `getRegions()` from `db.ts`. Note: the existing `getAllRoutes()` is paginated (defaults to 50/page) and is not suitable for sitemap generation.

**`lastmod` limitation:** The `routes` table has no `updated_at` column. Sitemap uses `created_at` as `lastmod`. This means routes that accumulate ratings/comments won't signal content freshness via the sitemap. This is acceptable for launch — adding `updated_at` is a future improvement.

**Sitemap size:** With <1000 routes, a single sitemap file is fine (limit is 50,000 URLs). No sitemap index needed yet.

#### 1c. JSON-LD Structured Data

Add structured data to route detail pages (`/routes/[id]/layout.tsx`).

**Schema type:** `SportsActivityLocation` with `Place` fallback.

```json
{
  "@context": "https://schema.org",
  "@type": "SportsActivityLocation",
  "name": "Route Name",
  "description": "Route description...",
  "url": "https://loops.ie/routes/abc123",
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 53.5,
    "longitude": -7.5
  },
  "address": {
    "@type": "PostalAddress",
    "addressRegion": "Cork",
    "addressCountry": "Ireland"
  },
  "sport": "Cycling",
  "image": "https://loops.ie/api/og/abc123",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.2,
    "reviewCount": 8
  },
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "Distance", "value": "45 km" },
    { "@type": "PropertyValue", "name": "Elevation Gain", "value": "620 m" },
    { "@type": "PropertyValue", "name": "Difficulty", "value": "Moderate" },
    { "@type": "PropertyValue", "name": "Surface", "value": "Gravel" },
    { "@type": "PropertyValue", "name": "Discipline", "value": "Gravel" }
  ]
}
```

Also add `BreadcrumbList` schema on route pages:
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "position": 1, "name": "LOOPS", "item": "https://loops.ie" },
    { "position": 2, "name": "Ireland", "item": "https://loops.ie/routes/country/ireland" },
    { "position": 3, "name": "Cork", "item": "https://loops.ie/routes/country/ireland/cork" },
    { "position": 4, "name": "Route Name" }
  ]
}
```

Add `WebSite` schema on the homepage:
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "LOOPS",
  "url": "https://loops.ie",
  "description": "Find and share the best cycling routes worldwide"
}
```

**Note:** `SearchAction` is omitted for now — the homepage uses client-side filtering, not a server-rendered search results page. Adding `SearchAction` requires the `?q=` URL to return server-rendered results, which is out of scope. Can be added when/if server-side search is implemented.

**Implementation:** JSON-LD is rendered as a `<script type="application/ld+json">` tag in the page's server component. No library needed — just `JSON.stringify()` in a `<script>` tag.

**Conditional fields:** Only include `aggregateRating` when `rating.count > 0`. Only include `image` when route has a cover photo or OG image.

#### 1d. Meta Tags Standardisation

Route pages already have good metadata. Improvements:

- **Add canonical URLs** to route pages: `https://loops.ie/routes/[id]`
- **Standardise title format:** `{Route Name} — {Distance}km {Difficulty} {Discipline} Route in {Region}, {Country} | LOOPS`
- **Standardise description format:** Lead with the hook, include key stats: `"{Description or auto-generated summary}. {Distance}km {difficulty} {discipline} route in {Region}, {Country}. {Elevation}m climbing. Free GPX download."`
- **Add `robots: { index: true, follow: true }`** explicitly on all public pages

#### 1e. Middleware Update — Make Homepage Public

Currently `/` redirects unauthenticated users to `/login`. Change this:

- Update middleware to use an array-based allowlist for public paths: `["/", "/about", "/privacy", "/terms", "/feedback"]`. Check with exact `pathname ===` match (not `startsWith`) to avoid accidentally exposing future routes like `/about-admin`.
- The existing `pathname.startsWith("/login")` and `pathname.startsWith("/routes/")` checks remain unchanged.
- The homepage becomes the primary landing page and SEO hub.
- `/login` remains as a dedicated login page but is no longer the primary public entry point.

**Homepage data access:** The homepage is a client component that fetches routes via `/api/routes`. The API routes do not require authentication (middleware only rate-limits API requests, not auth-gates them). So making the homepage public requires only the middleware change — no API changes needed.

### 2. Programmatic Landing Pages

Create country and region landing pages that rank for broad search terms like "gravel cycling routes Ireland" or "cycling routes Cork."

#### 2a. URL Structure

```
/routes/country/[country]           → "Cycling Routes in Ireland"
/routes/country/[country]/[region]  → "Cycling Routes in Cork, Ireland"
```

**Why this structure:**
- `/routes/country/ireland` is clear, hierarchical, and SEO-friendly
- Avoids collision with existing `/routes/[id]` (route IDs are UUIDs, not country names)
- Forward-compatible with future additions like `/routes/discipline/gravel` or `/routes/near/dublin`

**Slug format:** Lowercase, hyphenated: `ireland`, `united-kingdom`, `cork`, `west-cork`. A `slugify()` utility converts display names to URL slugs.

**Slug resolution (important):** De-slugification is lossy (e.g., "Castlebar-Westport" would become "castlebar westport"). Instead of de-slugifying and matching, queries use `LOWER(REPLACE(country, ' ', '-')) = $1` to match the slug directly against the database. This handles mixed casing and multi-word names correctly. The actual display name is taken from the first matching row.

#### 2b. Country Landing Page

**Route:** `src/app/routes/country/[country]/page.tsx` (server component)

**Content:**
- H1: "Cycling Routes in {Country}"
- Intro paragraph: Auto-generated summary — "{Count} cycling routes in {Country} on LOOPS. Browse {discipline breakdown} routes across {region count} regions. Free GPX downloads, community ratings."
- **Stats bar:** Total routes, total distance, average rating
- **Region cards:** Grid of regions within this country, each showing route count, linking to `/routes/country/[country]/[region]`
- **Featured routes:** Top 6 routes by rating (cards with name, distance, difficulty, rating)
- **All routes list:** Paginated list of all routes in this country, sorted by rating
- **FAQ section:** 2-3 auto-generated Q&A pairs for AI citation:
  - "What are the best cycling routes in {Country}?" → Lists top 3 by rating
  - "How many cycling routes are in {Country}?" → Count + breakdown by difficulty/discipline
  - "Can I download GPX files for routes in {Country}?" → Yes, free GPX downloads for all routes

**Dynamic metadata:** Uses `generateMetadata()` (required since content is dynamic):
```
title: "Cycling Routes in {Country} — {Count} Routes | LOOPS"
description: "Discover {count} cycling routes in {Country}. Browse {difficulties} routes with free GPX downloads. Community rated."
```

**OG image:** Uses the default site OG image (`/api/og`). Custom per-country OG images are out of scope.

**404 handling:** If the country slug matches no routes, call `notFound()` from `next/navigation`.

**JSON-LD:** `ItemList` schema with route entries:
```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Cycling Routes in Ireland",
  "numberOfItems": 15,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Route Name",
      "url": "https://loops.ie/routes/abc123"
    }
  ]
}
```

#### 2c. Region Landing Page

**Route:** `src/app/routes/country/[country]/[region]/page.tsx` (server component)

**Content:** Same structure as country page but scoped to region. Region cards replaced with a map showing all routes in the region (reuse MapView component, server-render the route data).

**Dynamic metadata:** Uses `generateMetadata()` — same format as country page but scoped to region:
```
title: "Cycling Routes in {Region}, {Country} — {Count} Routes | LOOPS"
description: "Discover {count} cycling routes in {Region}, {Country}. Free GPX downloads, community ratings."
```

**OG image:** Uses the default site OG image (`/api/og`). Custom per-region OG images are out of scope.

**Breadcrumbs:** LOOPS → {Country} → {Region}

**404 handling:** If the country or region slug matches no routes in the database, call `notFound()` from `next/navigation` to return a proper 404 status. This prevents soft-404 penalties from Google for invalid URLs like `/routes/country/narnia`.

#### 2d. Data Queries

Add to `db.ts`:
- `getAllRoutesForSitemap()` — returns all routes with only `id` and `created_at` (unpaginated, lightweight)
- `getRoutesByCountrySlug(slug: string)` — returns routes where `LOWER(REPLACE(country, ' ', '-')) = slug`
- `getRoutesByRegionSlug(countrySlug: string, regionSlug: string)` — returns routes matching both country and region slugs
- `getCountryStats(countrySlug: string)` — returns `{ routeCount, totalDistanceKm, avgRating, disciplines, difficulties, displayName }`
- `getRegionStats(countrySlug: string, regionSlug: string)` — same for region
- `getRelatedRoutes(routeId: string, country: string, region: string | null, limit: number)` — returns routes in the same region (or country if region is null), excluding the given route

**Slug matching:** All slug-based queries use `LOWER(REPLACE(column, ' ', '-')) = $1` to match URL slugs against database values. The display name (proper casing) is taken from the first matching row.

**Note:** The existing `getRegions(country)` uses exact case-sensitive matching. The new slug-based queries handle case insensitivity internally. `generateStaticParams()` should use `getCountries()` / `getRegions()` and pass results through `slugify()` for param generation.

#### 2e. Static Generation

Use `generateStaticParams()` on both country and region pages to pre-render at build time:
- Country pages: `getCountries()` → generate params
- Region pages: For each country, `getRegions(country)` → generate params

This ensures fast load times and proper indexing. Pages revalidate every hour (`revalidate: 3600`).

### 3. AI Search Optimisation

#### 3a. llms.txt

Create `/public/llms.txt` — a machine-readable file (emerging standard) that tells AI crawlers what the site is about and how to use it.

```
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

#### 3b. FAQ Content Blocks

On route detail pages, add a collapsible FAQ section with structured data:

- "How long is {Route Name}?" → "{Distance}km with {elevation}m of climbing"
- "What surface is {Route Name}?" → "{Surface type}. Suitable for {discipline} bikes."
- "How do I ride {Route Name}?" → "Download the free GPX file and load it into Strava, Komoot, Wahoo, or Garmin."
- "What difficulty is {Route Name}?" → "{Difficulty}. {Context based on difficulty level}."

These use `FAQPage` JSON-LD schema for rich snippet eligibility. FAQ answers are auto-generated from route data.

#### 3c. Content Formatting for AI Citation

Structure route descriptions and landing page content with clear, citable facts:

- Lead with the most important information (inverted pyramid)
- Use specific numbers: "45km gravel route with 620m climbing" not "a medium-length route with some hills"
- Include comparisons where possible: "One of the highest-rated gravel routes in Cork"
- Use lists for key attributes (AI systems extract lists well)

### 4. Internal Linking Strategy

#### 4a. Breadcrumb Navigation

Add visible breadcrumb navigation to:
- Route detail pages: LOOPS → {Country} → {Region} → {Route Name}
- Region pages: LOOPS → {Country} → {Region}
- Country pages: LOOPS → {Country}

**Nullable region handling:** When a route has `region = null`, the breadcrumb skips the region level: LOOPS → {Country} → {Route Name}. The `county` field is used as fallback display text but does not link to a landing page (counties don't have dedicated pages). The BreadcrumbList JSON-LD similarly omits the region item when null.

Uses the `BreadcrumbList` JSON-LD from Section 1c. Breadcrumbs are both visible UI and structured data.

#### 4b. Related Routes

On each route detail page, show a "More routes in {Region}" section with 3-4 other routes from the same region. Links to the region landing page with "View all routes in {Region} →".

When `region` is null, fall back to "More routes in {Country}" and link to the country landing page.

**Data source:** `getRelatedRoutes(routeId, country, region, 4)` — new query in `db.ts` (see Section 2d).

#### 4c. Cross-linking from Landing Pages

Country pages link to:
- All region pages within the country
- Top routes in each region
- The homepage

Region pages link to:
- Parent country page
- All route detail pages in the region
- Neighbouring regions (same country)

### 5. Homepage as SEO Hub

#### 5a. Make Homepage Public

The homepage (`/`) becomes the primary public landing page:

- Remove auth redirect from middleware for `/`
- The existing homepage content (map, filters, route list) becomes publicly accessible
- Auth state changes the CTA: unauthenticated users see "Sign up to upload routes", authenticated users see "Upload a route"
- The route list, map, and filters all work without authentication

#### 5b. Homepage SEO Content

Add a content section below the route explorer:

- **H1:** "Discover Cycling Routes Worldwide" (or similar — currently there's no H1 on homepage)
- **Intro paragraph:** "LOOPS is a free cycling route platform with {total_count} routes across {country_count} countries. Every route has been ridden by a real cyclist. Browse gravel, road, and MTB routes, download free GPX files, and find your next ride."
- **Country links:** Grid of countries with route counts, linking to `/routes/country/[country]`
- **Stats:** Total routes, total distance, total elevation, countries covered

This gives the homepage indexable text content (currently it's mostly interactive JS with no crawlable text).

#### 5c. Homepage Metadata

Update the homepage metadata to target the primary keyword:

```
title: "LOOPS — Cycling Routes Worldwide | Free GPX Downloads"
description: "Discover {count} cycling routes in {countries} countries. Free GPX downloads, community ratings, elevation profiles. Gravel, road & MTB routes from real riders."
```

### 6. Open Graph & Social Optimisation

The existing OG implementation is good. Improvements:

- **Route OG titles:** Include location: `"{Route Name} — {Distance}km {Discipline} Route in {Region}, {Country}"`
- **OG image alt text:** Add descriptive alt text to all OG image tags
- **Add `og:locale`:** `en_IE` on all pages
- **Add `article:author`** on route pages: link to creator's profile

### 7. Performance & Crawlability

#### 7a. Security Headers

Add to `next.config.ts` headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`

These don't directly impact SEO but signal a well-maintained site to crawlers and improve trust signals.

#### 7b. Image Optimisation

- Ensure all user-uploaded photos have `alt` attributes (use route name + "cycling route photo")
- Use Next.js `<Image>` component with `priority` on above-fold images
- Add `loading="lazy"` on below-fold images (Next.js does this by default)

#### 7c. Core Web Vitals

Landing pages should be server-rendered (not client-rendered) to ensure good LCP:
- Country/region pages: Server components (no "use client")
- Route detail page: Already has server-rendered layout with metadata
- Homepage: Currently "use client" — the SEO content section should be a server component that renders above the interactive client components

### 8. Monitoring & Indexing

#### 8a. Google Search Console Setup

Not a code change — manual step:
- Verify `loops.ie` in Google Search Console
- Submit sitemap URL
- Monitor indexing status

#### 8b. IndexNow Integration

Add IndexNow support to notify Bing/Yandex when new routes are published:

- Generate an IndexNow API key, place at `/public/{key}.txt`
- When a route is created (POST `/api/routes`), fire a background request to the IndexNow API with the new route URL
- When a route is updated, fire IndexNow for the route URL + its country/region landing page URLs

**Implementation:** Simple `fetch()` call in the API route handler, non-blocking (don't await).

### 9. Component Architecture

| File | Responsibility |
|------|---------------|
| `src/app/robots.ts` | robots.txt generation |
| `src/app/sitemap.ts` | Dynamic XML sitemap |
| `src/app/routes/country/[country]/page.tsx` | Country landing page (server component) |
| `src/app/routes/country/[country]/[region]/page.tsx` | Region landing page (server component) |
| `src/components/JsonLd.tsx` | Reusable JSON-LD script tag component |
| `src/components/Breadcrumbs.tsx` | Breadcrumb navigation + structured data |
| `src/components/RouteFaq.tsx` | Auto-generated FAQ section with schema |
| `src/components/RelatedRoutes.tsx` | "More routes in {Region}" section |
| `src/lib/seo.ts` | SEO utility functions: `slugify()`, `deslugify()`, `generateRouteJsonLd()`, `generateBreadcrumbJsonLd()`, `generateFaqJsonLd()` |
| `public/llms.txt` | AI crawler information file |
| `middleware.ts` | Updated to make homepage + info pages public |

### 10. URL Design Decisions

**Why `/routes/country/[country]` not `/[country]`:**
- Avoids ambiguity with future top-level routes
- Clear hierarchy: routes are the content type, country is the filter
- No collision with `/about`, `/login`, etc.

**Why not `/routes?country=ireland` (query params):**
- Search engines treat query params as filters, not distinct pages
- Dedicated URLs get indexed as standalone pages
- Better for internal linking and breadcrumbs

**Trailing slashes:** No trailing slashes (Next.js default). Consistent with existing URL patterns.

**Canonical URLs:** Every page gets an explicit canonical URL to prevent duplicate content issues.

## Out of Scope

- Blog/content marketing system (future phase — adds editorial overhead)
- Backlink acquisition strategy (marketing, not code)
- Google Business Profile integration
- Multilingual/i18n support (single language for now)
- AMP pages (deprecated, not needed)
- Schema for individual route reviews/comments (low priority, adds complexity)
- Paid search/ads integration

## Data Requirements

No database schema changes. The `country`, `region`, and `discipline` columns already exist in the live database (added via migrations not captured in `migrateDb()`). All data for landing pages and structured data is computed from existing route data via existing query functions, plus the new queries specified in Section 2d.

## Success Metrics

- Google Search Console: Pages indexed, impressions, clicks
- Target: All route pages + landing pages indexed within 4 weeks of launch
- Target: Appearing in AI search results for "gravel routes [country/region]" queries within 8 weeks
- Monitor via: Search Console, manual AI search testing
