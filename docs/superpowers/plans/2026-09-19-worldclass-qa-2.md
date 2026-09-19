# LOOPS — World-Class QA, Pass 2

**Date:** 2026-09-19
**Tester:** QA lead (second pass, Strava/Komoot benchmark)
**Build:** production server at http://localhost:3220 (real data), logged-in via QA session cookie
**Viewports:** 375×812 (mobile), 768×1024 (tablet), 1440×900 (desktop)
**Method:** Chromium + Playwright. Console errors, horizontal overflow, tap targets, load/empty/hydration
states, visual consistency. Screenshots in `/home/user/loops/qa3/`.
**Excluded (sandbox artifacts, per brief):** OSM tile failures / grey map canvases, ui-avatars/dicebear
avatar failures, intermittent proxy 429s on avatar/tile retries, Dublin-slow / gravel-fail generation.

---

## Confirmed fixed from pass 1

- **Dead collection links** — `/collections` cards link correctly; `/collections/girona` (and calpe,
  dublin, mallorca) load. Fixed.
- **Route-card thumbnails** — cards use server-rendered `/api/thumb/<id>` images (naturalWidth 640,
  on-brand green route line on dark map). They lazy-load correctly on scroll. Fixed. (Caveat: a full-page
  render before scrolling shows below-fold cards blank until the IntersectionObserver fires — acceptable,
  matches Strava, but see P2-note.)
- **Duplicate footers** — single consistent footer on every page checked (Collections / Switch from
  Komoot / Pricing / About / Privacy / Terms / Feedback + © 2026). Fixed.
- **Region-rail labels** — home filter rail (`All Countries` / `All Cities` / sort) and the country grid
  (Ireland, Italy, Spain, …) are labelled. Fixed.
- **Tap targets** — footer links now `min-h-[40px]`; most controls ≥40px. A few stragglers remain (see P2).
- **Hidden social on public surfaces** — home feed and route detail show no follow/persona/photo UI.
  **Partially regressed on the profile page — see P1-6.**

---

## P0 — Broken / launch-blocking

### P0-1 — Route Quality reads **0/100 on every route detail page** (all factors 0%)
- **Page:** `/routes/<id>` — all viewports. **Screenshot:** `qa3/b1-route-detail-desktop.png`
- **Repro:** Open any route detail page. The "ROUTE QUALITY" module shows **`0/100`** with
  `Quiet & safe roads 0% · Surface 0% · Scenery 0%`. Verified across 6 routes (Alcalali Loop, Rocacorba,
  Skerries via the Lanes, The Traka 100, Karoo-Drift, Sant Hilari) — **100% show 0/100**, including routes
  badged **VERIFIED**.
- **Proof it is a data/render bug, not a network limit:** in the *same* environment, `/generate`
  ("60km road loop from Girona flat") produced candidates with **real** scores — `EXCELLENT · 81`,
  `EXCELLENT · 77` and populated factor bars (Quiet 71%, Surface 84%, Scenery 100%). So scoring works;
  the stored-route detail page is reading null/0 and rendering it as a damning `0/100`.
  **Screenshot:** `qa3/gen-girona.png`.
- **Observed:** Every route advertises itself as 0/100 quality — directly contradicts the VERIFIED badge
  and the "quality-scored loops" pillar.
- **World-class expected:** Show the real stored score; if a route is genuinely unscored, render
  "Not yet scored" / hide the module — never a blanket `0/100`. This is the flagship differentiator and it
  is currently self-sabotaging on 100% of routes.

### P0-2 — Home page shows the **logged-out header + marketing state to authenticated users** (~60% of loads)
- **Page:** `/` — all viewports. **Screenshots:** `qa3/b1-profile-desktop.png` (the marketing hero that
  `/` also renders), header raw output in run logs.
- **Repro:** With the valid session cookie, load `/` repeatedly. In **3 of 5 loads** the header rendered
  `LOOPS PLAN DRAW ROUTES DESTINATIONS Log in Sign up` (logged-out) and the marketing hero
  ("Where should I ride today? / TIRED OF THE PAYWALL / GET STARTED WITH GOOGLE"); in 2 of 5 it correctly
  showed `Upload route · Sign out`. Same cookie, same URL — nondeterministic.
- **Observed:** An authenticated user frequently lands on the home page and is told to "Log in / Sign up",
  as though signed out. Looks like the page (or its RSC payload) is served from a cache that doesn't vary
  on session and only sometimes revalidates.
- **World-class expected:** The primary page of a login-gated product must deterministically reflect auth
  on first paint. Strava/Komoot never flip a signed-in user back to the marketing wall.

---

## P1 — Clearly below consumer standard

### P1-1 — Collection cards have **no cover imagery**
- **Page:** `/collections` — all viewports. **Screenshot:** `qa3/b1-collections-desktop.png`
- **Repro:** All four collections (Girona, Dublin & Wicklow, Calpe & Costa Blanca, Mallorca) render a
  generic grey folded-map SVG placeholder instead of a cover photo/route-montage.
- **Expected:** Komoot/Strava collection cards lead with rich destination imagery. As-is the page reads as
  unfinished/empty.

### P1-2 — Collection cards show **"routes" with no count number**
- **Page:** `/collections` — all viewports. **Screenshot:** `qa3/b1-collections-desktop.png`
- **Repro:** Each card's meta line reads `routes · Girona, Catalonia, Spain` — the numeric count in front
  of "routes" is missing (broken binding; should be e.g. "12 routes").
- **Expected:** "N routes · Location". A bare "routes" label looks like a data bug (it is).

