# LOOPS Vercel infrastructure audit

Status: read-only audit complete; staging is not isolated  
Audited: 25 August 2026  
Scope: Vercel projects owned by `anhudawa`; no environment values retrieved

## Current projects

| Vercel project | Current role | Evidence | Relaunch decision |
|---|---|---|---|
| `gravel-ireland` | Live production | Aliases include `loops.ie` and `www.loops.ie`; latest production deployment inspected as Ready | Treat as production only. Do not link the relaunch branch or run migrations against it yet. |
| `loops` | Unused/legacy deployment | Serves `loops-ten.vercel.app`; environment-variable list is empty | Not a usable staging environment without deliberate configuration and an isolated database. |

Both inspected deployments dated from 12 June 2026. This audit did not deploy,
change aliases, retrieve secret values or modify either project.

## Critical finding: preview is not staging

On `gravel-ireland`, the PostgreSQL/Neon environment records—including
`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `DATABASE_URL`, host, database and
password records—each target development, preview and production together.
That is one credential record shared across those targets, not evidence of an
isolated preview database.

Therefore:

- a Vercel preview deployment must be assumed capable of reading and writing
  the production database;
- preview cannot be used for the first provenance migration or end-to-end
  rehearsal;
- merely setting `LOOPS_DEPLOYMENT_ENV=staging` would be a false label and is
  explicitly prohibited by the migration runbook;
- the relaunch branch must not be linked/deployed until its preview environment
  points to a separately created database branch/copy.

## Missing relaunch controls

The live project does not currently list these mandatory relaunch variables:

- `LOOPS_DEPLOYMENT_ENV`;
- `LOOPS_DATABASE_TARGET`;
- `LOOPS_EXPECTED_DATABASE_HOST`;
- `LOOPS_EXPECTED_DATABASE_NAME`;
- `LOOPS_TOKEN_ENCRYPTION_KEY`;
- `NEXT_PUBLIC_MAP_TILE_URL`;
- `NEXT_PUBLIC_MAP_ATTRIBUTION`;
- production legal-review and monitoring sign-off variables.

Historical Strava client credentials are still configured for production.
The relaunch endpoints are hard-disabled and the deployment preflight rejects
those credentials, but they must be revoked/removed during the credential
rotation before relaunch.

## Safe staging creation sequence

1. Create a new Neon/PostgreSQL branch or restored copy from a verified
   production backup. Record its branch/database identifier and restore point.
2. Prove the new database host and name differ from production.
3. Use a dedicated Vercel staging project or preview scope whose database
   records target only that copy. Do not reuse the current shared records.
4. Add the explicit staging target, expected host/name, new 32-byte token key,
   staging base URL, contracted map configuration and a staging sign-in client.
5. Remove disabled Strava/Garmin credentials from the staging scope.
6. Run `npm run preflight:deploy`; retain the JSON result. It must pass before a
   database command is attempted.
7. Run migration status and the provenance audit read-only, then apply the
   numbered migrations with the legacy-quarantine acknowledgement.
8. Complete the two-person submit/review/publish, GPX-access, ride-plan,
   quarantine, recovery and monitoring rehearsal.
9. Retain all reports and only then prepare the separate production evidence
   pack.

## Authority still required

Creating the database branch, changing Vercel project environment records,
rotating production credentials, linking the Git branch and deploying are
external state changes. They should be performed only after the founder
confirms the staging project/database choice and backup owner.
