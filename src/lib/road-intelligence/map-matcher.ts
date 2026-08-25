import { createHash } from "node:crypto";
import polyline from "@mapbox/polyline";

export type RoadCoordinate = [number, number];

export interface MatchedRoadEdge {
  id: string;
  edgeKey: string;
  provider: "valhalla";
  providerEdgeId: string;
  graphVersion: string | null;
  osmWayId: string | null;
  fromOsmNodeId: string | null;
  toOsmNodeId: string | null;
  traversalDirection: "forward" | "reverse";
  sequenceNo: number;
  names: string[];
  geometry: RoadCoordinate[];
  lengthM: number;
  roadClass: string | null;
  roadUse: string | null;
  surface: string | null;
  traversability: string | null;
  cycleLane: string | null;
  bicycleNetwork: string | null;
  speedLimitKmh: number | null;
  laneCount: number | null;
  density: number | null;
  weightedGrade: number | null;
  maxUpwardGrade: number | null;
  maxDownwardGrade: number | null;
  meanElevationM: number | null;
  unpaved: boolean | null;
  tunnel: boolean | null;
  bridge: boolean | null;
  roundabout: boolean | null;
  shoulder: boolean | null;
  trafficSignal: boolean | null;
  sourcePercentAlong: number | null;
  targetPercentAlong: number | null;
  matchConfidence: number | null;
}

export interface RoadMapMatchResult {
  provider: "valhalla";
  graphVersion: string | null;
  inputPointCount: number;
  submittedPointCount: number;
  matchedPointCount: number;
  edges: MatchedRoadEdge[];
}

interface ValhallaEdge {
  id?: string | number;
  way_id?: string | number;
  begin_osm_node_id?: string | number;
  end_osm_node_id?: string | number;
  forward?: boolean;
  names?: string[];
  length?: number;
  road_class?: string;
  use?: string;
  surface?: string;
  traversability?: string;
  cycle_lane?: string;
  bicycle_network?: string;
  speed_limit?: number;
  lane_count?: number;
  density?: number;
  weighted_grade?: number;
  max_upward_grade?: number;
  max_downward_grade?: number;
  mean_elevation?: number;
  unpaved?: boolean;
  tunnel?: boolean;
  bridge?: boolean;
  roundabout?: boolean;
  shoulder?: boolean;
  traffic_signal?: boolean;
  begin_shape_index?: number;
  end_shape_index?: number;
  source_percent_along?: number;
  target_percent_along?: number;
}

interface ValhallaMatchedPoint {
  type?: string;
  edge_index?: number;
  distance_from_trace_point?: number;
}

interface ValhallaTraceAttributesResponse {
  edges?: ValhallaEdge[];
  shape?: string;
  osm_changeset?: string | number;
  matched_points?: ValhallaMatchedPoint[];
  warnings?: Array<{ text?: string }>;
}

export interface ValhallaMapMatcherOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  maxTracePoints?: number;
  fetchImpl?: typeof fetch;
}

const EDGE_ATTRIBUTES = [
  "edge.id",
  "edge.way_id",
  "edge.begin_osm_node_id",
  "edge.end_osm_node_id",
  "edge.forward",
  "edge.names",
  "edge.length",
  "edge.road_class",
  "edge.begin_shape_index",
  "edge.end_shape_index",
  "edge.traversability",
  "edge.use",
  "edge.unpaved",
  "edge.tunnel",
  "edge.bridge",
  "edge.roundabout",
  "edge.surface",
  "edge.weighted_grade",
  "edge.max_upward_grade",
  "edge.max_downward_grade",
  "edge.mean_elevation",
  "edge.lane_count",
  "edge.cycle_lane",
  "edge.bicycle_network",
  "edge.shoulder",
  "edge.density",
  "edge.speed_limit",
  "edge.traffic_signal",
  "shape",
  "osm_changeset",
  "matched.point",
  "matched.type",
  "matched.edge_index",
  "matched.distance_from_trace_point",
] as const;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function validateCoordinates(coordinates: RoadCoordinate[]): void {
  if (coordinates.length < 2) throw new Error("Map matching requires at least two coordinates");
  for (const point of coordinates) {
    if (
      !Array.isArray(point) || point.length !== 2 ||
      !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
      point[0] < -90 || point[0] > 90 || point[1] < -180 || point[1] > 180
    ) {
      throw new Error("Map matching received an invalid coordinate");
    }
  }
}

