# LOOPS Routing Engine — Costed Recommendation

**Date:** 2026-09-21
**Author:** Infrastructure / routing engineering
**Audience:** CEO (Anthony) + build engineer
**Question:** How does LOOPS beat Komoot on route planning — what engine, what
data layer, what does it cost, and how do we migrate without breaking launch?

---

## TL;DR (read this if nothing else)

Our routing is slow and unreliable for one reason: we call **public shared
servers** — the BRouter demo (`brouter.de`) for routing and the public
Overpass API (`overpass-api.de`) for road/surface data. Both are free
community boxes shared by the whole world, rate-limited, and queue our
requests behind everyone else's. That queueing — not our code — is why a
Dublin route can take 55 seconds and time out. **The fix is to stop renting a
seat on a shared server and run our own.** For 10 destination regions plus
Ireland this is small and cheap: our data is a few gigabytes, not the planet.
**Recommendation: self-host our own routing on a single Hetzner server (~€86/
month) — immediately as our current BRouter engine to kill the timeouts this
week (a one-line change), then upgrade the same server to GraphHopper for
Strava-instant draw-to-snap and to retire the slow Overpass surface lookups
entirely.** Total steady-state cost **~€86–100/month**, versus €200–480/month
for a comparable managed API that would *re-introduce* the rate limits we are
trying to escape. This is the single highest-leverage infrastructure move
before launch.

---

## 1. Why the current setup fails (root cause)

Every generated route in `src/lib/route-generator.ts` fans out into **many**
routing calls, not one:

- a warm-up leg, one or more corridor extensions, and a home leg per workout,
- multiple candidate loops per request (candidate "explosion" in
  `route-explosion.ts`),
- plus a full-route **Overpass** query in `route-quality.ts` to score surface,
  safety and scenery (10 factors, per candidate).

So one user tap on "generate" = **10–40+ calls** to `brouter.de` and several
heavy queries to `overpass-api.de`. From a seeded holiday destination the
public servers happen to be warm/cached and it lands in 15–30s. From dense
Dublin the queries are bigger and the public boxes throttle us, so we hit our
own 15s BRouter timeout repeatedly and the whole request drags past 55s.

**The bottleneck is shared-server contention and rate limits, not our
algorithm.** The demo server's own terms ask you not to use it in production,
and Overpass public instances aggressively rate-limit. Owning the boxes makes
the contention disappear and makes latency predictable.

