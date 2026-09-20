# LOOPS — World-Class QA, Pass 3 (2026-09-20)

Third QA pass toward a Strava/Komoot standard. Driven against the production
server at `http://localhost:3250` with real data, logged in via the QA session
cookie, using Chromium + Playwright. Tested at 375×812, 768×1024, 1440×900,
plus a clean no-cookie context for the logged-out experience.

Sandbox artifacts (OSM tile failures / grey maps, ui-avatars/dicebear avatar
failures, Overpass "road data unavailable" so live scoring returns nothing,
Dublin-slow/gravel-fail generation) are excluded from all findings below.
Screenshots referenced are in `/home/user/loops/qa4/`.

---

## Regressions / still-broken from earlier passes

Spot-check of the 9 pass-1 / pass-2 fixes:

| # | Verification | Result |
|---|---|---|
| 1 | Route detail never shows `0/100` (real score or module hidden) | **PASS** — 4 routes checked, none show `0/100`; where a score exists it renders (generate result showed `Quality 77` + bars). Library routes hide the module. |
| 2 | Home `/` with cookie shows signed-in view (~5 loads) | **FAIL (P0 regression)** — see P0-1. Home flips to the logged-out marketing hero. In one run 14/15 loads rendered logged-out. |
| 3 | Route detail: no "Uploaded by", Follow, Photos | **PASS** |
| 4 | Profile: no Followers/Following/Follow/"Explorer" badge | **PASS** |
| 5 | Collection cards: thumbnail + "N routes" | **PASS** (listing) — all four show an image thumb + real count. But see P2-1 (thumb can be a "LOOPS" placeholder) and P1-1 (count missing on the collection *detail* page). |
| 6 | Route/feed cards show route-shape thumbnails | **PASS (feed) / partial** — the home route feed and collection-detail cards have neon route-shape thumbnails. The `/routes/country/*` listing uses text-only rows with no thumbnail (minor, see P2-4). |
| 7 | Search: one clear (×) button | **PASS** — exactly one clear control. |
| 8 | Profile loads fast (no 5–6s skeleton) | **PASS** — DOM ready ~1.4s, no lingering skeleton. |
| 9 | Single footer; footer/weather tap targets ≥40px | **PASS** — one `<footer>` per page; no sub-40px targets inside it. |

Net: **8 of 9 hold. Verification #2 has regressed and is now the single
biggest problem in the product** (root cause below).

---

## New prioritized findings

### P0

**P0-1 — Logged-in users are silently downgraded to the anonymous
landing / paywall across the entire app (root cause: `/api/auth` 429).**
- Pages/viewports: every page, all viewports.
- Repro: with a valid session cookie, load `/` repeatedly (or navigate quickly
  between pages). The client calls `GET /api/auth` on each navigation; it
  intermittently returns **429 Too Many Requests**, and on 429 the UI renders
  the *logged-out* variant.
- Measured severity: 19/20 rapid `/api/auth` requests returned 429; **8/8 at a
  spaced 1 request/second still returned 429**; it recovers to 200 only after
  ~25s idle. So the limiter is tripped by ordinary navigation, not just abuse.
- Observed symptoms (all reproduced this pass):
  - Home `/` shows the marketing hero + "Log in / Sign up" (`qa4/v2-marketing-leak.png`).
  - Route detail renders logged-out: nav shows "Log in / Sign up", the favourite
    button reads "Sign in to favourite", and a "Join LOOPS / SIGN UP FREE"
    upsell banner appears (`qa4/desktop-route-detail.png` vs the correct
    `qa4/mobile-route-detail.png`).
  - `/generate` renders the "GET STARTED WITH GOOGLE" gate instead of the
    generation UI (`qa4/desktop-generate.png`).
  - `/plan` renders logged-out (`qa4/desktop-plan.png`).
  - The route feed on `/` intermittently renders "Something went wrong loading
    routes / Try again" — the same 429 burst hitting the routes API
    (`qa4/v2-marketing-leak.png`, lower half).
- Observed vs world-class: a logged-in cyclist is repeatedly dumped onto the
  marketing/paywall page and loses the favourite/save/generate affordances.
  World-class: the session check is cached client-side and retried with
  backoff; a 429 (or any transient failure) must **never** downgrade a
  logged-in user to the anonymous view — retain last-known auth state. And the
  limiter itself must not fire on normal per-navigation traffic (raise the
  window, key it per-session, or stop re-fetching auth on every navigation /
  serve it from a cached provider). This is the top fix.

### P1

**P1-1 — Collection *detail* header shows a bare "routes" label with no number.**
- Page/viewport: `/collections/{slug}` header sub-line, all viewports.
- Repro: open `/collections/girona` (also mallorca, calpe, dublin). The neon
  sub-line reads `routes · Girona, Catalonia, Spain` with **no count** before
  the word "routes", although the page lists 34 (26/9/7) cards and the
  `/collections` grid card correctly shows "34 routes".
