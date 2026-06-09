# LOOPS Launch Build — Delivery Plan

**Responds to:** `docs/superpowers/specs/2026-06-09-loops-launch-build-spec.md`
**For:** Anthony Walsh, Roadman Cycling
**Date:** 2026-06-09
**Status:** Dev team response — timeline, sequencing, resourcing, spike plan
**Update 2026-06-09:** Anthony's decisions received — see "Decisions received"
addendum at the end of this document. The validator-partner model in Section 1
is superseded by `2026-06-09-route-sourcing-validation.md`.

---

## TL;DR

- We are **not starting from scratch**. The codebase already ships a working
  voice → Claude intent parser → candidate generation → guardrails → quality
  scoring → library-first pipeline, plus interval segment detection with unit
  tests. Roughly 40% of Sections 2–4 of the brief exists in first-cut form.
- The four genuinely new builds are: **(1)** the validator/destination data
  model + admin tool, **(2)** the PostGIS road intelligence layer, **(3)** wind
  optimisation in generation, **(4)** anchor-first session assembly with
  course-point export and Garmin Connect integration.
- The **critical path is not engineering** — it's validator partner
  recruitment (10 destinations × 8 routes each, externally signed off) and
  Garmin Connect API programme approval. Both start week 1.
- **Estimated timeline: 12 weeks to launch gate** with 3 engineers. Detail in
  Section 4.
- **Routing engine spike:** the comparison must be run on self-hosted
  instances against Ireland + Mallorca OSM extracts — that's a week-1 task on
  real infrastructure, so the *result* is not in this document. Section 3
  gives the spike protocol, the evaluation rubric, and a provisional
  recommendation. One material fact the brief missed: production code already
  routes via **BRouter**, so the spike is three-way (GraphHopper vs Valhalla
  vs incumbent BRouter), and migration cost counts in the decision.
- Four decisions need Anthony's call before week 2 — Section 5.

---

## 1. Gap analysis — what exists today vs the brief

### Already built (and tested)

| Brief requirement | Current implementation | State |
|---|---|---|
| Voice capture | `src/lib/useVoiceInput.ts` — browser SpeechRecognition, wired into `/generate` | Working; no Whisper fallback yet |
| Claude constraint parsing | `src/lib/route-intent.ts` — NL → `RouteSpec` incl. workout parsing, geocoding, duration→distance via rider speed | Working; schema needs extending (see gaps) |
| Rider-speed-aware duration conversion | Discipline × terrain speed lookup scaled by user `avg_speed_kmh` | Matches brief intent ("never assume 30km/h") |
| Candidates + scoring, never single-shot | `route-generator.ts`: N waypoint sets → BRouter → validate → score → top 3 ranked | Working |
| Hard guardrails | `route-rules.ts` — auto-reject validation pass | Working; needs audit against the brief's exact list |
| Quality scoring | `route-quality.ts` — 10-factor 0–100 score via live Overpass/OSM queries, with confidence + coverage warnings | Working but slow and rate-limited (see gaps) |
| Library-first matching | `route-library.ts` — verified routes beat fresh generation above a 75-point threshold | Matches the brief's "curated overlap" philosophy |
| Interval segment detection | `interval-segments.ts` + `interval-validation.ts` — length-at-zone-speed, gradient window, variance cap, bearing-change junction proxy | Working, unit-tested |
| "Show me another" without regeneration | Top-3 ranked candidates returned per generation | Working |
| Honest decline states | Generator returns quality tiers and refusals below `QUALITY_FLOOR` | Partial — copy/UX pass needed |
| Open-Meteo integration | Weather display per route + elevation backfill | Exists, but **not used in generation** |
| Destination content | 6 SEO guide pages: Girona, Mallorca, Dublin, Wicklow, Calpe, Tenerife (`src/content/destinations.ts`) | Content only — no curated library data model |
| Unit tests | intent, intervals, library matching, intensity, climbs, rate-limit | Exists; no golden-route suite, no utterance harness |

### Gaps (the actual build)

1. **Curated library system (Section 1)** — entirely new: `destinations`,
   `validator_partners`, `route_validations` tables; route versioning with
   immutable GPX per version; revalidation lifecycle (`validated` →
   `needs_review` on expiry); mobile-friendly no-login validator checklist
   tool; route pages showing validator badge, surface profile bar, traffic
   rating, café stops, hazards. The existing `routes` table and route pages
   are the starting point but need the destination/validation columns.
