# Browser QA Findings — /generate and /plan

**Date:** 2026-06-11
**Tester:** QA (real Chromium via Playwright, dev server at http://localhost:3111)
**Viewports:** 375x812 (iPhone), 768x1024 (iPad), 1440x900 (desktop)
**Auth:** middleware bypass cookie `session=qa-test` as instructed.
**Screenshots:** `…/scratchpad/qa/*.png` (paths given per finding).
**Repro script (gitignored):** `/home/user/loops/tmp-qa/qa.mjs`

---

## READ THIS FIRST — the honest state of both flows in this environment

**With the exact login cookie a real rider carries, NEITHER core flow delivers its
payload in this running environment.** The root cause is that the database is
unreachable here (fail-soft is expected per CLAUDE.md), but the two flows handle
that DB outage **inconsistently**, and one of them handles it badly:

- **/generate is hard-down.** Two DB-backed calls block it. First, the client
  `AuthProvider` calls `GET /api/auth`, which returns **500**, so the rider is
  treated as logged-out and **redirected to /login** — they never see the
  planner. Second, even past that gate, `POST /api/generate-route` returns an
  **empty-body HTTP 500 in ~100 ms** whenever a session cookie is present,
  because `getUserBySession()` is called **without a try/catch** (route.ts:45).
  The client's `res.json()` then throws and the rider sees the developer-ese
  error **"Unexpected end of JSON input" / "Failed to execute 'json' on
  'Response'"**. This violates both the `{ error, code }` response convention
  and the project's own honesty principles.

- **/plan degrades gracefully but can't snap.** `POST /api/reroute` guards the
  identical DB call with `.catch(() => null)` and returns a clean **401**, so
  the planner falls back to straight-line legs, shows an honest *"Sign in to
  snap to roads"* banner, and keeps working. This is the correct pattern —
  **/generate should copy it.** The downside: with the DB down I could not
  verify road-snapping, so the "line becomes a viewable snapped route without
  export" behaviour is **UNVERIFIED** in this environment (it stays dashed and
  straight).

**Proof the generator itself is healthy:** calling `POST /api/generate-route`
**without** the session cookie (so the un-guarded DB call is skipped) returns a
real **200 with a full 54.3 km route in ~35 s** for the Skerries prompt. So the
pipeline works; the login cookie is literally what breaks it.

**How I got UI coverage anyway:** to test the interactive shell around
generation (the actual prior complaints), I mocked `GET /api/auth` to a user and
served `POST /api/generate-route` from that real captured 200 response. Every
"Flow A UI" finding below is from that path and is genuine; the "hard-down"
findings above are the raw, unmocked behaviour.

**Good news up front:** the three prior UX complaints for Flow A appear
**resolved** — submit is above the fold on mobile, there is **zero horizontal
overflow** at any viewport before or after results, and a generated candidate
**does** open into a full-screen route viewer. Flow B's live distance readout
**does** update per click. Details below.

---

## Defects (prioritized)

### P0-1 — /generate throws a bare 500 + cryptic error for any logged-in rider
- **Flow:** A (/generate). **Viewports:** all three (identical).
- **Repro:**
  1. Have a `session` cookie set (every logged-in rider does).
  2. `POST /api/generate-route` (or type a prompt and hit *Find my route*).
  3. Endpoint returns **HTTP 500, body length 0, in ~100 ms**.
- **Observed:** Error panel reads **"Unexpected end of JSON input"** /
  **"Failed to execute 'json' on 'Response'"** with sub-text *"Check your
  connection and try again — your request is still here."* No route is ever
  produced.
- **Expected:** Either a real route, or — if the DB is down — a graceful,
  on-brand `{ error, code }` message, exactly like /api/reroute does. Generation
  should never 500 with an empty body on a DB blip.
- **Root cause:** `src/app/api/generate-route/route.ts:45`
  `const user = sessionToken ? await getUserBySession(sessionToken) : null;`
  is not wrapped in try/catch. Compare `src/app/api/reroute/route.ts:14`, which
  guards the same call with `.catch(() => null)`.
- **Prod caveat:** with a healthy DB and a *valid* session this call resolves and
  generation works. But any transient DB error takes the entire generate flow
  down with a cryptic message — and in this test environment it is 100% down.
- **Screenshot:** `qa/A-iphone-3-results.png` was captured in an earlier
  (unmocked) run showing this exact error panel; see also the direct-curl note
  above (HTTP=500 size=0).

### P0-2 — Logged-in rider is bounced off /generate to /login (no fail-soft on auth)
- **Flow:** A (/generate). **Viewports:** all three.
- **Repro:** Load `/generate` with the `session` cookie set.
- **Observed:** `AuthProvider` calls `GET /api/auth` → **500** → `refresh()`
  treats `!res.ok` as logged-out (`setUser(null)`), and `GeneratePage`'s effect
  immediately `router.push('/login…')`. The rider lands on the marketing/login
  landing ("Where should I ride today?") and cannot reach the planner at all.
- **Expected:** A 500 from the auth endpoint is a *server* failure, not proof the
  rider is logged out. It should be retried / treated distinctly from a 401,
  rather than silently ejecting an authenticated rider to /login.
- **Root cause:** `src/components/AuthProvider.tsx` `refresh()` collapses every
  non-OK response (500 included) to `user = null`; `src/app/generate/page.tsx`
  redirects on `!authLoading && !user`.
- **Screenshot:** `qa/A-iphone-1-load.png` (first, cookie-only run — shows the
  login landing instead of the planner).

