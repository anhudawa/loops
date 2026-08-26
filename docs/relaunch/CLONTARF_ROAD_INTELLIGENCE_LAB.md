# Clontarf Road Intelligence Lab

**Started:** 25 August 2026<br>
**Status:** staging foundation<br>
**Market:** Clontarf, Dublin, Ireland<br>
**Discipline:** road cycling

## Objective

Make this request answerable without weakening the LOOPS trust model:

> Start in Clontarf and build me a credible four-hour road ride.

The lab turns approved completed rides into a reusable directed-road evidence
graph. It does not infer that a new combination of roads is an exact
human-ridden loop.

## Product boundary

LOOPS now distinguishes three records:

1. **Verified route:** the exact immutable geometry was ridden by a named
   person, rights were granted and a different curator approved it.
2. **Human-covered plan:** every directed edge has current approved human ride
   evidence, but the exact combination may not have been ridden. It remains a
   team-only planning proposal.
3. **Provisional plan:** at least one connector lacks current directed human
   evidence. It remains a team-only planning proposal.

Only the first record can enter `routes` and become publicly discoverable.
`route_plan_proposals` is deliberately a separate table with `visibility =
'team_only'` and `public_eligible = false` database constraints.

## Clontarf demand benchmark

The lab origin is the public Clontarf suburb point at `53.36081, -6.19685`, not
a rider's home address. The initial coverage radius is 45 km.

Twelve structured requests are fixed before route evidence arrives:

- two 90-minute rides;
- two two-hour rides;
- three three-hour rides;
- five four-hour rides: endurance, rolling/scenic, threshold, café and
  tailwind-home.

They are demand tests, not route claims. The expected result remains an honest
no-match until the necessary evidence exists.

## Directed-road evidence graph

The `011_clontarf_road_intelligence.sql` migration adds:

- `road_intelligence_areas`;
- `road_intelligence_benchmarks`;
- `road_edges`;
- `road_edge_characteristics`;
- `ride_edge_observations`;
- `road_edge_human_assessments`;
- `route_plan_proposals`;
- `route_plan_proposal_edges` (added by migration `012`);
- `route_plan_feedback`.

An observation can be inserted only when its ride attestation:

- is approved;
- belongs to the same route and immutable route version;
- has the same completed-ride date as the observation.

Human edge assessments require the same approved evidence and a different
reviewer before approval. Assessments are directional because traffic,
sightlines, junction entry and workout usefulness can differ by direction.
The assessment's supporting ride must also contain an observation of that
exact directed edge.

Every proposal stores its ordered directed edges and, for each human-covered
edge, the exact approved ride observation that supports it. A claimed coverage
percentage without these records is not accepted as evidence. A human-covered
proposal cannot contain provisional edges; evidence over 365 days old is
explicitly stale. Deferred database checks prevent a proposal from committing
as human-covered without current approved support for every stored edge.

## Map matching

`src/lib/road-intelligence/map-matcher.ts` uses Valhalla's
`trace_attributes` contract to map a completed trace to directed road edges.
It requests OSM way and node identifiers, graph version, edge geometry,
surface, road class, cycle infrastructure, gradient and intersection facts.

The stable identity preference is:

`OSM way + traversed from-node + traversed to-node`

If those identifiers are unavailable, the fallback identity contains the
Valhalla graph version and provider edge identifier. Long GPS traces are
deterministically sampled while preserving their first and last points.

There is no default public endpoint. Applying a sync requires:

- a contracted or self-hosted `VALHALLA_URL`;
- `LOOPS_MAP_MATCHING_APPROVAL=contracted-or-self-hosted-valhalla`;
- the isolated staging database safeguards.

The public Valhalla demonstration server is not LOOPS production
infrastructure.

## Evidence-gated planning engine

`src/lib/road-intelligence/evidence-planner.ts` evaluates the fixed demand
benchmark without writing a route or proposal. It searches only directed edges
backed by an approved ride observation no more than 365 days old.

The deterministic search:

- anchors to human-covered roads within 3 km of the public Clontarf origin;
- finds a closed directed loop within ±15 minutes of the target duration;
- does not repeat a directed edge or make an immediate U-turn;
- excludes edges with reviewed high traffic, poor sightlines or poor surface;
- requires scenic evidence on at least 80% of a scenic candidate;
- requires elevation evidence before claiming flat, rolling or hilly fit;
- requires at least 25% evidenced coastal riding for a coastal request;
- requires an evidenced café for café requests;
- requires separately assessed, uninterrupted effort sections for workout
  repetitions;
- waits for live weather before claiming a tailwind-home fit.

The initial fixed benchmark uses 26 km/h, so the four-hour target is 104 km.
Personal planning will substitute the rider's own expected speed. The engine
returns an explicit status such as `no_evidence`, `origin_uncovered`,
`duration_miss`, `workout_evidence_missing` or `dynamic_context_required`
instead of forcing an answer.

The first reproducible algorithm identifier is `clontarf-evidence-v1`.

Even a successful result is a private candidate. It remains outside `routes`,
and its exact combined geometry still requires a completed human ride and the
normal independent review before public publication.

## Commands

```bash
npm run roads:sync
npm run roads:sync -- --apply --area=clontarf --limit=10
npm run roads:audit:clontarf
npm run roads:evaluate:clontarf
```

The dry run reports approved, unmatched completed rides without contacting a
map-matching provider. The apply command writes only `road_edges` and
`ride_edge_observations`; it has no route or plan write path.

The benchmark evaluator is read-only. On 26 August 2026, staging loaded zero
approved graph edges and correctly returned `no_evidence` for all 12 requests,
with zero route or proposal writes.

Administrators can inspect Clontarf coverage under **Admin → Roads**.

## What remains human-dependent

No engineering step can manufacture the initial evidence. The lab needs:

1. named riders with recent completed road recordings beginning in or near
   Clontarf;
2. contributor rights and privacy declarations;
3. independent approval of each exact route version and attestation;
4. human assessments for high-value exit, return and workout corridors;
5. a contracted or self-hosted map-matching service before edge ingestion.

The first operational target is connected directed coverage rather than a raw
loop count: Clontarf exits, north-coast connections, useful inland returns,
shortcuts, extensions and separately assessed effort corridors.

## Next engineering slice

After approved rides exist:

1. ingest and map-match them into the edge graph;
2. compute characteristic version `clontarf-v1`;
3. display the directed coverage on a private map;
4. rerun the twelve fixed demands and inspect any evidence-backed candidates;
5. let local riders review and ride accepted private proposals;
6. compare planned versus completed geometry and duration;
7. submit any useful completed exact loop through normal route review.