2. **Road intelligence layer (Section 4)** — new PostGIS `road_segments`
   schema + seeding tooling (OSM import per destination bounds, validator
   markup, manual review queue). Today's quality scorer queries Overpass live
   per generation: fine for a prototype, wrong for production (latency, rate
   limits, non-determinism). The intelligence layer makes scoring a local DB
   lookup inside the 10 destination bounds.
3. **Wind (Section 2)** — new in generation: forecast at ride window (not
   now-cast), sampled at 3+ points per candidate, return-leg bearing
   distribution vs wind direction as a scoring factor, `wind_strategy` added
   to the constraint schema, honest no-op below 8 km/h. Open-Meteo client
   patterns already exist to build on.
4. **Anchor-first session assembly (Section 3)** — the current flow is
   route-first (generate candidates, then check whether segments fit). The
   brief demands anchor-first: query qualifying segments within range, then
   build warm-up/recovery/cool-down around them. This requires the
   intelligence layer (junction + road-class data per segment) and is the
   single hardest engineering item. The existing segment detector becomes the
   qualifier; the assembler is new.
5. **Junction truth** — current junction detection is a bearing-change proxy.
   The brief's "zero traffic lights, stop signs, yield-onto-major" needs real
   OSM node data (highway=traffic_signals/stop/give_way), which lands in the
   intelligence layer.
6. **Head-unit handoff (Sections 3, 5)** — course points in GPX export (new),
   Garmin Connect Courses API push (new, requires developer programme
   approval — **lead time, apply week 1**), Wahoo integration, and the
   physical device test matrix.
7. **Voice hardening (Section 2)** — server-side Whisper fallback,
   one-line confirmation + voice-correction UX, 200-utterance accent test
   harness, structured-form fallback on parse failure.
8. **Constraint schema deltas** — current `RouteSpec` lacks
   `wind_strategy`, `traffic_preference`, `cafe_stop`, explicit
   `duration_tolerance`; mapping from the brief's schema is straightforward.
9. **Launch gate machinery (Section 6)** — golden route suite (100 pairs) in
   CI, generation logging corpus (route + score breakdown + rider action),
   rider beta tooling (route assignment, rating capture), performance
   budgets.
10. **Destination coverage** — 4 of 10 proposed destinations have no presence
    at all yet: Nice, Lucca, Lake Garda, Annecy, Flanders (and Dublin/Wicklow
    is currently two pages, so the count depends on the final 10).

---

## 2. Discrepancies between the brief and the live product — need decisions

1. **Stack.** The brief says Next.js 15 + Supabase + pgvector. Loops in
   production is **Next.js 16 + Vercel Postgres + Vercel Blob**, live at
   loops.ie with auth, uploads, messaging and a route library. Migrating to
   Supabase buys nothing the product needs — PostGIS is available on the
   current Postgres. **Recommendation: stay on the current stack; treat
   "hard technical reason" as satisfied by the existing production system.**
2. **Out-of-scope conflicts.** Section 7 excludes social features and public
   comments/ratings — but comments, star ratings, condition reports,
   messaging and follows are already shipped. **Recommendation:** keep them
   login-gated (they already are) and remove them from curated destination
   route pages at launch so the launch surface matches the brief; don't
   delete working code.
3. **Routing engine incumbency.** The brief assumes GraphHopper vs Valhalla.
   Production already uses BRouter (cyclist-built, elevation-aware,
   self-hostable). The spike must be three-way — see Section 3.
4. **Strava.** The brief's heatmap warning is already respected — we use
   Strava only for rider-authorised activity import, which also feeds the
   rider speed profile. No change needed; flagging for completeness.

---

## 3. Routing engine spike — protocol and provisional recommendation

**Honesty first:** the spike result is not in this report. A credible
comparison requires self-hosted GraphHopper and Valhalla instances with
Ireland and Mallorca OSM extracts, graph builds, and a few hundred timed
generation runs — that is the week-1 task on real infrastructure, not
something to fabricate in a planning document.

### Protocol (5 working days, 1 engineer)

- **Day 1:** Provision one VM; download `ireland-and-northern-ireland` and
  `spain/islas-baleares` extracts from Geofabrik; build graphs for
  GraphHopper (custom model: penalise primary+, reward quiet/tertiary,
  surface weights) and Valhalla (bicycle costing, equivalent tuning). Stand
  BRouter up beside them with the existing production profile.
- **Days 2–3:** Run the candidate-generation workload through all three:
  50 round-trip requests per engine per region across 30/60/100/160 km
  targets and varied headings. Capture: round-trip support quality, route
  geometry against our existing quality scorer, p50/p95 latency, memory
  footprint, graph build time.
