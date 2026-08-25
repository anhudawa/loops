# LOOPS

LOOPS is a road-cycling route discovery product built around a strict trust
rule: no loop enters the public library until a named human has ridden that
exact route version and LOOPS has permission to publish it.

The commercial rollout starts in Ireland, followed by Girona and Mallorca.
See [the active execution plan](docs/relaunch/IRELAND_FIRST_EXECUTION_PLAN.md).
Route and mapping-platform decisions are documented in
[the platform data-source policy](docs/relaunch/PLATFORM_DATA_SOURCE_POLICY.md).

## Product model

- Search by location, available time, terrain and training session.
- Match requests to reviewed, human-ridden routes.
- Keep route verification separate from interval-segment suitability.
- Return an honest no-match instead of generating unproven geometry.
- Export approved routes as open GPX files and, where approved, to devices.

## Local development

Requirements: Node.js 20 and a PostgreSQL database compatible with the Vercel
Postgres client currently used by the application.

```bash
npm ci
npm run dev
```

Common checks:

```bash
npm test
npm run rehearse:migration
npx tsc --noEmit
npm run lint
npm run build
```

Copy `.env.example` into a secret-managed environment file and run
`npm run preflight:deploy` before any staging or production deployment.

## Provenance migration

The commercial relaunch introduces immutable route versions and ride
attestations. Before deploying code from the relaunch branch:

1. Take a database backup.
2. Run `npm run rehearse:migration` locally. This uses a disposable in-memory
   PostgreSQL database and cannot touch staging or production.
3. Run `npm run audit:provenance` against the target database.
4. Apply every numbered file in `migrations/` to staging, in order.
5. Test one complete submission and publication workflow.
6. Apply the migration to production before deploying application code.

The migration intentionally moves every legacy route back to `draft`. Legacy
ratings and `verified` booleans are not accepted as proof that a route was
ridden.

Legacy scripts that generated geometry, copied public GPX files or seeded
fictional riders are intentionally fail-closed. They remain in the repository
only as audit evidence for legacy-data cleanup. New catalogue supply must use
the signed-in contributor upload and independent review workflow.

`npm run migrate:status` is read-only. `npm run migrate:apply` uses checksums,
an advisory lock and explicit database host/name/target guards. The complete
operator sequence is in `docs/relaunch/DEPLOYMENT_RUNBOOK.md`.

## OAuth token encryption

Set `LOOPS_TOKEN_ENCRYPTION_KEY` to a random 32-byte key before storing any
third-party OAuth credentials. For example, generate one with `openssl rand -base64 32`
and store it only in the deployment secret manager. OAuth access tokens,
secrets and the temporary Garmin OAuth cookie are authenticated and encrypted
with AES-256-GCM. The ordered token migration clears historical plaintext
Strava and Garmin credentials. Direct Strava access is disabled for the
commercial relaunch. The legacy Garmin client is also hard-disabled until
LOOPS is accepted into Garmin's current business programme and replaces it
with a tested OAuth 2 integration.

## Production maps

Production deliberately renders no base map unless a contracted provider is
configured. Set both `NEXT_PUBLIC_MAP_TILE_URL` and
`NEXT_PUBLIC_MAP_ATTRIBUTION` to the provider-issued tile template and its
required visible attribution. The public OpenStreetMap tile and Nominatim
servers are development-scale services, not LOOPS production infrastructure.

## Ireland beta measurement

Signed-in beta route views, saves, GPX downloads, ride plans and explicit ride
confirmations are stored as privacy-minimised first-party events tied to the
exact reviewed route version. Apply `003_ireland_beta_measurement.sql` before
deploying this flow. KPI definitions and cohort rules are documented in
`docs/relaunch/IRELAND_BETA_MEASUREMENT.md`.

Run `npm run audit:beta-readiness` against a migrated staging/copy database to
test the fixed 24-case Dublin/Wicklow discovery set and eight human-assessed
workout cases. It is read-only and exits non-zero until the supply gates pass.

## Closed-beta intake

Apply `005_beta_cohort_intake.sql` before deploying the invitation workflow.
Signed-in candidates apply at `/beta` as a rider or founding contributor. An
administrator approves, waitlists or declines the application in the `Beta`
admin queue. Approved riders can search; approved contributors can also upload
their own completed-ride files and track decisions at `/submissions`. A route,
its immutable first version and pending attestation are created atomically.
Rejected, stale or quarantined routes can receive a newer ridden version and
must pass independent review again. Apply `006_route_version_integrity.sql` so
evidence, reviews, workout assessments and beta events cannot reference a
version belonging to another route. Admin access remains available for
operational rehearsal.

## Error monitoring

Apply `004_operational_error_monitoring.sql` before deployment. API errors are
grouped in a privacy-safe administrator queue and receive a support reference;
uncaught errors emit a compatible structured hosting log. Raw messages,
request data and network/device identifiers are excluded from the queue. The
production alert setup and test procedure is in
`docs/relaunch/ERROR_MONITORING_RUNBOOK.md`.

## Synthetic seed data

Synthetic community data is prohibited in production. The historical seed
script now requires an isolated non-production database and the explicit
`LOOPS_ALLOW_SYNTHETIC_SEED=true` environment variable. Its routes remain
pending and unverified.
