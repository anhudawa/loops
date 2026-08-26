# Ireland relaunch staging status

Last updated: 2026-08-25

## Isolation established

- Vercel project: `loops` (`prj_vddnXXhsSWFeWBehdXBm8lZeUGW0`)
- Git branch: `relaunch/ireland-human-ridden`
- Stable branch preview: `https://loops-git-relaunch-ireland-human-ridden-anhudawas-projects.vercel.app`
- Database resource: `loops-ireland-staging`
- Database region: London
- Database scope: a new Neon project connected only to the empty Vercel
  `loops` project
- Production project `gravel-ireland`, its domains and its database were not
  changed or connected.

The staging database began empty. No production or legacy routes were copied.
All migrations from `000_runtime_schema.sql` through
`013_harden_road_evidence_links.sql` are recorded as applied with matching
checksums.

## Environment safeguards

The staging Vercel project has separate database credentials for Production,
Preview and Development targets. The relaunch branch also has explicit Preview
values. All targets declare:

- `LOOPS_DEPLOYMENT_ENV=staging`
- `LOOPS_DATABASE_TARGET=staging`
- exact database host and database-name guards
- a staging-only 32-byte token-encryption key
- synthetic seed mode disabled
- fresh route generation disabled
- reviewed-library search enabled

Disabled Strava and Garmin credentials were not copied into staging.

Google sign-in is configured only for the relaunch branch Preview environment:

- Google Cloud project: `loops-ireland-staging`
- OAuth app status: External / Testing (not published)
- OAuth client: `LOOPS Ireland Staging Preview`
- Authorized origin: the stable relaunch branch preview
- Authorized callback: the stable relaunch branch preview's
  `/api/auth/google/callback` endpoint
