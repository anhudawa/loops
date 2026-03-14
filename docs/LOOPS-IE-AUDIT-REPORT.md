# LOOPS.IE — Site Audit Report

**Date:** 14 March 2026
**URL:** https://www.loops.ie
**Auditor:** Automated (Playwright + manual inspection)
**Playwright test suite:** `loops-ie-tests.spec.ts` (included alongside this report)

---

## Executive Summary

The loops.ie landing page has been redesigned with a strong visual identity and clear value proposition. However, **four critical bugs** are blocking conversion and SEO, and several high-priority issues affect accessibility and legal compliance. The most urgent problem is that every image on the landing page is broken — the OG image API returns HTTP 200 but renders nothing visible, and a React re-render loop is firing 5+ network requests per image.

---

## CRITICAL — Fix Immediately

### 1. All images on the landing page are broken

**Impact:** First impression is destroyed. Every visitor sees broken image placeholders instead of route previews.

**Details:** Four images load via `/api/og/{uuid}` — the hero app preview and three Popular Routes cards. The endpoint returns HTTP 200 with correct headers, but the rendered `<img>` elements have `naturalWidth === 0`. The server is responding but generating empty or corrupt image data.

**Steps to fix:**

1. Open `/api/og/[id]/route.tsx` (or equivalent OG image handler)
2. Test the endpoint directly in a browser — visit `https://www.loops.ie/api/og/6565324e-8187-4cbd-ad69-f612cdd01d90` and inspect the response body
3. Check if the image generation library (likely `@vercel/og` or `satori`) is failing silently — add `try/catch` with error logging
4. Verify font files and any remote assets referenced in the OG template are accessible in production
5. Check if the issue is specific to Vercel's Edge runtime — test locally with `vercel dev`
6. Add a fallback static image for when generation fails

**Playwright test:** `BUG-CRITICAL: app preview image loads (not broken)` and `BUG-CRITICAL: Popular Routes card images load`

---

### 2. React re-render loop causing excessive image requests

**Impact:** Performance degradation. Each of the 4 images is fetched 5+ times (21 total requests observed for 4 unique URLs), wasting bandwidth and hammering the OG endpoint.

**Details:** A component re-renders in a loop, causing `<img src="/api/og/...">` elements to re-trigger fetch on every render cycle. This is consistent with an unstable dependency in a `useEffect` or a state update inside a render path that triggers re-render.

**Steps to fix:**

1. Open the component rendering the Popular Routes section (likely in a landing page or login page component)
2. Check for `useEffect` hooks with missing or unstable dependency arrays
3. Look for state updates that trigger on image load events, creating a render → load → state update → render cycle
4. Memoize the image URLs using `useMemo` or move them to a constant outside the component
5. Consider using `React.memo` on the route card component
6. Add `loading="lazy"` to images below the fold

**Playwright test:** `BUG: /api/og/ images cause excessive network requests (re-render loop)`

---

### 3. Massive empty space in the page layout

**Impact:** Users must scroll through a large blank void between sections. It looks broken and unprofessional — many visitors will assume the page failed to load and leave.

**Details:** The page height is approximately 8–10x the viewport height, far more than the content warrants. A large empty gap exists between the stats counters section and the app preview/features section.

**Steps to fix:**

1. Inspect the section between the animated counters and the app preview image in Chrome DevTools
2. Look for a container with excessive `height`, `min-height`, or `padding`/`margin`
3. Check if a hidden or empty element (e.g. a map container or placeholder div from the old design) is still in the DOM taking up space
4. Check for CSS `flex-grow` or `grid` rules that allocate space to a now-empty area
5. Remove or collapse the offending element and verify the page flows naturally

**Playwright test:** `BUG-CRITICAL: no massive empty space between stats and app preview`

---

### 4. Privacy policy page redirects to login

**Impact:** **Legal compliance risk.** GDPR and most privacy laws require the privacy policy to be publicly accessible. Google OAuth may also require it for app verification.

**Details:** Navigating to `/privacy` redirects to `/login`. The footer contains a Privacy link, but clicking it also lands on the login page.

**Steps to fix:**

1. In your Next.js middleware or route guard, add `/privacy` to the public routes whitelist
2. Ensure the privacy page component exists at `app/privacy/page.tsx` (or equivalent)
3. Test that unauthenticated visitors can view the full policy
4. Also whitelist `/terms` if you have one

**Playwright test:** `BUG: Privacy link redirects to login instead of showing privacy policy` and `BUG: /privacy redirects to /login`

---

## HIGH PRIORITY — Fix This Week

### 5. All routes are auth-gated (kills SEO and social sharing)

**Impact:** Google cannot index any route pages. When someone shares a LOOPS route link on social media, the recipient gets redirected to login instead of seeing the route. This eliminates organic discoverability.

**Details:** `/routes/{uuid}` and `/explore` both redirect unauthenticated users to `/login`. For a route-discovery platform, individual route pages should be the primary organic traffic driver.

**Steps to fix:**

1. Make `/routes/[id]` a public route (remove from auth middleware)
2. Show the route details (map, name, distance, description) to unauthenticated users
3. Gate the GPX download and interactive features behind auth — show a "Sign in to download" CTA
4. Make `/explore` public as well, or at minimum show a limited preview with a sign-up prompt
5. Ensure the OG meta tags on route pages use the `/api/og/{id}` images (once those are fixed)