- **Day 4:** Manual review of 20 routes per engine per region by someone who
  knows the roads (Anthony for Dublin/Wicklow; validator partner candidate
  for Mallorca). Score against the hard guardrails.
- **Day 5:** Write the spike report against the rubric below; decision
  meeting.

### Decision rubric (weighted)

| Criterion | Weight | Why |
|---|---|---|
| Round-trip candidate quality (loop shape, no out-and-backs) | 30% | This is the candidate generator for the whole product |
| Custom-model expressiveness (road class, surface, gradient, **our** quietness scores) | 25% | The intelligence layer must be able to drive routing, not just scoring |
| Latency at 15–30 candidates/request | 20% | 12s p95 budget end-to-end |
| Ops burden (graph build, memory, update cadence for 10 regions) | 15% | Small team |
| Migration cost from BRouter | 10% | Incumbent advantage is real but shouldn't dominate |

### Provisional view (to be confirmed or overturned by the spike)

GraphHopper is the likely winner on paper: its custom models can consume
per-segment weights from our intelligence layer (encoded values via custom
areas/priority), and its round-trip algorithm is a true candidate generator.
Valhalla's dynamic costing is comparable but heavier to operate. BRouter
remains a credible fallback and stays in production until the replacement
beats it on the rubric — we migrate behind the `route-generator.ts`
orchestrator interface, so the swap is contained to the routing call.

---

## 4. Timeline and sequencing — 12 weeks to launch gate

Assumes 3 engineers (see resourcing), Anthony driving partner/content work in
parallel. Engineering weeks below; external dependencies marked ⚠.

### Week 1 — Decisions and long poles
- Routing engine spike (Section 3) — *Eng C*
- ⚠ Garmin Connect developer programme application (approval can take weeks)
- ⚠ Validator partner outreach begins for all 10 destinations (longest pole
  in the whole plan — 80+ validated routes needed by week 10)
- Anthony confirms: final 10 destinations, stack decision, Section 7
  conflicts (Section 5 of this doc)

### Weeks 2–4 — Foundations
- Curated library data model + migrations (`destinations`,
  `validator_partners`, `route_validations`, route versioning) — *Eng A*
- Validator checklist tool (mobile, tokenised links, no login) + admin
  validation workflow incl. `revalidation_due` lifecycle — *Eng A*
- PostGIS road intelligence schema + OSM seeding pipeline per destination
  bounds; manual-review queue UI — *Eng C*
- Constraint schema extension (`wind_strategy`, `traffic_preference`,
  `cafe_stop`) + parser updates + utterance test harness scaffold — *Eng B*
- Wind module: forecast-at-ride-window client, candidate bearing-distribution
  scoring, summary copy ("Wind SW 18km/h…") — *Eng B*

### Weeks 5–7 — Core engineering
- Routing engine productionisation per spike decision; custom profile driven
  by intelligence-layer weights; destination-constrained generation — *Eng C*
- Guardrail audit: every item in brief §4.3 mapped to a test (motorways,
  sliproads, access tags, unpaved-on-road, ferries, fake loops, `avoid`) —
  *Eng C*
- Anchor-first session assembler: segment query within range → loop built
  around efforts → warm-up/recovery/cool-down placement → explicit decline
  with alternatives — *Eng B*
- Course points in GPX export; Garmin Connect Courses push; Wahoo route
  sync — *Eng A*
- Curated route pages: validator badge, surface bar, traffic rating, café
  stops, hazards; 1.5s/4G performance budget — *Eng A*

### Weeks 8–9 — Quality machinery
- Golden route test suite (100 prompt → expected-properties pairs) wired into
  CI as a release blocker — *Eng B/C*
- 200-utterance voice test set (Irish/British/American/Australian accents,
  corrections) + Whisper fallback + structured-form parse-failure fallback —
  *Eng B*
- Generation logging corpus (route, score breakdown, rider action) — *Eng C*
- Rider beta tooling: route assignment + rating capture — *Eng A*
- Device matrix round 1: Edge 540/840/1050, ROAM/BOLT, Karoo course-point
  behaviour ⚠ (hardware needed) — *all*

### Weeks 10–12 — Beta and launch gate
- ⚠ 25-rider beta (NDY + Clubhouse) across ≥4 destinations; fix cycles
- ⚠ Validator sign-off completion: 8+ routes × 10 destinations
- Resilience tests (wind API down, router timeout, parse failure)
- Performance: generation p95 < 12s, curated page p95 < 1.5s on 4G
- ⚠ Solicitor review of disclaimer + validator agreements
- Launch gate report against brief Section 6

