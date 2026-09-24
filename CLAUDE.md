# LOOPS - Route Intelligence for Serious Cyclists

## What This Is
A Next.js web app for cycling route discovery and AI route generation
(road, gravel, MTB). Three pillars (per the June 2026 launch build spec):
1. **Curated destination libraries** — 10 iconic cycling destinations with
   ready-to-import route sets
2. **Voice-prompted route generation** — natural language → wind-aware,
   quality-scored loops
3. **Session-aware loop building** — structured workouts mapped onto roads
   that can hold the efforts

Pre-launch. Login-gated. Owner: Anthony Walsh, Roadman Cycling.

**Domain**: https://www.loops.ie/
**Repo**: https://github.com/anhudawa/loops
**Spec**: `docs/superpowers/specs/2026-06-09-loops-launch-build-spec.md`
**Delivery plan + decisions**: `docs/superpowers/plans/2026-06-09-loops-launch-delivery-plan.md`
**Route sourcing model**: `docs/superpowers/plans/2026-06-09-route-sourcing-validation.md`

## Tech Stack
- Next.js 16 + React 19 + TypeScript (App Router)
- Tailwind CSS 4
- Vercel Postgres (database; PostGIS planned for road intelligence)
- Vercel Blob (file storage)
- Leaflet + React-Leaflet (maps)
- Anthropic API (route intent parsing — claude-haiku)
- BRouter (routing engine; public demo in dev, self-host via BROUTER_URL for prod)
- Open-Meteo (weather + wind forecasts, elevation backfill)
- Overpass/OSM (route quality scoring)
- Capacitor (mobile bridge), Resend (email)
- Auth: Google OAuth + Magic Links; Strava import only (not auth)

## Project Structure
```
src/
  app/
    api/generate-route/  # Voice/text → route generation endpoint
    generate/            # Generation UI (voice input, staged loading, wind notes)
    cycling/[destination]/ # SEO destination guides (12: 10 launch + Dublin/Wicklow)
    routes/[id]/         # Route detail pages
    routes/country/...   # Country/region route listings (fail-soft static params)
    admin/ blog/ collections/ login/ messages/ profile/ upload/ share/
  components/            # Flat component dir
  config/constants.ts    # Quality thresholds, SOCIAL_FEATURES_ENABLED flag
  content/destinations.ts # Destination guide content + LAUNCH_DESTINATION_SLUGS
  lib/
    route-intent.ts      # Claude NL parser → RouteSpec (incl. workout + wind_strategy)
    route-generator.ts   # Orchestrator: library-first → candidates → guardrails → scoring
    route-library.ts     # Library matching (verified routes beat fresh generation)
    route-quality.ts     # 10-factor 0-100 scoring (roads from the engine's tags; scenery via Overpass)
    road-segments.ts     # Engine-native road intelligence: per-edge tags, road rules, compromise report
    places.ts / places-known.ts  # Bundled GeoNames places (waypoint anchors) + launch-destination lookup
    engine-profiles.ts   # Upload routing profiles to the live engine (POST /api/engine/sync-profiles)
    route-rules.ts       # Hard guardrails (auto-reject); spur repair; access-retrace zone
    wind.ts              # Wind forecast + bearing alignment ("tailwind home")
    session-assembly.ts  # Anchor-first corridor finder (spec §3)
    interval-segments.ts # Workout segment detection
    interval-validation.ts
    intensity.ts         # Zone definitions
    db.ts                # All database queries (single source of truth)
    gpx.ts fit.ts tcx.ts ridewithgps.ts route-parser.ts
scripts/
  import-routes.mjs      # Manifest → DB importer (supports --dry-run, RWGPS URLs)
  hub-data/*.json        # Route manifests for all 10 launch destinations
  routing/               # Own BRouter server: profiles/*.brf (SOURCE OF TRUTH), template →
                         #   build-cloud-init.mjs → cloud-init-brouter.yaml + src/data/engine-profiles.json
  anchors/build-places.mjs  # GeoNames → src/data/places-eu.json
tests/                   # Playwright smoke suite (npm run smoke; read-only, against production)
src/lib/__tests__/       # Vitest unit tests (npm test)
```

