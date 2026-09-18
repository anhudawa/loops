# DISCOVERY pillar audit — 2026-06-11

Read-only code audit of the DISCOVERY surface (home, search, browse/collections,
destination pages, route detail). Scope: correctness + empty/broken-state bugs.
Generate/plan flows are covered by a separate browser-QA pass and are excluded here.

Severity key: **P0** = broken (dead end / crash / 404 on a primary path) ·
**P1** = wrong (misleads the rider or shows the wrong thing) · **P2** = polish.

---

## P0 — broken

### P0-1. Accent-mismatch dead links to every accented region (Girona, Málaga, Nice)
**Root cause — `src/lib/seo.ts:7-17` vs `src/lib/db.ts:1149-1150,1219-1221`.**
URLs are built with `slugify()`, which **strips accents** (`normalize("NFD")` +
diacritic removal): `"Cataluña" → "cataluna"`, `"Andalucía" → "andalucia"`,
`"Côte d'Azur" → "cote-dazur"`. But the region pages resolve the slug in SQL with
`LOWER(REPLACE(r.region, ' ', '-'))`, which **keeps accents and apostrophes**:
`"Cataluña" → "cataluña"`, `"Côte d'Azur" → "côte-d'azur"`. The two never match, so
`getRegionStats()` / `getRoutesByRegionSlug()` return null → `notFound()` → **404**.

This is the CEO's "dead links to destination routes" complaint, and it is systemic —
the same broken link is generated in three places:
- `src/app/cycling/[destination]/page.tsx:327` — the "Browse {name} routes" button.
  Dead for **Girona** (`/routes/country/spain/cataluna`), **Málaga**
  (`/routes/country/spain/andalucia`), **Nice** (`/routes/country/france/cote-dazur`).
- `src/app/routes/country/[country]/page.tsx:166` — every "Regions" card links
  `/routes/country/${countrySlug}/${slugify(region.name)}`; the Cataluña / Andalucía /
  Côte d'Azur cards on the country page are all dead.
- `src/app/routes/[id]/page.tsx:372` — the route-detail breadcrumb region link is dead
  on any Girona/Málaga/Nice route page.

(Manifests confirm the stored region strings: `Cataluña`, `Andalucía`, `Côte d'Azur`,
`Toscana`, `Islas Baleares`, `Costa Blanca`, etc. — `scripts/hub-data/*.json`.
Non-accented regions such as Islas Baleares/Costa Blanca/Tenerife happen to work, which
is why Mallorca's route-library button resolves but Girona's does not.)

**Symptom:** rider taps "Browse Girona routes" (a flagship destination) or a region card
and lands on the LOOPS "Route not found" 404.
**Fix (1-3 lines):** make the SQL comparison accent-insensitive so it matches
`slugify()`. Enable `unaccent` and compare
`LOWER(REPLACE(unaccent(r.region),' ','-')) = $2` (and same for `country`, and in
`getCountryStats`/`getRoutesByCountrySlug`). Also strip apostrophes in the SQL side (or,
simpler, add a stored `region_slug` column populated with `slugify()` at import and match
on it). Whichever is chosen, the URL builder and the resolver must use the *same*
normalization.

---

## P1 — wrong

### P1-2. "Near you" silently falls back to a global (foreign) feed → Dublin rider sees Spain
**`src/app/_components/HomeClient.tsx:222-231, 300-303, 356-362` +
`src/lib/db.ts:576-582`.**
Location comes only from `navigator.geolocation`. If the rider denies permission, is on
a context where geolocation never resolves, or just hasn't answered the prompt yet,
`userLocation` stays null and the feed is fetched with no lat/lng. With no location,
`getRoutes` orders by `avg_rating DESC` across the **entire** table (db.ts:580-581).
The library is dominated by Spanish destinations (Girona/Mallorca each carry 8+ routes,
Dublin/Wicklow far fewer), so a Dublin user is shown Girona/Mallorca — exactly the
"Girona collections on sign-in" complaint. The heading even says "Top rated" with no
honest hint unless `locationDenied` flipped.
Compounding it: `FeaturedCollections` (`_components/FeaturedCollections.tsx:23-31`) always
renders the `featured` collections regardless of locale — those are the foreign packs.
**Symptom:** a rider in Ireland signs in and the "where should I ride today" feed leads
with Spanish routes/collections.
**Fix:** when there is no geolocation, bias the default feed to the home country
(`DEFAULT_COUNTRY`) instead of a global rating sort — e.g. pass `country=Ireland` (or
sort Irish routes first) as the no-location default in `fetchRoutes`, and/or label the
collections rail as "Destinations" so it doesn't read as "near you".

