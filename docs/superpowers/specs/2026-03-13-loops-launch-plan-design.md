# LOOPS Launch Plan — Design Spec

**Date**: 2026-03-13
**Status**: Draft
**Goal**: Get Loops into the hands of friends & cycling club with a polished, reliable experience

## Context

LOOPS is a cycling route discovery platform (road, gravel, MTB) built with Next.js 16, React 19, TypeScript, Vercel Postgres, and Leaflet maps. It's pre-launch with ~11 commits of rapid development. Routes are manually seeded. Login is gated for lead gen.

The approach is **Launch-First**: fix critical issues, polish what exists, ship to friends/club, then build features based on real feedback.

---

## Phase 1: Technical Audit & Critical Fixes

### 1.1 Error Handling (Must Fix)

**Problem**: API routes return generic error responses. No React error boundaries. Users see white screens on failure.

**Fix**:
- Add a root-level React Error Boundary in `layout.tsx` with a user-friendly fallback UI
- Add `error.tsx` files in key route segments (routes, messages, profile) — Next.js App Router convention
- Standardize API error responses: `{ error: string, code: string }` with appropriate HTTP status codes
- Add try/catch to all API route handlers with structured error logging
- Add client-side error handling for fetch calls in components (AuthProvider, Comments, ConditionReports, etc.)

### 1.2 Input Validation (Must Fix)

**Problem**: GPX uploads have no file size limits or schema validation. No server-side validation on comments or condition reports.

**Fix**:
- GPX upload: max file size (10MB), validate XML structure, validate required GPX elements (trk, trkseg, trkpt)
- Comments: server-side trim and length enforcement (2000 chars)
- Condition reports: server-side validation on status enum and note length (500 chars)
- Route creation API: validate all required fields server-side, sanitize text inputs
- Image uploads: validate MIME type, not just file extension

### 1.3 Rate Limiting (Must Fix)

**Problem**: No protection on API endpoints. Comments, conditions, ratings can be spammed.

**Fix**:
- Add basic rate limiting middleware using Vercel's `@vercel/edge` or simple in-memory tracking
- Limits per endpoint category:
  - Auth (login/magic link): 5 requests/minute per IP
  - Write operations (comments, ratings, conditions): 10 requests/minute per user
  - Read operations (route listing, profile): 60 requests/minute per user
  - File uploads: 3 requests/minute per user

### 1.4 Pagination (Must Fix)

**Problem**: Comments, conditions, and route lists not paginated. Will degrade with real data.

**Fix**:
- Route list: paginate with cursor or offset (20 routes per page)
- Comments: paginate (10 per page) with "load more"
- Condition reports: paginate (10 per page) with "load more"
- API endpoints accept `page` and `limit` query params
- Update `db.ts` queries to support LIMIT/OFFSET

### 1.5 Code Cleanup (Should Fix)

- Remove console.log statements from FilterSidebar.tsx and other components
- Extract hardcoded values to config:
  - Countries list → config/constants.ts
  - Map center coordinates → config/constants.ts
  - Message polling interval → config/constants.ts
  - Input character limits → config/constants.ts

### 1.6 Optimistic UI Updates (Should Fix)

- Comments: show new comment immediately, revert on API failure
- Ratings: update star display immediately
- Favorites: toggle immediately on click
- Condition reports: show new report immediately

### 1.7 Error Boundaries (Should Fix)

- Add `error.tsx` to: `/routes/[id]`, `/messages`, `/profile`, `/upload`, `/admin`
- Each should show a friendly message with a retry button
- Root error boundary in `layout.tsx` as final fallback

---

## Phase 2: Launch Polish

### 2.1 Authentication Flows

- Verify Google OAuth end-to-end: login → callback → session → redirect to home
- Verify magic link end-to-end: email input → Resend delivery → link click → session → redirect
- Handle edge cases: expired magic links, duplicate sessions, OAuth errors
- Login page should clearly communicate what LOOPS is before asking for credentials

### 2.2 Route Browsing

- Route list loads with sensible defaults (nearest routes if geolocation available, otherwise newest)
- Filter sidebar works smoothly with no layout shift
- Route cards display: cover photo, name, discipline icon, distance, elevation, rating, difficulty badge
- Map view responsive and performant with many markers
- Empty states for filtered results ("No MTB routes in this area")

### 2.3 Route Detail Page

- GPX download works reliably with correct filename
- Elevation profile renders correctly on all screen sizes
- Comments display with user avatar, name, timestamp
- Star rating interactive and responsive
- Condition reports show status badge (good/fair/poor/closed) with date
- Photo gallery loads efficiently (lazy loading)
- WhatsApp share generates correct deep link with route info

### 2.4 Mobile UX Pass

- All pages usable on phone screens (375px minimum)
- No horizontal scroll on any page
- Touch targets minimum 44x44px
- Map pinch-to-zoom works
- Filter sidebar works as overlay/drawer on mobile
- Bottom navigation or clear nav pattern

### 2.5 Admin Tools

- Add/edit/remove routes via admin dashboard
- Moderate comments (delete inappropriate ones)
- View basic stats: user count, route count, download count, active users
- Ban/unban users if needed

---

## Phase 3: Post-Launch Feature Roadmap

Priority order, driven by user feedback:

### Tier 1 — High Value

**User-Submitted Routes**
- Polish existing GPX upload flow
- Add route review/approval workflow (admin approves before public)
- Allow trusted users to publish directly

**Multi-Discipline Tagging**
- Change discipline from single string to array or junction table
- Update FilterSidebar to support multi-select discipline filtering
- Update RouteCard to show multiple discipline badges

**Search**
- Add text search for route name, region, description
- Search bar in header or above filter sidebar

### Tier 2 — Social & Engagement

**Ride Coordination**
- "Plan a ride" on any route: date, time, meeting point
- Other users can join
- Notification to participants

**Activity Feed**
- Feed of recent activity from followed users
- New routes, ratings, comments, condition reports

**Strava Integration**
- Import routes from Strava
- Show ride count ("X people have ridden this")
- Optional activity sync

### Tier 3 — Growth & Scale

**Public Route Pages (SEO)**
- Route detail pages publicly accessible
- GPX download behind login (lead gen preserved)
- Open Graph meta tags for social sharing (partially exists)

**Performance**
- CDN caching for route data
- Database query optimization (indexes, query planning)
- Image optimization (WebP, responsive sizes)

**Real-Time Messaging**
- Replace 30s polling with WebSockets or Server-Sent Events

**Internationalization**
- Remove hardcoded locale ("en-IE")
- Support multiple languages

### Explicitly Deferred

- Route drawing in browser (GPX upload covers the need)
- Payment/subscriptions (premature)
- App store release (web-first, Capacitor ready when needed)
- AI route recommendations

---

## Success Criteria

**Phase 1 complete when:**
- No white-screen crashes on common user flows
- API endpoints validate input and return structured errors
- Basic rate limiting active
- Route list and comments paginate correctly

**Phase 2 complete when:**
- A new user can: login → browse routes → view route detail → download GPX → leave a comment → rate a route — without friction
- Works well on mobile
- Admin can manage routes and moderate content

**Phase 3 is ongoing** — prioritized by user feedback after launch

---

## Architecture Notes

- Keep App Router patterns (server components by default, "use client" only when needed)
- Database queries stay in `src/lib/db.ts` (single source of truth)
- All components in `src/components/` (flat structure)
- Config/constants extracted to `src/config/constants.ts`
- API responses follow `{ data: T } | { error: string, code: string }` pattern