Sources: BRouter demo/self-host guidance
(https://github.com/abrensch/brouter,
https://blog.devops.uber.space/2024/202407.html); Overpass public-instance
rate limits (https://wiki.openstreetmap.org/wiki/Overpass_API).

---

## 2. Engine comparison (2025/2026)

All open-source engines below are **Apache-2.0**, so we can self-host in a
commercial product with no licence fee
(https://github.com/graphhopper/graphhopper/blob/master/LICENSE.txt).

| Engine | Cycling / surface / gradient awareness | Custom road/gravel/mtb profiles | Draw-snap quality & latency | Self-host complexity (our scale: Ireland + 10 regions) | Cost |
|---|---|---|---|---|---|
| **BRouter (self-host)** *(what we run today, but on the demo server)* | Excellent — purpose-built for bikes, elevation-aware, best-tuned bike cost model of any engine | Best-in-class: per-request scriptable profiles; we already map road=`fastbike-lowtraffic`, gravel, mtb | Good routing; **recomputes every request (no contraction hierarchies)** so long routes are slower; no native "snap a drawn line" service | **Trivial.** Java jar/Docker, 5°×5° "segments4" tiles for our regions, ~512MB–2GB RAM. Almost no ops. | ~€8–15/mo VPS |
| **GraphHopper (self-host)** ⭐ | Excellent — elevation/gradient aware; carries surface & road-class **in the graph** (can retire Overpass for surface) | Yes — "custom models" (JSON) per profile; ships bike / racing-bike / mtb; fully tunable | **Best.** Contraction Hierarchies → **sub-100ms** routes; **Map-Matching API** snaps drawn lines like Strava | Low–moderate. Java/Docker, Geofabrik + `osmium` regional extract, CH build. One instance serves all 3 profiles sharing one graph | €70–86/mo VPS |
| GraphHopper Directions API (managed) | Same engine, hosted | Custom models on paid tiers | Same engine | None | **€69 Basic / €199 Standard / €479 Premium** per month; credit-metered, re-introduces per-call limits (https://www.graphhopper.com/pricing/) |
| **Valhalla (self-host / Mapbox / Stadia)** | Good — dynamic per-request costing, elevation-aware; strong multimodal | Yes — costing options per request; bicycle profile with `use_roads`/`use_hills`/bicycle_type | Good; tile-based, has trace/map-matching (`trace_route`) | Moderate–higher. Tile builds slower, larger disk; heavier than GH for our regional scale | Self-host similar VPS; **Stadia hosted**: 200k credits/mo free, then $20/1M → $250/25M (https://stadiamaps.com/pricing/) |
| OpenRouteService (self-host / API) | Good — built on GraphHopper; cycling-road/-mountain/-electric/-regular profiles, surface-aware | Yes (GH-derived profiles) | Good routing; snapping via GH under the hood | Moderate; Docker; **RAM ≈ 2× PBF size** per instance, one profile per graph = heavier for 3 disciplines | Self-host VPS; free API tier is **low daily quota** (≈2k directions/day), not production-scale (https://openrouteservice.org/restrictions/) |
| Mapbox Directions (managed) | Good cycling profile; no gravel/mtb distinction, no custom bike model | **No** — fixed profiles only | Excellent latency | None | 100k free/mo, then **$2.00/1k** (100k–500k), $1.60/1k above (https://www.mapbox.com/pricing) |
| OSRM (self-host) | Weak for our needs — car-oriented, **no elevation/gradient**, profiles are Lua but not bike-first | Poor fit for gravel/mtb surface nuance | Fastest raw latency (CH/MLD) | Low | Cheap VPS — **but wrong tool for surface-aware cycling** |

**Read of the table.** For a bike-first product the real contest is
**BRouter vs GraphHopper**, both self-hosted:

- **BRouter** has the best *bike cost model* and we already depend on it — the
  disciplines, guardrails and GPX pipeline are wired to its profiles. Its
  weakness is speed on long routes (no contraction hierarchies) and it has no
  native "snap this drawn polyline" service.
- **GraphHopper** wins on the two things the brief calls world-class:
  **instant draw-to-snap** (Contraction Hierarchies + a real Map-Matching API)
  and **surface carried in the routing graph**, which lets us delete most
  per-request Overpass traffic. Apache-2.0, one instance serves all three
  disciplines from one shared graph, released v11 Oct 2025 with bike-routing
  fixes (https://www.graphhopper.com/blog/2025/10/14/graphhopper-routing-engine-11-0-released/).

**Why not a managed API?** Because of the fan-out in §1, "low-thousands of
routes/day" to users is **tens of thousands of engine calls/day**. On managed
credit pricing that pushes us onto the €199–479/mo GraphHopper tiers or
Mapbox's per-1k meter — *and* re-imposes rate limits and network latency,
the exact problems we're escaping. Self-hosting is a **flat** cost, gives full
profile control, keeps data local (low latency), and never throttles us.
Sources: https://www.graphhopper.com/pricing/, https://www.mapbox.com/pricing,
https://stadiamaps.com/pricing/.

---

## 3. What Komoot actually does (and how we beat it)

Komoot is **closed-source**, so the algorithm isn't published, but what's
publicly known:

- **Base data is OpenStreetMap** — same raw data we use. Their edge is not
  secret map data; it's what they layer on top
  (https://wiki.openstreetmap.org/wiki/Komoot,
  https://support.komoot.com/hc/en-us/articles/360022830972).
- **Their own in-house, sport-aware routing engine.** They run proprietary
  algorithms on OSM, not an off-the-shelf engine, choosing routes by activity
  type, waypoints and POIs
  (https://www.bikeradar.com/advice/buyers-guides/guide-to-using-komoot).
- **A strong surface / waytype model.** Komoot classifies every segment by
  surface (asphalt / gravel / singletrack…) and waytype and folds it into
  sport-specific costing. This — surface honesty per sport — is *the* thing
  road cyclists praise and MTB/gravel riders trust
  (https://komoot.business/en/news-and-stories/news/improved-route-planning-for-gravel-biking_news_137).
- **Popularity / "Highlights" signal.** Recommended tours blend highly-rated
  Highlights with anonymised recorded rides from their user base — a crowd
  "locals ride this" layer we can't replicate without a corpus
  (https://support.komoot.com/hc/en-us/articles/360058879211).

**What actually makes Komoot *feel* good:** (1) routing feels **instant**
because it's precomputed/served from their own infra, (2) **surface is shown
honestly per sport** so you're rarely surprised by gravel on a road bike, and
(3) POI/Highlight richness.

**How LOOPS matches or beats each:**

| Komoot strength | LOOPS answer |
|---|---|
| Instant routing on own infra | Self-hosted GraphHopper CH → sub-100ms; draw-snap becomes instant (this doc) |
| Surface honesty per sport | We already ship a **surface % breakdown + "100% paved" badge** and discipline-true profiles (komoot-rival roadmap). Graph-carried surface makes it faster and per-metre accurate |
| Popularity / Highlights corpus | We **don't** fake a heatmap (honesty principle). Our edge is the **operator-sourced verified library** ("locals ride this" without spyware data) + **wind-aware "tailwind home"**, which Komoot has **no** answer to |
| POI richness | Café/viewpoint scoring already in the quality model; keep the regional OSM extract for this |

**Net:** we don't need to out-corpus Komoot. We need to (a) be as fast as them
(self-host + CH), (b) be as surface-honest as them (already shipping; make it
graph-native), and (c) win on the two things they lack — **wind-aware routing**
and a **curated verified library**. Beating them is an infra problem plus our
existing differentiators, not an ML-corpus problem.

---

## 4. The road/surface data layer — retire per-request Overpass

**Yes, per-request Overpass is a primary problem**, co-equal with the routing
demo server. `route-quality.ts` fires a live `overpass-api.de` query (30s
timeout, 2-concurrent) for *every* candidate to score surface/safety/scenery.
On dense areas these queries are large and get throttled.

Three ways to fix it, in order of preference:

1. **Carry surface in the routing graph (best).** GraphHopper encodes
   `surface`, `road_class` and `road_environment` per edge at import. Ask the
   engine for the route's edge details and you get paved/unpaved per metre
   **for free, in the same call** — no Overpass round-trip for surface at all.
   This alone removes the biggest quality-scoring query.
2. **Self-host the OSM extract for the residual POI/scenery scoring.** Water,
   forests, peaks, viewpoints, cafés still need OSM lookups. Run a **private
   Overpass instance** (or import the extracts into **PostGIS** — we already
   plan PostGIS for road intelligence) on the *same* server, loaded with **only
   our ~11 regions**. Same query code, private endpoint, no throttling, ~10ms.
3. **Preprocess offline.** For the seeded library and destination bounding
   boxes, precompute POI/scenery layers into Postgres once at import time so
   scoring is a local index lookup, not a network call.

We only need **Ireland + 10 destination bounding boxes**, so the extract is a
**few GB, not the ~80GB planet** — cheap to host and fast to query.
(Self-hosted ORS/Overpass RAM ≈ 2× PBF size; our PBFs are small —
https://ask.openrouteservice.org/t/limitations-on-self-hosted-openrouteservice/5512.)

---

## 5. Recommended stack + monthly cost + build effort

### Primary recommendation — self-hosted GraphHopper (+ private Overpass) ⭐

**One Hetzner Cloud dedicated-vCPU server, both services on it:**

- **Server:** Hetzner **CCX23** — 4 dedicated vCPU, 16 GB RAM, 160 GB NVMe —
  **€85.99/month** (ex VAT), Germany/Finland region
  (https://costgoat.com/pricing/hetzner). Dedicated vCPU matters: routing is
  CPU-bound and we don't want noisy-neighbour jitter on draw-snap latency.
- **On it:**
  - **GraphHopper** (Docker, Apache-2.0), one merged regional extract built
    with Geofabrik downloads + `osmium extract` bounding boxes for Ireland +
    the 10 destinations, **3 custom models** (road / gravel / mtb) sharing one
    CH graph. Serves routing **and** per-edge surface.
  - **Private Overpass** (or PostGIS import) of the *same* regional extracts,
    for the residual scenery/POI quality factors.
  - Open-Meteo stays as-is for wind (free, low volume — no change).
- **Headroom:** 16 GB comfortably holds our regional graph + Overpass extract.
  If we later add regions, bump to **CCX33** (8 vCPU / 32 GB / **€138.49/mo**).

**Steady-state monthly cost: ~€86** (one CCX23). Budget **~€100/mo** with
backups/snapshots. No per-call metering, ever.

**Build effort:** ~**1.5–2.5 engineer-weeks**:
- Stand up GraphHopper + build script for the regional extract & custom models
  (2–3 days).
- Port the three BRouter profiles to GraphHopper custom models and validate
  parity against our golden route suite (3–4 days).
- Swap `route-quality.ts` surface scoring to read GraphHopper edge details;
  stand up private Overpass/PostGIS for the rest (2–3 days).
- Load-test Dublin generation end-to-end; tune (1–2 days).

### Cheaper fallback / immediate Week-1 stopgap — self-hosted BRouter

**This is also step 1 of the migration regardless** — do it this week:

- **Server:** Hetzner **CX33** (4 vCPU / 8 GB / **€8.49/mo**) or **CPX32**
  (4 vCPU / 8 GB / €35.49) if we want more headroom
  (https://costgoat.com/pricing/hetzner). BRouter needs only ~512MB–2GB heap
  (https://github.com/abrensch/brouter).
- **On it:** BRouter Docker image (`ghcr.io/abrensch/brouter`) + the
  `segments4` tiles covering our regions + a **private Overpass** for scoring.
- **Cost: ~€8–20/month.**
- **Build effort: ~0.5–1 day.** BRouter is a **drop-in** — set `BROUTER_URL`
  to our box (the env var already exists in `route-generator.ts`) and point
  `route-quality.ts` at the private Overpass. **Zero algorithm changes.**

**Trade-off:** BRouter keeps the best bike cost model and instantly kills the
timeout, but does **not** give GraphHopper's sub-100ms CH snapping or a native
draw-snap service. It fixes reliability now; GraphHopper wins world-class
draw-to-snap.

### Recommended path: do both, in sequence

1. **This week (fallback):** self-host BRouter + private Overpass → the Dublin
   timeout is gone for **~€15/mo**, ~1 day, one env var + one endpoint swap.
2. **Before/just-after launch (primary):** stand up GraphHopper on the same
   (or a sized-up) box behind the same routing interface, A/B against BRouter
   on the golden suite, then cut over for instant draw-snap and graph-native
   surface. Retire the public demo server and public Overpass for good.

---

## 6. Migration plan (minimal risk)

We have two coupling points: `route-generator.ts` → BRouter, and
`route-quality.ts` → Overpass. A `BROUTER_URL` env var already exists.

**Phase 0 — Provision (0.5 day).**
Spin up the Hetzner box. Deploy BRouter (Docker) + `segments4` tiles for
Ireland + 10 regions. Deploy a private Overpass (or start the PostGIS import)
with the same regional extracts. Lock both behind a firewall / private network
so only our app server reaches them.

**Phase 1 — Cut over to self-hosted BRouter (0.5 day, near-zero risk).**
Set `BROUTER_URL=https://<our-box>/brouter` in Vercel. No code change — the
generator already reads it. Add `OVERPASS_URL` as an env var in
`route-quality.ts` (currently hardcoded to `overpass-api.de`) and point it at
our private instance. Verify a Dublin generation completes < 20s. **This alone
resolves the #1 blocker.** Keep the public URLs as a fallback default so a box
outage fails soft, consistent with our build-time DB pattern.

**Phase 2 — Introduce GraphHopper behind an interface (primary engine).**
- Extract the BRouter call into a small `RoutingEngine` interface
  (`route(waypoints, discipline) → RoutedPath`) — BRouter impl first, so this
  refactor changes no behaviour.
- Add a `GraphHopper` impl of the same interface. Translate our three
  discipline profiles into GraphHopper custom models. Gate via
  `ROUTING_ENGINE=brouter|graphhopper`.
- Run the **golden route suite** (`npm run golden`) against both; compare
  distance, surface %, guardrail pass-rate, quality score. Only promote
  GraphHopper where parity or better.

**Phase 3 — Retire Overpass-for-surface.**
Replace the surface/road-class portion of `route-quality.ts` with GraphHopper
edge details returned by the route call. Keep private Overpass/PostGIS only for
scenery/POI factors. Removes the largest per-candidate network query.

**Phase 4 — Harden.**
Health checks + auto-restart on the box; nightly `segments4`/extract refresh
(OSM updates); alert if the engine is unreachable so we fail soft to the public
default rather than 500. Snapshot backups (~€1–5/mo).

**Rollback at every phase:** flip the env var back to the public URL. Because
each phase is env-gated and interface-isolated, we can revert in seconds
without a deploy.

---

## Appendix — sources

- Engine comparisons: https://sumguy.com/osrm-vs-valhalla-vs-graphhopper/ ·
  https://www.pistack.xyz/posts/2026-04-25-graphhopper-vs-osrm-vs-valhalla-self-hosted-routing-engines-guide-2026/ ·
  https://github.com/gis-ops/tutorials/blob/master/general/foss_routing_engines_overview.md
- GraphHopper: https://github.com/graphhopper/graphhopper ·
  https://www.graphhopper.com/blog/2025/10/14/graphhopper-routing-engine-11-0-released/ ·
  https://www.graphhopper.com/pricing/ ·
  https://github.com/graphhopper/graphhopper/blob/master/LICENSE.txt ·
  https://docs.graphhopper.com/openapi/map-matching
- BRouter: https://github.com/abrensch/brouter ·
  https://brouter.de/brouter/ · https://blog.devops.uber.space/2024/202407.html
- Valhalla / Stadia: https://stadiamaps.com/pricing/ ·
  https://docs.stadiamaps.com/routing/
- OpenRouteService: https://openrouteservice.org/restrictions/ ·
  https://ask.openrouteservice.org/t/limitations-on-self-hosted-openrouteservice/5512
- Mapbox: https://www.mapbox.com/pricing · https://docs.mapbox.com/api/navigation/directions/
- Komoot: https://wiki.openstreetmap.org/wiki/Komoot ·
  https://support.komoot.com/hc/en-us/articles/360022830972 ·
  https://komoot.business/en/news-and-stories/news/improved-route-planning-for-gravel-biking_news_137 ·
  https://www.bikeradar.com/advice/buyers-guides/guide-to-using-komoot
- Hetzner pricing: https://costgoat.com/pricing/hetzner ·
  https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
