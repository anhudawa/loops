# LOOPS.IE Audit Bugfix Plan

**Date:** 2026-03-14
**Source:** Public Landing Page Audit + Authenticated Experience Audit + Playwright Test Suite (40 tests)
**Goal:** Fix all bugs found in the March 14 audits. Tests prefixed BUG-CRITICAL and BUG document current failures.

## Test-Driven Approach

The Playwright test suite at `tests/loops-ie-tests.spec.ts` has 40 tests. Run them first to establish baseline, then fix bugs until all tests pass.

```bash
npx playwright test tests/loops-ie-tests.spec.ts --project=chromium
npx playwright test -g "BUG-CRITICAL" # critical bugs only
```

---

## Phase 1: CRITICAL Bugs (Fix Immediately)

### 1.1 All landing page images broken (OG image API)
**Severity:** CRITICAL | **Tests:** `BUG-CRITICAL: app preview image loads`, `BUG-CRITICAL: Popular Routes card images load`

Four images load via `/api/og/{uuid}` — hero app preview and 3 Popular Routes cards. Endpoint returns HTTP 200 but renders empty (naturalWidth === 0).

**Fix:**
- Open `/api/og/[id]/route.tsx` (or equivalent OG image handler)
- Test endpoint directly in browser — inspect response body
- Check if @vercel/og or satori is failing silently — add try/catch with error logging
- Verify font files and remote assets are accessible in production
- Check Edge runtime compatibility — test with `vercel dev`
- Add fallback static image when generation fails

### 1.2 React re-render loop (excessive image requests)
**Severity:** CRITICAL | **Test:** `BUG: /api/og/ images cause excessive network requests`

Each of the 4 images fetched 5+ times (21 total for 4 URLs). Unstable useEffect dependency or state update in render path.

**Fix:**
- Find component rendering Popular Routes section
- Check for useEffect with missing/unstable dependency arrays
- Look for state updates on image load events creating render-load-state cycle
- Memoize image URLs with useMemo or move to constant
- Consider React.memo on route card component
- Add `loading="lazy"` to below-fold images

### 1.3 Massive empty space in layout
**Severity:** CRITICAL | **Test:** `BUG-CRITICAL: no massive empty space`

Huge blank void between stats counters and app preview image. Page height ratio > 7x viewport.

**Fix:**
- Inspect section between animated counters and app preview
- Find container with excessive height/min-height/padding/margin
- Check for hidden/empty element (old map container?) still in DOM
- Remove/collapse offending element

### 1.4 Privacy policy redirects to login
**Severity:** CRITICAL (LEGAL/GDPR) | **Tests:** `BUG: Privacy link redirects to login`, `BUG: /privacy redirects to /login`

Privacy policy MUST be publicly accessible. GDPR requirement. Google OAuth may require it.

**Fix:**
- In `middleware.ts`, add `/privacy` and `/terms` to public routes whitelist
- Verify pages exist at `app/privacy/page.tsx` and `app/terms/page.tsx`
- Test unauthenticated access

### 1.5 New users see 0 routes on first sign-in
**Severity:** CRITICAL (CONVERSION KILLER) | **Auth experience audit #1**

Default sort "Nearby/Best Rated" filters by map viewport. User geolocated outside Ireland/Spain sees empty state. All 19 routes are in Ireland and Cataluna.

**Fix:**
- Change default sort from "Nearby/Default" to "Top Rated"
- OR: fall back to "Top Rated" when 0 routes in viewport
- OR: show world map view initially instead of geolocated view
- Show friendly message when 0 nearby: "No routes near you yet — here are the best routes worldwide"

### 1.6 Stats counter says "19 ROUTES" but only 10 shown
**Severity:** CRITICAL | **Auth experience audit #2**

Sorted by Top Rated, only 10 appear. No "Load more" or pagination.

**Fix:**
- Ensure pagination/"Load more" button works for all sort modes
- Stats counter should reflect total available, not just visible count
- OR: auto-load all routes if total is under 50

### 1.7 Search does not work
**Severity:** CRITICAL | **Auth experience audit #3**

Search bar is non-functional — typing and pressing Enter produces no results, autocomplete, or feedback.

**Fix:**
- Wire up search input to filter routes by name/region/country
- Implement search-as-you-type with debounced API calls
- On submit, filter route list and pan map to matching area
- Show "No results" state when nothing matches

---

## Phase 2: HIGH Priority Bugs (Fix This Week)

### 2.1 Routes are auth-gated (kills SEO & social sharing)
**Severity:** HIGH | **Tests:** `BUG: /routes/{uuid} redirects to /login`, `BUG: individual route pages not accessible to search engines`

