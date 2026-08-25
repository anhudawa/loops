/**
 * Map-match approved completed rides into the private directed-road graph.
 * Writes are staging-only and require an explicitly approved contracted or
 * self-hosted Valhalla endpoint. No route or proposal is created here.
 */
import { createHash } from "node:crypto";
import { createClient } from "@vercel/postgres";
import {
  createRoadMapMatcherFromEnv,
  type MatchedRoadEdge,
  type RoadCoordinate,
} from "../src/lib/road-intelligence/map-matcher";

const apply = process.argv.includes("--apply");
const areaArg = process.argv.find((arg) => arg.startsWith("--area="));
const areaId = areaArg?.split("=")[1] || "clontarf";
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Math.max(1, Math.min(100, Number(limitArg?.split("=")[1] || 10)));

const target = process.env.LOOPS_DEPLOYMENT_ENV;
const databaseTarget = process.env.LOOPS_DATABASE_TARGET;
const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (target !== "staging" || databaseTarget !== "staging") {
  throw new Error("Road intelligence sync is staging-only");
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

type AreaRow = {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  coverage_radius_km: number;
};

type EvidenceRow = {
  attestation_id: string;
  route_id: string;
  route_version_id: string;
  ridden_at: string;
  start_lat: number;
  start_lng: number;
  coordinates: string;
};

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

function parseCoordinates(raw: string): RoadCoordinate[] {
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value)) throw new Error("Route version coordinates are not an array");
  return value.map((point) => {
    if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new Error("Route version contains an invalid coordinate");
    }
    return [Number(point[0]), Number(point[1])] as RoadCoordinate;
  });
}

