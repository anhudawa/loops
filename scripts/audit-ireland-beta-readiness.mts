/**
 * Read-only launch gate for the fixed Dublin/Wicklow beta search set.
 *
 * Run only against a migrated staging/copy database:
 *   node --env-file=.env.staging --import tsx scripts/audit-ireland-beta-readiness.mts
 */
import { matchLibraryForWorkout, matchLibraryRoutes } from "../src/lib/route-library";
import {
  discoveryCoverageCases,
  workoutCoverageCases,
} from "./ireland-beta-coverage-cases";

if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  console.error("A staging/copy database URL is required. Production must not be used for the first rehearsal.");
  process.exit(2);
}

type CaseResult = {
  id: string;
  label: string;
  result_count: number;
  route_ids: string[];
  passed: boolean;
};

const discoveryResults: CaseResult[] = [];
for (const testCase of discoveryCoverageCases) {
  const matches = await matchLibraryRoutes(testCase.spec, 3);
  discoveryResults.push({
    id: testCase.id,
    label: testCase.label,
    result_count: matches.length,
    route_ids: matches.map((match) => match.route_id),
    passed: matches.length >= 3,
  });
}

const workoutResults: CaseResult[] = [];
for (const testCase of workoutCoverageCases) {
  const matches = await matchLibraryForWorkout(testCase.spec, 3);
  workoutResults.push({
    id: testCase.id,
    label: testCase.label,
    result_count: matches.length,
    route_ids: matches.map((match) => match.route_id),
    passed: matches.length >= 1,
  });
}

const discoveryPassed = discoveryResults.filter((result) => result.passed).length;
const discoveryCoveragePct = Math.round(
  (discoveryPassed / discoveryResults.length) * 1000
) / 10;
const workoutPassed = workoutResults.filter((result) => result.passed).length;
const discoveryGatePassed = discoveryCoveragePct >= 80;
const workoutGatePassed = workoutPassed === workoutResults.length;

const report = {
  generated_at: new Date().toISOString(),
  mode: "read_only",
  database_rule: "staging_or_copy_only_until_release_signoff",
  discovery: {
    rule: "at_least_3_matches_for_80_percent_of_fixed_searches",
    passed_cases: discoveryPassed,
    total_cases: discoveryResults.length,
    coverage_pct: discoveryCoveragePct,
    gate_passed: discoveryGatePassed,
    cases: discoveryResults,
  },
  workouts: {
    rule: "at_least_1_human_assessed_match_for_every_supported_workout_case",
    passed_cases: workoutPassed,
    total_cases: workoutResults.length,
    gate_passed: workoutGatePassed,
    cases: workoutResults,
  },
  overall_gate_passed: discoveryGatePassed && workoutGatePassed,
};

console.log(JSON.stringify(report, null, 2));
if (!report.overall_gate_passed) process.exitCode = 1;