## Launch Destinations (research-confirmed 2026-06-09)
Mallorca, Girona, Málaga, Calpe, Tenerife, Gran Canaria, Lanzarote,
Algarve, Lucca, Nice — see `LAUNCH_DESTINATION_SLUGS`. Dublin/Wicklow stay
as home-turf pages outside the count. Route manifests for all 10 are in
`scripts/hub-data/` (dry-run validated; import with
`node --env-file=.env.local scripts/import-routes.mjs <manifest> [--dry-run]`).

## Key Owner Decisions (2026-06-09)
- **No public route attribution** — routes are facts; operator_name/url in
  the DB are private provenance only, never displayed.
- **No validator partners** — validation = sourcing from credible local
  operators' public routes + automated quality scoring + guardrails.
- **Social features hidden for launch** (`SOCIAL_FEATURES_ENABLED=false` in
  config/constants.ts) — comments/ratings/condition reports kept intact,
  out of launch scope per spec §7.
- **Stack stays** Next.js 16 + Vercel Postgres (not Supabase per spec).

## Honesty Principles (from spec — enforced in code)
- Wind under 8 km/h → say it's not worth planning around (src/lib/wind.ts)
- Forecast down → generate without wind and say so
- No clean interval segment → decline with alternatives, never serve a
  compromised one
- Quality floor (QUALITY_FLOOR) — candidates below it are never surfaced

## Commands
```bash
npm test                  # Vitest unit suite
npx tsc --noEmit          # Typecheck
npm run build             # Production build (passes without DB — fail-soft)
npm run smoke             # Read-only production smoke suite (tests/smoke.spec.ts, iPhone 13 emulation);
                          #   BASE_URL=<deploy> targets another deployment; PW_SANDBOX=1 in this sandbox
npm run golden            # Golden route suite (needs ANTHROPIC_API_KEY)
node scripts/import-routes.mjs scripts/hub-data/girona-eat-sleep-cycle.json --dry-run
```

## Routing engine (read before touching generation)
- Own BRouter 1.7.10 on Hetzner (`BROUTER_URL`, project `gravel-ireland` on Vercel).
  Profiles: `loops-road` (the Road Standard) and `loops-road-relaxed` (fallback).
  `docs/superpowers/specs/2026-09-21-road-standard.md` — the rules AND how they
  are applied in code (owner-confirmed interpretations live there).
- Generation pipeline: bundled places → candidate diamonds → engine (strict →
  moved far point → relaxed) → spur repair → rules → road report + serving
  policy → scoring (roads from engine tags, scenery from one Overpass call) →
  second pass if < 2 loops or < 2 near the ask (`planSecondPass`: radius
  recalibrated when the ROUTED loops ran long/short, new directions when
  retrace cut them short). Loop shaping and the distance fit both pick the
  lowest `loopFitCostKm` (km off the ask + km of retrace to cut).
  Per-phase timings are logged (`timings`).
- Trust rules enforced in code: a named place must resolve or we decline;
  every generated/drawn route carries a `road_report`; loops > ±35 % off the
  requested distance are declined; nothing is silently downgraded.
- `GET /api/engine/status?probe=1` shows wiring, model-key presence and
  whether the server runs cloud-init v3 (relaxed profile present).
- Local testing: scratchpad `local-up.sh` (engine + dev server), `sweep-run.sh`.

## Known Technical Debt / Open Items
- Routing server is on cloud-init v3 (2026-09-22): both profiles live, custom
  profile uploads work (`POST /api/engine/sync-profiles`, admin). Profile
  changes need NO re-provisioning: edit `scripts/routing/profiles/loops-road.brf`,
  run `node scripts/routing/build-cloud-init.mjs`, deploy, call the sync endpoint.
- ANTHROPIC_API_KEY is unset on the production project (parser: basic —
  plain rides work, workout prompts cannot parse). Owner action.
