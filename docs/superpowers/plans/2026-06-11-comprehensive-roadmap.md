# LOOPS Comprehensive Roadmap — Function + Layout

**Date:** 2026-06-11 · **Author:** COO · **Authority:** ORG.md hierarchy
**Trigger:** CEO verdict — "so much wrong, from function to layout; too
vibe-coded." Dept-audited (PRODUCT, QUALITY, EXPERIENCE) per standing
priority #2. Evidence is file paths and line numbers, not vibes.

---

## 1. Executive summary — the 5 things that matter most

1. **Mobile users can't find the product.** Both planning entry points —
   "Plan" (→ /generate) and "Draw a route" (→ /plan) — are `hidden
   sm:inline-flex` in the homepage header
   (`src/app/_components/HomeClient.tsx:322,332`). ORG.md says 375px is
   the primary viewport; at 375px the two core value-prop buttons do not
   exist. The flagship features are invisible on the device most riders use.

2. **2,700 lines of core pipeline have zero tests and zero CI.**
   `src/lib/route-generator.ts` (1,314 lines) and
   `src/lib/route-quality.ts` (1,430 lines) have no unit tests
   (`src/lib/__tests__/` covers climb-detection, elevation, session-assembly,
   wind, intensity — not these two). There is **no `.github/` directory at
   all**: no lint, no tsc, no test, no build runs on any push. Every
   regression ships silently.

3. **Generation can hang or quietly degrade.** Anthropic call has no
   explicit timeout (`src/lib/route-intent.ts` ~400-425, SDK default ~10
   min); Overpass concurrency queue has an unbounded wait
   (`src/lib/route-quality.ts:284-286`); BRouter returns silent `null` on
   timeout with no retry (`src/lib/route-generator.ts:302`) and the
   production config still points at the rate-limited public demo unless
   `BROUTER_URL` is set; Overpass failure falls back to neutral scores
   (`route-quality.ts:1323-1332`) so bad data looks like a real score.
   `scoreSafety` is a brute-force triple loop (`route-quality.ts:621-651`)
   that bypasses the existing `SegmentGrid` index — millions of distance
   calcs per route.

4. **There is no design system, only five hand-rolled pages.** Homepage
   header is bespoke JSX inside `HomeClient.tsx:313-397`; `/login` is a
   second full 573-line marketing landing page with its own header and
   footer (`src/app/login/page.tsx:183,543`); `/cycling/[destination]`
   rolls its own header (`page.tsx:51-73`); `/generate` (1,115 lines) and
   `/plan` have **no header and no link back to home** — dead ends.
   Terminology contradicts itself: the button labelled "Plan" goes to
   /generate while /plan is labelled "Draw a route"
   (`HomeClient.tsx:320-339`). Styling is inline `style={{}}` CSS-var
   objects mixed with Tailwind classes throughout.

