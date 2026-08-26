import { describe, expect, it } from "vitest";
import {
  planEvidenceBackedLoop,
  type EvidencePlanDemand,
  type EvidenceRoadEdge,
  type RoadAssessment,
} from "../road-intelligence/evidence-planner";

const AS_OF = new Date("2026-08-26T12:00:00Z");
const CLONTARF: [number, number] = [53.36081, -6.19685];

const safeAssessment: RoadAssessment = {
  surfaceRating: "good",
  trafficRating: "low",
  sightlinesRating: "clear",
  flowRating: "excellent",
  scenicRating: 4,
};

function demand(overrides: Partial<EvidencePlanDemand> = {}): EvidencePlanDemand {
  return {
    id: "clontarf-test",
    label: "Clontarf test loop",
    origin: CLONTARF,
    durationMinutes: 60,
    durationToleranceMinutes: 5,
    averageSpeedKmh: 20,
    structuredRequest: { session: "endurance", scenic: false, cafe: false, elevation: "any" },
    ...overrides,
  };
}

function loopEdges(
  count = 4,
  options: { observedAt?: string; assessed?: boolean; scenicScore?: number | null; cafeEdge?: number } = {}
): EvidenceRoadEdge[] {
  const radius = 0.012;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return [CLONTARF[0] + Math.sin(angle) * radius, CLONTARF[1] + Math.cos(angle) * radius] as [number, number];
  });
  return points.map((point, index) => {
    const next = points[(index + 1) % count];
    return {
      id: `edge-${index}`,
      supportingObservationId: `observation-${index}`,
      fromNode: `node-${index}`,
      toNode: `node-${(index + 1) % count}`,
      geometry: [point, next],
      lengthM: 20_000 / count,
      observedAt: options.observedAt ?? "2026-08-01",
      lowerStressScore: 82,
      flowScore: 80,
      scenicScore: options.scenicScore === undefined ? 75 : options.scenicScore,
      cafeCount: options.cafeEdge === index ? 1 : 0,
      distanceToCoastM: 500,
      weightedGrade: 0.5,
      unpaved: false,
      roundabout: false,
      trafficSignal: false,
      assessment: options.assessed ? safeAssessment : null,
    };
  });
}

describe("evidence-gated road loop planner", () => {
  it("returns an honest no-evidence state for the empty Clontarf graph", () => {
    const result = planEvidenceBackedLoop(demand(), [], { asOf: AS_OF });
    expect(result.status).toBe("no_evidence");
    expect(result.candidate).toBeNull();
    expect(result.target.distanceKm).toBe(20);
  });

  it("does not treat stale ride observations as current coverage", () => {
    const result = planEvidenceBackedLoop(demand(), loopEdges(4, { observedAt: "2024-01-01" }), { asOf: AS_OF });
    expect(result.status).toBe("no_evidence");
    expect(result.graph.currentDirectedEdges).toBe(0);
  });

  it("builds a deterministic private candidate from a current directed loop", () => {
    const result = planEvidenceBackedLoop(demand(), loopEdges(), { asOf: AS_OF });
    expect(result.status).toBe("candidate");
    expect(result.algorithmVersion).toBe("clontarf-evidence-v1");
    expect(result.candidate).toMatchObject({
      edgeIds: ["edge-0", "edge-1", "edge-2", "edge-3"],
      distanceKm: 20,
      predictedDurationMinutes: 60,
      scenicEvidencePct: 100,
    });
    expect(result.candidate?.supportingObservationIds).toHaveLength(4);
    expect(result.reason).toMatch(/not a public verified route/i);
  });

  it("rejects a graph whose reviewed edges all have known safety failures", () => {
    const edges = loopEdges(4, { assessed: true });
    edges.forEach((edge) => {
      edge.assessment = { ...safeAssessment, trafficRating: "high" };
    });
    const result = planEvidenceBackedLoop(demand(), edges, { asOf: AS_OF });
    expect(result.status).toBe("known_safety_failure");
    expect(result.graph.excludedKnownSafetyFailureEdges).toBe(4);
    expect(result.candidate).toBeNull();
  });

  it("does not claim a scenic benchmark without broad scenic evidence", () => {
    const result = planEvidenceBackedLoop(
      demand({ structuredRequest: { session: "endurance", scenic: true, elevation: "any" } }),
      loopEdges(4, { scenicScore: null }),
      { asOf: AS_OF }
    );
    expect(result.status).toBe("preference_evidence_missing");
    expect(result.reason).toMatch(/scenic evidence/i);
    expect(result.candidate?.scenicEvidencePct).toBe(0);
  });

  it("chooses the loop that satisfies the requested evidence rather than the generic top score", () => {
    const first = loopEdges(4).map((edge, index) => ({
      ...edge,
      id: `a-${index}`,
      fromNode: index === 0 ? "shared-origin" : `a-node-${index}`,
      toNode: index === 3 ? "shared-origin" : `a-node-${index + 1}`,
      geometry: [index === 0 ? CLONTARF : edge.geometry[0], index === 3 ? CLONTARF : edge.geometry[1]],
      cafeCount: 0,
      flowScore: 95,
    }));
    const cafeLoop = loopEdges(4, { cafeEdge: 2 }).map((edge, index) => ({
      ...edge,
      id: `b-${index}`,
      fromNode: index === 0 ? "shared-origin" : `b-node-${index}`,
      toNode: index === 3 ? "shared-origin" : `b-node-${index + 1}`,
      geometry: [index === 0 ? CLONTARF : edge.geometry[0], index === 3 ? CLONTARF : edge.geometry[1]],
      flowScore: 70,
    }));
    const result = planEvidenceBackedLoop(
      demand({ structuredRequest: { session: "endurance", cafe: true, elevation: "any" } }),
      [...first, ...cafeLoop],
      { asOf: AS_OF }
    );
    expect(result.status).toBe("candidate");
    expect(result.candidate?.edgeIds).toEqual(["b-0", "b-1", "b-2", "b-3"]);
    expect(result.candidate?.cafeCount).toBe(1);
  });

  it("requires separate assessed uninterrupted sections for workout reps", () => {
    const edges = loopEdges(8, { assessed: true });
    edges[3].assessment = null;
    const workoutDemand = demand({
      structuredRequest: {
        session: "threshold",
        scenic: false,
        elevation: "any",
        workout: { count: 2, effort_seconds: 180 },
      },
    });
    const result = planEvidenceBackedLoop(workoutDemand, edges, { asOf: AS_OF });
    expect(result.status).toBe("candidate");
    expect(result.candidate?.workoutBlocks.length).toBeGreaterThanOrEqual(2);

    edges.forEach((edge) => { edge.assessment = null; });
    const missing = planEvidenceBackedLoop(workoutDemand, edges, { asOf: AS_OF });
    expect(missing.status).toBe("workout_evidence_missing");
  });

  it("waits for live weather before claiming a tailwind-home fit", () => {
    const result = planEvidenceBackedLoop(
      demand({ structuredRequest: { session: "endurance", scenic: false, elevation: "any", wind_strategy: "tailwind_home" } }),
      loopEdges(),
      { asOf: AS_OF }
    );
    expect(result.status).toBe("dynamic_context_required");
    expect(result.reason).toMatch(/live wind forecast/i);
  });
});