- Library-first serves verified loops starting up to 40 km from the named
  place (Banyoles gets Girona's loops). Owner to decide the radius.
- Playwright: `npm run smoke` (tests/smoke.spec.ts) is the read-only production
  smoke suite — never signs in, blocks every mutating request. The older
  tests/loops-ie-tests.spec.ts predates the current login page (stale) and is
  excluded by playwright.config.ts; fold what is still useful into smoke.spec.ts.
- DB credential leaked in git history (removed from files) — MUST be
  rotated in the Vercel/Neon dashboard
- Anchor-first session assembly SHIPPED (src/lib/session-assembly.ts +
  assembleAnchorFirstWorkout in route-generator) — corridor finder live-
  verified from Skerries; route-first wide search remains the fallback
- Garmin Connect API push + Whisper voice fallback — need external
  accounts/keys
- Golden route suite: harness + 30 cases at `npm run golden` (needs
  ANTHROPIC_API_KEY + network); expand to 100 cases and wire into CI
- BRouter public demo is rate-limited — set BROUTER_URL before launch
- Gran Canaria manifest has 8 routes (bar met, 2026-09-23)
- Dublin library: /admin → Routes → "Import Dublin routes" inserts the bundled
  src/data/hub-bundles/dublin.json (2 Skerries loops, road report measured on the
  engine, approved but not VERIFIED). Of dublin.json, the Canal Ride (~5 km gravel
  towpath) and Wicklow 200 (~11 km primary) FAIL the Road Standard — not bundled.
  Note: import-routes.mjs inserts self-sourced routes as quality_status 'pending'
  (hidden publicly).
- Road reports for library routes (2026-09-23): GET /api/routes/[id] traces
  a route without one through the engine after the response
  (src/lib/road-trace.ts, `trekking` profile, via points every ~0.8 km) and
  stores it; unknown beats wrong (length drift > 8 % → nothing stored, retry
  in 1 h). Shown as the "Road Standard" card on the route page and as a
  badge on the OG preview. Roadman spin: meets the standard.
- Trust surfaces: Road Standard card + "Where" list + map markers (route
  page), ✓/⚠ chip on cards, badge on the OG image, "Road note" GPX
  waypoints, "Where" list on Generate results. Trace is per chunk with a
  60 % measured floor; names batched via Overpass and lazily back-filled.
- Ride time (src/lib/ride-time.ts, 2026-09-23, owner-anchored: Roadman spin
  ≈ 3½ h): minutes = 60 × (km + climb_m/100) / cruise, cruise = 25/19/13
  (road/gravel/mtb) scaled by the rider's profile speed; display rounds to
  ¼ h under 3 h and ½ h above ("~3½h", "Allow around 3½ hours of riding…");
  db.ts builds its SQL twin from the same constants (rideMinutesSql). Never
  add a second formula. The rider's own typed ask is echoed exactly.
- Ride verdict (src/lib/ride-wind.ts): weather card says what wind/rain do
  to THIS loop for the hours of the ride; never suggests reversing a loop
  (start point decides out/home balance under steady wind).
- Group-ride links: /ride/<id>?t=YYYY-MM-DDTHH:MM&m=<meet>; share sheet
  forwards the same ride; email sign-in stores the return path with the
  token (works from Gmail/Outlook in-app browsers).
- GPX access is one switch: GPX_ACCESS in src/config/constants.ts
  ("signed-in" default | "ride-links" | "everyone"); copy derives from it.
- Library Road Standard tally (2026-09-23, 107 routes): rules v2 8 meet /
  86 notes / 13 unknown; rules v3 (crossings < 100 m ignored, gravel-aware)
  10 / 86 / 11; rules v5 (per-chunk trace, names, positions) 11 / 91 / 5 —
  the compromises are real kilometres of primary road. Tracing (2026-09-23
  evening) is per chunk with a profile chain — discipline profile → trekking
  → permissive `loops-trace` (scripts/routing/profiles, uploaded by the app
  itself once per instance) — so any track can be measured as ridden.
  FINDING: the ten Girona routes from scripts/build-all-girona-gpx.mjs were
  car-routed (OSRM demo /cycling = car profile; autovías). Eight were
  redesigned from researched landmarks (sanctuary/col/summit elevations
  confirmed on the engine) → src/data/hub-bundles/girona-rebuild.json;
  /admin → Routes → "Rebuild Girona tracks (10)" (replaceRouteTrack by name
  within Spain; also rewrites the description where the ride changed).
  Empordà Plain starts at Flaçà station — every Ter crossing out of Girona
  to the plain is a main road under loops-road.
  Mare de Déu del Mont is a declared summit out-and-back (47 % retrace).
  Karoo (US) has no map data. The iconic Canary/Balearic climbs
  are OSM "primary" (TF-21 Teide 43 km, GC-60 Fataga 42 km) with no traffic
  estimate or maxspeed in the engine data, so no automatic rule separates
  them from busy N-roads. LIBRARY_ROAD_POLICY (constants.ts) is the owner
  switch: "name" (default: offer in Generate with the compromise named,
  clean loops rank first) | "enforce" (drop from Generate). Recommendation
  on record: keep "name". Traces re-run when ROAD_RULES_VERSION changes.
- Smoke suite (tests/smoke.spec.ts, `PW_SANDBOX=1 npm run smoke` here) is
  the live-site check; sweep (`npm run sweep`) is the generation check
  (14/14 on 2026-09-23 13:08).
- v1 is ROAD ONLY (owner, 2026-09-23): ENABLED_DISCIPLINES = ["road"] in
  constants.ts. Gravel/MTB asks are planned as road with a notice ("LOOPS
  plans road rides for now…"); pickers hidden; lists, collections, sitemap
  and library matching show road only (db.ts gates spell 'road'). Gravel/MTB
  data stays in the DB for later.
- Track integrity (src/lib/track-shape.ts): every stored track is measured
  (loop / lollipop / out-and-back, retrace %, gaps). "Loop" > 50 % ridden
  twice or a > 2 km gap = broken: banner, hidden from lists, never offered.
  Verified redesigns (src/data/hub-bundles/girona-rebuild.json, and
  library-corrections.json: Cap Formentor and Rocacorba as there-and-back
  rides, 2026-09-24) replace the stored track on first view
  (src/lib/bundle-corrections.ts). No "Verified" badge on a point-to-point
  or broken track. Imported names read cleaned (tidyRouteName in
  public-route.ts: grade tags, Majorca → Mallorca); /admin "Tidy library
  data" stores the same.
- Strava connect/import HIDDEN for v1 (STRAVA_IMPORT_ENABLED=false in
  constants.ts): production Strava app credentials were never set up; the
  "Open in Strava" button is hidden too (Strava's upload page is for
  recorded activities, not planned routes). Komoot button opens Komoot's
  GPX import (komoot.com/upload).
- Destination rides (owner rule 2026-09-23: "Pollença to Cap de Formentor and
  back" must work — a cape/summit with one road is an exception to the
  out-and-back rule): parseDestination (route-intent.ts) → resolveDestination
  (known places → bundled towns → geocoder bounded around the start; houses/
  shops ignored; known place > 90 km → "too far") → generateDestinationRides
  (route-generator.ts): out, a different road home when one really exists
  (measured shared < 50 %), plus the same road back. Labels are measured, never
  assumed. Road Standard applies (compromises named; motorway/unpaved decline).
- Intervals (owner 2026-09-23: "4x4 VO2 from Clontarf → all 4 on Howth hill"):
  parseBasicWorkout (route-intent.ts) parses sessions without the model; the
  rider's ride length wins over the session length. Generate asks "OK to
  repeat your efforts on the same stretch?" (repeat_efforts, default yes).
  Yes → generateRepeatWorkoutRoutes: VO2/anaerobic seek a hill (src/data/
  hills.json = GeoNames + OSM peaks, scripts/anchors/build-hills.mjs; summit
  ROAD found via a trekking route), loops aimed at it / via a same-side town,
  else out to the climb and home; effort-repeats.ts finds the best stretch
  (gradient, steadiness, effort-grade roads, light traffic = engine
  estimated_traffic_class ≤ 3, no junction with a road of class ≥ 3
  (estimated_crossing_class), ≤ 2 quiet side lanes per km, no lights/stop/
  give-way/junction turn — engine NodeTags/TurnCost, direction-aware) and splices
  the reps in; long flat efforts may be laps of a quiet flat stretch.
  No → one different stretch per rep on the loop pipeline's loops.
- Rider-proven routes (owner 2026-09-24; rules in src/lib/ride-check.ts):
  saving a route (or taking its GPX) books a check-in for the next day —
  "Did you ride it? How was it (1–5)?" — asked by the in-app card
  (RideCheckCard), web push (dormant until NEXT_PUBLIC_VAPID_PUBLIC_KEY +
  VAPID_PRIVATE_KEY [+ VAPID_SUBJECT]) or email via Resend (daily cron
  /api/cron/ride-checks, vercel.json; needs CRON_SECRET). A rider-saved
  route is offered to others (quality_status approved, community_status
  'proven') only when its creator rode it and rated it 4+ AND it is a
  training loop (ends ≤ 1 km apart, ≥ 20 km, ≤ 40 % retrace, sound track)
  AND its road report passes the serving policy; 3+ ratings averaging
  < 3.5 drop it. Offered routes carry "Ridden and rated ★ x by n LOOPS
  riders" — never a name.
- Beehiiv (src/lib/beehiiv.ts): opted-in signups subscribe (+ enrol in
  BEEHIIV_AUTOMATION_ID, the autoresponder) once BEEHIIV_API_KEY +
  BEEHIIV_PUBLICATION_ID are set; /admin → "Check Beehiiv" and "Send
  opted-in riders to Beehiiv" (backfill).
- Rider-journey pass (2026-09-24, six personas + triage + 3 fixers, merged):
  basic parser reads loops-to-self, qualifiers ("Laragh, Co. Wicklow"),
  "from my hotel in X", places without "from", named climbs/café stops as
  destinations, typos (fuzzy known places), negated hills, number words;
  Canaries added to places-eu.json; effort stretches report side roads from
  a map lookup (no claim when it fails); loops-road/relaxed profiles cost
  quiet secondary roads (traffic class ≤ 3) 1.5× not 3× — needs
  POST /api/engine/sync-profiles (admin) after deploy.
- Coastal/headland starts (2026-09-24): when pass 1 keeps no loop, a
  lollipop runs alongside pass 2 (lollipopRides: stem to an inland town whose
  road is direct, full-pipeline loop from it, same stem home; said on the
  card, never titled "loop"). Galway/Maspalomas served; Sóller declines
  honestly (only main roads out). Destination + asked distance: loops OVER
  the place (loopsOverDestination) built in parallel with there-and-back.
- Owner decisions 2026-09-24: (1) routes with no road report are hidden from
  every list and suggestion (SQL gate road_report IS NOT NULL) — measured by
  the daily cron /api/cron/measure and /admin "Measure unmeasured routes";
  (2) Draw on phones: one-row header, nav in a menu; (3) weak names ("Sunday
  Social") → start – far point – end · km (isWeakName, renamed on open and by
  "Tidy library data"); (4) main roads near the start/finish are used however
  long when unavoidable (named), never motorways or roads closed to bikes —
  see the road-standard spec.
- Admin access: users.role = 'admin'. Grant it with ADMIN_EMAILS (Vercel env,
  comma-separated; applied at sign-in and by requireAdmin, then stored) or
  from /admin → Users → "Make admin" / "Remove admin" (you cannot remove
  your own). anthony@roadmancycling.com is admin (set 2026-09-24).
- Routing profiles: after a profile change is deployed, /admin → "Sync
  routing profiles" (POST /api/engine/sync-profiles) updates the engine's
  custom ids in place (BROUTER_ROAD_PROFILE / BROUTER_ROAD_RELAXED_PROFILE are
  set on Vercel since the first sync, 2026-09-24).
- Dublin & Wicklow designed loops (2026-09-24): 16 loops (Clontarf ×3, Howth,
  Malahide, Skerries, Naul, Rathfarnham ×3, Enniskerry ×2, Bray, Greystones,
  Lucan, Kilcullen) routed on our engine, all meet the Road Standard →
  src/data/hub-bundles/dublin-designed.json; /admin → Routes → "Import Dublin
  & Wicklow loops" (insert, approved; skips names that exist).
- Rules v9 (2026-09-24): access=no + bicycle=yes/designated is a cycle path
  bikes may use (it was flagged "bikes not allowed"). Profiles: foot-only ways
  (push the bike) cost 40× not 5× — needs /admin → "Sync routing profiles".
- No CSRF tokens; cookie-only sessions; locale hardcoded en-IE

## Conventions
- Server components by default; "use client" only when needed
- DB queries only in src/lib/db.ts
- Route parsing through src/lib/route-parser.ts
- API responses: `{ data: T } | { error: string, code: string }`
- Build-time DB access must fail soft (try/catch → degraded render)
