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
  second pass if < 2 loops. Per-phase timings are logged (`timings`).
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
- Ride verdict (src/lib/ride-wind.ts): weather card says what wind/rain do
  to THIS loop for the hours of the ride; never suggests reversing a loop
  (start point decides out/home balance under steady wind).
- Group-ride links: /ride/<id>?t=YYYY-MM-DDTHH:MM&m=<meet>; share sheet
  forwards the same ride; email sign-in stores the return path with the
  token (works from Gmail/Outlook in-app browsers).
- GPX access is one switch: GPX_ACCESS in src/config/constants.ts
  ("signed-in" default | "ride-links" | "everyone"); copy derives from it.
- Library Road Standard tally (2026-09-23, rules v2, 107 routes): 8 meet,
  86 carry named compromises, 13 unknown. The iconic Canary/Balearic climbs
  are OSM "primary" (TF-21 Teide 43 km, GC-60 Fataga 42 km) with no traffic
  estimate or maxspeed in the engine data, so no automatic rule separates
  them from busy N-roads. LIBRARY_ROAD_POLICY (constants.ts) is the owner
  switch: "name" (default: offer in Generate with the compromise named,
  clean loops rank first) | "enforce" (drop from Generate). Recommendation
  on record: keep "name". Traces re-run when ROAD_RULES_VERSION changes.
- Smoke suite (tests/smoke.spec.ts, `PW_SANDBOX=1 npm run smoke` here) is
  the live-site check; sweep (`npm run sweep`) is the generation check
  (14/14 on 2026-09-23 13:08).
- No CSRF tokens; cookie-only sessions; locale hardcoded en-IE

## Conventions
- Server components by default; "use client" only when needed
- DB queries only in src/lib/db.ts
- Route parsing through src/lib/route-parser.ts
- API responses: `{ data: T } | { error: string, code: string }`
- Build-time DB access must fail soft (try/catch → degraded render)
