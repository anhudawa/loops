# Route Sourcing & Validation Runbook

**Date:** 2026-06-09
**Status:** Active — replaces the "validator partner sign-off" model in the
launch build spec, per Anthony's decision (no local partners exist; source
routes from what local experts already publish).

---

## The model in one paragraph

We don't have local partners to sign off routes, so validation comes from
**provenance plus automated checking**: a route enters the launch library only
if (1) it was published by a named, credible local operator — a bike shop,
tour company or camp organiser whose business depends on recommending good
roads — and (2) it passes our own automated quality scoring and hard
guardrails (`route-quality.ts`, `route-rules.ts`). The operator's name and a
link to the original appear on the route page ("Route by Eat Sleep Cycle,
Girona"), which is honest attribution and free marketing for them.

## Why this works as validation

A Girona shop that rents €8,000 bikes and guides tourists daily cannot afford
to publish a route with a dangerous descent or a gravel sector — their
published libraries ARE locally validated, continuously, by their own
business. We add a second layer: every imported route runs through the
quality scorer (surface, traffic proximity, bicycle access, road class via
OpenStreetMap) and anything that fails the guardrails is rejected regardless
of source.

## Licensing — do this first per destination

A published GPX is still the operator's work. Before importing any
operator's routes at volume, send a short permission email: we want to
feature their routes with name, logo and link on a free route-discovery
platform. Expect most to say yes — it is free customer acquisition for them.
Keep replies in a folder; record consent in the `route_sources` notes. Where
no reply, prefer (a) routes the operator distributes explicitly for public
download, (b) rebuilding the same roads as our own GPX (roads are facts and
not copyrightable; the operator is then credited as "route intelligence"
rather than file source).

## The pipeline (all pieces already exist in the codebase)

```
Operator's public route (RideWithGPS / GPX download / Wikiloc)
  → import via src/lib/ridewithgps.ts or src/lib/route-parser.ts (GPX/FIT/TCX)
  → quality score + hard guardrails (route-quality.ts, route-rules.ts)
  → reject below threshold or on any guardrail violation
  → insertRoute with operator_name + operator_url attribution (db.ts)
  → route appears in the destination library and in library-first matching
    for generated requests (route-library.ts)
```

Per-route manual sense check before publish: does the distance/elevation
match the operator's description, does it start somewhere a visitor can
actually start (town, resort, café), is the discipline tag right.

### Running an import

```bash
# Validate a manifest without touching the database (no env needed):
node scripts/import-routes.mjs scripts/hub-data/girona-eat-sleep-cycle.json --dry-run

# Real import (needs POSTGRES_URL in .env.local):
node --env-file=.env.local scripts/import-routes.mjs scripts/hub-data/girona-eat-sleep-cycle.json
```

Note: the dry-run quality score shows 60 (neutral) when the Overpass/OSM
service is unreachable — the importer is deliberately fail-open on scoring
and fail-closed on guardrails (loop check, point count). Re-run real imports
from an environment with Overpass access so the quality gate actually bites.

## Source candidates by destination

Verified = we have confirmed a public route library exists. Others are
candidates to confirm during the sourcing sprint.

| Destination | Source candidates | Status |
|---|---|---|
| Girona | **Eat Sleep Cycle** — public route library on RideWithGPS (org 13026) | **Manifest built**: `scripts/hub-data/girona-eat-sleep-cycle.json`, 20 routes, dry-run validated |
| Mallorca | **Epic Road Rides** — public RideWithGPS event library (their tried-and-tested top 6); also HC Bike Tours and Berganti Bikes publish free GPX | **Manifest built**: `scripts/hub-data/mallorca-epic-road-rides.json`, 6 routes, dry-run validated; needs 2+ more routes to hit the 8-route launch bar |
| Málaga | Local hire/guide operators in Málaga and Fuengirola; Andalusian cycling tourism boards publish GPX | To confirm |
| Calpe / Costa Blanca | Calpe/Altea/Dénia camp operators and hire shops (pro-camp territory, several publish routes) | To confirm |
| Tenerife | Bike Point Tenerife and similar hire operators; Teide route guides | To confirm |
| Gran Canaria | Free Motion and other Maspalomas hire operators publish route guides | To confirm |
| Lanzarote | Club La Santa publishes training routes; Ironman Lanzarote course is public | To confirm |
| Algarve | Algarve Bike Holidays / Loulé-area operators; Volta ao Algarve stage routes are public | To confirm |
| Lucca | Lucca cycling hotels and Tuscany tour operators | To confirm |
| Nice | Côte d'Azur guide operators; classic col routes are extensively documented | To confirm |

Fallback for thin destinations: build routes ourselves along the documented
classic roads (every destination above has famous, well-documented climbs and
loops), run them through scoring, and label them "Loops verified" instead of
operator-attributed. The launch spec's bar of 8 routes per destination is
reachable this way even where no operator cooperates.

## Library shape per destination (from the launch spec)

8–12 routes each: recovery spin (1–1.5 hr), standard loops (2–3 hr), big day
(4–5 hr+), and at least one signature-climb route. Tag each with discipline,
distance, elevation, and start point so library-first matching can serve them
against generated requests.

## Freshness

Without partners there is no human re-validation cycle, so we substitute:
- `last_verified` date shown on every sourced route ("Route by Eat Sleep
  Cycle — imported May 2026")
- Re-run the quality scorer on the full library quarterly (OSM data updates
  capture closures and reclassifications)
- Rider condition reports (already built — `ConditionReports`) become the
  early-warning system once users arrive
