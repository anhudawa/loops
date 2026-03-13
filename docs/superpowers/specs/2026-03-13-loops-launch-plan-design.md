# LOOPS Launch Plan — Design Spec

**Date**: 2026-03-13
**Status**: Draft
**Goal**: Get Loops into the hands of friends & cycling club with a polished, reliable experience

## Context

LOOPS is a cycling route discovery platform (road, gravel, MTB) built with Next.js 16, React 19, TypeScript, Vercel Postgres, and Leaflet maps. It's pre-launch with ~11 commits of rapid development. Routes are manually seeded. Login is gated for lead gen.

The approach is **Launch-First**: fix critical issues, polish what exists, ship to friends/club, then build features based on real feedback.

A comprehensive Playwright audit (62 tests) was run against the live site. The test suite is at `tests/loops-comprehensive.spec.ts`. Run with:
```bash
npx playwright test tests/loops-comprehensive.spec.ts --project=chromium
```

---

## Phase 1: Critical User-Facing Bugs (DO FIRST)

These are bugs your friends will hit immediately. Fix before anything else.

### 1.1 Discipline Filters Are Broken (CRITICAL)

**Problem**: Clicking "Gravel", "Road", or "MTB" filter buttons does nothing. All 19 routes still display. The "All" button stays visually highlighted even after clicking another filter.

**Steps to reproduce**:
1. Go to homepage, scroll to filter sidebar
2. Click "Gravel" button
3. Observe: still shows "19 LOOPS", road routes still visible

**Fix**: Debug filter state management in `FilterSidebar.tsx` and `page.tsx`:
- Check the onClick handler on discipline buttons
- Verify the filter state is passed to the route list component and triggers re-render
- Verify routes have a `discipline` field that matches the filter values
- Ensure the active filter button gets visual highlighting (green border should move)

### 1.2 Mobile Layout Completely Broken (CRITICAL)

**Problem**: At mobile widths (375px), the filter sidebar and map remain side-by-side instead of stacking. This causes horizontal overflow and makes the site unusable on phones.

**Fix**: Add responsive breakpoints. At `max-width: 768px`:
- Collapse filter sidebar into a toggleable drawer/sheet ("Filters" button opens slide-up panel)
- Make the map full-width
- Stack route cards in single column
- Consider hiding map on mobile, showing via "Map" toggle button

### 1.3 Auth State in Nav Is Wrong (CRITICAL)

**Problem**: The sticky nav shows "Sign out" even for unauthenticated users. Confusing and unprofessional.

**Fix**: Check auth state in the nav component. Conditionally render:
- Logged out: "Sign in" or "Get Started" button
- Logged in: user avatar + "Sign out"

---

## Phase 2: High Priority UX Fixes

### 2.1 Route-Not-Found Page Has No Branding

**Problem**: `/routes/bogus-uuid` shows plain "Route not found" text on black screen. No header, no logo, no nav.

**Fix**: Wrap the not-found state in the standard page layout with LOOPS header/nav. Match the branded 404 page that `/nonexistent-page` uses.

### 2.2 /profile Returns 404

**Problem**: Navigating to `/profile` shows generic 404.

**Fix**: Create `/profile` route that:
- Redirects to `/login` if not authenticated
- Shows user profile if authenticated

### 2.3 Login Page Has Massive Empty Space

**Problem**: Below the fold on `/login` is ~2x viewport height of black emptiness.

**Fix**: Remove excess height. Check for `min-height: 200vh` or similar CSS rule. Page should end after stats counters or have a footer.

### 2.4 Inconsistent Branding

**Problem**:
- Homepage title: "LOOPS - Discover & Share Cycling Routes"
- Login title: "LOOPS — Routes Worth Riding | Free Cycling Route Discovery"
- Homepage hero: "STOP RIDING THE SAME LOOP"
- Login hero: "ROUTES WORTH RIDING"

**Fix**: Pick one tagline, use consistently:
- Homepage: "LOOPS — Routes Worth Riding"
- Login: "Sign In — LOOPS"
- Route detail: "{Route Name} — LOOPS"

### 2.5 Duplicate Search Inputs

**Problem**: Two `<input placeholder="Search routes, regions...">` elements always in DOM (hero + sticky nav).

**Fix**: Ensure only one is visible/focusable at a time. Use `aria-hidden="true"` and `tabindex="-1"` on the hidden one. Both should share the same search state.

### 2.6 Route Card "LOOPS" Text Is Redundant

**Problem**: Every route card displays "LOOPS" as large text in the header. Wastes card real estate with app branding that adds no value.

**Fix**: Remove "LOOPS" text from route cards or replace with a small logo mark. Use the space for route preview image or larger route map.

---

## Phase 3: Technical Hardening

### 3.1 Error Handling

**Problem**: API routes return generic error responses. No React error boundaries. Users see white screens on failure.