**Slip risks, in order:** validator route validation throughput (mitigate:
stagger destinations, launch-gate on 10 but start outreach with the 6 we
already have content for), Garmin API approval (mitigate: raw GPX download +
"send to device" instructions as interim), beta rider recruitment (mitigate:
recruit in week 1, not week 9).

---

## 5. Decisions needed from Anthony (blocking, by end of week 1)

1. **Final 10 destinations** — confirm or amend the proposed list. Note we
   have existing content for Girona, Mallorca, Dublin/Wicklow, Calpe,
   Tenerife; Nice, Lucca, Garda, Annecy, Flanders start cold including
   partner search.
2. **Stack** — confirm staying on Next.js 16 + Vercel Postgres (+ PostGIS)
   rather than migrating to Supabase (our recommendation: stay).
3. **Shipped social features vs Section 7** — hide comments/ratings on
   curated destination pages at launch, or keep visible login-gated?
4. **Validator commercial terms** — what's on the table for partners
   (cash per validation, referral placement, both)? The admin tool design
   depends on whether validation is paid work with SLAs.

---

## 6. Resourcing

| Role | Allocation | Notes |
|---|---|---|
| Eng A — full-stack/product | Full-time, 12 wks | Curated library, validator tool, route pages, exports, beta tooling |
| Eng B — full-stack/AI | Full-time, 12 wks | Voice pipeline, constraint parsing, wind, session assembler, test harnesses |
| Eng C — geo/routing | Full-time, 12 wks | Spike, routing engine, intelligence layer, guardrails, scorer. Contractor acceptable; PostGIS + OSM experience required |
| Design | ~2 days/wk, wks 2–9 | Brand-aligned generate flow, route pages, validator checklist |
| Anthony / ops | Heavy, continuous | Partner recruitment + management, destination confirmation, beta recruitment, road-knowledge review |
| Hardware budget | One-off | Edge 540/840/1050, ROAM/BOLT, Karoo, 2 test phones (~€3.5k) |
| Infra | Ongoing | Routing engine VM(s) for 10 regions, Postgres+PostGIS, Whisper inference (~€200–400/mo at launch scale) |

Content/validation effort is the hidden line item: 8–12 routes × 10
destinations, each drafted, ridden or verified locally, photographed and
written up. Budget Anthony-plus-partner time per destination in days, not
hours.

---

## 7. Deliverables checklist mapping (brief Section 8)

| # | Deliverable | Plan reference |
|---|---|---|
| 1 | Spike report | Week 1 — protocol in Section 3 |
| 2 | Road intelligence + validator tool | Weeks 2–4 |
| 3 | Curated library + exports | Weeks 2–7 |
| 4 | Voice pipeline + utterance harness | Weeks 2–4, 8–9 |
| 5 | Generation engine | Weeks 5–7 |
| 6 | Session engine | Weeks 5–7 |
| 7 | Golden suite in CI | Weeks 8–9 |
| 8 | Beta tooling | Weeks 8–9 |
| 9 | Launch gate report | Week 12 |

---

## Addendum — Decisions received from Anthony (2026-06-09)

1. **Route validation:** no local partners exist. Validation switches to
   sourcing routes that credible local operators already publish (e.g. Eat
   Sleep Cycle's public Girona route library), imported with attribution and
   gated by our automated quality scoring. Full model:
   `2026-06-09-route-sourcing-validation.md`. This removes the biggest
   external dependency from the critical path.
2. **Product status:** treat the product as pre-live. Rebuild where needed to
   execute the plan — no obligation to preserve existing behaviour.
3. **Social features:** no preference. Per the spec's out-of-scope list, hide
   comments/ratings from curated destination route pages at launch; code stays.
4. **Final 10 destinations (research-confirmed, popularity-ranked):**
   Mallorca, Girona, Málaga/Costa del Sol, Calpe/Costa Blanca, Tenerife,
   Gran Canaria, Lanzarote, Algarve, Lucca/Tuscany, Nice/Côte d'Azur.
   Changes from the spec's proposed list: Lake Garda, Annecy, Flanders and
   Dublin/Wicklow drop out of the 10 (Dublin/Wicklow stays as home-turf
   coverage and the session-builder geography); Málaga, Gran Canaria,
   Lanzarote and the Algarve come in — these rank higher on the
   winter-training-camp circuit Roadman's audience actually books.
   Implemented in `src/content/destinations.ts` (`LAUNCH_DESTINATION_SLUGS`).
5. **Garmin Connect API application** remains a week-1 action (unchanged).
