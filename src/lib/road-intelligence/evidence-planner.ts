/**
 * Evidence-gated loop planning for the private Road Intelligence lab.
 *
 * This module never writes routes or proposals. It searches only directed
 * edges backed by current approved ride observations and returns explicit
 * no-match states when the graph cannot support the request.
 */

export type RoadCoordinate = [number, number];
export const EVIDENCE_PLANNER_VERSION = "clontarf-evidence-v1";
export type RoadCoverageState =
  | "current_assessed"
  | "current_unassessed"
  | "known_safety_warning"
  | "stale"
  | "invalid";

export interface RoadAssessment {
  surfaceRating: "good" | "mixed" | "poor";
  trafficRating: "low" | "moderate" | "high";
  sightlinesRating: "clear" | "mixed" | "poor";
  flowRating: "excellent" | "good" | "interrupted" | "poor";
  scenicRating: number;
}

export interface EvidenceRoadEdge {
  id: string;
  supportingObservationId: string;
  fromNode: string;
  toNode: string;
  geometry: RoadCoordinate[];
  lengthM: number;
  observedAt: string;
  lowerStressScore: number | null;
  flowScore: number | null;
  scenicScore: number | null;
  cafeCount: number;
  distanceToCoastM: number | null;
  weightedGrade: number | null;
  unpaved: boolean | null;
  roundabout: boolean | null;
  trafficSignal: boolean | null;
  assessment: RoadAssessment | null;
}

export interface EvidencePlanDemand {
  id: string;
  label: string;
  origin: RoadCoordinate;
  durationMinutes: number;
  durationToleranceMinutes: number;
  averageSpeedKmh: number;
  structuredRequest: {
    session?: string;
    scenic?: boolean;
    cafe?: boolean;
    elevation?: "flat" | "rolling" | "hilly" | "mountainous" | "any";
    wind_strategy?: string;
    workout?: {
      count?: number;
      effort_seconds?: number;
    };
    [key: string]: unknown;
  };
}

export type EvidencePlanningStatus =
  | "no_evidence"
  | "known_safety_failure"
  | "origin_uncovered"
  | "no_closed_loop"
  | "duration_miss"
  | "preference_evidence_missing"
  | "workout_evidence_missing"
  | "dynamic_context_required"
  | "candidate";

export interface WorkoutEvidenceBlock {
  startEdgeIndex: number;
  endEdgeIndex: number;
  distanceKm: number;
  estimatedEffortMinutes: number;
}

export interface EvidenceLoopCandidate {
  edgeIds: string[];
  supportingObservationIds: string[];
  coordinates: RoadCoordinate[];
  distanceKm: number;
  predictedDurationMinutes: number;
  score: number;
  assessedDistancePct: number;
  scenicEvidencePct: number;
  elevationEvidencePct: number;
  coastalDistancePct: number;
  cafeCount: number;
  estimatedElevationGainM: number;
  workoutBlocks: WorkoutEvidenceBlock[];
  warnings: string[];
}

export interface EvidencePlanningResult {
  demandId: string;
  label: string;
  algorithmVersion: string;
  status: EvidencePlanningStatus;
  reason: string;
  graph: {
    currentDirectedEdges: number;
    currentDirectedKm: number;
    assessedDirectedEdges: number;
    excludedKnownSafetyFailureEdges: number;
    nearestEvidenceKm: number | null;
  };
  target: {
    distanceKm: number;
    minDistanceKm: number;
    maxDistanceKm: number;
  };
  candidate: EvidenceLoopCandidate | null;
}

export interface EvidencePlannerOptions {
  asOf?: Date;
  evidenceFreshnessDays?: number;
  maxOriginDistanceKm?: number;
  beamWidth?: number;
  maxSearchEdges?: number;
}

interface SearchState {
  node: string;
  previousNode: string | null;
  edges: EvidenceRoadEdge[];
  usedEdgeIds: Set<string>;
  distanceM: number;
  qualityTotal: number;
}

const DEFAULT_EVIDENCE_FRESHNESS_DAYS = 365;
const DEFAULT_MAX_ORIGIN_DISTANCE_KM = 3;
const DEFAULT_BEAM_WIDTH = 256;

