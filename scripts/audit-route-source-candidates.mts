/** Read-only separation and count audit for the private source-candidate queue. */
import { createClient } from "@vercel/postgres";

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (process.env.LOOPS_DEPLOYMENT_ENV !== "staging" || process.env.LOOPS_DATABASE_TARGET !== "staging") {
  throw new Error("Route source audit is staging-only");
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
  const [totals, destinations, sources, formats] = await Promise.all([
    client.query(`SELECT
      COUNT(*)::int AS candidates,
      COUNT(*) FILTER (WHERE verification_status = 'source_only')::int AS source_only,
      COUNT(*) FILTER (WHERE promoted_route_id IS NOT NULL)::int AS promoted,
      (SELECT COUNT(*)::int FROM routes) AS all_routes,
      (SELECT COUNT(*)::int FROM routes WHERE publication_status = 'published') AS published_routes
      FROM route_source_candidates`),
    client.query("SELECT destination, COUNT(*)::int AS count FROM route_source_candidates GROUP BY destination ORDER BY destination"),
    client.query("SELECT source_name, COUNT(*)::int AS count FROM route_source_candidates GROUP BY source_name ORDER BY source_name"),
    client.query("SELECT route_format, COUNT(*)::int AS count FROM route_source_candidates GROUP BY route_format ORDER BY route_format"),
  ]);
  const row = totals.rows[0];
  const passed = Number(row.candidates) >= 200 && Number(row.source_only) === Number(row.candidates) && Number(row.promoted) === 0;
  console.log(JSON.stringify({
    checked_at: new Date().toISOString(),
    mode: "read_only",
    passed,
    candidates: Number(row.candidates),
    source_only: Number(row.source_only),
    promoted_candidates: Number(row.promoted),
    route_library: { all: Number(row.all_routes), published: Number(row.published_routes) },
    by_destination: Object.fromEntries(destinations.rows.map((item) => [item.destination, Number(item.count)])),
    by_source: Object.fromEntries(sources.rows.map((item) => [item.source_name, Number(item.count)])),
    by_format: Object.fromEntries(formats.rows.map((item) => [item.route_format, Number(item.count)])),
    geometry_present_in_candidate_schema: false,
  }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await client.end();
}
