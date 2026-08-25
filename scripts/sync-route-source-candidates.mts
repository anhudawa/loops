/** Metadata-only, staging-only acquisition catalogue sync. Does not import geometry or routes. */
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@vercel/postgres";
import { buildSourceCatalogue } from "./source-candidates/source-catalogue";

const apply = process.argv.includes("--apply");
const candidates = await buildSourceCatalogue();
const sourceCounts = Object.fromEntries(
  [...new Set(candidates.map((candidate) => candidate.sourceName))]
    .sort()
    .map((source) => [source, candidates.filter((candidate) => candidate.sourceName === source).length])
);
const destinationCounts = Object.fromEntries(
  ["Ireland", "Girona", "Mallorca"].map((destination) => [destination, candidates.filter((candidate) => candidate.destination === destination).length])
);

if (candidates.length < 200) {
  throw new Error(`Source catalogue safety floor failed: expected at least 200 candidates, found ${candidates.length}`);
}

if (!apply) {
  console.log(JSON.stringify({
    checked_at: new Date().toISOString(),
    mode: "dry_run",
    candidates: candidates.length,
    by_destination: destinationCounts,
    by_source: sourceCounts,
    geometry_downloaded: false,
    public_routes_written: false,
  }, null, 2));
  process.exit(0);
}

const target = process.env.LOOPS_DEPLOYMENT_ENV;
const databaseTarget = process.env.LOOPS_DATABASE_TARGET;
const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (target !== "staging" || databaseTarget !== "staging") {
  throw new Error("Source candidate writes are staging-only");
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
const importRunId = randomUUID();
const checkedAt = new Date().toISOString();
await client.connect();
try {
  const table = await client.query<{ table_name: string | null }>("SELECT to_regclass('public.route_source_candidates')::text AS table_name");
  if (!table.rows[0].table_name) throw new Error("route_source_candidates migration is not applied");
  await client.query("BEGIN");
  try {
    for (const candidate of candidates) {
      const id = `src_${createHash("sha256").update(candidate.sourceKey).digest("hex").slice(0, 28)}`;
      await client.query(
        `INSERT INTO route_source_candidates (
          id, source_key, rollout_phase, destination, source_name,
          source_page_url, source_track_url, source_external_id, route_name,
          country, region, county, discipline, route_format, distance_km,
          elevation_gain_m, source_evidence, source_claims_recorded,
          source_author_name, source_recorded_at, acquisition_target, next_action,
          source_checked_at, import_run_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )
        ON CONFLICT (source_key) DO UPDATE SET
          rollout_phase = EXCLUDED.rollout_phase,
          destination = EXCLUDED.destination,
          source_name = EXCLUDED.source_name,
          source_page_url = EXCLUDED.source_page_url,
          source_track_url = EXCLUDED.source_track_url,
          source_external_id = EXCLUDED.source_external_id,
          route_name = EXCLUDED.route_name,
          country = EXCLUDED.country,
          region = EXCLUDED.region,
          county = EXCLUDED.county,
          discipline = EXCLUDED.discipline,
          route_format = EXCLUDED.route_format,
          distance_km = EXCLUDED.distance_km,
          elevation_gain_m = EXCLUDED.elevation_gain_m,
          source_evidence = EXCLUDED.source_evidence,
          source_claims_recorded = EXCLUDED.source_claims_recorded,
          source_author_name = EXCLUDED.source_author_name,
          source_recorded_at = EXCLUDED.source_recorded_at,
          acquisition_target = EXCLUDED.acquisition_target,
          next_action = EXCLUDED.next_action,
          source_last_seen_at = NOW(),
          source_checked_at = EXCLUDED.source_checked_at,
          import_run_id = EXCLUDED.import_run_id,
          updated_at = NOW()`,
        [
          id, candidate.sourceKey, candidate.rolloutPhase, candidate.destination, candidate.sourceName,
          candidate.sourcePageUrl, candidate.sourceTrackUrl || null, candidate.sourceExternalId || null,
          candidate.routeName, candidate.country, candidate.region || null, candidate.county || null,
          candidate.discipline, candidate.routeFormat, candidate.distanceKm || null,
          candidate.elevationGainM ?? null, candidate.sourceEvidence, candidate.sourceClaimsRecorded,
          candidate.sourceAuthorName || null, candidate.sourceRecordedAt || null,
          candidate.acquisitionTarget || null, candidate.nextAction, checkedAt, importRunId,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
} finally {
  await client.end();
}

console.log(JSON.stringify({
  checked_at: checkedAt,
  mode: "staging_apply",
  candidates_upserted: candidates.length,
  by_destination: destinationCounts,
  by_source: sourceCounts,
  geometry_downloaded: false,
  public_routes_written: false,
}, null, 2));