### P1-3. Route detail treats server errors (5xx) as "Route not found"
**`src/app/routes/[id]/page.tsx:97-105, 257-273`.**
`fetchRoute` does `const data = await res.json(); setRoute(data);` **without checking
`res.ok`**. The API returns `{ error, code }` with a non-2xx status on both 404
(db.ts route missing) and 5xx (`handleApiError`). On any error response, `route` is set
to that error object; since it is truthy but has no `.coordinates`, the render path
hits `if (!route || !route.coordinates)` and shows the **"Route not found — this loop
doesn't exist"** screen. A transient DB/API outage is therefore reported to the rider as
"this route doesn't exist," and the built-in `fetchError` "Try again" state (lines
226-241) is never reached.
**Fix:** `if (!res.ok) { setFetchError(true); return; }` before `res.json()`, and only
`setRoute` on a real payload (guard that `data.coordinates`/`data.id` exists).

### P1-4. Destination collection buttons 404 unless the collection was seeded
**`src/app/cycling/[destination]/page.tsx:354-355`.**
The "View {name} routes" collection button renders whenever `dest.collectionSlug` is set
(Girona, Mallorca, Calpe) and links `/collections/${slug}`. `getCollectionBySlug`
returns null → `notFound()` if no matching row. The slugs match the seed scripts
(`scripts/seed-{girona,mallorca,calpe}-collection.mjs` all use `girona`/`mallorca`/
`calpe`), so this is an **operational** dead-link: if those seeds were not run against
the launch DB, all three buttons 404. Verify the three collections exist in prod;
otherwise gate the button on real data or remove the slug.

---

## P2 — polish

### P2-5. Feed "thumbnail" is the full 1200×630 social card, cropped
**`src/components/RouteCard.tsx:74.`** The card cover image is `/api/og/${route.id}` —
the OpenGraph social card with the route name, star rating, distance and surface **baked
into the pixels** (`src/app/api/og/[id]/route.tsx`). It is then dropped into a
`aspect-[3/1]`/`aspect-[21/9]` strip with `object-cover`, so the baked-in text is cropped
mid-word and the route-shape sits off to one side. It also renders 6+ Satori images per
feed page. The old "broken map thumbnails" timeout is mitigated (MAX_PTS=150,
og/[id]:74), but this is not a map thumbnail and reads oddly.
**Fix:** render a lightweight route-shape/static-map thumbnail endpoint for cards, or a
dedicated crop, instead of reusing the text-heavy OG card.

### P2-6. Route-detail coordinate guard checks the array but not its elements
**`src/app/routes/[id]/page.tsx:277-286.`** The `JSON.parse` is wrapped in try/catch and
`Array.isArray(parsed)` is checked (good), but the elements are assumed to be
`[lat,lng,ele]` tuples. If a row stored a valid-JSON-but-wrong-shape `coordinates`
(e.g. `[1,2,3]`), `c[0]/c[1]` yield scalars/undefined and flow into `MapView`,
`ElevationProfile`, and `detectClimbs` as `[undefined, undefined]`. Low risk (data is
import-controlled) but not defended.
**Fix:** filter to `Array.isArray(c) && typeof c[0] === "number" && typeof c[1] ===
"number"` when building `rawCoords`.

### P2-7. Home feed flashes the global list before "near you" resolves
**`src/app/_components/HomeClient.tsx:222-231, 318-322.`** The first `fetchRoutes` fires
immediately with no location; when geolocation resolves, `userLocation` changes and the
effect refetches. The rider sees a global/top-rated feed for a beat, then it swaps to the
near-you ordering (layout shift + a flash of the wrong content).
**Fix:** hold the first fetch briefly for the geolocation callback (or show the skeleton
until either location resolves or a short timeout elapses) before the initial query.

---

## Checked and OK (no action)
- `src/components/RouteCard.tsx` image `onError` fallback (LOOPS placeholder) works;
  rating hidden when `avg_score` is 0/undefined, so `SOCIAL_FEATURES_ENABLED=false` is
  consistent (feed ratings come from the API aggregate, not the gated widgets).
- `normalizeRoute` (HomeClient.tsx:46-58) correctly maps `avg_rating`→`avg_score` and
  `haversine_distance`→`distance_km_away`; distances/elevation are NOT NULL columns so no
  null-format crash on cards.
- Collections index + `[slug]` pages fail soft on DB outage (honest degraded copy, not a
  crash) and `notFound()` only on a genuine missing slug.
- Country/region listing pages fail soft at build (`generateStaticParams` try/catch →
  `[]`) and at runtime (`RoutesUnavailable`); `notFound()` only when stats are truly empty.
- Route-detail elevation/quality/coordinates all degrade silently when null/absent
  (guarded `JSON.parse`, quality block only renders when the score arrives).
- Route-detail "view route"/related-route links use real DB ids → always valid.

---

## Counts
- **P0: 1** (accent-mismatch dead links — 3 call sites)
- **P1: 3**
- **P2: 3**

## Top 3
1. **P0-1** — accent-stripping `slugify()` vs accent-preserving SQL makes every
   Girona / Málaga / Nice region + destination-route link a 404 (the CEO's dead-link bug).
2. **P1-2** — "near you" falls back to a global, Spain-heavy feed whenever geolocation is
   absent → Dublin riders shown Girona/Mallorca on sign-in.
3. **P1-3** — route detail renders server (5xx) errors as "Route not found," hiding real
   outages behind a "this loop doesn't exist" screen.
