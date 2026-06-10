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
    route-quality.ts     # 10-factor 0-100 scoring via Overpass
    route-rules.ts       # Hard guardrails (auto-reject)
    wind.ts              # Wind forecast + bearing alignment ("tailwind home")
    interval-segments.ts # Workout segment detection
    interval-validation.ts
    intensity.ts         # Zone definitions
    db.ts                # All database queries (single source of truth)
    gpx.ts fit.ts tcx.ts ridewithgps.ts route-parser.ts
scripts/
  import-routes.mjs      # Manifest → DB importer (supports --dry-run, RWGPS URLs)
  hub-data/*.json        # Route manifests for all 10 launch destinations
tests/                   # Playwright suite
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
npx playwright test tests/loops-comprehensive.spec.ts --project=chromium
node scripts/import-routes.mjs scripts/hub-data/girona-eat-sleep-cycle.json --dry-run
```

## Known Technical Debt / Open Items
- DB credential leaked in git history (removed from files) — MUST be
  rotated in the Vercel/Neon dashboard
- Anchor-first session assembly (spec §3) — current flow is route-first
  with segment validation; anchor-first is the upgrade
- Garmin Connect API push + Whisper voice fallback — need external
  accounts/keys
- Golden route test suite (spec §6) not yet wired into CI
- BRouter public demo is rate-limited — set BROUTER_URL before launch
- Gran Canaria manifest has 7 routes (bar is 8)
- No CSRF tokens; cookie-only sessions; locale hardcoded en-IE

## Conventions
- Server components by default; "use client" only when needed
- DB queries only in src/lib/db.ts
- Route parsing through src/lib/route-parser.ts
- API responses: `{ data: T } | { error: string, code: string }`
- Build-time DB access must fail soft (try/catch → degraded render)
