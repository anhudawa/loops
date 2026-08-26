/** Read-only evaluation of the fixed Clontarf demand benchmark. */
import { getRoadPlanningInputs } from "../src/lib/db";
import { planEvidenceBackedLoop } from "../src/lib/road-intelligence/evidence-planner";

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (process.env.LOOPS_DEPLOYMENT_ENV !== "staging" || process.env.LOOPS_DATABASE_TARGET !== "staging") {
  throw new Error("Clontarf benchmark evaluation is staging-only");
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

const inputs = await getRoadPlanningInputs("clontarf");
const results = inputs.benchmarks.map((benchmark) =>
  planEvidenceBackedLoop(benchmark, inputs.edges)
);
const statuses = results.reduce<Record<string, number>>((counts, result) => {
  counts[result.status] = (counts[result.status] ?? 0) + 1;
  return counts;
}, {});
const invalidCandidate = results.some((result) =>
  (result.status === "candidate" && !result.candidate) ||
  (result.status !== "candidate" && result.candidate?.supportingObservationIds.length === 0)
);
const output = {
  checked_at: new Date().toISOString(),
  mode: "read_only",
  algorithm_version: results[0]?.algorithmVersion ?? null,
  passed: results.length === 12 && !invalidCandidate,
  area: inputs.area,
  approved_graph_edges_loaded: inputs.edges.length,
  benchmark_queries: results.length,
  four_hour_benchmarks: inputs.benchmarks.filter((benchmark) => benchmark.durationMinutes === 240).length,
  statuses,
  results: results.map((result) => ({
    demand_id: result.demandId,
    label: result.label,
    status: result.status,
    reason: result.reason,
    target_distance_km: result.target.distanceKm,
    candidate_distance_km: result.candidate?.distanceKm ?? null,
    candidate_edge_count: result.candidate?.edgeIds.length ?? 0,
  })),
  routes_written: false,
  proposals_written: false,
};
console.log(JSON.stringify(output, null, 2));
if (!output.passed) process.exitCode = 1;