### P1-3 — Profile page: **~5s skeleton, no SSR**
- **Page:** `/profile` → redirects to `/profile/<id>` — all viewports.
  **Screenshots:** `qa3/profile-real.png` (skeleton), `qa3/profile-final.png` (loaded).
- **Repro:** Navigate to own profile. For ~5 seconds only skeleton blocks + the footer render (at t=3s
  still skeleton, content appears between t=3s and t=6s). Content is fetched client-side.
- **Expected:** Your own profile should render instantly (SSR/streamed). A 5-second skeleton on your own
  page reads as broken. Also `/profile` (bare) briefly flashes the logged-out marketing home during the
  redirect (`qa3/b1-profile-desktop.png`).

### P1-4 — Profile **resurfaces social + persona** that are out of launch scope
- **Page:** `/profile/<id>` — all viewports. **Screenshot:** `qa3/profile-final.png`
- **Repro:** Profile shows `0 FOLLOWERS`, `0 FOLLOWING` stat boxes and a persona/level badge
  `🧭 0 · Explorer`. Pass 1 hid social/persona on public surfaces; the profile still exposes them.
- **Expected:** Consistent with `SOCIAL_FEATURES_ENABLED=false` — hide followers/following/persona for
  launch, or the profile contradicts the rest of the app.

### P1-5 — Hydration mismatch console error on collection detail
- **Page:** `/collections/girona` — desktop (1440). **Screenshot:** `qa3/b1-collections-girona-desktop.png`
- **Repro:** Console/pageerror: `Minified React error #418` (text content did not match server-rendered
  HTML). Causes a client re-render/flash.
- **Expected:** Zero hydration warnings; SSR and client markup must match.

### P1-6 — Auth-state **flash to logged-out** on heavy client pages
- **Pages:** `/plan`, `/profile` — all viewports. **Screenshot:** `qa3/b1-plan-desktop.png` (header shows
  `Log in / Sign up` mid-load).
- **Repro:** On map-heavy pages the header paints `Log in / Sign up` for ~2–3s, then hydrates to
  `Sign out`. Same root family as P0-2. Verified `/plan` settles correctly to `Sign out`.
- **Expected:** No auth flicker. Server-render the authenticated header.

### P1-7 — Generate decline suggests **Irish landmarks for a Spanish query**
- **Page:** `/generate` (a.k.a. Plan a ride). **Screenshot:** `qa3/gen-calpe.png`
- **Repro:** "2 hour hilly ride from Calpe" (a brief-listed known-good prompt) returned the decline card
  "No valid routes could be generated…" (API 422). The card's suggestions are hardcoded Irish:
  *"Name a town or landmark — e.g. 'from Blessington' or 'near Dalkey'."* — irrelevant to a Calpe/Spain
  request. (The decline copy/honesty framing is otherwise excellent.) The 422 itself may be BRouter
  public-demo rate-limiting, but the mismatched suggestions are a definite copy bug.
- **Expected:** Locale-aware suggestions (name landmarks near the query), or generic phrasing.

---

## P2 — Polish

- **P2-1 — Double clear (×) in search field.** `/` search input renders **two** clear icons — the native
  `type="search"` clear plus a custom grey ×. **Screenshot:** `qa3/search-empty.png`. Use one.
- **P2-2 — Leaflet controls unstyled.** Zoom `+ / −` buttons are default white squares (30×30px) on the
  dark app — off-brand and below the 40px tap target. `/plan`, `/routes/<id>`. Restyle to the dark system.
- **P2-3 — Footer "Terms" link is 39px wide** (just under the 40px target) on every page. Nudge padding.
- **P2-4 — Destination guides are text-only** (no hero imagery). `/cycling/girona`, `/cycling/mallorca`.
  Content is genuinely strong (best-time, climbs, practical info, FAQ, CTAs) but reads text-heavy vs
  Komoot's photo-led guides. **Screenshot:** `qa3/b1-cycling-girona-desktop.png`.
- **P2-5 — Generate intent echo repeats a token.** Girona result confirmed "60 km · road · flat · **from
  Girona flat**" — the parser folded "flat" into the location. **Screenshot:** `qa3/gen-girona.png`.
- **P2-6 — Small home tap target.** "View all →" (Collections section) is 56×16px on all viewports.
- **P2-7 — Profile list items are sparse.** "My Loops" rows are icon + title + one line, no thumbnail —
  inconsistent with the rich cards everywhere else. Followers/Following stat boxes have uneven widths.
- **P2-NOTE — Feed cards blank until scrolled** on first render (lazy `loading="lazy"` thumbnails). Fine
  for real users, but consider eager-loading the first row so the above-the-fold feed is never empty.

---

## Coverage

Home `/` (feed, search "Girona"/"Mallorca"/nonsense, filters, sort), route detail ×6, `/generate`
(Girona ✓ generated 2 candidates in 32s with real scores; Calpe declined — see P1-7), `/plan`
(draw → snap → save works: 3 points → 88.7km → saved to `/routes/<new-id>`), `/collections`,
`/collections/girona`, `/cycling/girona`, `/cycling/mallorca`, `/upload`, `/pricing`, `/switch`,
`/profile`, logged-out `/` and `/login`. No horizontal overflow found at any viewport on any page.

**What's genuinely world-class already:** the `/generate` result UX (intent echo, freshly-built
candidates, quality factor bars, honesty note "Hillier than 'flat' — 413m…", save/download), the route
detail elevation-gradient profile + categorised climbs, the destination guide content depth, and the
draw-and-snap planner. The gaps above are what keep it from feeling finished.
