# LOOPS — World-Class QA Findings (2026-09-19)

**Brief:** Find every gap between the current build and a world-class consumer
product (Strava / Komoot standard), with exact repros.
**Environment:** production server (`next start`, next-server v16.1.6) at
`http://localhost:3200`, real data (~124 routes), authenticated session cookie
(`qa-283635a4-...`). Chromium/Playwright. Tested at 375×812 (iPhone),
768×1024 (iPad), 1440×900 (desktop). Screenshots in `/home/user/loops/qa2/`.

**Excluded as environment artifacts (not bugs):** OpenStreetMap map tiles fail
to load (cert proxy); external avatar services `ui-avatars.com` /
`api.dicebear.com` fail `ERR_CERT_AUTHORITY_INVALID` (cert proxy). These are
sandbox-only and are not counted below.

**Scoreboard:** P0 = 1 · P1 = 6 · P2 = 6.
No horizontal overflow was found on any page at any viewport (good).

---

## P0 — Broken / unusable

### P0-1. The home feed and curated collection pages hard-crash to a full-page "Something went wrong"
- **Pages:** `/` (home — the "where should I ride today" feed) and
  `/collections/<slug>` (curated destination libraries — **pillar #1**).
- **Viewports:** all three (viewport-independent; it is a client hydration crash).
- **Repro:** Load `/` with a valid session. The server-rendered feed paints for
  a moment, then the entire page is replaced by:
  *"Something went wrong — An unexpected error occurred. Try refreshing the page
  or click below to retry. [TRY AGAIN]"* (body text collapses to 111 chars).
- **Reproducibility (measured):** `/` crashed 2/6, then 8/8 on a later run;
  `/collections/girona` 4/6; `/collections/dublin` and `/collections/mallorca`
  also observed crashing. Intermittent per load, trending worse — currently
  near-total on home.
- **Root cause (precise):** The home HTML references
  `/_next/static/chunks/95324e3248d29614.js` (also `b7cb20bd34256921.js`,
  `50b29e9007197c2a.js`). These chunks were **never emitted** to
  `.next/static/chunks/` and return **HTTP 500 / `Content-Type: text/plain`**
  on every request (both backend instances, ports 3150 & 3151, behind the
  `:3200` proxy). The browser refuses the script ("MIME type text/plain is not
  executable") → `ChunkLoadError` → React root error boundary wipes the page.
  SSR HTML is clean (curl of `/` contains the real feed and **no** error text),
  so this is a **client-side hydration crash only**. Likely a stale/incomplete
  build-deploy race: the `next start` processes started 14:05/14:07 but `.next`
  was rebuilt 14:17–14:18, so the running manifest points at chunk hashes the
  new build no longer produced.
- **Observed vs expected:** Observed — the primary entry point and the curated
  library surface show a generic crash screen for a large fraction of loads.
  Expected — home and collections render reliably, 100% of loads. This alone
  makes the product feel not-shippable; **search could not even be tested**
  because home would not stay rendered (8/8 crash on the search run).
- **Screenshots:** any `home-*` (SSR flash) vs the crash state captured in
  `qa2/crashmap.mjs` output; `collections/girona` crash confirmed in
  `qa2/*` runs.
- **Note for triage:** may be a deploy artifact of this box rather than source
  code — but it is the current, reproducible state of the "production" server
  and destroys the core browse experience, so it is ranked P0. Must be
  confirmed fixed on a clean deploy before launch.

---

## P1 — Clearly wrong / below consumer standard

### P1-1. Console is flooded with 500 ChunkLoadErrors on nearly every page
- **Pages:** all (route detail, plan, generate, collections index, etc.).
- **Viewports:** all.
- **Repro:** Open devtools on any page; observe repeated
  `Failed to load resource: 500`, `Refused to execute script … MIME type
  ('text/plain')`, and `ChunkLoadError: Failed to load chunk …`.
- **Observed vs expected:** Even pages that render (route detail, plan) throw
  2–4 chunk 500s each. A world-class app ships a clean console; this signals a
  broken build and a latent lazy feature that never loads. Same root cause as
  P0-1. Also produced a React #418 hydration error once.

### P1-2. Route cards in the feed and lists are text-only — no map thumbnails
- **Pages:** home feed, `/routes/country/*`, route-detail "More routes" rail.
- **Viewports:** all (most glaring at 375).
- **Repro:** Home feed cards render as plain text rows — name, "84 km · 594 m
  climbing · Road", location, a rating star — with `img=0, canvas=0, svg=0`.
- **Observed vs expected:** Strava and Komoot show a map (or photo) preview on
  every route card; it is the single most important visual cue for "do I want
  this ride." LOOPS' discovery feed reads like a spreadsheet. Inconsistent
  internally, too: the **generate** results DO render per-route SVG map
  thumbnails, so the browse feed looks poorer than the AI output.
- **Screenshot:** `qa2/home-mobile.png`, `qa2/route1-mobile.png` (More-routes rail).

### P1-3. Social features are live despite the documented launch decision to hide them (and read as fabricated proof)
- **Page:** `/routes/<id>` (every route).
- **Viewports:** all.
- **Repro:** Open any route. It shows "UPLOADED BY Aoife Brennan ★ 4.6 (8)", a
  **FOLLOW** button, and a **PHOTOS** section ("Add Photo / Be the first to
  share one!"). Confirmed in DOM: `uploadedBy="Aoife Brennan"`, `rating="4.6
  (8)"`, `follow=true`, `photos=true`.
- **Observed vs expected:** `CLAUDE.md` owner decisions say *Social features
  hidden for launch (`SOCIAL_FEATURES_ENABLED=false`)* and *No public route
  attribution — routes are facts.* Yet curated/sourced routes are presented as
  uploaded by a named persona with a star rating and review count. That is
  fabricated social proof on facts — it directly undermines the "routes are
  facts / we won't serve a route we can't stand over" trust positioning, and it
  contradicts the launch scope. Either wire the flag to these components or
  remove the persona/rating/follow/photos block.
- **Screenshot:** `qa2/route1-desktop.png`, `qa2/route1-mobile.png`.

### P1-4. "More routes in <region>" recommends routes from the wrong region
- **Page:** `/routes/<id>` related-routes rail.
- **Viewports:** all.
- **Repro:** Wicklow 200 (breadcrumb Ireland / **Wicklow**) shows a rail headed
  "MORE ROUTES IN WICKLOW" listing **Skerries via the Lanes**, **Dublin Canal
  Ride**, **Skerries Loop** — all Dublin/Fingal routes, ~50 km north of Wicklow.
- **Observed vs expected:** Related routes are not filtered to the stated
  region; a rider is told these are Wicklow routes when they are not. Komoot's
  "nearby routes" are genuinely nearby. Erodes trust in the data.
- **Screenshot:** `qa2/route1-desktop.png` (bottom).

### P1-5. AI generation fails on plausible prompts (GEOCODE_FAILED) after long waits
- **Page:** `/generate`.
- **Viewports:** tested 375 & 1440.
- **Repro:**
  - "60km road loop from Girona, flat" → **works**, 62.9 km, ~15 s. Good.
  - "2 hour hilly ride from Calpe" → **works**, 42.6 km, ~29 s.
  - "gravel loop from Dublin" → **422 GEOCODE_FAILED** in ~10 s.
  - "90 min gravel from Dublin with a cafe" → **422 GEOCODE_FAILED** after
    **~50 s** (`/api/generate-route` body: *"No valid routes could be
    generated…","code":"GEOCODE_FAILED"*).
- **Observed vs expected:** Dublin is a home-turf destination with real routes,
  yet gravel/cafe prompts from Dublin fail geocoding. Latency is inconsistent
  (15 s / 29 s / 10–50 s) and the 50 s failure **exceeds the app's own "this can
  take up to a minute" promise**. For a product whose pillar is "voice-prompted
  route generation," failing a natural prompt like "gravel from Dublin with a
  cafe" is a core-value miss. (The failure *screen* is good — see Positives.)
- **Screenshots:** `qa2/genfinal-0-mobile.png` (success), `qa2/dublin-outcome.png`
  (failure card).

### P1-6. Generated routes show two conflicting quality scores
- **Page:** `/generate` result cards.
- **Viewports:** all.
- **Repro:** A generated route's badge reads "EXCELLENT · 78" while the stat row
  reads "Quality 81"; the second option reads badge "72" vs stat "Quality 77".
- **Observed vs expected:** Two different 0–100-looking scores for the same
  route, both unlabeled as to what differs, reads as a bug and undercuts the
  headline "quality-scored" claim. Show one number, or clearly label the two.
- **Screenshot:** `qa2/genfinal-0-mobile.png`.

---

## P2 — Polish

### P2-1. Footer renders twice
- **Pages:** `/pricing`, `/switch` (confirmed `footers=2`, "© 2026" ×2).
- **Viewports:** all. Looks unfinished. `qa2/pricing-desktop.png`,
  `qa2/switch-desktop.png`.

### P2-2. Header auth state inconsistent across sections
- **Pages:** `/cycling/*` destination pages show a logged-out "Log in / Sign up"
  header for an authenticated session, while `/generate`, `/collections`, etc.
  show the avatar + "Sign out". (`/pricing`, `/switch` show login buttons
  pre-hydration too.) A logged-in user clicking into a destination guide
  suddenly looks logged out. `qa2/cycling-girona-desktop.png`.

### P2-3. Redundant, ambiguous CTAs on destination pages
- **Page:** `/cycling/girona` stacks "Browse Girona routes"
  (→ `/routes/country/spain/cataluna`) directly above "View Girona routes"
  (→ `/collections/girona`). Near-identical labels, the difference isn't
  communicated, and "View Girona routes" leads to the P0-crash-prone
  collections page. `qa2/cycling-girona-desktop.png`.

### P2-4. Generated-route surface breakdown is largely "unknown"
- **Page:** `/generate` results show "64% paved · 2% unpaved · **34% unknown**"
  and "47% paved · 1% unpaved · **52% unknown**". Komoot classifies surface with
  high confidence; a third-to-half "unknown" reads as low-confidence data.
  `qa2/genfinal-0-mobile.png`.

### P2-5. Tap targets below 40 px
- Route-detail weather toggles "Direction"/"Wind" are 97×**30** px; footer links
  are ~**17** px tall; Leaflet zoom controls 30×30. Minor a11y / mobile-ergonomics
  gap vs the 44 px iOS guideline.

### P2-6. No "Send to Garmin" on route detail
- Route detail offers Strava, Komoot, Copy Link, Download GPX, Invite-to-ride —
  but no Garmin push (pricing lists one-tap Garmin sync as "soon"). Consistent
  with known tech debt, but a gap vs the expected device handoff. Download GPX
  itself works (downloads "Wicklow 200.gpx"). `qa2/route1-desktop.png`.

---

## What is already at / near world-class (keep)
- **Plan / Draw (`/plan`)** is genuinely Strava-quality: live distance + gain,
  road-snapped dashed polyline (`/api/reroute`), gradient-banded elevation
  profile, ROAD/GRAVEL/MTB toggle, "Loop back to start", undo, clear helper
  text, Save + Download GPX. `qa2/plan-drawn-desktop.png`.
- **Generate output** (when it succeeds) is premium: two ranked options, quality
  scores, surface breakdown, and honest guidance ("Hillier than 'flat' — 413 m
  of climbing on the flattest quiet loop we could find here"). Staged loading
  copy is on-brand ("Checking the library of verified routes…").
- **Failure/decline UX** is on-brand and helpful: "No valid routes could be
  generated… WE WON'T SERVE A ROUTE WE CAN'T STAND OVER" with suggestions and
  a TRY AGAIN button — matches the honesty principles.
- **Destination SEO pages** (`/cycling/girona`) and **Switch/Pricing** copy are
  strong, specific, and credible.
- **Route detail** is rich and renders cleanly at 375 (weather, stats, verified
  badge, elevation profile, categorized climbs, About, FAQ) with no overflow.

---

## Top 5 to fix first
1. **P0-1** — Home + collections crash to "Something went wrong" (missing 500'ing
   chunks). Rebuild/redeploy cleanly and verify 0 chunk 500s; this blocks launch.
2. **P1-2** — Add map thumbnails to route cards in the feed/lists (biggest visual
   gap vs Strava/Komoot).
3. **P1-3** — Hide the persona/rating/Follow/Photos social block on routes (matches
   the launch decision and the "routes are facts" trust story).
4. **P1-4** — Region-filter the "More routes in <region>" rail (no Dublin routes
   under a Wicklow header).
5. **P1-5** — Fix Dublin/gravel/POI generation (GEOCODE_FAILED) and cap latency so
   it never blows past the promised minute.
