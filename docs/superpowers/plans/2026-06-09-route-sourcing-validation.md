# Route Sourcing & Validation Runbook

**Date:** 2026-06-09
**Status:** Active — replaces the "validator partner sign-off" model in the
launch build spec, per Anthony's decision (no local partners exist; source
routes from what local experts already publish).

---

## The model in one paragraph

A route enters the launch library only if (1) it follows roads that named,
credible local operators — bike shops, tour companies, camp organisers whose
business depends on recommending good roads — publish and ride themselves,
and (2) it passes our own automated quality scoring and hard guardrails
(`route-quality.ts`, `route-rules.ts`). Routes are presented as Loops
routes with no public attribution (owner decision, 2026-06-09: routes are
facts, no credit shown). The `operator_name`/`operator_url` fields are
retained as **private provenance only** — internal bookkeeping so we know
where each route's intelligence came from when re-checking freshness. They
are not displayed anywhere in the UI.

## Why this works as validation

A Girona shop that rents €8,000 bikes and guides tourists daily cannot afford
to publish a route with a dangerous descent or a gravel sector — their
published libraries ARE locally validated, continuously, by their own
business. We add a second layer: every imported route runs through the
quality scorer (surface, traffic proximity, bicycle access, road class via
OpenStreetMap) and anything that fails the guardrails is rejected regardless
of source.

## Licensing position (owner decision, 2026-06-09)

Routes are treated as facts — roads, distances and elevations are not
copyrightable, and no permission emails or public credit are required.
Names and descriptions are written by us, never copied from the source.
Route geometry is sourced from publicly downloadable tracks. If an operator
ever objects, the fallback is trivial: re-trace the same public roads with
our own router, which produces an equivalent route from facts alone.

## The pipeline (all pieces already exist in the codebase)

```
Operator's public route (RideWithGPS / GPX download / Wikiloc)
  → import via src/lib/ridewithgps.ts or src/lib/route-parser.ts (GPX/FIT/TCX)
  → quality score + hard guardrails (route-quality.ts, route-rules.ts)
  → reject below threshold or on any guardrail violation
  → insertRoute with operator_name + operator_url as private provenance (db.ts)
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

All 10 destinations now have dry-run-validated manifests in
`scripts/hub-data/`. Routes were selected against each destination's
documented classic rides (see `src/content/destinations.ts` climbs), with
loop closure and trace density checked per route. Counts vs the 8-route
launch bar:

| Destination | Manifest(s) | Routes | vs 8-route bar |
|---|---|---|---|
| Girona | `girona-eat-sleep-cycle.json` + `girona.json` | 20 + 10 | ✓ |
| Mallorca | `mallorca-epic-road-rides.json` | 9 | ✓ (incl. Sa Calobra, Formentor, flat spin) |
| Calpe / Costa Blanca | `calpe.json` (local files) + `calpe-rwgps.json` | 6 + 3 | ✓ |
| Málaga | `malaga.json` | 8 | ✓ |
| Tenerife | `tenerife.json` | 8 | ✓ (no true easy day exists in the south — flagged) |
| Gran Canaria | `gran-canaria.json` | 7 | 1 short — south coast lacks an 8th distinct loop; add a northern (Las Palmas) route or trace one |
| Lanzarote | `lanzarote.json` | 8 | ✓ (incl. 175 km island lap) |
| Algarve | `algarve.json` | 8 | ✓ |
| Lucca | `lucca.json` | 8 | ✓ (incl. Pisa/Viareggio easy spins, Garfagnana epic) |
| Nice | `nice.json` | 8 | ✓ |

Every route was dry-run validated: fetched, parsed, loop closure < 3 km
(or flagged point-to-point), trace density checked. Real imports must run
from an environment with Overpass access so the quality gate scores
properly (dry runs here returned the neutral fallback).

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
