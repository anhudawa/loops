/**
 * Read-only production catalogue audit for the commercial relaunch.
 *
 * Run before applying migrations:
 *   node --env-file=.env.local --import tsx scripts/audit-route-provenance.mts
 *
 * This script never changes data. It identifies the legacy catalogue that
 * must be reviewed or quarantined before the Ireland beta.
 */
import { sql } from "@vercel/postgres";

const [totals, countries, disciplines, sources, seedUsers, stravaRoutes] = await Promise.all([
  sql`
    SELECT
      COUNT(*)::int AS routes,
      COUNT(*) FILTER (WHERE verified = TRUE)::int AS legacy_verified,
      COUNT(*) FILTER (WHERE quality_status = 'approved')::int AS quality_approved,
      COUNT(*) FILTER (WHERE operator_name IS NOT NULL)::int AS operator_attributed
    FROM routes
  `,
  sql`SELECT country, COUNT(*)::int AS routes FROM routes GROUP BY country ORDER BY routes DESC`,
  sql`SELECT discipline, COUNT(*)::int AS routes FROM routes GROUP BY discipline ORDER BY routes DESC`,
  sql`
    SELECT
      COUNT(*) FILTER (WHERE gpx_filename IS NOT NULL)::int AS file_named,
      COUNT(*) FILTER (WHERE operator_name IS NOT NULL)::int AS operator_named,
      COUNT(*) FILTER (WHERE strava_activity_id IS NOT NULL)::int AS strava_linked,
      COUNT(*) FILTER (
        WHERE gpx_filename IS NULL AND operator_name IS NULL AND strava_activity_id IS NULL
      )::int AS source_unrecorded
    FROM routes
  `,
  sql`
    SELECT COUNT(*)::int AS users
    FROM users
    WHERE email LIKE '%@seed.loops.ie'
  `,
  sql`
    SELECT COUNT(*)::int AS routes
    FROM routes
    WHERE strava_activity_id IS NOT NULL
  `,
]);

const report = {
  generated_at: new Date().toISOString(),
  mode: "read_only",
  totals: totals.rows[0],
  countries: countries.rows,
  disciplines: disciplines.rows,
  source_coverage: sources.rows[0],
  synthetic_seed_users: seedUsers.rows[0]?.users ?? 0,
  strava_linked_routes: stravaRoutes.rows[0]?.routes ?? 0,
  required_action:
    "Treat every legacy route as unproven until a human ride, rights grant, immutable version and editorial review are attached.",
};

console.log(JSON.stringify(report, null, 2));

