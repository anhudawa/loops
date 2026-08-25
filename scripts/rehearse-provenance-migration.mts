import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { buildIrelandBetaMetricsQuery } from "../src/lib/beta-metrics";
import { readOrderedMigrations } from "./migration-files";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const migrationDirectory = new URL("../migrations/", import.meta.url);
const migrations = await readOrderedMigrations(migrationDirectory);

const db = new PGlite();

try {
  // Representative legacy schema: only the objects and columns the ordered
  // provenance migration depends on. This database is in-memory and cannot
  // reach staging or production.
  await db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      strava_id TEXT,
      strava_access_token TEXT,
      strava_refresh_token TEXT,
      strava_token_expires_at BIGINT
    );

    CREATE TABLE routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      distance_km REAL NOT NULL,
      elevation_gain_m REAL NOT NULL,
      elevation_loss_m REAL NOT NULL,
      surface_type TEXT NOT NULL,
      county TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Ireland',
      region TEXT,
      discipline TEXT NOT NULL DEFAULT 'road',
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      gpx_filename TEXT,
      coordinates TEXT NOT NULL,
      created_by TEXT REFERENCES users(id),
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      quality_status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE conditions (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE garmin_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      access_token TEXT NOT NULL,
      token_secret TEXT NOT NULL,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO users (id, email, name, role) VALUES
      ('admin-1', 'admin@example.test', 'Admin Reviewer', 'admin'),
      ('rider-1', 'rider@example.test', 'Aoife Rider', 'user');

    UPDATE users SET
      strava_id = 'legacy-strava',
      strava_access_token = 'legacy-plaintext-access',
      strava_refresh_token = 'legacy-plaintext-refresh',
      strava_token_expires_at = 9999999999
    WHERE id = 'rider-1';

    INSERT INTO garmin_tokens (user_id, access_token, token_secret)
    VALUES ('rider-1', 'legacy-garmin-access', 'legacy-garmin-secret');

    INSERT INTO routes (
      id, name, distance_km, elevation_gain_m, elevation_loss_m,
      surface_type, county, country, region, discipline,
      start_lat, start_lng, coordinates, created_by, verified, quality_status
    ) VALUES (
      'legacy-route', 'Legacy Wicklow Loop', 52, 720, 720,
      'road', 'Wicklow', 'Ireland', 'Wicklow', 'road',
      53.1, -6.2, '[[53.1,-6.2,100],[53.2,-6.3,150],[53.1,-6.2,100]]',
      'rider-1', TRUE, 'approved'
    );

    UPDATE routes SET gpx_filename = 'Aoife-Rider-private-activity-123.gpx'
    WHERE id = 'legacy-route';
  `);

  await db.exec(`
    CREATE TABLE schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const migration of migrations) {
    await db.exec(migration.sql);
    await db.query(
      "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
      [migration.filename, migration.checksum]
    );
  }

  const ledger = await db.query<{ filename: string; checksum: string }>(
    "SELECT filename, checksum FROM schema_migrations ORDER BY filename"
  );
  assert.deepEqual(
    ledger.rows.map((row) => row.filename),
    migrations.map((migration) => migration.filename)
  );
  assert.ok(ledger.rows.every((row) => /^[a-f0-9]{64}$/.test(row.checksum)));

  const legacy = await db.query<{
    publication_status: string;
    human_ridden: boolean;
    last_ridden_at: string | null;
    current_version_id: string | null;
  }>(`
    SELECT publication_status, human_ridden, last_ridden_at, current_version_id
    FROM routes WHERE id = 'legacy-route'
  `);
  assert.equal(legacy.rows[0].publication_status, "draft");
  assert.equal(legacy.rows[0].human_ridden, false);
  assert.equal(legacy.rows[0].last_ridden_at, null);
  assert.equal(legacy.rows[0].current_version_id, null);

  const minimisedFilename = await db.query<{ gpx_filename: string | null }>(
    "SELECT gpx_filename FROM routes WHERE id = 'legacy-route'"
  );
  assert.equal(minimisedFilename.rows[0].gpx_filename, "ridden-route.gpx");

  const clearedTokens = await db.query<{
    strava_id: string | null;
    strava_access_token: string | null;
    garmin_count: number;
  }>(`
    SELECT u.strava_id, u.strava_access_token,
      (SELECT COUNT(*)::int FROM garmin_tokens) AS garmin_count
    FROM users u WHERE u.id = 'rider-1'
  `);
  assert.equal(clearedTokens.rows[0].strava_id, null);
  assert.equal(clearedTokens.rows[0].strava_access_token, null);
  assert.equal(clearedTokens.rows[0].garmin_count, 0);

  const expectedTables = [
    "route_versions",
    "ride_attestations",
    "route_reviews",
    "route_incidents",
    "route_publication_events",
    "route_segment_assessments",
    "beta_product_events",
    "ride_plans",
    "operational_errors",
    "beta_applications",
    "beta_memberships",
    "beta_membership_events",
  ];
  const tables = await db.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const tableNames = new Set(tables.rows.map((row) => row.table_name));
  for (const table of expectedTables) assert.ok(tableNames.has(table), `Missing ${table}`);

  await db.exec(`
    INSERT INTO route_versions (
      id, route_id, version_number, geometry_hash, coordinates,
      distance_km, elevation_gain_m, elevation_loss_m, created_by
    ) VALUES (
      'version-1', 'legacy-route', 1, 'hash-1',
      '[[53.1,-6.2,100],[53.2,-6.3,150],[53.1,-6.2,100]]',
      52, 720, 720, 'rider-1'
    );

    UPDATE routes SET
      publication_status = 'in_review', human_ridden = TRUE,
      last_ridden_at = CURRENT_DATE, rights_confirmed_at = NOW(),
      current_version_id = 'version-1'
    WHERE id = 'legacy-route';

    INSERT INTO ride_attestations (
      id, route_id, route_version_id, rider_user_id, rider_name,
      ridden_at, evidence_type, evidence_reference,
      file_format, source_platform, source_reference,
      evidence_file_hash, evidence_started_at, evidence_ended_at,
      evidence_point_count, evidence_timestamped_point_count,
      rights_statement_version, rights_granted_at, privacy_confirmed_at, review_status,
      reviewed_by, reviewed_at, review_notes
    ) VALUES (
      'attestation-1', 'legacy-route', 'version-1', 'rider-1', 'Aoife Rider',
      CURRENT_DATE, 'gpx', 'private:test-evidence',
      'gpx', 'ridewithgps', 'test-route-123',
      'file-hash-1', NOW() - INTERVAL '2 hours', NOW(), 3, 3,
      'route-rights-v1', NOW(), NOW(), 'approved',
      'admin-1', NOW(), 'Evidence matches the current immutable version.'
    );

    INSERT INTO route_reviews (
      id, route_id, route_version_id, reviewer_id,
      evidence_checked, rights_checked, geometry_checked,
      start_finish_checked, road_suitability_checked, description_checked,
      review_notes, decision
    ) VALUES (
      'review-1', 'legacy-route', 'version-1', 'admin-1',
      TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
      'Full route and contributor evidence checked.', 'approved'
    );

    INSERT INTO route_segment_assessments (
      id, route_id, route_version_id, ride_attestation_id,
      assessor_user_id, assessor_name, assessed_at,
      assessment_statement_version, confirmed_by, confirmed_at,
      start_index, end_index, direction, session_type,
      min_effort_seconds, max_effort_seconds, length_km,
      avg_gradient_pct, max_gradient_pct, gradient_variance,
      surface_rating, traffic_rating, sightlines_rating, junction_count,
      entry_notes, recovery_notes, runout_notes,
      review_status, reviewed_by, reviewed_at, review_notes
    ) VALUES (
      'segment-1', 'legacy-route', 'version-1', 'attestation-1',
      'rider-1', 'Aoife Rider', CURRENT_DATE,
      'segment-assessment-v1', 'admin-1', NOW(),
      0, 2, 'forward', 'threshold',
      600, 1200, 10, 2, 4, 0.5,
      'good', 'low', 'clear', 0,
      'Start after the bridge.', 'Recover on the quiet lane.', 'Clear run-out before the turn.',
      'approved', 'admin-1', NOW(), 'Rider assessment and safety details checked.'
    );

    UPDATE routes SET publication_status = 'published'
    WHERE id = 'legacy-route';

    INSERT INTO beta_product_events (
      id, user_id, route_id, route_version_id, event_type
    ) VALUES (
      'event-1', 'rider-1', 'legacy-route', 'version-1', 'route_view'
    ), (
      'event-2', 'rider-1', 'legacy-route', 'version-1', 'gpx_download'
    );

    INSERT INTO ride_plans (
      id, user_id, route_id, route_version_id
    ) VALUES (
      'plan-1', 'rider-1', 'legacy-route', 'version-1'
    );

    UPDATE ride_plans SET status = 'completed', completed_at = NOW()
    WHERE id = 'plan-1';
  `);

  const measurement = await db.query<{
    event_count: number;
    completed_plan_count: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM beta_product_events) AS event_count,
      (SELECT COUNT(*)::int FROM ride_plans WHERE status = 'completed') AS completed_plan_count
  `);
  assert.equal(measurement.rows[0].event_count, 2);
  assert.equal(measurement.rows[0].completed_plan_count, 1);

  const publicRoutePredicate = `
    r.discipline = 'road'
    AND r.surface_type = 'road'
    AND r.country = 'Ireland'
    AND r.publication_status = 'published'
    AND r.human_ridden = TRUE
    AND r.last_ridden_at >= CURRENT_DATE - INTERVAL '365 days'
    AND r.rights_confirmed_at IS NOT NULL
    AND r.current_version_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM ride_attestations ra
      WHERE ra.route_id = r.id
        AND ra.route_version_id = r.current_version_id
        AND ra.review_status = 'approved'
        AND ra.rights_granted_at IS NOT NULL
    )
    AND EXISTS (
      SELECT 1 FROM route_reviews rr
      WHERE rr.route_id = r.id
        AND rr.route_version_id = r.current_version_id
        AND rr.decision = 'approved'
    )
  `;
  const kpis = await db.query<{
    public_routes: number;
    route_views_28d: number;
    action_conversions_28d: number;
    eligible_ride_plans: number;
    confirmed_within_14_days: number;
  }>(buildIrelandBetaMetricsQuery(publicRoutePredicate));
  assert.equal(kpis.rows[0].public_routes, 1);
  assert.equal(kpis.rows[0].route_views_28d, 1);
  assert.equal(kpis.rows[0].action_conversions_28d, 1);
  assert.equal(kpis.rows[0].eligible_ride_plans, 1);
  assert.equal(kpis.rows[0].confirmed_within_14_days, 1);

  await db.exec(`
    INSERT INTO routes (
      id, name, distance_km, elevation_gain_m, elevation_loss_m,
      surface_type, county, country, region, discipline,
      start_lat, start_lng, coordinates, created_by, verified, quality_status
    ) VALUES (
      'second-route', 'Second Private Loop', 41, 410, 410,
      'road', 'Dublin', 'Ireland', 'Dublin', 'road',
      53.3, -6.3, '[[53.3,-6.3,20],[53.4,-6.4,40],[53.3,-6.3,20]]',
      'rider-1', FALSE, 'pending'
    );
    INSERT INTO route_versions (
      id, route_id, version_number, geometry_hash, coordinates,
      distance_km, elevation_gain_m, elevation_loss_m, created_by
    ) VALUES (
      'version-2', 'second-route', 1, 'hash-2',
      '[[53.3,-6.3,20],[53.4,-6.4,40],[53.3,-6.3,20]]',
      41, 410, 410, 'rider-1'
    );
    UPDATE routes SET current_version_id = 'version-2'
    WHERE id = 'second-route';
  `);

  await assert.rejects(
    db.exec(`
      INSERT INTO ride_attestations (
        id, route_id, route_version_id, rider_user_id, rider_name,
        ridden_at, evidence_type, file_format, source_platform,
        evidence_file_hash, evidence_started_at, evidence_ended_at,
        evidence_point_count, evidence_timestamped_point_count,
        rights_statement_version, rights_granted_at, privacy_confirmed_at
      ) VALUES (
        'mismatched-attestation', 'legacy-route', 'version-2', 'rider-1', 'Aoife Rider',
        CURRENT_DATE, 'gpx', 'gpx', 'ridewithgps', 'mismatched-hash',
        NOW() - INTERVAL '2 hours', NOW(), 30, 30,
        'route-rights-v1', NOW(), NOW()
      )
    `),
    /foreign key constraint/i
  );

  await assert.rejects(
    db.exec(`UPDATE routes SET current_version_id = 'version-2' WHERE id = 'legacy-route'`),
    /foreign key constraint/i
  );

  await assert.rejects(
    db.exec(`
      INSERT INTO beta_product_events (
        id, user_id, route_id, route_version_id, event_type
      ) VALUES (
        'mismatched-event', 'rider-1', 'second-route', 'version-1', 'route_view'
      )
    `),
    /foreign key constraint/i
  );

  await assert.rejects(
    db.exec(`
      INSERT INTO beta_product_events (
        id, user_id, route_id, route_version_id, event_type
      ) VALUES (
        'bad-event', 'rider-1', 'legacy-route', 'version-1', 'precise_location_search'
      )
    `),
    /check constraint/i
  );

  await db.exec(`
    INSERT INTO operational_errors (
      id, fingerprint, source, error_name, last_reference_id
    ) VALUES (
      'error-1', 'fingerprint-1', 'api', 'DatabaseError', 'reference-1'
    );

    INSERT INTO operational_errors (
      id, fingerprint, source, error_name, last_reference_id
    ) VALUES (
      'error-2', 'fingerprint-1', 'api', 'DatabaseError', 'reference-2'
    )
    ON CONFLICT (fingerprint) DO UPDATE SET
      occurrence_count = operational_errors.occurrence_count + 1,
      last_reference_id = EXCLUDED.last_reference_id;
  `);
  const groupedError = await db.query<{
    occurrence_count: number;
    last_reference_id: string;
  }>(`
    SELECT occurrence_count, last_reference_id
    FROM operational_errors WHERE fingerprint = 'fingerprint-1'
  `);
  assert.equal(groupedError.rows[0].occurrence_count, 2);
  assert.equal(groupedError.rows[0].last_reference_id, 'reference-2');

  await db.exec(`
    INSERT INTO beta_applications (
      id, user_id, application_type, home_region, riding_frequency,
      routes_available, session_interests, source_platforms,
      contact_consent_at, privacy_version
    ) VALUES (
      'application-1', 'rider-1', 'contributor', 'South Dublin / North Wicklow',
      'two_to_three', 3, ARRAY['endurance', 'threshold'],
      ARRAY['garmin', 'strava_export'], NOW(), '2026-08-25'
    );

    INSERT INTO beta_memberships (
      user_id, access_level, approved_application_id, approved_by
    ) VALUES (
      'rider-1', 'contributor', 'application-1', 'admin-1'
    );
  `);
  const betaAccess = await db.query<{ access_level: string; status: string }>(`
    SELECT access_level, status FROM beta_memberships WHERE user_id = 'rider-1'
  `);
  assert.equal(betaAccess.rows[0].access_level, "contributor");
  assert.equal(betaAccess.rows[0].status, "active");

  await assert.rejects(
    db.exec(`
      INSERT INTO beta_applications (
        id, user_id, application_type, home_region, riding_frequency,
        session_interests, source_platforms, contact_consent_at, privacy_version
      ) VALUES (
        'bad-application', 'admin-1', 'rider', 'Dublin', 'weekly',
        ARRAY['sprint'], ARRAY['unknown_api'], NOW(), '2026-08-25'
      )
    `),
    /check constraint/i
  );

  await assert.rejects(
    db.exec(`
      INSERT INTO operational_errors (
        id, fingerprint, source, error_name, last_reference_id
      ) VALUES (
        'bad-error', 'bad-fingerprint', 'browser_fingerprint', 'Error', 'bad-reference'
      )
    `),
    /check constraint/i
  );

  await assert.rejects(
    db.exec("UPDATE routes SET publication_status = 'invented' WHERE id = 'legacy-route'"),
    /routes_publication_status_check|check constraint/i
  );
  await assert.rejects(
    db.exec(`
      INSERT INTO route_segment_assessments (
        id, route_id, route_version_id, ride_attestation_id,
        assessor_name, assessed_at, assessment_statement_version,
        confirmed_by, confirmed_at, start_index, end_index, direction,
        session_type, min_effort_seconds, max_effort_seconds, length_km,
        avg_gradient_pct, max_gradient_pct, gradient_variance,
        surface_rating, traffic_rating, sightlines_rating, junction_count,
        entry_notes, recovery_notes, runout_notes
      ) VALUES (
        'bad-segment', 'legacy-route', 'version-1', 'attestation-1',
        'Aoife Rider', CURRENT_DATE, 'segment-assessment-v1',
        'admin-1', NOW(), 0, 2, 'forward', 'motorpacing', 60, 120, 1,
        0, 1, 0, 'good', 'low', 'clear', 0, 'entry', 'recovery', 'runout'
      )
    `),
    /check constraint/i
  );

  console.log(JSON.stringify({
    rehearsal: "passed",
    database: "in-memory PostgreSQL",
    migrations: migrations.map((migration) => `${projectRoot}migrations/${migration.filename}`),
    migration_ledger: "verified",
    verified_tables: expectedTables,
    legacy_catalogue_result: "draft_and_unproven",
    legacy_oauth_result: "revoked",
  }, null, 2));
} finally {
  await db.close();
}