- Vercel variables `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are stored as
  secrets and scoped only to `relaunch/ireland-human-ridden`; Production does
  not receive them.
- The owner account is the sole approved OAuth test user.

## Closed-team access and map licence

This environment is private research and development, not a public beta:

- Vercel Deployment Protection redirects signed-out visitors to team SSO.
- Responses carry `X-Robots-Tag: noindex`.
- Only the project team may be invited while the MapTiler Free plan is in use.
- The MapTiler key is named `LOOPS Ireland staging` and is restricted to the
  stable relaunch branch domain; it is not enabled for production or arbitrary
  Vercel previews.
- The branch uses MapTiler Streets raster tiles with the required linked
  MapTiler logo and OpenStreetMap attribution.
- An allowed-origin request returns `200`; an unrelated origin returns `403`.

MapTiler's Free plan is limited to non-commercial use and research and
development for commercial products. The current limits are 5,000 sessions and
100,000 API requests per month. Analytics must be reviewed during internal
testing. Before any external tester is invited or deployment protection is
relaxed, upgrade to a commercial plan and record the date and owner here.

References:

- <https://www.maptiler.com/terms/cloud/>
- <https://www.maptiler.com/cloud/pricing/>

## Verification completed

- Ordered migration status: all applied; no checksum mismatch
- Provenance audit: zero routes, zero legacy records and zero synthetic users
- Ireland beta readiness audit: executes successfully against the real staging
  schema and reports the expected `0%` supply result for an empty catalogue
- Google OAuth: completed end to end against the stable protected preview; the
  callback created the first user in the staging database and issued a working
  application session
- Staging operations: the owner account was promoted to `admin` in the isolated
  staging database and the admin dashboard correctly reports one user and zero
  routes
- The live audit exposed and verified a fix for PostgreSQL proximity ranking:
  calculated `base_zone` and `zone_boost` fields are now materialised in a CTE
  before they are combined in `ORDER BY`.

The failed supply gate is intentional. It must remain failed until real Irish
routes have a permissioned ride recording, immutable route version, approved
attestation and independent editorial review.

## Local ride-file triage

The five legacy Irish GPX files in `scripts/seed-data/gpx/` were audited without
writing to the staging database. Results are recorded in
`IRELAND_LOCAL_RIDE_CANDIDATES.csv` and can be reproduced with
`npm run audit:local-candidates`.

- `skerries-loop.gpx` (64.6 km) and `skerries-via-the-lanes.gpx` (84.0 km)
  pass the timestamped completed-loop gate.
- `canals.gpx` and `wicklow-200.gpx` do not finish close enough to their starts.
- `dublin-canal-ride.gpx` has no timestamped track points.
- None of the five files currently identifies and records consent from the
  actual rider. The old seed manifest assigned them to synthetic users, so it
  is not evidence of authorship or permission.

Accordingly, zero routes were created. The two technical passes are ready for
the named rider to submit through the protected staging workflow; the other
three must not be ingested.

## Website source discovery

A metadata-only source sync now maintains 304 private acquisition leads in the
staging `route_source_candidates` table:

- 139 Ireland leads from Cycling Ireland and Sport Ireland Outdoors;
- 20 Girona leads from Eat Sleep Cycle and Epic Road Rides;
- 45 Mallorca leads from MallorcaVelo, CurroBikes, Mallorca Cycling Center and
  Epic Road Rides;
- 41 Tenerife leads from Bike Point Tenerife and Tenerife Tourism;
- 25 Calpe/Costa Blanca leads from Cycling Calpe;
- 9 Lanzarote leads from Lanzarote Bike;
- 8 Tuscany leads from Tuscany Trail 365;
- 7 Alpe d'Huez/Oisans leads from Epic Road Rides;
- 5 Gran Canaria leads from Epic Road Rides;
- 5 Dolomites leads from CyclingHero.

The original `WEBSITE_ROUTE_SOURCE_BACKLOG.csv` remains the 33-route
human-curated priority list. `npm run sources:sync` rebuilds and validates the
broader source catalogue; `npm run sources:audit` verifies database separation,
counts and promotion state. Administrators can inspect the queue under the
**Sources** tab. The expanded-destination rationale and source claims are
recorded in `EXPANDED_DESTINATION_SOURCES.md`.

These are acquisition leads rather than catalogue routes. No third-party GPX
or geometry has been copied into staging. All 304 are `source_only`; zero have
been promoted. The format audit records 178 advertised/apparent loops, 18
linear routes, 3 out-and-back routes and 105 unknown-format leads, so the
source queue itself must never be shown as loop inventory.

Source checking is recorded separately from LOOPS verification: 175 entries
have checked public metadata, 104 come from a local/official curator and 25
carry an explicit publisher claim that the routes were ridden. None of those
states establishes the named exact-version rider, evidence or rights required
for LOOPS publication. A lead advances only when the source introduces that
rider and the person completes the normal contributor upload, rights and
privacy workflow.

## Clontarf Road Intelligence Lab

The staging database now contains the private Road Intelligence v1 foundation
for Clontarf:

- one active Clontarf coverage area with a 45 km lab radius;
- 12 fixed planning-demand benchmarks, including five four-hour requests;
- approved-attestation-only directed road observations;
- reusable provider/OSM road-edge identity and characteristic records;
- separately reviewed human road assessments;
- team-only human-covered or provisional plan records that are structurally
  outside route publication;
- ordered proposal-edge records that link every human-covered road directly
  to its approved ride observation rather than trusting a summary percentage;
- deferred integrity checks that reject human-covered plan commits without
  current edge evidence and reject assessments not supported by a ride over
  that exact directed edge.

The post-migration trust audit passes with zero invalid observations, zero
invalid assessments, zero unsupported human-covered plans and zero
public-capable proposals. The evidence graph correctly remains empty: zero
approved Clontarf rides, zero road edges, zero observations, zero assessments,
zero plan proposals and zero routes. `VALHALLA_URL` is not configured, and the
dry run contacted no map-matching provider.

The read-only evidence planner now evaluates every fixed demand against the
approved graph. Its first real staging run on 26 August 2026 returned
`no_evidence` for all 12 benchmarks, including all five four-hour requests.
The initial four-hour benchmark target is 104 km at 26 km/h. The evaluator
wrote zero routes and zero proposals; Admin → Roads displays each demand's
current result and blocking reason.

Admin → Roads also includes a private directed-coverage map. With zero approved
edges it honestly renders only the public Clontarf origin and 45 km lab radius.
It will populate automatically after approved rides are map-matched, with
separate colours for current assessed, current unassessed, stale and known
safety-warning edges. Its API omits rider and attestation identifiers.

The next road-intelligence input must be a real approved completed ride from a
named contributor beginning within the Clontarf lab area. Edge ingestion also
requires a contracted or self-hosted Valhalla endpoint and the explicit
staging approval documented in `CLONTARF_ROAD_INTELLIGENCE_LAB.md`.

## Next operating gates

The protected branch preview now has its isolated database, restricted map,
Google sign-in, first staging administrator and a private 304-lead acquisition
queue. It remains intentionally empty of routes.

The next workflow rehearsal requires two inputs that must not be fabricated:

1. A named rider must either attest and submit one of the two technically valid
   Skerries recordings, if it is genuinely theirs, or supply another recent
   Irish road-loop GPX or FIT recording they personally rode and can grant
   LOOPS permission to use.
2. A second real team Google account, added as an OAuth test user, so the
   contributor and reviewer are different people.

With those inputs, run the complete contributor submission, privacy check,
immutable versioning, interval assessment, independent review, rejection and
approval/quarantine paths. The Ireland supply gate remains closed until at
least 25 independently reviewed human-ridden routes are published.
