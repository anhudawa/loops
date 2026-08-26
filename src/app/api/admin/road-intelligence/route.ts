import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getRoadIntelligenceCoverage, getRoadPlanningInputs } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { planEvidenceBackedLoop, roadCoverageState } from "@/lib/road-intelligence/evidence-planner";

const ADMIN_COVERAGE_EDGE_LIMIT = 5_000;

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
    const coverageEdgeRecords = planningInputs.edges.map((edge) => ({
      id: edge.id,
      coordinates: edge.geometry,
      length_km: Math.round(edge.lengthM / 100) / 10,
      state: roadCoverageState(edge),
      observed_at: edge.observedAt,
      lower_stress_score: edge.lowerStressScore,
      flow_score: edge.flowScore,
      scenic_score: edge.scenicScore,
      assessment: edge.assessment ? {
        surface: edge.assessment.surfaceRating,
        traffic: edge.assessment.trafficRating,
        sightlines: edge.assessment.sightlinesRating,
        flow: edge.assessment.flowRating,
      } : null,
    }));
    coverageEdgeRecords.sort((a, b) => {
      const priority = { known_safety_warning: 0, current_assessed: 1, current_unassessed: 2, stale: 3, invalid: 4 };
      return priority[a.state] - priority[b.state] || b.observed_at.localeCompare(a.observed_at) || a.id.localeCompare(b.id);
    });
    const coverageEdges = coverageEdgeRecords.slice(0, ADMIN_COVERAGE_EDGE_LIMIT);
    return NextResponse.json({
      ...coverage,
      planning_area: planningInputs.area,
      evaluated_at: new Date().toISOString(),
      coverage_edges: coverageEdges,
      coverage_edge_total: coverageEdgeRecords.length,
      coverage_edges_truncated: coverageEdgeRecords.length > coverageEdges.length,
      benchmark_readiness: benchmarkReadiness,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