5. **The ORG.md gates have never actually run.** One merged PR in repo
   history (#1, `ce3dff1`, 2026-05-29). All ~60 commits since 2026-06-09
   went directly to `claude/loops-launch-spec-vkwk3k` with no review,
   including multi-concern swarm commits (`8466c54`
   "fix(climbs+journeys+polish)", 16 files; `d8cb826` "full-product
   troubleshoot" mixing crash pages, feature flags, LLM resilience and a
   scoring rewrite). The leaked DB credential (CLAUDE.md known debt) is
   still unrotated. This is the "vibe-coded" root cause.

---

## 2. NOW (this week) — 8 items

### N1. Rotate the leaked DB credential — Owner: QUALITY BM + CEO (dashboard action)
- **User:** every user; their data sits behind a credential in git history.
- **Problem:** Neon/Vercel Postgres credential leaked in history; flagged in CLAUDE.md since 2026-06-09, still live.
- **Change:** Rotate in the Neon/Vercel dashboard, update `.env.local`/Vercel env, confirm old credential dead.
- **Risk:** Brief downtime if env not updated everywhere; mitigate by staging the swap.
- **Verification:** Old connection string rejected; `npm run build` + a live page load against the new credential.

### N2. Planning entry points visible at 375px — Owner: EXPERIENCE / Mobile-first UI
- **User:** mobile rider opening loops.ie for the first time.
- **Problem:** "Plan" and "Draw a route" are `hidden sm:` (`src/app/_components/HomeClient.tsx:322,332`); core features unreachable on the primary viewport.
- **Change:** Mobile-visible nav (bottom bar or compact header icons) exposing Plan/Draw/Library at 375px.
- **Risk:** Header crowding; resolve with icon+label bottom nav rather than cramming the top bar.
- **Verification:** Playwright render check at 375/768/1440 — entry points visible, ≥40px tap targets, zero overflow (ORG gate 3).

### N3. One shared Header; no dead-end pages — Owner: EXPERIENCE / Journeys
- **User:** anyone navigating between home, generate, plan, destination and route pages.
- **Problem:** Four bespoke headers (`HomeClient.tsx:313`, `login/page.tsx:183`, `cycling/[destination]/page.tsx:51-73`) and two pages with none — `/generate` and `/plan` have no link back to `/` (verified by grep: zero `href="/"` in `src/app/generate/page.tsx`, `src/app/plan/PlanClient.tsx`).
- **Change:** Extract `src/components/Header.tsx` (logo, Plan, Draw, Library, auth) and mount it on every page; one Footer (exists: `src/components/Footer.tsx`).
- **Risk:** Sticky-header/map z-index conflicts on Leaflet pages; test on /plan and /generate explicitly.
- **Verification:** Every top-level route renders the shared header; Playwright nav loop home→generate→plan→route→home with no dead end.

### N4. CI pipeline — Owner: QUALITY / Code Review
- **User:** every future contributor (human or agent); the CEO's trust.
- **Problem:** No `.github/workflows/` exists; gates 2 and 5 of ORG.md are unenforceable; regressions ship undetected.
- **Change:** `.github/workflows/ci.yml` on push+PR: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` (all already pass locally per CLAUDE.md).
- **Risk:** Build needs fail-soft DB behaviour — already in place (`e957a38`); golden suite stays out of CI until key handling decided.
- **Verification:** Green check on this branch; a deliberately broken commit on a scratch branch goes red.

### N5. Unit tests for route-generator + route-quality — Owner: QUALITY / Verification
- **User:** every rider served a generated route; the score must mean something.
- **Problem:** Zero tests on `src/lib/route-generator.ts` (1,314 lines) and `src/lib/route-quality.ts` (1,430 lines); fallback paths (Overpass-fail → neutral scores at `route-quality.ts:1323-1332`, BRouter null at `route-generator.ts:302`) are completely unverified.
- **Change:** Vitest suites with mocked BRouter/Overpass/Open-Meteo covering `scoreRoute` normalisation, `scoreSurface`/`scoreSafety`, the failure fallbacks, and `routeViaBRouter` retry behaviour.
- **Risk:** Mock drift from real API shapes; pin fixtures from recorded live responses.
- **Verification:** `npm test` covers both files; failure-path assertions (Overpass down ⇒ flagged low-confidence, not a clean neutral score).

### N6. External-service hardening + scoreSafety perf — Owner: QUALITY BM
- **User:** rider mid-generation; today a slow upstream means a hung or silently degraded result.
- **Problem:** No Anthropic timeout (`route-intent.ts` ~400-425); unbounded Overpass queue wait (`route-quality.ts:284-286`); BRouter no retry/backoff and no `BROUTER_URL` startup validation (`route-generator.ts:287-347`); `scoreSafety` O(n³) brute force (`route-quality.ts:621-651`).
- **Change:** `AbortSignal.timeout(5000)` on the Claude call with regex-parser fallback; 10s max queue wait + distinct "API down" vs "no coverage" states; BRouter exponential backoff + boot-time warning when on the public demo; reuse `SegmentGrid` (already built, `route-quality.ts:228`) inside `scoreSafety`.
- **Risk:** Tighter timeouts may fail requests that would have eventually succeeded; tune from logged latencies.
- **Verification:** New unit tests for each failure mode (N5); before/after timing of `scoreSafety` on a 100km route.

### N7. One coherent planning story (naming + homepage IA) — Owner: PRODUCT / Planning & Generation, with EXPERIENCE
- **User:** new rider deciding in 10 seconds whether LOOPS beats Komoot.
- **Problem:** "Plan" button goes to /generate, "Draw a route" to /plan (`HomeClient.tsx:320-339`); "Share Loop" means upload; "loops" vs "routes" drift; `/login` duplicates the landing pitch (573 lines) while the homepage leads with a feed + filters rather than Komoot-style plan/search-first; both "Log in" and "Sign up" hit the same `/login`.
- **Change:** Naming decision (suggest: "Describe a ride" = /generate, "Draw on map" = /plan, under one "Plan" hub); homepage hero leads with the two planning CTAs above the library feed; demote `/login` to a plain auth page, keep one marketing surface.
- **Risk:** SEO copy on /login currently does landing duty — move it, don't delete it.
- **Verification:** Click-count audit: new user to first planned route ≤ 2 clicks from `/`; terminology grep shows one term per concept.

### N8. Ship the library: import manifests, fill gaps — Owner: PRODUCT / Library & Destinations
- **User:** rider browsing a destination expecting a credible, complete route set.
- **Problem:** Manifests are dry-run validated but library depth is uneven: `scripts/hub-data/gran-canaria.json` has 8 now but `calpe.json` 6 + `calpe-rwgps.json` 3, `dublin.json` 4; cover photos/descriptions sparse vs Komoot collections.
- **Change:** Run `scripts/import-routes.mjs` for all 10 manifests against prod (post-N1 rotation), reconcile Calpe duplicates, fill `cover_photo`/`description` on the 8-route bar destinations.
- **Risk:** Importing before credential rotation re-exposes the DB — hard dependency on N1.
- **Verification:** `/cycling/<slug>` shows ≥8 verified routes with photos for all 10 launch slugs; importer logs clean.

---

## 3. NEXT (this month) — one-liners

1. Garmin Connect activation: owner applies for Training API key, then one real-Edge sandbox push test (`docs/superpowers/plans/garmin-connect-setup.md`; code dormant in `src/components/SendToGarmin.tsx` + `src/app/api/garmin/`).
2. Decompose `src/app/generate/page.tsx` (1,115-line client monolith) into testable components; same for the 573-line `login/page.tsx` once N7 lands.
3. Route editor polish: undo, save-edited-route to library, re-score quality on save (`src/components/RouteEditor.tsx`, komoot-rival roadmap #2).
4. Bulk GPX/RWGPS import UI for Komoot refugees — parsers already exist (`src/lib/gpx.ts`, `ridewithgps.ts`); cheapest acquisition channel.
5. Wind-painted route polyline on the map (myWindsock-style); `src/lib/wind.ts` already computes the data.
6. Itemised 10-factor quality breakdown on `/routes/[id]` pages instead of one opaque number.
7. Golden route suite: 30 → 100 cases and wire into CI behind a secrets-gated job (`npm run golden`).
8. Design tokens: replace inline `style={{}}` CSS-var objects with Tailwind 4 theme tokens; one button/spacing/typography scale (drift visible across `HomeClient.tsx`, `generate/page.tsx`, `login/page.tsx`).
9. Wahoo Cloud API push (OAuth2, reuse the Garmin component pattern).
10. Security pass: CSRF tokens, session hardening, locale un-hardcode (en-IE) — known debt in CLAUDE.md.

---

## 4. LATER (parked)

- Offline route sheet / PWA tile caching for the active route.
- Photo-first destination collections + "import all 8 to your Garmin".
- /pricing trust page — blocked on an owner decision about the model.
- Whisper voice fallback (needs external account/keys).
- PostGIS road intelligence layer (planned in stack notes, not launch-blocking).
- Social features un-hide (`SOCIAL_FEATURES_ENABLED`, spec §7 — post-launch by decision).
- Explicitly NOT doing (per komoot-rival roadmap): Strava-style heatmap, turn-by-turn nav, native apps.

---

## 5. Org notes — which gates failed, and enforcement

**Evidence of historical gate failure:**
- **Gate 2/5 (build/ship automation):** no `.github/` directory exists —
  nothing has ever run automatically. Confirmed by `ls .github` →
  "No such file or directory".
- **Gate 4 (author ≠ reviewer):** exactly one merged PR in history
  (#1, `ce3dff1`, 2026-05-29). Every commit since the 2026-06-09 spec —
  ~60 of them — went directly to `claude/loops-launch-spec-vkwk3k`
  unreviewed.
- **Gate 1 (5-line spec before code):** multi-concern commits show
  spec-less batching: `8466c54` "fix(climbs+journeys+polish): swarm round
  two" (16 files), `d8cb826` "full-product troubleshoot — crash pages,
  dead feature flag, LLM outage resilience, 10x scoring speedup" (four
  unrelated concerns in one diff).
- **Gate 3 (browser check at 375/768/1440):** the Komoot roadmap itself
  records shipping the route editor "needs an on-device browser pass
  before launch since the sandbox can't render Leaflet"
  (`docs/superpowers/plans/2026-06-10-komoot-rival-roadmap.md:26`) — and
  the 375px header regression in `HomeClient.tsx:322,332` proves no
  mobile render gate ran on the homepage either.

**What the COO enforces from next session:**
1. All work lands via PR with gates 1-4 evidenced in the body; no direct
   pushes to the working branch. CI (N4) becomes a required check.
2. One concern per PR. "Swarm" batches are split before review.
3. A reviewer agent distinct from the author reads every diff; the COO
   spot-checks that review actually happened (comment trail in the PR).
4. Every UI PR carries a 375/768/1440 Playwright render artifact; mobile
   regressions are an automatic block.
5. Each session starts by re-reading ORG.md + this roadmap, picks from
   NOW in order, and updates this file with evidence (commit SHAs, test
   output), not claims.