### P1-1 — /plan cannot snap to roads for a cookie'd rider; shows "Sign in to snap"
- **Flow:** B (/plan). **Viewports:** all three.
- **Repro:** With the `session` cookie set, open /plan and drop points.
- **Observed:** `POST /api/reroute` → **401** (`getUserBySession` returns null
  under the fake/unvalidatable session), so all legs stay **dashed straight
  lines**, totals are prefixed **"~"** (approximate) with **"+0 m"** elevation,
  and the banner *"Sign in to snap to roads"* shows — even though the app header
  simultaneously shows generic *Log in / Sign up*. Confusing dual state.
  Measured: 4 clicks → readouts `0.0 → 0.0 → ~17.8 → ~26.6 → ~29.1 km`;
  polylines `{solid:0, dashed:4}`; only 2 reroute calls fired before the client
  gave up and drew straight.
- **Expected:** A valid session should snap legs to roads and produce a solid,
  viewable route with real elevation, with no sign-in banner.
- **Note:** This fails *soft and honestly* (unlike P0-1) — the correct pattern.
  The "snapped viewable route without export" prior complaint is therefore
  **UNVERIFIED** in this environment (needs a real DB session to confirm).
- **Screenshots:** `qa/B-iphone-3-finished.png`, `qa/B-desktop-3-finished.png`.

### P1-2 — Map tiles never load (blank grey canvas) in this environment
- **Flow:** A route-viewer modal + B planner. **Viewports:** all three.
- **Repro:** Open the route viewer (Flow A) or /plan (Flow B).
- **Observed:** Dozens of `net::ERR_CERT_AUTHORITY_INVALID` console errors; the
  Leaflet basemap is a **blank grey field** with only the drawn route/pins and
  the OSM attribution visible.
- **Assessment:** This is the agent proxy blocking `tile.openstreetmap.org`, an
  **environment artifact, not a product bug** — the route geometry and controls
  render correctly on top. Flagged so it isn't mistaken for a UI regression, and
  as a reminder that prod must reach the tile host. The route line, zoom
  controls and attribution all draw fine.
- **Screenshots:** `qa/A-iphone-4-route-open.png` (route line on grey),
  `qa/B-desktop-3-finished.png`.

### P2-1 — Leaflet zoom +/- controls are 30x30 px (< 40 px tap target)
- **Flow:** A viewer + B planner. **Viewports:** all three (esp. iPhone).
- **Observed:** The `.leaflet-control-zoom` buttons measure **30x30 px**, under
  the 40 px minimum. Every app-authored control was fine (Undo 86x44, discipline
  61x44, Loop 138x44, Clear 72x44, Save 113x44, Download GPX 139x44) — only the
  default Leaflet zoom controls miss the bar.
- **Expected:** ≥ 40 px (ideally 44) for thumb use on the map.
- **Screenshot:** `qa/B-iphone-3-finished.png` (top-left +/-).

### P2-2 — A floating "N" widget overlaps bottom-left content
- **Flow:** A and B. **Viewport:** iPhone most visible.
- **Observed:** A dark circular element containing "N" sits fixed at bottom-left
  and **overlaps the "Clear all" button** on /plan (text partly hidden) and the
  page footer on /generate.
- **Expected:** It should not occlude interactive controls; add bottom padding or
  reposition on small screens.
- **Screenshots:** `qa/B-iphone-3-finished.png`, `qa/A-iphone-3-results.png`.

### P2-3 — "60 km, flat" request returns a 54.3 km, 472 m-climb route
- **Flow:** A (/generate). **Viewport:** all.
- **Observed:** For *"60km road loop from Skerries, flat, tailwind home"* the
  interpreter correctly reads 60 km / flat / Skerries / tailwind_home, but the
  single candidate is **54.3 km** (~10% short) with **472 m** of climbing
  (~8.7 m/km — reads "rolling", not "flat"). The card still labels it a match
  (EXCELLENT · 72).
- **Expected:** Closer to the requested distance, or an explicit note that it
  came in short/hillier than asked (honesty principle).
- **Screenshot:** `qa/A-iphone-3-results.png`.

---

## What works well (verified, not defects)

- **Submit above the fold on mobile (prior complaint FIXED):** the *Find my
  route* button is fully in-viewport at 375 px (top at y≈377 of 812) — and at
  iPad/desktop. `qa/A-iphone-2-typed.png`.
- **No horizontal overflow anywhere (prior "sizes strange on mobile" FIXED):**
  overflow measured 0 px at all three viewports, both before submit and after
  results render, and inside the route viewer.
- **Can view the generated route (prior "can't click in to view" FIXED):** the
  candidate preview is a button ("Tap to view full map") that opens a
  full-screen route viewer with the route line, title, stats and a close
  control. `qa/A-iphone-4-route-open.png`.
- **Results card is consumer-ready:** quality tier badge, distance/climb/quality,
  highlight chips, paved/unpaved surface split, quality-factor bars, and a wind
  note ("Wind SW 24 km/h — you'll ride into it early and have it at your back
  for the run home"). `qa/A-iphone-3-results.png`.
- **Flow B live distance readout (prior "doesn't show distance as I create it"
  FIXED):** the toolbar total updates on every point (`0.0 → ~17.8 → ~26.6 →
  ~29.1 km`), with "~" honestly marking straight-line approximations.
- **Undo works:** removes the last point (4 → 3 polylines). App-authored map
  controls all ≥ 44 px.
- **Graceful degradation on /plan:** 401 → straight legs + honest banner, no
  crash. This is the model /generate should follow.

---

## Coverage gaps (could not be exercised in this environment)
- End-to-end /generate through the real login cookie (blocked by P0-1/P0-2;
  covered via mocked auth + cached real response instead).
- Road-snapping and the "viewable snapped route without export" behaviour on
  /plan (blocked by P1-1 / DB down).
- "Save to my routes" (Flow A) and "Save route" (Flow B) — both POST to
  `/api/routes/from-generated`, which needs the DB; not exercised.
