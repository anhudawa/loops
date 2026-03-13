# LOOPS - Cycling Route Discovery Platform

## What This Is
A Next.js web app for discovering cycling routes (road, gravel, MTB). Pre-launch, targeting friends & cycling club first, then expanding. Login-gated for lead gen.

**Live at**: https://gravel-ireland.vercel.app/
**Repo**: https://github.com/anhudawa/loops

## Tech Stack
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4
- Vercel Postgres (database)
- Vercel Blob (file storage)
- Leaflet + React-Leaflet (maps)
- Capacitor (mobile app bridge)
- Resend (email)
- Auth: Google OAuth + Magic Links + Strava

## Project Structure
```
src/
  app/           # Next.js App Router pages & API routes
    admin/       # Admin dashboard
    api/         # API routes (auth, routes, messages, profile, stats, push)
    login/       # Login page (landing)
    messages/    # User messaging
    profile/     # User profiles & favorites
    routes/[id]/ # Route detail pages
    upload/      # GPX upload
  components/    # React components (15 files)
  lib/           # Utilities (db.ts, gpx.ts, email.ts, admin.ts, capacitor.ts)
middleware.ts    # Auth middleware - session cookie check
tests/           # Playwright test suite
```

## Database Schema (Vercel Postgres)
12 tables: users, magic_links, follows, routes, route_ratings, route_comments, route_photos, route_conditions, route_downloads, conversations, messages, user_follows

Routes have: name, description, difficulty (easy/moderate/hard/expert), distance_km, elevation_gain_m, surface_type, country, county, discipline (road/gravel/mtb), coordinates (JSON), cover_photo_url, verified flag

## Current State
- Routes manually seeded by admin (no user-submitted routes yet)
- Core features built: route discovery, filtering, maps, elevation profiles, comments, ratings, condition reports, photo galleries, ride sharing via WhatsApp, messaging, favorites, user profiles
- Discipline filtering exists but IS BROKEN (see Phase 1 below)
- Mobile layout IS BROKEN (see Phase 1 below)
- Countries hardcoded to Ireland/UK/USA/Spain
- Map center hardcoded to Ireland

---

## Launch Plan

Full design spec: `docs/superpowers/specs/2026-03-13-loops-launch-plan-design.md`

### Phase 1: Critical User-Facing Bugs (DO FIRST)

1. **Discipline filters broken** — Clicking Road/Gravel/MTB doesn't filter routes. All 19 still show. Debug FilterSidebar.tsx + page.tsx state management.
2. **Mobile layout broken** — At 375px, filter sidebar + map are side-by-side causing horizontal overflow. Need responsive breakpoints, collapsible filter drawer, full-width map.
3. **Nav shows "Sign out" for logged-out users** — Check auth state in nav, conditionally render Sign in vs Sign out.

### Phase 2: High Priority UX Fixes

4. Route-not-found page has no branding/nav — wrap in standard layout
5. /profile returns 404 — create the route with auth redirect
6. Login page has ~2x viewport of empty black space below fold — CSS fix
7. Inconsistent branding/taglines across pages — standardize
8. Duplicate search inputs both always in DOM — hide one properly
9. Route cards show redundant "LOOPS" text — remove or replace with useful content

### Phase 3: Technical Hardening

10. Error handling — error boundaries, standardized API errors, try/catch
11. Input validation — GPX file size/schema, server-side comment/condition validation
12. Rate limiting — protect API endpoints from spam
13. Pagination — route lists, comments, conditions
14. Code cleanup — remove console.logs, extract hardcoded values to config
15. Optimistic UI updates — instant feedback on comments/ratings/favorites

### Phase 4: Launch Polish

16. Verify auth flows end-to-end (Google OAuth, magic links)
17. Accessibility — aria-labels, form labels, map container role
18. Footer, loading states, skeleton cards
19. Mobile UX pass — touch targets, map interactions
20. Admin tools — route management, moderation, stats

### Phase 5: Post-Launch (based on user feedback)
- User-submitted routes (GPX upload polish + approval workflow)
- Multi-discipline tagging (route can be road AND gravel)
- Search by name/region
- Ride coordination, activity feed, Strava integration
- Public route pages for SEO, performance, i18n

---

## Test Suite

62-test Playwright suite at `tests/loops-comprehensive.spec.ts`. Tests prefixed with `BUG:` are expected to fail until fixed.

```bash
npx playwright test tests/loops-comprehensive.spec.ts --project=chromium
```

## Known Technical Debt
- No CSRF tokens visible
- Session management is cookie-only, no refresh token mechanism
- No file type validation beyond extension (should check MIME type)
- Some N+1 query patterns (comment/photo fetches)
- No database indexes documented for filtered queries
- Locale hardcoded to "en-IE"

## Conventions
- App Router (not Pages Router)
- Server components by default, "use client" only when needed
- API routes in src/app/api/
- Database queries in src/lib/db.ts
- All components in src/components/ (flat structure)
- Config/constants should go in src/config/constants.ts
- API responses: `{ data: T } | { error: string, code: string }`