**Playwright test:** `BUG: /routes/{uuid} redirects to /login (should be public)` and `BUG: individual route pages not accessible to search engines`

---

### 6. Route card images have no alt text

**Impact:** Screen readers cannot describe the images. Fails WCAG 2.1 Level A (Success Criterion 1.1.1). Also hurts image SEO — Google Image Search cannot index them.

**Details:** The three Popular Routes card images rendered via `<img src="/api/og/...">` have empty or missing `alt` attributes.

**Steps to fix:**

1. Pass the route name to the image component as alt text: `alt="Preview of {route.name} cycling route"`
2. For the hero app preview image, use a descriptive alt like: `alt="LOOPS app showing the Traka 360 route"`

**Playwright test:** `BUG: Popular Route card images have no alt text` and `BUG: route card images have no alt text`

---

### 7. Low contrast text in "How it works" and comparison sections

**Impact:** Text is difficult to read for users with any visual impairment, and strains the eyes for everyone. Fails WCAG 2.1 AA contrast ratio requirement of 4.5:1.

**Details:** The step descriptions in the "How it works" section and the strikethrough comparison text in "Tired of the paywall?" have very low contrast against the dark background. During manual inspection the text was nearly invisible.

**Steps to fix:**

1. Use a contrast checker tool (e.g. WebAIM Contrast Checker) to verify all text meets 4.5:1 ratio against its background
2. Increase text brightness — use `text-gray-300` or lighter instead of `text-gray-500`/`text-gray-600` on dark backgrounds
3. For strikethrough text, ensure the base color is still readable even with the line through it

**Playwright test:** `BUG: color contrast on "How it works" section text`

---

## MEDIUM PRIORITY — Fix Before Next Release

### 8. Missing canonical URL

**Details:** No `<link rel="canonical">` tag found on the landing page. This can cause duplicate content issues if the page is accessible via both `loops.ie` and `www.loops.ie`.

**Steps to fix:**

1. Add `<link rel="canonical" href="https://www.loops.ie/login" />` to the landing page head
2. For route pages, use `https://www.loops.ie/routes/{id}` as the canonical
3. In Next.js, use the `metadata` export or `<Head>` component

**Playwright test:** `canonical URL is set`

---

### 9. Open Graph meta tags incomplete

**Details:** The `og:title` may be present but `og:description` and `og:image` need verification. When sharing on social media, incomplete OG tags result in a generic preview with no image or description.

**Steps to fix:**

1. Verify all OG tags are present: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`
2. Add `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` for Twitter/X previews
3. Test with the Facebook Sharing Debugger and Twitter Card Validator

**Playwright test:** `Open Graph meta tags present`

---

## LOW PRIORITY — Polish

### 10. Stats counter animation may show "0"

**Details:** The animated counters (ROUTES, RIDERS, COMMENTS, RATINGS) may briefly show 0 on slow connections before animating to their final values. Consider initializing with the target values or adding a skeleton/shimmer state.

### 11. Missing robots.txt and sitemap.xml

**Details:** Verify that `https://www.loops.ie/robots.txt` exists and allows crawling, and that `https://www.loops.ie/sitemap.xml` lists all public routes for search engine indexing.

### 12. Domain redirect confirmation

**Details:** Verify that `loops.ie` (without www) redirects to `www.loops.ie` consistently, and that HTTP redirects to HTTPS. Both tested in the Playwright suite.

---

## What's Working Well

The redesigned landing page does several things right:

- Strong hero with a clear value proposition ("Routes worth riding")
- "Free forever, no credit card" trust signal is prominent and effective
- Feature cards communicate the three pillars clearly (curated routes, GPX ownership, free)
- "Tired of the paywall?" comparison section is a smart competitive positioning move
- Integration logos (Strava, Komoot, Wahoo, Garmin) build credibility
- "How it works" three-step flow is simple and clear
- Footer is clean with necessary links
- Mobile responsive layout stacks correctly on iPhone viewport
- Google Sign-in CTA is large and tappable on mobile
- Nav bar works well across screen sizes

---

## Running the Tests

The Playwright test suite (`loops-ie-tests.spec.ts`) contains 40 tests covering all sections above. To run it on your machine:

```bash
# Install Playwright (if not already installed)
npm init playwright@latest

# Copy the test file into your tests/ directory
cp loops-ie-tests.spec.ts tests/

# Run all tests
npx playwright test tests/loops-ie-tests.spec.ts

# Run with browser visible for debugging
npx playwright test tests/loops-ie-tests.spec.ts --headed

# Run a specific test by name
npx playwright test -g "BUG-CRITICAL"
```

Tests prefixed with `BUG-CRITICAL:` and `BUG:` are expected to fail — they document the current bugs. As you fix each issue, the corresponding test should start passing.

---

## Feeding This to Claude Code

Copy the test file into your project and tell Claude Code:

> "Run `npx playwright test tests/loops-ie-tests.spec.ts` and fix every failing test. Start with tests marked BUG-CRITICAL, then BUG, then any other failures. After each fix, re-run the tests to confirm the fix and check for regressions."

This gives Claude Code a concrete, verifiable checklist where each bug has an automated test that will pass once the fix is correct.