export function downsampleTrace(
  coordinates: RoadCoordinate[],
  maxPoints: number
): RoadCoordinate[] {
  if (!Number.isInteger(maxPoints) || maxPoints < 2) throw new Error("maxPoints must be at least 2");
  if (coordinates.length <= maxPoints) return coordinates;
  const sampled: RoadCoordinate[] = [];
  for (let index = 0; index < maxPoints; index++) {
    const sourceIndex = Math.round((index * (coordinates.length - 1)) / (maxPoints - 1));
    const point = coordinates[sourceIndex];
    if (sampled.at(-1) !== point) sampled.push(point);
  }
  return sampled;
}

function edgeConfidence(points: ValhallaMatchedPoint[], edgeIndex: number): number | null {
  const distances = points
    .filter((point) => point.edge_index === edgeIndex && point.type !== "unmatched")
    .map((point) => finiteNumber(point.distance_from_trace_point))
    .filter((distance): distance is number => distance != null);
  if (distances.length === 0) return null;
  const meanDistanceM = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  return Math.round(Math.max(0, Math.min(1, 1 - meanDistanceM / 50)) * 1000) / 1000;
}

function stableEdgeIdentity(
  edge: ValhallaEdge,
  graphVersion: string | null
): { edgeKey: string; fromNode: string | null; toNode: string | null; direction: "forward" | "reverse" } {
  const providerEdgeId = String(edge.id ?? "");
  const wayId = edge.way_id == null ? null : String(edge.way_id);
  const beginNode = edge.begin_osm_node_id == null ? null : String(edge.begin_osm_node_id);
  const endNode = edge.end_osm_node_id == null ? null : String(edge.end_osm_node_id);
  const direction = edge.forward === false ? "reverse" : "forward";
  const fromNode = direction === "forward" ? beginNode : endNode;
  const toNode = direction === "forward" ? endNode : beginNode;
  const edgeKey = wayId && fromNode && toNode
    ? `osm:${wayId}:${fromNode}:${toNode}`
    : `valhalla:${graphVersion ?? "unknown"}:${providerEdgeId}:${direction}`;
  return { edgeKey, fromNode, toNode, direction };
}

function edgeGeometry(
  shape: RoadCoordinate[],
  edge: ValhallaEdge
): RoadCoordinate[] {
  const start = Math.max(0, Math.floor(edge.begin_shape_index ?? 0));
  const end = Math.min(shape.length - 1, Math.ceil(edge.end_shape_index ?? start + 1));
  const geometry = shape.slice(start, end + 1);
  if (geometry.length >= 2) return geometry;
  if (start > 0) return [shape[start - 1], shape[start]];
  if (shape.length >= 2) return shape.slice(0, 2);
  throw new Error("Valhalla returned an edge without usable geometry");
}

