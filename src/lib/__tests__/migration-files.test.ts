import { describe, expect, it } from "vitest";
import { readOrderedMigrations } from "../../../scripts/migration-files";

describe("ordered migration manifest", () => {
  it("loads every numbered SQL migration in lexical order with a checksum", async () => {
    const migrations = await readOrderedMigrations(new URL("../../../migrations/", import.meta.url));
    expect(migrations.map((migration) => migration.filename)).toEqual([
      "000_runtime_schema.sql",
      "001_human_ridden_provenance.sql",
      "002_clear_plaintext_oauth_tokens.sql",
      "003_ireland_beta_measurement.sql",
      "004_operational_error_monitoring.sql",
      "005_beta_cohort_intake.sql",
      "006_route_version_integrity.sql",
      "007_beta_membership_audit.sql",
      "008_minimise_recording_filenames.sql",
      "009_route_source_candidates.sql",
    ]);
    expect(migrations.every((migration) => /^[a-f0-9]{64}$/.test(migration.checksum))).toBe(true);
  });
});
