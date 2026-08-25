# Relaunch deployment runbook

Status: tooling ready; production identified, staging isolation absent
Applies to: Ireland provenance release

The read-only infrastructure findings and safe isolation sequence are recorded
in [`VERCEL_INFRASTRUCTURE_AUDIT.md`](./VERCEL_INFRASTRUCTURE_AUDIT.md). The
current `gravel-ireland` preview environment must be treated as production-data
capable until its shared database credentials are replaced with a verified
database branch/copy.

## Safety rules

- Never deploy application code before its numbered migrations.
- Never apply the first provenance migration to production without a verified
  backup, retained read-only audit and Irish legal sign-off.
- Use a copied/staging database first. Do not substitute the live database and
  label it staging.
- The migration command checks the expected database host, database name and
  deployment target before it can write.
- Existing migration checksums are immutable. A mismatch is a release stop;
  create a new numbered migration rather than editing an applied file.

## Prepare staging

1. Copy `.env.example` to a secret-managed staging environment file outside
   source control and fill in the staging values.
2. Set `LOOPS_DEPLOYMENT_ENV=staging` and
   `LOOPS_DATABASE_TARGET=staging`.
3. Set the exact expected host/name separately from the database URL.
4. Configure a 32-byte token-encryption key, HTTPS application URL, contracted
   tile URL/attribution and at least one complete sign-in method.
5. Keep Strava/Garmin credentials, synthetic seed mode and fresh generation
   disabled.

Run:

```bash
npm run preflight:deploy
npm run migrate:status
npm run audit:provenance
```

For a copied legacy database with no migration ledger, explicitly acknowledge
the intended catalogue quarantine for that one command:

```bash
LOOPS_LEGACY_MIGRATION_APPROVAL=quarantine-legacy-catalogue npm run migrate:apply
```

Then run:

```bash
npm run migrate:status
npm run audit:beta-readiness
npm test
npx tsc --noEmit
npm run lint -- --quiet
npm run build
```

The migration status must show every file as `applied`, with no checksum
mismatch. Publish one test Irish route end to end with separate contributor and
reviewer accounts. Confirm that a draft is private, an approved route is
public, GPX requires sign-in, ride planning is tied to its route version, an
incident quarantines it and an induced staging error reaches the admin queue.

## Production evidence pack

Before any production write, retain:

- backup identifier, timestamp and restore-test result;
- `audit:provenance` JSON output and reviewer sign-off;
- staging `migrate:status` and `audit:beta-readiness` reports;
- legal-review date and reviewed document versions;
- map/provider agreement and required attribution;
- monitoring-provider alert test reference;
- test-route publication, privacy, GPX and quarantine results;
- deployment commit hash and rollback owner.

Set production target, expected host/name and the sign-off dates only after the
evidence exists. The production apply command additionally requires:

```text
LOOPS_PRODUCTION_MIGRATION_APPROVAL=backup-audit-and-legal-signoff-complete
```

That value is an operator assertion, not evidence by itself. Apply migrations,
deploy the application immediately afterward, run the smoke checks, and stop
the release if any public query exposes an unproven route.

## Rollback posture

The provenance migration intentionally changes the catalogue state and clears
legacy plaintext OAuth credentials. Rollback is therefore restore-forward,
not a reverse SQL script: stop traffic, preserve incident/error logs, restore
the verified backup into a new database target, verify it, then repoint the
application. Never attempt to reconstruct cleared credentials or bulk-publish
legacy routes.
