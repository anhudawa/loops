/** Read-only trust and coverage audit for the Clontarf road intelligence lab. */
import { createClient } from "@vercel/postgres";

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (process.env.LOOPS_DEPLOYMENT_ENV !== "staging" || process.env.LOOPS_DATABASE_TARGET !== "staging") {
  throw new Error("Clontarf road intelligence audit is staging-only");
}
if (!connectionString) throw new Error("POSTGRES_URL_NON_POOLING is required");
const parsed = new URL(connectionString.replace(/^postgresql:/, "https:"));
const actualName = parsed.pathname.replace(/^\//, "");
if (!process.env.LOOPS_EXPECTED_DATABASE_HOST || parsed.hostname !== process.env.LOOPS_EXPECTED_DATABASE_HOST) {
  throw new Error("Database host does not match LOOPS_EXPECTED_DATABASE_HOST");
}
if (!process.env.LOOPS_EXPECTED_DATABASE_NAME || actualName !== process.env.LOOPS_EXPECTED_DATABASE_NAME) {
  throw new Error("Database name does not match LOOPS_EXPECTED_DATABASE_NAME");
}

const client = createClient({ connectionString });
await client.connect();
try {
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM road_intelligence_areas WHERE id = 'clontarf' AND status = 'active') AS active_areas,
      (SELECT COUNT(*)::int FROM road_intelligence_benchmarks WHERE area_id = 'clontarf' AND active) AS benchmarks,
      (SELECT COUNT(*)::int FROM road_intelligence_benchmarks WHERE area_id = 'clontarf' AND active AND duration_minutes = 240) AS four_hour_benchmarks,
      (SELECT COUNT(*)::int FROM road_edges) AS road_edges,
      (SELECT COUNT(*)::int FROM ride_edge_observations WHERE area_id = 'clontarf') AS observations,
      (SELECT COUNT(DISTINCT road_edge_id)::int FROM ride_edge_observations WHERE area_id = 'clontarf') AS observed_edges,
      (SELECT COUNT(*)::int
       FROM ride_edge_observations reo
       LEFT JOIN ride_attestations ra ON ra.id = reo.ride_attestation_id
       WHERE ra.id IS NULL OR ra.review_status <> 'approved' OR ra.route_id <> reo.route_id OR ra.route_version_id <> reo.route_version_id) AS invalid_observations,
      (SELECT COUNT(*)::int
       FROM road_edge_human_assessments reha
       JOIN ride_attestations ra
         ON ra.id = reha.ride_attestation_id
        AND ra.route_id = reha.route_id
        AND ra.route_version_id = reha.route_version_id
        AND ra.review_status = 'approved'
       WHERE reha.review_status = 'approved' AND reha.valid_until >= CURRENT_DATE) AS current_human_assessments,
      (SELECT COUNT(*)::int
       FROM road_edge_human_assessments reha
       LEFT JOIN ride_attestations ra
         ON ra.id = reha.ride_attestation_id
        AND ra.route_id = reha.route_id
        AND ra.route_version_id = reha.route_version_id
        AND ra.review_status = 'approved'
       LEFT JOIN ride_edge_observations reo
         ON reo.ride_attestation_id = reha.ride_attestation_id
        AND reo.route_id = reha.route_id
        AND reo.route_version_id = reha.route_version_id
        AND reo.road_edge_id = reha.road_edge_id
       WHERE reha.review_status = 'approved' AND (ra.id IS NULL OR reo.id IS NULL)) AS invalid_assessments,
      (SELECT COUNT(*)::int FROM route_plan_proposals) AS proposals,
      (SELECT COUNT(*)::int FROM route_plan_proposals WHERE public_eligible OR visibility <> 'team_only') AS invalid_proposals,
      (SELECT COUNT(*)::int
       FROM route_plan_proposals rpp
       WHERE rpp.trust_class = 'human_covered'
         AND (
           NOT EXISTS (
             SELECT 1 FROM route_plan_proposal_edges rppe WHERE rppe.proposal_id = rpp.id
           )
           OR EXISTS (
             SELECT 1
             FROM route_plan_proposal_edges rppe
             LEFT JOIN ride_edge_observations reo
               ON reo.id = rppe.supporting_observation_id
              AND reo.road_edge_id = rppe.road_edge_id
              AND reo.area_id = rpp.area_id
             LEFT JOIN ride_attestations ra
               ON ra.id = reo.ride_attestation_id
              AND ra.route_id = reo.route_id
              AND ra.route_version_id = reo.route_version_id
              AND ra.review_status = 'approved'
             WHERE rppe.proposal_id = rpp.id
               AND (
                 rppe.evidence_state <> 'current_human'
                 OR reo.id IS NULL
                 OR reo.observed_at < CURRENT_DATE - INTERVAL '365 days'
                 OR ra.id IS NULL
               )
           )
         )) AS unsupported_human_covered_proposals,
      (SELECT COUNT(*)::int FROM routes) AS routes,
      (SELECT COUNT(*)::int FROM routes WHERE publication_status = 'published') AS published_routes
  `);
  const row = result.rows[0];
  const passed = Number(row.active_areas) === 1 &&
    Number(row.benchmarks) >= 12 &&
    Number(row.four_hour_benchmarks) >= 5 &&
    Number(row.invalid_observations) === 0 &&
    Number(row.invalid_assessments) === 0 &&
    Number(row.invalid_proposals) === 0 &&
    Number(row.unsupported_human_covered_proposals) === 0;
  console.log(JSON.stringify({
    checked_at: new Date().toISOString(),
    mode: "read_only",
    passed,
    area: "clontarf",
    active_area_records: Number(row.active_areas),
    benchmark_queries: Number(row.benchmarks),
    four_hour_benchmarks: Number(row.four_hour_benchmarks),
    evidence_graph: {
      road_edges: Number(row.road_edges),
      observations: Number(row.observations),
      observed_edges: Number(row.observed_edges),
      current_human_assessments: Number(row.current_human_assessments),
      invalid_observations: Number(row.invalid_observations),
      invalid_assessments: Number(row.invalid_assessments),
    },
    team_only_proposals: {
      total: Number(row.proposals),
      invalid_or_public: Number(row.invalid_proposals),
      unsupported_human_covered: Number(row.unsupported_human_covered_proposals),
    },
    route_library: { all: Number(row.routes), published: Number(row.published_routes) },
  }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await client.end();
}