function haversineKm(a: RoadCoordinate, b: RoadCoordinate): number {
  const radiusKm = 6371;
  const latDelta = ((b[0] - a[0]) * Math.PI) / 180;
  const lngDelta = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const value = Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function observationIsCurrent(observedAt: string, asOf: Date, freshnessDays: number): boolean {
  const observed = new Date(`${observedAt.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(observed.getTime()) || observed > asOf) return false;
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - freshnessDays);
  return observed >= cutoff;
}

function edgeHasKnownSafetyFailure(edge: EvidenceRoadEdge): boolean {
  const assessment = edge.assessment;
  return assessment?.trafficRating === "high" ||
    assessment?.sightlinesRating === "poor" ||
    assessment?.surfaceRating === "poor";
}

export function roadCoverageState(
  edge: EvidenceRoadEdge,
  asOf: Date = new Date(),
  freshnessDays = DEFAULT_EVIDENCE_FRESHNESS_DAYS
): RoadCoverageState {
  if (!edge.supportingObservationId || edge.lengthM <= 0 || edge.geometry.length < 2) return "invalid";
  if (edgeHasKnownSafetyFailure(edge)) return "known_safety_warning";
  if (!observationIsCurrent(edge.observedAt, asOf, freshnessDays)) return "stale";
  return edge.assessment ? "current_assessed" : "current_unassessed";
}

function edgeQuality(edge: EvidenceRoadEdge, demand: EvidencePlanDemand): number {
  const stress = edge.lowerStressScore ?? 50;
  const flow = edge.flowScore ?? 50;
  const scenic = demand.structuredRequest.scenic ? edge.scenicScore ?? 25 : 50;
  const humanAdjustment = !edge.assessment ? 0 :
    edge.assessment.trafficRating === "low" && edge.assessment.flowRating === "excellent" ? 10 : 0;
  return Math.max(0, Math.min(100, stress * 0.45 + flow * 0.35 + scenic * 0.2 + humanAdjustment));
}

function statePriority(state: SearchState, targetDistanceM: number): number {
  const distanceFit = 1 - Math.min(1, Math.abs(targetDistanceM - state.distanceM) / targetDistanceM);
  const averageQuality = state.edges.length > 0 ? state.qualityTotal / state.edges.length / 100 : 0;
  return distanceFit * 0.7 + averageQuality * 0.3;
}

function joinCoordinates(edges: EvidenceRoadEdge[]): RoadCoordinate[] {
  const coordinates: RoadCoordinate[] = [];
  for (const edge of edges) {
    for (const point of edge.geometry) {
      const previous = coordinates.at(-1);
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) coordinates.push(point);
    }
  }
  return coordinates;
}

function estimateElevationGainM(edges: EvidenceRoadEdge[]): number {
  return edges.reduce((total, edge) => {
    const grade = edge.weightedGrade ?? 0;
    return total + (grade > 0 ? edge.lengthM * grade / 100 : 0);
  }, 0);
}

function workoutSpeedKmh(session: string | undefined, fallback: number): number {
  if (session === "sprint") return Math.max(fallback, 42);
  if (session === "vo2" || session === "vo2max") return Math.max(fallback, 36);
  if (session === "threshold") return Math.max(fallback, 32);
  if (session === "tempo") return Math.max(fallback, 29);
  return fallback;
}

function isWorkoutEdge(edge: EvidenceRoadEdge): boolean {
  const assessment = edge.assessment;
  return Boolean(
    assessment &&
    assessment.surfaceRating === "good" &&
    assessment.trafficRating === "low" &&
    assessment.sightlinesRating === "clear" &&
    (assessment.flowRating === "excellent" || assessment.flowRating === "good") &&
    edge.unpaved !== true &&
    edge.roundabout !== true &&
    edge.trafficSignal !== true
  );
}

function workoutBlocks(
  edges: EvidenceRoadEdge[],
  demand: EvidencePlanDemand
): WorkoutEvidenceBlock[] {
  const workout = demand.structuredRequest.workout;
  const effortSeconds = workout?.effort_seconds;
  if (!effortSeconds || effortSeconds <= 0) return [];
  const effortSpeed = workoutSpeedKmh(demand.structuredRequest.session, demand.averageSpeedKmh);
  const minimumDistanceKm = effortSpeed * effortSeconds / 3600;
  const totalDistanceM = edges.reduce((sum, edge) => sum + edge.lengthM, 0);
  const protectedStartM = Math.min(10_000, totalDistanceM * 0.15);
  const protectedEndM = Math.min(8_000, totalDistanceM * 0.1);
  const blocks: WorkoutEvidenceBlock[] = [];
  let routePositionM = 0;
  let blockStart = -1;
  let blockDistanceM = 0;

  const closeBlock = (endIndex: number) => {
    if (blockStart >= 0 && blockDistanceM / 1000 >= minimumDistanceKm) {
      blocks.push({
        startEdgeIndex: blockStart,
        endEdgeIndex: endIndex,
        distanceKm: round(blockDistanceM / 1000),
        estimatedEffortMinutes: round((blockDistanceM / 1000) / effortSpeed * 60),
      });
    }
    blockStart = -1;
    blockDistanceM = 0;
  };

  edges.forEach((edge, index) => {
    const edgeStartM = routePositionM;
    const edgeEndM = routePositionM + edge.lengthM;
    const outsideWarmupAndCooldown = edgeStartM >= protectedStartM && edgeEndM <= totalDistanceM - protectedEndM;
    if (outsideWarmupAndCooldown && isWorkoutEdge(edge)) {
      if (blockStart < 0) blockStart = index;
      blockDistanceM += edge.lengthM;
    } else {
      closeBlock(index - 1);
    }
    routePositionM = edgeEndM;
  });
  closeBlock(edges.length - 1);
  return blocks;
}

function buildCandidate(edges: EvidenceRoadEdge[], demand: EvidencePlanDemand): EvidenceLoopCandidate {
  const distanceM = edges.reduce((sum, edge) => sum + edge.lengthM, 0);
  const assessedDistanceM = edges.reduce((sum, edge) => sum + (edge.assessment ? edge.lengthM : 0), 0);
  const scenicEvidenceM = edges.reduce((sum, edge) => sum + (edge.scenicScore != null ? edge.lengthM : 0), 0);
  const elevationEvidenceM = edges.reduce((sum, edge) => sum + (edge.weightedGrade != null ? edge.lengthM : 0), 0);
  const coastalDistanceM = edges.reduce((sum, edge) =>
    sum + (edge.distanceToCoastM != null && edge.distanceToCoastM <= 1_000 ? edge.lengthM : 0), 0);
  const averageQuality = edges.reduce((sum, edge) => sum + edgeQuality(edge, demand), 0) / edges.length;
  const targetDistanceM = demand.averageSpeedKmh * demand.durationMinutes / 60 * 1000;
  const distanceFit = Math.max(0, 100 - Math.abs(distanceM - targetDistanceM) / targetDistanceM * 100);
  const warnings: string[] = [];
  if (assessedDistanceM < distanceM) warnings.push("Some directed edges lack current human safety assessments.");
  if (edges.some((edge) => edge.lowerStressScore == null || edge.flowScore == null)) {
    warnings.push("Some road-characteristic scores are not yet computed.");
  }

  return {
    edgeIds: edges.map((edge) => edge.id),
    supportingObservationIds: edges.map((edge) => edge.supportingObservationId),
    coordinates: joinCoordinates(edges),
    distanceKm: round(distanceM / 1000),
    predictedDurationMinutes: Math.round(distanceM / 1000 / demand.averageSpeedKmh * 60),
    score: Math.round(distanceFit * 0.65 + averageQuality * 0.35),
    assessedDistancePct: Math.round(assessedDistanceM / distanceM * 100),
    scenicEvidencePct: Math.round(scenicEvidenceM / distanceM * 100),
    elevationEvidencePct: Math.round(elevationEvidenceM / distanceM * 100),
    coastalDistancePct: Math.round(coastalDistanceM / distanceM * 100),
    cafeCount: edges.reduce((sum, edge) => sum + edge.cafeCount, 0),
    estimatedElevationGainM: Math.round(estimateElevationGainM(edges)),
    workoutBlocks: workoutBlocks(edges, demand),
    warnings,
  };
}

function preferenceFailure(candidate: EvidenceLoopCandidate, demand: EvidencePlanDemand): string | null {
  if (demand.structuredRequest.scenic && candidate.scenicEvidencePct < 80) {
    return "The loop lacks scenic evidence on at least 80% of its distance.";
  }
  if (demand.structuredRequest.cafe && candidate.cafeCount < 1) {
    return "The loop has no evidenced café stop.";
  }
  const elevation = demand.structuredRequest.elevation;
  if (elevation && elevation !== "any" && candidate.elevationEvidencePct < 80) {
    return "The loop lacks elevation evidence on at least 80% of its distance.";
  }
  const metresPerKm = candidate.estimatedElevationGainM / Math.max(1, candidate.distanceKm);
  if (elevation === "flat" && metresPerKm > 8) return "The evidenced loop is too hilly for the flat request.";
  if (elevation === "rolling" && (metresPerKm < 5 || metresPerKm > 20)) {
    return "The evidenced loop does not fit the rolling elevation band.";
  }
  if ((elevation === "hilly" || elevation === "mountainous") && metresPerKm < 12) {
    return "The evidenced loop is not hilly enough for the request.";
  }
  if (demand.structuredRequest.vibe === "coastal" && candidate.coastalDistancePct < 25) {
    return "The loop does not have enough evidenced coastal riding for the request.";
  }
  return null;
}

function emptyResult(
  demand: EvidencePlanDemand,
  status: EvidencePlanningStatus,
  reason: string,
  graph: EvidencePlanningResult["graph"],
  target: EvidencePlanningResult["target"],
  candidate: EvidenceLoopCandidate | null = null
): EvidencePlanningResult {
  return {
    demandId: demand.id,
    label: demand.label,
    algorithmVersion: EVIDENCE_PLANNER_VERSION,
    status,
    reason,
    graph,
    target,
    candidate,
  };
}

export function planEvidenceBackedLoop(
  demand: EvidencePlanDemand,
  edges: EvidenceRoadEdge[],
  options: EvidencePlannerOptions = {}
): EvidencePlanningResult {
  if (demand.durationMinutes <= 0 || demand.averageSpeedKmh <= 0) {
    throw new Error("Planning demand requires positive duration and average speed");
  }
  const asOf = options.asOf ?? new Date();
  const freshnessDays = options.evidenceFreshnessDays ?? DEFAULT_EVIDENCE_FRESHNESS_DAYS;
  const maxOriginDistanceKm = options.maxOriginDistanceKm ?? DEFAULT_MAX_ORIGIN_DISTANCE_KM;
  const targetDistanceKm = demand.averageSpeedKmh * demand.durationMinutes / 60;
  const toleranceDistanceKm = demand.averageSpeedKmh * demand.durationToleranceMinutes / 60;
  const target = {
    distanceKm: round(targetDistanceKm),
    minDistanceKm: round(Math.max(1, targetDistanceKm - toleranceDistanceKm)),
    maxDistanceKm: round(targetDistanceKm + toleranceDistanceKm),
  };
  const evidencedEdges = edges.filter((edge) => {
    const state = roadCoverageState(edge, asOf, freshnessDays);
    return state === "current_assessed" || state === "current_unassessed" || state === "known_safety_warning";
  });
  const currentEdges = evidencedEdges.filter((edge) => roadCoverageState(edge, asOf, freshnessDays) !== "known_safety_warning");
  const graph: EvidencePlanningResult["graph"] = {
    currentDirectedEdges: evidencedEdges.length,
    currentDirectedKm: round(evidencedEdges.reduce((sum, edge) => sum + edge.lengthM, 0) / 1000),
    assessedDirectedEdges: evidencedEdges.filter((edge) => edge.assessment != null).length,
    excludedKnownSafetyFailureEdges: evidencedEdges.length - currentEdges.length,
    nearestEvidenceKm: null,
  };
  if (evidencedEdges.length === 0) {
    return emptyResult(demand, "no_evidence", "No current approved human ride evidence is available.", graph, target);
  }
  if (currentEdges.length === 0) {
    return emptyResult(
      demand,
      "known_safety_failure",
      "All current evidence near this request has a reviewed high-traffic, poor-sightline or poor-surface warning.",
      graph,
      target
    );
  }

  const nodeCoordinates = new Map<string, RoadCoordinate>();
  for (const edge of currentEdges) {
    nodeCoordinates.set(edge.fromNode, edge.geometry[0]);
    nodeCoordinates.set(edge.toNode, edge.geometry.at(-1)!);
  }
  const nearest = [...nodeCoordinates.entries()]
    .map(([node, coordinate]) => ({ node, distanceKm: haversineKm(demand.origin, coordinate) }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.node.localeCompare(b.node))[0];
  graph.nearestEvidenceKm = nearest ? round(nearest.distanceKm) : null;
  if (!nearest || nearest.distanceKm > maxOriginDistanceKm) {
    return emptyResult(
      demand,
      "origin_uncovered",
      `The nearest current human-covered road is more than ${maxOriginDistanceKm} km from the requested origin.`,
      graph,
      target
    );
  }

  const outgoing = new Map<string, EvidenceRoadEdge[]>();
  for (const edge of currentEdges) {
    const list = outgoing.get(edge.fromNode) ?? [];
    list.push(edge);
    outgoing.set(edge.fromNode, list);
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const minDistanceM = target.minDistanceKm * 1000;
  const maxDistanceM = target.maxDistanceKm * 1000;
  const targetDistanceM = target.distanceKm * 1000;
  const medianLengthM = [...currentEdges].sort((a, b) => a.lengthM - b.lengthM)[Math.floor(currentEdges.length / 2)].lengthM;
  const maxSearchEdges = options.maxSearchEdges ?? Math.min(2_000, Math.max(40, Math.ceil(maxDistanceM / medianLengthM * 1.4)));
  const beamWidth = options.beamWidth ?? DEFAULT_BEAM_WIDTH;
  let frontier: SearchState[] = [{
    node: nearest.node,
    previousNode: null,
    edges: [],
    usedEdgeIds: new Set<string>(),
    distanceM: 0,
    qualityTotal: 0,
  }];
  const closedLoops: EvidenceRoadEdge[][] = [];
  let closedOutsideDuration = false;

  for (let step = 0; step < maxSearchEdges && frontier.length > 0; step++) {
    const nextFrontier: SearchState[] = [];
    for (const state of frontier) {
      for (const edge of outgoing.get(state.node) ?? []) {
        if (state.usedEdgeIds.has(edge.id)) continue;
        if (state.previousNode && edge.toNode === state.previousNode) continue;
        const nextDistanceM = state.distanceM + edge.lengthM;
        if (nextDistanceM > maxDistanceM * 1.1) continue;
        const nextEdges = [...state.edges, edge];
        if (edge.toNode === nearest.node) {
          if (nextDistanceM >= minDistanceM && nextDistanceM <= maxDistanceM) closedLoops.push(nextEdges);
          else closedOutsideDuration = true;
          continue;
        }
        const nextUsed = new Set(state.usedEdgeIds);
        nextUsed.add(edge.id);
        nextFrontier.push({
          node: edge.toNode,
          previousNode: state.node,
          edges: nextEdges,
          usedEdgeIds: nextUsed,
          distanceM: nextDistanceM,
          qualityTotal: state.qualityTotal + edgeQuality(edge, demand),
        });
      }
    }
    nextFrontier.sort((a, b) =>
      statePriority(b, targetDistanceM) - statePriority(a, targetDistanceM) ||
      a.edges.map((edge) => edge.id).join(":").localeCompare(b.edges.map((edge) => edge.id).join(":"))
    );
    frontier = nextFrontier.slice(0, beamWidth);
  }

  if (closedLoops.length === 0) {
    return emptyResult(
      demand,
      closedOutsideDuration ? "duration_miss" : "no_closed_loop",
      closedOutsideDuration
        ? "Human-covered loops exist, but none fit the requested duration tolerance."
        : "The current directed evidence graph does not contain a closed loop from the origin.",
      graph,
      target
    );
  }

  const candidates = closedLoops
    .map((loop) => buildCandidate(loop, demand))
    .sort((a, b) => b.score - a.score || a.edgeIds.join(":").localeCompare(b.edgeIds.join(":")));
  const preferenceCandidates = candidates.filter((candidate) => preferenceFailure(candidate, demand) == null);
  if (preferenceCandidates.length === 0) {
    const bestAttempt = candidates[0];
    return emptyResult(
      demand,
      "preference_evidence_missing",
      preferenceFailure(bestAttempt, demand) ?? "No evidenced loop satisfies the requested characteristics.",
      graph,
      target,
      bestAttempt
    );
  }

  const workout = demand.structuredRequest.workout;
  const requiredWorkoutCount = workout?.count ?? 0;
  const workoutCandidates = requiredWorkoutCount > 0 && workout?.effort_seconds
    ? preferenceCandidates.filter((candidate) => candidate.workoutBlocks.length >= requiredWorkoutCount)
    : preferenceCandidates;
  if (workoutCandidates.length === 0) {
    return emptyResult(
      demand,
      "workout_evidence_missing",
      `The loop does not contain ${requiredWorkoutCount} independently assessed uninterrupted effort sections.`,
      graph,
      target,
      preferenceCandidates[0]
    );
  }
  const candidate = workoutCandidates[0];
  if (demand.structuredRequest.wind_strategy) {
    return emptyResult(
      demand,
      "dynamic_context_required",
      "A live wind forecast is required before evaluating the requested wind strategy.",
      graph,
      target,
      candidate
    );
  }

  return emptyResult(
    demand,
    "candidate",
    "A private evidence-backed loop candidate fits the benchmark. It is not a public verified route.",
    graph,
    target,
    candidate
  );
}
