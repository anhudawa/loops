/** Guarded ordered migration runner. Use --status for a read-only check. */
import { createClient } from "@vercel/postgres";
import { readOrderedMigrations } from "./migration-files";

const mode = process.argv.includes("--apply") ? "apply" : "status";
const target = process.env.LOOPS_DEPLOYMENT_ENV;
const databaseTarget = process.env.LOOPS_DATABASE_TARGET;
const connectionString = process.env.POSTGRES_URL_NON_POOLING;

if (target !== "staging" && target !== "production") {
  throw new Error("LOOPS_DEPLOYMENT_ENV must be staging or production");
}
if (databaseTarget !== target) {
  throw new Error("LOOPS_DATABASE_TARGET must exactly match LOOPS_DEPLOYMENT_ENV");
}
if (!connectionString) throw new Error("POSTGRES_URL_NON_POOLING is required");

const parsed = new URL(connectionString.replace(/^postgresql:/, "https:"));
const expectedHost = process.env.LOOPS_EXPECTED_DATABASE_HOST;
const expectedName = process.env.LOOPS_EXPECTED_DATABASE_NAME;
const actualName = parsed.pathname.replace(/^\//, "");
if (!expectedHost || parsed.hostname !== expectedHost) {
  throw new Error("Database host does not match LOOPS_EXPECTED_DATABASE_HOST");
}
if (!expectedName || actualName !== expectedName) {
  throw new Error("Database name does not match LOOPS_EXPECTED_DATABASE_NAME");
}

if (mode === "apply" && target === "production") {
  if (process.env.LOOPS_PRODUCTION_MIGRATION_APPROVAL !== "backup-audit-and-legal-signoff-complete") {
    throw new Error("Production migration requires backup, audit and legal sign-off approval");
  }
}

const migrations = await readOrderedMigrations(new URL("../migrations/", import.meta.url));
const client = createClient({ connectionString });
await client.connect();

try {
  const ledgerCheck = await client.query<{ ledger: string | null; routes: string | null }>(`
    SELECT
      to_regclass('public.schema_migrations')::text AS ledger,
      to_regclass('public.routes')::text AS routes
  `);
  const ledgerExists = ledgerCheck.rows[0].ledger != null;
  const legacyDatabase = ledgerCheck.rows[0].routes != null;

  if (mode === "status") {
    const applied = ledgerExists
      ? await client.query<{ filename: string; checksum: string; applied_at: string }>(
          "SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename"
        )
      : { rows: [] };
    const appliedByName = new Map(applied.rows.map((row) => [row.filename, row]));
    const files = migrations.map((migration) => {
      const record = appliedByName.get(migration.filename);
      return {
        filename: migration.filename,
        state: !record ? (ledgerExists ? "pending" : "untracked") :
          record.checksum === migration.checksum ? "applied" : "checksum_mismatch",
        applied_at: record?.applied_at ?? null,
      };
    });
    console.log(JSON.stringify({
      checked_at: new Date().toISOString(),
      mode: "read_only",
      target,
      database: { host: parsed.hostname, name: actualName },
      ledger_exists: ledgerExists,
      legacy_database_detected: legacyDatabase,
      files,
    }, null, 2));
    if (files.some((file) => file.state === "checksum_mismatch")) process.exitCode = 1;
  } else {
    if (
      legacyDatabase && !ledgerExists &&
      process.env.LOOPS_LEGACY_MIGRATION_APPROVAL !== "quarantine-legacy-catalogue"
    ) {
      throw new Error("Legacy database requires explicit approval to quarantine the unsupported catalogue");
    }

    await client.query("SELECT pg_advisory_lock(hashtext('loops_ordered_migrations'))");
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename TEXT PRIMARY KEY,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      for (const migration of migrations) {
        const existing = await client.query<{ checksum: string }>(
          "SELECT checksum FROM schema_migrations WHERE filename = $1",
          [migration.filename]
        );
        if (existing.rows[0]) {
          if (existing.rows[0].checksum !== migration.checksum) {
            throw new Error(`Checksum mismatch for applied migration ${migration.filename}`);
          }
          continue;
        }
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [migration.filename, migration.checksum]
        );
        console.log(JSON.stringify({ event: "migration_applied", filename: migration.filename }));
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('loops_ordered_migrations'))");
    }
  }
} finally {
  await client.end();
}
