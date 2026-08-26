import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getRoadIntelligenceCoverage, getRoadPlanningInputs } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { planEvidenceBackedLoop } from "@/lib/road-intelligence/evidence-planner";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const [coverage, planningInputs] = await Promise.all([
      getRoadIntelligenceCoverage(),
      getRoadPlanningInputs("clontarf"),
    ]);
    const benchmarkReadiness = planningInputs.benchmarks.map((benchmark) => {
      const result = planEvidenceBackedLoop(benchmark, planningInputs.edges);
      return {
        demand_id: result.demandId,
        label: result.label,
        algorithm_version: result.algorithmVersion,
        duration_minutes: benchmark.durationMinutes,
        status: result.status,
        reason: result.reason,
        graph: result.graph,
        target: result.target,
        candidate: result.candidate ? {
          distance_km: result.candidate.distanceKm,
          predicted_duration_minutes: result.candidate.predictedDurationMinutes,
          score: result.candidate.score,
          edge_count: result.candidate.edgeIds.length,
          assessed_distance_pct: result.candidate.assessedDistancePct,
          scenic_evidence_pct: result.candidate.scenicEvidencePct,
          elevation_evidence_pct: result.candidate.elevationEvidencePct,
          coastal_distance_pct: result.candidate.coastalDistancePct,
          cafe_count: result.candidate.cafeCount,
          workout_block_count: result.candidate.workoutBlocks.length,
          warnings: result.candidate.warnings,
        } : null,
      };
    });
    return NextResponse.json({
      ...coverage,
      planning_area: planningInputs.area,
      evaluated_at: new Date().toISOString(),
      benchmark_readiness: benchmarkReadiness,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
