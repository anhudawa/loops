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
```

## Database Schema (Vercel Postgres)
12 tables: users, magic_links, follows, routes, route_ratings, route_comments, route_photos, route_conditions, route_downloads, conversations, messages, user_follows

Routes have: name, description, difficulty (easy/moderate/hard/expert), distance_km, elevation_gain_m, surface_type, country, county, discipline (road/gravel/mtb), coordinates (JSON), cover_photo_url, verified flag

## Current State
- 11 commits, built rapidly
- Routes manually seeded by admin (no user-submitted routes yet)
- Core features working: route discovery, filtering, maps, elevation profiles, comments, ratings, condition reports, photo galleries, ride sharing via WhatsApp, messaging, favorites, user profiles
- Discipline filtering exists (road/gravel/mtb) but single-category per route
- Countries hardcoded to Ireland/UK/USA/Spain
- Map center hardcoded to Ireland

---

## Launch Plan (Approach A: Launch-First)

### Phase 1: Technical Audit & Critical Fixes (DO FIRST)

**Must Fix (blocking launch):**
1. Error handling - API routes return generic errors, no React error boundaries. Users see white screen on failure.
2. Input validation - GPX uploads have no file size limits or schema validation. Malformed files could crash server.
3. Rate limiting - No protection on API endpoints. Comments/conditions can be spammed.
4. Pagination - Comments, conditions, route lists not paginated. Breaks with real data.

**Should Fix:**
5. Console.log cleanup - Debug logging left in FilterSidebar.tsx
6. Hardcoded values - Countries array, map center coordinates, message polling interval (30s), input limits
7. Optimistic UI updates - Comments/favorites require page refresh to reflect changes
8. Error boundaries - Add React error boundary components for graceful failure

**Can Wait (post-launch):**
- Real-time features (WebSockets for messages instead of 30s polling)
- Performance (caching, fix N+1 queries in comment/photo fetches)
- Comprehensive test suite
- Dark mode toggle (currently forced dark)

### Phase 2: Launch Polish
- Polish existing flows (login, route browsing, route detail)
- Mobile UX pass
- Verify all auth flows work end-to-end (Google OAuth, magic links)
- Admin tools for managing routes/users

### Phase 3: Post-Launch Feature Roadmap (based on user feedback)
- User-submitted routes via GPX upload (flow exists but needs polish)
- Multi-discipline tagging (route can be both road and gravel)
- Ride coordination (group rides, meeting points)
- Strava integration
- Performance & caching

---

## Known Technical Debt
- No CSRF tokens visible
- Session management is cookie-only, no refresh token mechanism
- No file type validation beyond extension (should check MIME type)
- Some N+1 query patterns (comment/photo fetches)
- No database indexes documented for filtered queries (county, difficulty + distance)
- Locale hardcoded to "en-IE"
- Wind overlay arrows may not render on complex polylines

## Conventions
- App Router (not Pages Router)
- Server components by default, "use client" only when needed
- API routes in src/app/api/
- Database queries in src/lib/db.ts
- All components in src/components/ (flat structure)