Google can't index routes. Shared links redirect to login.

**Fix:**
- Make `/routes/[id]` a public route in `middleware.ts`
- Show route details (map, name, distance, description) to unauthenticated users
- Gate GPX download and interactive features behind auth — show "Sign in to download" CTA
- Optionally make `/explore` public with limited preview + sign-up prompt

### 2.2 Route card images have no alt text
**Severity:** HIGH (WCAG 2.1 Level A) | **Tests:** `BUG: Popular Route card images have no alt text`, `BUG: route card images have no alt text`

3 Popular Routes card images have empty/missing alt attributes. Fails WCAG 1.1.1.

**Fix:**
- Add descriptive alt text to route card images: `alt="{route name} - {distance}km {discipline} route in {region}"`

### 2.3 Low contrast text in "How it works" and comparison sections
**Severity:** HIGH (WCAG AA) | **Test:** `BUG: color contrast on "How it works" section text`

Text nearly invisible against dark background. Must meet 4.5:1 contrast ratio.

**Fix:**
- Increase text brightness in "How it works" step descriptions
- Fix "Tired of the paywall?" strikethrough text contrast
- Verify with contrast checker tool

### 2.4 /explore returns 404
**Severity:** HIGH | **Auth experience audit #4**

Shows "This loop doesn't exist — yet." Explore functionality is on homepage scroll.

**Fix:**
- Create `/explore` route that redirects to `/#explore` (homepage explore section)
- OR: create dedicated explore page
- Fix 404 page copy: change to "Page not found"

### 2.5 "EXPLORE LOOPS" hero button doesn't scroll
**Severity:** HIGH | **Auth experience audit #5**

Primary CTA on authenticated homepage does nothing on click.

**Fix:**
- Add smooth scroll to explore section: `document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' })`
- Add `id="explore"` to the explore section container

### 2.6 Import URL helper text inconsistency
**Severity:** HIGH | **Auth experience audit #6**

Placeholder says Strava URL, helper text says RideWithGPS. Confusing.

**Fix:**
- Align placeholder and helper text to match actual supported services
- If both are supported: "Paste a Strava activity or RideWithGPS route URL"

### 2.7 Map tile loading failures
**Severity:** HIGH | **Auth experience audit #7**

Grey squares where tiles fail to load.

**Fix:**
- Add tile loading error handler with retry logic
- Use `tileloadeerror` event on Leaflet tile layer
- Consider fallback tile server

---

## Phase 3: MEDIUM Priority (Before Next Release)

### 3.1 Missing canonical URL
**Severity:** MEDIUM | **Test:** `canonical URL is set`

No `<link rel="canonical">` on landing page. Duplicate content between loops.ie and www.loops.ie.

**Fix:**
- Add canonical URL in page metadata: `<link rel="canonical" href="https://www.loops.ie/">`

### 3.2 Open Graph meta tags incomplete
**Severity:** MEDIUM | **Test:** `Open Graph meta tags present`

og:description and og:image need verification.

**Fix:**
- Ensure og:title, og:description, og:image, og:url are all set in layout.tsx or page metadata
- Test with social media debugger tools

### 3.3 No user profile page or settings
**Severity:** MEDIUM | **Auth experience audit #8**

Nav shows avatar + Sign out but no profile page. Users can't view uploads, ratings, or manage account.

**Fix:**
- Create basic `/profile` page showing user's uploads, ratings, and account info
- This is also where the zone 2 average speed setting will live (from filter redesign spec)

### 3.4 Back navigation loses filter state
**Severity:** MEDIUM | **Auth experience audit #9**

Route detail back button navigates to homepage top, losing filter/sort/scroll position.

**Fix:**
- Persist filter state in URL query params (already planned in filter redesign)
- Use `router.back()` instead of navigating to `/`
- OR: store scroll position in sessionStorage

---

## Execution Strategy

**For the coding window, copy this prompt:**

```
Read docs/superpowers/specs/2026-03-14-audit-bugfix-plan.md — this is the approved bugfix plan from two Playwright audit reports.

Step 1: Copy the test file from /Users/anthonywalsh/Downloads/loops-ie-tests.spec.ts to tests/loops-ie-tests.spec.ts

Step 2: Run the Playwright tests to establish baseline:
npx playwright test tests/loops-ie-tests.spec.ts --project=chromium

Step 3: Fix bugs in this order — Phase 1 (CRITICAL) first, then Phase 2 (HIGH), then Phase 3 (MEDIUM). After each fix, re-run the affected tests to confirm and check for regressions.

Start with BUG-CRITICAL tests, then BUG tests, then any remaining failures.
```
