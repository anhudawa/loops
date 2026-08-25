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

## Verification completed

- Ordered migration status: all applied; no checksum mismatch
- Provenance audit: zero routes, zero legacy records and zero synthetic users
- Ireland beta readiness audit: executes successfully against the real staging
  schema and reports the expected `0%` supply result for an empty catalogue
- The live audit exposed and verified a fix for PostgreSQL proximity ranking:
  calculated `base_zone` and `zone_boost` fields are now materialised in a CTE
  before they are combined in `ORDER BY`.

The failed supply gate is intentional. It must remain failed until real Irish
routes have a permissioned ride recording, immutable route version, approved
attestation and independent editorial review.

## Deployment gates still open

Do not redeploy the branch as usable staging until both are configured:

1. A staging Google OAuth client whose callback is
   `https://loops-git-relaunch-ireland-human-ridden-anhudawas-projects.vercel.app/api/auth/google/callback`.
2. A licensed commercial map-tile URL and its required attribution.

Google Cloud currently requires the account owner to re-authenticate before a
new isolated OAuth client can be created. Do not reuse production credentials.
The public OpenStreetMap tile service remains development-only and must not be
misrepresented as the contracted staging provider.

After these two values are present, pull the branch Preview environment, run
`npm run preflight:deploy`, redeploy the relaunch branch, and complete the
contributor/reviewer/privacy/quarantine workflow in the deployment runbook.