- Confirmed programmatically on all four collections: the count token is
  missing while the card count is 34/26/9/7.
- Observed vs world-class: the hero of every collection detail page is missing
  its headline number. Should read "34 routes · Girona, Catalonia, Spain".
- Screenshot: `qa4/desktop-collection-detail.png`.

**P1-2 — Route/collection listing has large dead space on desktop.**
- Pages/viewports: `/profile/*` and `/collections/{slug}` at 1440×900 (and
  1024).
- Repro: profile content is confined to a ~720px centred column; below ~530px
  the entire viewport is empty black. Collection detail is a single ~672px
  column with the right ~half of a 1440px screen empty next to a long
  single-column description wall.
- Observed vs world-class: the desktop layout feels unfinished and sparse.
  Profile should use the width (two-column, or route cards in a grid with
  thumbnails); collection detail's long prose should sit at a comfortable
  measure with the map/cards using the freed width.
- Screenshots: `qa4/desktop-profile.png`, `qa4/desktop-collection-detail.png`.

### P2

**P2-1 — Collection card thumbnail inconsistency ("LOOPS" placeholder).**
- Page/viewports: `/collections`, all viewports (most visible on mobile).
- Repro: the Girona/Calpe/Mallorca cards render a real neon route-shape thumb;
  the **Dublin** card renders a generic "LOOPS" wordmark tile. Cards use the
  first/representative route's `/api/thumb/{id}`; Dublin's representative route
  (`4f024589…`) returns a 364-byte "LOOPS" placeholder SVG (others return
  ~4.7KB route shapes) because that route has no rendered path geometry.
- Observed vs world-class: collections should always show a route-shape hero
  (pick a representative route that has geometry, or composite the collection).
- Screenshot: `qa4/mobile-collections.png` (2nd card).

**P2-2 — Small tap targets on the profile page.**
- Page/viewport: `/profile/*`, mobile (also affects click ergonomics on
  desktop).
- Repro: "Share profile" button is 30×30px; the MY LOOPS / ACTIVITY tabs are
  34px tall; the ALL / UPLOADED / DOWNLOADED / FAVOURITED filter chips are
  ~27px tall. All below the 40px minimum.
- Route detail: the favourite (heart) button is 38px wide. Nav footer wordmark
  links are ~16px tall.
- Observed vs world-class: primary controls on a touch surface should be ≥40px
  (ideally 44px). Bump the share button, tabs, and filter chips.

**P2-3 — Avatar fallback overflows its frame.**
- Page/viewport: `/profile/*`, all viewports.
- Repro: when the avatar image is unavailable, the raw alt text ("QA Rider")
  renders left-clipped, spilling outside the circular frame instead of an
  initials/monogram fallback. (The avatar *service* is a sandbox artifact, but
  the fallback treatment is app-owned.)
- Observed vs world-class: render a centred initials chip on load failure.
- Screenshot: `qa4/desktop-profile.png` (avatar circle).

**P2-4 — Country listing rows have no thumbnail.**
- Page/viewport: `/routes/country/*`, all viewports.
- Repro: rows are text-only (title, km, climbing, region) with no route-shape
  mini-map, unlike the home feed and collection cards.
- Observed vs world-class: even dense listings on Strava/Komoot carry a small
  route glyph. Add a compact thumbnail to keep the visual language consistent.

**P2-5 — Low-contrast body copy on collection detail.**
- Page/viewport: `/collections/{slug}`, all viewports.
- Repro: the long description paragraph is rendered in a muted grey on near-
  black; a full-width wall of low-contrast text is hard to scan.
- Observed vs world-class: raise the description text to the body-text token and
  cap the measure.

---

## Notes on things that are genuinely good (keep)

- **Generate flow** (`60km road loop from Girona flat`): parsed-intent
  confirmation ("HERE'S WHAT WE UNDERSTOOD: 60 km · road · flat"), staged
  loading with honest "up to a minute … checking real road quality" messaging,
  a real quality score (77 / EXCELLENT) with sub-scores, and the honest
  "Hillier than 'flat' — 592 m of climbing on the flattest quiet loop" note.
  Result in ~42s with Save + Download GPX. (`qa4/generate-*.png`)
- **Plan / draw**: dropping points snaps to roads live (distance 0 → 73.8 →
  87.9 km) and Save redirects to the new route detail. No console errors.
- **Pricing** and **destination guide** pages are clean and well-structured.
- No horizontal overflow found on any page at any viewport.
- Only non-artifact console error observed anywhere is the `/api/auth` 429
  (P0-1); everything else (tile/avatar CERT failures, `_rsc` prefetch aborts)
  is a sandbox artifact.