export class ValhallaMapMatcher {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxTracePoints: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ValhallaMapMatcherOptions) {
    const parsed = new URL(options.baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("Valhalla URL must use HTTPS unless it is local");
    }
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxTracePoints = options.maxTracePoints ?? 1_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async match(coordinates: RoadCoordinate[]): Promise<RoadMapMatchResult> {
    validateCoordinates(coordinates);
    const submitted = downsampleTrace(coordinates, this.maxTracePoints);
    const url = new URL(`${this.baseUrl}/trace_attributes`);
    if (this.apiKey) url.searchParams.set("api_key", this.apiKey);

    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": "loops.ie-road-intelligence",
      },
      body: JSON.stringify({
        shape: submitted.map(([lat, lng]) => ({ lat, lon: lng })),
        costing: "bicycle",
        costing_options: { bicycle: { bicycle_type: "Road" } },
        shape_match: "map_snap",
        units: "kilometers",
        filters: { action: "include", attributes: EDGE_ATTRIBUTES },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Valhalla map matching failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const data = await response.json() as ValhallaTraceAttributesResponse;
    if (!data.shape || !Array.isArray(data.edges) || data.edges.length === 0) {
      throw new Error("Valhalla returned no matched road edges");
    }
    const shape = polyline.decode(data.shape, 6) as RoadCoordinate[];
    if (shape.length < 2) throw new Error("Valhalla returned an invalid matched shape");
    const graphVersion = data.osm_changeset == null ? null : String(data.osm_changeset);
    const matchedPoints = data.matched_points ?? [];

    const edges = data.edges.map((edge, sequenceNo): MatchedRoadEdge => {
      if (edge.id == null) throw new Error("Valhalla returned an edge without an identifier");
      const lengthKm = finiteNumber(edge.length);
      if (lengthKm == null || lengthKm <= 0) {
        throw new Error("Valhalla returned an edge without a positive length");
      }
      const identity = stableEdgeIdentity(edge, graphVersion);
      const geometry = edgeGeometry(shape, edge);
      const edgeKeyHash = createHash("sha256").update(identity.edgeKey).digest("hex").slice(0, 24);
      return {
        id: `edge_${edgeKeyHash}`,
        edgeKey: identity.edgeKey,
        provider: "valhalla",
        providerEdgeId: String(edge.id),
        graphVersion,
        osmWayId: edge.way_id == null ? null : String(edge.way_id),
        fromOsmNodeId: identity.fromNode,
        toOsmNodeId: identity.toNode,
        traversalDirection: identity.direction,
        sequenceNo,
        names: Array.isArray(edge.names) ? edge.names.filter((name): name is string => typeof name === "string") : [],
        geometry,
        lengthM: lengthKm * 1_000,
        roadClass: edge.road_class ?? null,
        roadUse: edge.use ?? null,
        surface: edge.surface ?? null,
        traversability: edge.traversability ?? null,
        cycleLane: edge.cycle_lane ?? null,
        bicycleNetwork: edge.bicycle_network ?? null,
        speedLimitKmh: finiteNumber(edge.speed_limit),
        laneCount: finiteNumber(edge.lane_count),
        density: finiteNumber(edge.density),
        weightedGrade: finiteNumber(edge.weighted_grade),
        maxUpwardGrade: finiteNumber(edge.max_upward_grade),
        maxDownwardGrade: finiteNumber(edge.max_downward_grade),
        meanElevationM: finiteNumber(edge.mean_elevation),
        unpaved: optionalBoolean(edge.unpaved),
        tunnel: optionalBoolean(edge.tunnel),
        bridge: optionalBoolean(edge.bridge),
        roundabout: optionalBoolean(edge.roundabout),
        shoulder: optionalBoolean(edge.shoulder),
        trafficSignal: optionalBoolean(edge.traffic_signal),
        sourcePercentAlong: finiteNumber(edge.source_percent_along),
        targetPercentAlong: finiteNumber(edge.target_percent_along),
        matchConfidence: edgeConfidence(matchedPoints, sequenceNo),
      };
    });

    return {
      provider: "valhalla",
      graphVersion,
      inputPointCount: coordinates.length,
      submittedPointCount: submitted.length,
      matchedPointCount: matchedPoints.filter((point) => point.type !== "unmatched").length,
      edges,
    };
  }
}

export function createRoadMapMatcherFromEnv(): ValhallaMapMatcher {
  const baseUrl = process.env.VALHALLA_URL;
  if (!baseUrl) {
    throw new Error("VALHALLA_URL is required; LOOPS does not use an uncontracted public map-matching server");
  }
  return new ValhallaMapMatcher({
    baseUrl,
    apiKey: process.env.VALHALLA_API_KEY,
  });
}