**Fix**:
- Add a root-level React Error Boundary in `layout.tsx` with user-friendly fallback UI
- Add `error.tsx` files in key route segments (`/routes/[id]`, `/messages`, `/profile`, `/upload`, `/admin`)
- Standardize API error responses: `{ error: string, code: string }` with appropriate HTTP status codes
- Add try/catch to all API route handlers with structured error logging
- Add client-side error handling for fetch calls in components

### 3.2 Input Validation

**Problem**: GPX uploads have no file size limits or schema validation. No server-side validation on comments or condition reports.

**Fix**:
- GPX upload: max file size (10MB), validate XML structure, validate required GPX elements (trk, trkseg, trkpt)
- Comments: server-side trim and length enforcement (2000 chars)
- Condition reports: server-side validation on status enum and note length (500 chars)
- Route creation API: validate all required fields server-side, sanitize text inputs
- Image uploads: validate MIME type, not just file extension

### 3.3 Rate Limiting

**Problem**: No protection on API endpoints. Comments, conditions, ratings can be spammed.

**Fix**:
- Add basic rate limiting middleware
- Limits: Auth 5/min per IP, writes 10/min per user, reads 60/min per user, uploads 3/min per user

### 3.4 Pagination

**Problem**: Comments, conditions, and route lists not paginated. Will degrade with real data.

**Fix**:
- Route list: 20 per page
- Comments: 10 per page with "load more"
- Condition reports: 10 per page with "load more"
- API endpoints accept `page` and `limit` query params

### 3.5 Code Cleanup

- Remove console.log statements from FilterSidebar.tsx and other components
- Extract hardcoded values to `src/config/constants.ts`:
  - Countries list (currently: Ireland, UK, USA, Spain)
  - Map center coordinates (currently: 53.5°N, 7.5°W)
  - Message polling interval (currently: 30s)
  - Input character limits (comments: 2000, condition notes: 500)

### 3.6 Optimistic UI Updates

- Comments: show immediately, revert on API failure
- Ratings: update star display immediately
- Favorites: toggle immediately on click
- Condition reports: show immediately

---

## Phase 4: Launch Polish

### 4.1 Authentication Flows

- Verify Google OAuth end-to-end: login → callback → session → redirect to home
- Verify magic link end-to-end: email input → Resend delivery → link click → session → redirect
- Handle edge cases: expired magic links, duplicate sessions, OAuth errors

### 4.2 Accessibility

- Add `aria-label="Scroll to routes"` to hero scroll-down button
- Add proper `<label>` elements or `aria-label` to all filter selects/inputs
- Add `role="img" aria-label="Map showing cycling route locations"` to Leaflet map container
- Ensure all app images have alt text (map tiles exempt)

### 4.3 Missing UI Elements

- Add footer: About, Privacy Policy, Terms, Contact, social links
- Add loading states / skeleton cards while routes fetch
- Add tooltip or label to chat icon in nav
- Fix stats counter animation: render small numbers (< 5) instantly, skip animation on return visits

### 4.4 Mobile UX Pass

- All pages usable at 375px minimum
- Touch targets minimum 44x44px
- Map pinch-to-zoom works
- Filter drawer works smoothly on touch

### 4.5 Admin Tools

- Add/edit/remove routes via admin dashboard
- Moderate comments
- View basic stats: user count, route count, download count
- Ban/unban users

---

## Phase 5: Post-Launch Feature Roadmap

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
- Add canonical URLs to all pages

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
- Discipline filters correctly filter routes by road/gravel/MTB
- Site is fully usable on mobile (375px)
- Nav shows correct auth state (Sign in vs Sign out)

**Phase 2 complete when:**
- All pages have consistent branding and no broken states
- /profile works, route-not-found has branding, login page has no empty space

**Phase 3 complete when:**
- No white-screen crashes on common user flows
- API endpoints validate input and return structured errors
- Basic rate limiting active
- Route list and comments paginate correctly

**Phase 4 complete when:**
- A new user can: login → browse routes → view detail → download GPX → comment → rate — without friction
- Accessibility basics covered
- Footer, loading states, and other UI polish in place

**Phase 5 is ongoing** — prioritized by user feedback after launch

---

## Architecture Notes

- Keep App Router patterns (server components by default, "use client" only when needed)
- Database queries stay in `src/lib/db.ts` (single source of truth)
- All components in `src/components/` (flat structure)
- Config/constants extracted to `src/config/constants.ts`
- API responses follow `{ data: T } | { error: string, code: string }` pattern

## Test Suite

A 62-test Playwright suite is at `tests/loops-comprehensive.spec.ts`. Tests prefixed with `BUG:` are expected to fail until the corresponding issues are fixed. Run:
```bash
npx playwright test tests/loops-comprehensive.spec.ts --project=chromium
```
