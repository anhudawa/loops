# LOOPS - Cycling Route Discovery Platform

## What This Is
A Next.js web app for discovering cycling routes (road, gravel, MTB). Pre-launch, targeting friends & cycling club first, then expanding. Login-gated for lead gen.

**Live at**: https://www.loops.ie/
**Repo**: https://github.com/anhudawa/loops

## Tech Stack
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4
- Vercel Postgres (database)
- Vercel Blob (file storage)
- Leaflet + React-Leaflet (maps)
- Capacitor (mobile app bridge)
- Resend (email)
- Auth: Google OAuth + Magic Links
- Strava (data import only, not auth)

## Project Structure
```
src/
  app/           # Next.js App Router pages & API routes
    admin/       # Admin dashboard
    api/         # API routes (auth, routes, messages, profile, stats, push, strava)
    login/       # Login page (landing)
    messages/    # User messaging
    profile/     # User profile redirect (→ /profile/[id] or /login)
    routes/[id]/ # Route detail pages
    upload/      # Route upload (GPX, FIT, TCX, RideWithGPS URL, Strava import)
  components/    # React components
    Footer.tsx         # Site-wide footer
    SkeletonCard.tsx   # Loading skeleton for route cards
    FilterSidebar.tsx  # Discipline/country/distance filters with mobile drawer
    RouteCard.tsx      # Route card display
    MapView.tsx        # Leaflet map with route markers
    HeroSection.tsx    # Landing hero with CTAs
    StravaConnectButton.tsx # Strava connect/disconnect button
    StravaActivityBrowser.tsx # Strava activity browser with import
    + 10 more components
  lib/           # Utilities
    db.ts              # All database queries (single source of truth)
    gpx.ts             # GPX file parsing
    fit.ts             # FIT file parsing
    tcx.ts             # TCX file parsing
    ridewithgps.ts     # RideWithGPS URL import
    route-parser.ts    # Unified route file parser (dispatches to gpx/fit/tcx)
    strava-api.ts      # Strava OAuth & API client (token refresh, activity fetching)
    geo-utils.ts       # Geospatial utilities
    email.ts           # Resend email
    admin.ts           # Admin functions
    capacitor.ts       # Mobile bridge
middleware.ts    # Auth middleware - session cookie check
tests/           # Playwright test suite
```

## Database Schema (Vercel Postgres)
12 tables: users, magic_links, follows, routes, route_ratings, route_comments, route_photos, route_conditions, route_downloads, conversations, messages, user_follows

Routes have: name, description, distance_km, elevation_gain_m, surface_type, country, county, discipline (road/gravel/mtb), coordinates (JSON), cover_photo_url, verified flag, strava_activity_id (optional, for Strava imports)

## Current State (dev branch)
- All 18 items from site audit fixed (commit c41112a)
- Discipline filters working (15 road, 4 gravel routes)
- Mobile layout working (filter drawer, responsive stacking, full-width map)
- Nav auth state correct (Sign in vs Sign out)
- Profile redirect working (/profile → /profile/[id] or /login)
- Footer, skeleton loading cards, accessibility labels added
- Upload expanded: GPX, FIT, TCX files + RideWithGPS URL + Strava activity import
- Consistent branding and titles across pages
- Canonical URLs and SEO meta tags

---

## Launch Plan

Full design spec: `docs/superpowers/specs/2026-03-13-loops-launch-plan-design.md`

### Completed (Phase 1 & 2)
All critical bugs and high-priority UX fixes from the site audit are done on `dev`.

### Phase 3: Technical Hardening (NEXT)

1. **Error handling** — Error boundaries, standardized API errors, try/catch in all handlers
2. **Input validation** — File size limits, GPX/FIT/TCX schema validation, server-side comment/condition validation, MIME type checks
3. **Rate limiting** — Protect API endpoints (auth 5/min, writes 10/min, reads 60/min, uploads 3/min)
4. **Pagination** — Route lists (20/page), comments (10/page), conditions (10/page)
5. **Code cleanup** — Remove console.logs, extract hardcoded values to config/constants.ts
6. **Optimistic UI updates** — Instant feedback on comments/ratings/favorites

### Phase 4: Launch Polish

7. Verify auth flows end-to-end (Google OAuth, magic links)
8. Mobile UX pass (touch targets, map interactions)
9. Admin tools (route management, moderation, stats)

### Phase 5: Post-Launch (based on user feedback)
- User-submitted routes (approval workflow)
- Multi-discipline tagging (route can be road AND gravel)
- Search by name/region
- Ride coordination, activity feed
- Public route pages for SEO, performance, i18n

---

## Test Suite

62-test Playwright suite at `tests/loops-comprehensive.spec.ts`.

```bash
npx playwright test tests/loops-comprehensive.spec.ts --project=chromium
```

## Known Technical Debt
- No CSRF tokens
- Session management is cookie-only, no refresh tokens
- Some N+1 query patterns (comment/photo fetches)
- No database indexes documented for filtered queries
- Locale hardcoded to "en-IE"
- Strava rate limits not tracked globally (100/15min, 1000/day)

## Conventions
- App Router (not Pages Router)
- Server components by default, "use client" only when needed
- API routes in src/app/api/
- Database queries in src/lib/db.ts (single source of truth)
- All components in src/components/ (flat structure)
- Route file parsing through src/lib/route-parser.ts (dispatches to format-specific parsers)
- API responses: `{ data: T } | { error: string, code: string }`
