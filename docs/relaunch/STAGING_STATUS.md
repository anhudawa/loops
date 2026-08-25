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
`008_minimise_recording_filenames.sql` are recorded as applied with matching
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

## Next operating gates

The protected branch preview now has its isolated database, restricted map,
Google sign-in and first staging administrator. It remains intentionally empty
of routes.

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