function deterministicId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 28)}`;
}

async function upsertEdge(
  client: ReturnType<typeof createClient>,
  edge: MatchedRoadEdge
): Promise<string> {
  const begin = edge.geometry[0];
  const end = edge.geometry.at(-1)!;
  const result = await client.query<{ id: string }>(
    `INSERT INTO road_edges (
      id, edge_key, network_provider, provider_edge_id, graph_version,
      osm_way_id, from_osm_node_id, to_osm_node_id, traversal_direction,
      names, geometry, begin_lat, begin_lng, end_lat, end_lng, length_m,
      road_class, road_use, surface, traversability, cycle_lane,
      bicycle_network, speed_limit_kmh, lane_count, density, weighted_grade,
      max_upward_grade, max_downward_grade, mean_elevation_m, unpaved,
      tunnel, bridge, roundabout, shoulder, traffic_signal
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
      $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
      $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35
    )
    ON CONFLICT (edge_key) DO UPDATE SET
      provider_edge_id = EXCLUDED.provider_edge_id,
      graph_version = EXCLUDED.graph_version,
      names = EXCLUDED.names,
      geometry = EXCLUDED.geometry,
      begin_lat = EXCLUDED.begin_lat,
      begin_lng = EXCLUDED.begin_lng,
      end_lat = EXCLUDED.end_lat,
      end_lng = EXCLUDED.end_lng,
      length_m = EXCLUDED.length_m,
      road_class = EXCLUDED.road_class,
      road_use = EXCLUDED.road_use,
      surface = EXCLUDED.surface,
      traversability = EXCLUDED.traversability,
      cycle_lane = EXCLUDED.cycle_lane,
      bicycle_network = EXCLUDED.bicycle_network,
      speed_limit_kmh = EXCLUDED.speed_limit_kmh,
      lane_count = EXCLUDED.lane_count,
      density = EXCLUDED.density,
      weighted_grade = EXCLUDED.weighted_grade,
      max_upward_grade = EXCLUDED.max_upward_grade,
      max_downward_grade = EXCLUDED.max_downward_grade,
      mean_elevation_m = EXCLUDED.mean_elevation_m,
      unpaved = EXCLUDED.unpaved,
      tunnel = EXCLUDED.tunnel,
      bridge = EXCLUDED.bridge,
      roundabout = EXCLUDED.roundabout,
      shoulder = EXCLUDED.shoulder,
      traffic_signal = EXCLUDED.traffic_signal,
      updated_at = NOW()
    RETURNING id`,
    [
      edge.id, edge.edgeKey, edge.provider, edge.providerEdgeId, edge.graphVersion,
      edge.osmWayId, edge.fromOsmNodeId, edge.toOsmNodeId, edge.traversalDirection,
      JSON.stringify(edge.names), JSON.stringify(edge.geometry), begin[0], begin[1], end[0], end[1],
      edge.lengthM, edge.roadClass, edge.roadUse, edge.surface, edge.traversability,
      edge.cycleLane, edge.bicycleNetwork, edge.speedLimitKmh, edge.laneCount,
      edge.density, edge.weightedGrade, edge.maxUpwardGrade, edge.maxDownwardGrade,
      edge.meanElevationM, edge.unpaved, edge.tunnel, edge.bridge, edge.roundabout,
      edge.shoulder, edge.trafficSignal,
    ]
  );
  return result.rows[0].id;
}

const client = createClient({ connectionString });
await client.connect();
try {
  const table = await client.query<{ table_name: string | null }>(
    "SELECT to_regclass('public.road_intelligence_areas')::text AS table_name"
  );
  if (!table.rows[0].table_name) throw new Error("Clontarf road intelligence migration is not applied");
  const areaResult = await client.query<AreaRow>(
    `SELECT id, name, center_lat, center_lng, coverage_radius_km
     FROM road_intelligence_areas WHERE id = $1 AND status = 'active'`,
    [areaId]
  );
  const area = areaResult.rows[0];
  if (!area) throw new Error(`Active road intelligence area not found: ${areaId}`);

  const evidenceResult = await client.query<EvidenceRow>(
    `SELECT ra.id AS attestation_id, ra.route_id, ra.route_version_id,
       TO_CHAR(ra.ridden_at, 'YYYY-MM-DD') AS ridden_at,
       r.start_lat, r.start_lng, rv.coordinates
     FROM ride_attestations ra
     JOIN route_versions rv ON rv.id = ra.route_version_id AND rv.route_id = ra.route_id
     JOIN routes r ON r.id = ra.route_id
     WHERE ra.review_status = 'approved'
       AND r.country = 'Ireland'
       AND r.discipline = 'road'
       AND NOT EXISTS (
         SELECT 1 FROM ride_edge_observations reo
         WHERE reo.area_id = $1 AND reo.ride_attestation_id = ra.id
       )
     ORDER BY ra.ridden_at DESC, ra.id
     LIMIT $2::int`,
    [area.id, limit]
  );
  const eligible = evidenceResult.rows.filter((row) =>
    haversineKm(
      [Number(row.start_lat), Number(row.start_lng)],
      [Number(area.center_lat), Number(area.center_lng)]
    ) <= Number(area.coverage_radius_km)
  );

  if (!apply) {
    console.log(JSON.stringify({
      checked_at: new Date().toISOString(),
      mode: "dry_run",
      area: { id: area.id, name: area.name, radius_km: Number(area.coverage_radius_km) },
      approved_unmatched_rides: eligible.length,
      provider_configured: Boolean(process.env.VALHALLA_URL),
      roads_written: false,
      routes_written: false,
      proposals_written: false,
    }, null, 2));
    process.exit(0);
  }

  if (process.env.LOOPS_MAP_MATCHING_APPROVAL !== "contracted-or-self-hosted-valhalla") {
    throw new Error("Apply requires contracted or self-hosted Valhalla approval");
  }
  const matcher = createRoadMapMatcherFromEnv();
  let ridesProcessed = 0;
  let edgesObserved = 0;

  for (const evidence of eligible) {
    const coordinates = parseCoordinates(evidence.coordinates);
    const matched = await matcher.match(coordinates);
    await client.query("BEGIN");
    try {
      for (const edge of matched.edges) {
        const edgeId = await upsertEdge(client, edge);
        const observationId = deterministicId(
          "obs",
          `${area.id}:${evidence.attestation_id}:${edge.sequenceNo}:${edge.edgeKey}`
        );
        await client.query(
          `INSERT INTO ride_edge_observations (
            id, area_id, road_edge_id, route_id, route_version_id,
            ride_attestation_id, sequence_no, observed_at,
            source_percent_along, target_percent_along, match_confidence
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (area_id, ride_attestation_id, sequence_no) DO NOTHING`,
          [
            observationId, area.id, edgeId, evidence.route_id, evidence.route_version_id,
            evidence.attestation_id, edge.sequenceNo, evidence.ridden_at,
            edge.sourcePercentAlong, edge.targetPercentAlong, edge.matchConfidence,
          ]
        );
      }
      await client.query("COMMIT");
      ridesProcessed += 1;
      edgesObserved += matched.edges.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log(JSON.stringify({
    checked_at: new Date().toISOString(),
    mode: "staging_apply",
    area: area.id,
    rides_processed: ridesProcessed,
    edge_observations_written: edgesObserved,
    routes_written: false,
    proposals_written: false,
  }, null, 2));
} finally {
  await client.end();
}
