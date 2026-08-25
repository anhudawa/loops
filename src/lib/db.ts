import { sql } from "@vercel/postgres";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "node:crypto";
import { DURATION_TIERS, DEFAULT_SPEED_KMH } from "@/config/constants";
import { INTERVAL_FRESHNESS_DAYS, type PublicationStatus } from "@/config/route-policy";
import type { WorkoutSessionType } from "@/lib/workout";
import { openToken, sealToken } from "@/lib/token-crypto";
import { buildIrelandBetaMetricsQuery, ratePercent } from "@/lib/beta-metrics";

// ──── Types ────
export interface Route {
  id: string;
  name: string;
  description: string | null;
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  surface_type: "gravel" | "mixed" | "trail" | "road" | "singletrack" | "technical";
  county: string;
  country: string;
  region: string | null;
  discipline: "road" | "gravel" | "mtb";
  start_lat: number;
  start_lng: number;
  gpx_filename: string | null;
  coordinates: string;
  created_by: string | null;
  created_at: string;
  strava_activity_id: number | null;
  quality_status: "approved" | "failed" | "pending" | null;
  operator_name: string | null;
  operator_url: string | null;
  publication_status?: PublicationStatus;
  human_ridden?: boolean;
  last_ridden_at?: string | null;
  rights_confirmed_at?: string | null;
  current_version_id?: string | null;
  ridden_by_name?: string | null;
  ride_evidence_type?: string | null;
  reviewed_at?: string | null;
}

export interface RouteFilters {
  minDistance?: number;
  maxDistance?: number;
  county?: string;
  country?: string;
  discipline?: string;
  surface_type?: string;
  search?: string;
  sort?: string;
  verified?: boolean;
  lat?: number;
  lng?: number;
  maxRadius?: number;
  limit?: number;
  offset?: number;
  duration?: string;   // "1h" | "2h" | "3h" | "4h+"
  avgSpeedKmh?: number;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin" | "banned";
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  session_token: string | null;
  created_at: string;
  avg_speed_kmh: number;
  strava_id: string | null;
  strava_access_token: string | null;
  strava_refresh_token: string | null;
  strava_token_expires_at: number | null;
}

export interface Rating {
  id: string;
  route_id: string;
  user_id: string;
  score: number;
  created_at: string;
}

export interface Comment {
  id: string;
  route_id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  body: string;
  created_at: string;
}

export interface AdminComment extends Comment {
  user_email: string;
}

export interface Photo {
  id: string;
  route_id: string;
  user_id: string;
  user_name: string | null;
  filename: string;
  caption: string | null;
  created_at: string;
}

export interface Condition {
  id: string;
  route_id: string;
  user_id: string;
  user_name: string | null;
  status: "good" | "fair" | "poor" | "closed";
  note: string;
  created_at: string;
}

export interface UserStats {
  routesRated: number;
  commentsPosted: number;
  conditionsReported: number;
  photosUploaded: number;
}

export type ActivityItem = {
  type: "rating" | "comment" | "condition" | "photo";
  route_id: string;
  route_name: string;
  detail: string;
  created_at: string;
};

export type BetaProductEventType =
  | "route_view"
  | "route_saved"
  | "gpx_download"
  | "device_transfer"
  | "route_planned"
  | "ride_confirmed";

export interface RidePlan {
  id: string;
  user_id: string;
  route_id: string;
  route_version_id: string;
  status: "planned" | "completed" | "cancelled";
  planned_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface IrelandBetaMetrics {
  publicRoutes: number;
  activeRiders28d: number;
  routeViews28d: number;
  actionConversions28d: number;
  routeActionRatePct: number | null;
  eligibleRidePlans: number;
  confirmedWithin14Days: number;
  rideConfirmationRatePct: number | null;
  retentionCohortSize: number;
  retainedAtFourWeeks: number;
  fourWeekRetentionPct: number | null;
}

const PUBLIC_ROUTE_PREDICATE = `
  r.discipline = 'road'
  AND r.surface_type = 'road'
  AND r.country = 'Ireland'
  AND r.publication_status = 'published'
  AND r.human_ridden = TRUE
  AND r.last_ridden_at >= CURRENT_DATE - INTERVAL '365 days'
  AND r.rights_confirmed_at IS NOT NULL
  AND r.current_version_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM ride_attestations ra
    WHERE ra.route_id = r.id
      AND ra.route_version_id = r.current_version_id
      AND ra.review_status = 'approved'
      AND ra.rights_granted_at IS NOT NULL
  )
  AND EXISTS (
    SELECT 1 FROM route_reviews rr
    WHERE rr.route_id = r.id
      AND rr.route_version_id = r.current_version_id
      AND rr.decision = 'approved'
  )
`;

/**
 * Record a privacy-minimised beta action only when it belongs to the exact
 * currently published route version. The database uniqueness constraint
 * reduces repeat renders/clicks to one event per rider, route, action and day.
 */
export async function recordBetaProductEvent(
  userId: string,
  routeId: string,
  routeVersionId: string,
  eventType: BetaProductEventType
): Promise<void> {
  const id = uuidv4();
  await sql.query(
    `INSERT INTO beta_product_events (
       id, user_id, route_id, route_version_id, event_type
     )
     SELECT $1, $2, r.id, r.current_version_id, $3
     FROM routes r
     WHERE r.id = $4
       AND r.current_version_id = $5
       AND ${PUBLIC_ROUTE_PREDICATE}
     ON CONFLICT (user_id, route_id, event_type, event_date) DO NOTHING`,
    [id, userId, eventType, routeId, routeVersionId]
  );
}

export async function getLatestRidePlan(
  userId: string,
  routeId: string
): Promise<RidePlan | undefined> {
  const { rows } = await sql.query(
    `SELECT rp.*
     FROM ride_plans rp
     JOIN routes r ON r.id = rp.route_id
     WHERE rp.user_id = $1
       AND rp.route_id = $2
       AND ${PUBLIC_ROUTE_PREDICATE}
     ORDER BY (rp.status = 'planned') DESC, rp.planned_at DESC
     LIMIT 1`,
    [userId, routeId]
  );
  return rows[0] as RidePlan | undefined;
}

export async function createRidePlan(
  userId: string,
  routeId: string
): Promise<RidePlan | undefined> {
  const id = uuidv4();
  await sql.query(
    `INSERT INTO ride_plans (id, user_id, route_id, route_version_id)
     SELECT $1, $2, r.id, r.current_version_id
     FROM routes r
     WHERE r.id = $3
       AND ${PUBLIC_ROUTE_PREDICATE}
     ON CONFLICT (user_id, route_id) WHERE status = 'planned' DO NOTHING`,
    [id, userId, routeId]
  );

  const plan = await getLatestRidePlan(userId, routeId);
  if (plan?.status === "planned") {
    await recordBetaProductEvent(
      userId,
      routeId,
      plan.route_version_id,
      "route_planned"
    );
    return plan;
  }
  return undefined;
}

export async function completeRidePlan(
  userId: string,
  routeId: string
): Promise<RidePlan | undefined> {
  const { rows } = await sql.query(
    `UPDATE ride_plans
     SET status = 'completed', completed_at = NOW()
     WHERE id = (
       SELECT rp.id
       FROM ride_plans rp
       JOIN routes r ON r.id = rp.route_id
       WHERE rp.user_id = $1
         AND rp.route_id = $2
         AND rp.status = 'planned'
         AND rp.route_version_id = r.current_version_id
         AND ${PUBLIC_ROUTE_PREDICATE}
       ORDER BY rp.planned_at DESC
       LIMIT 1
     )
     RETURNING *`,
    [userId, routeId]
  );
  const plan = rows[0] as RidePlan | undefined;
  if (plan) {
    await recordBetaProductEvent(
      userId,
      routeId,
      plan.route_version_id,
      "ride_confirmed"
    );
  }
  return plan;
}

export async function cancelRidePlan(
  userId: string,
  routeId: string
): Promise<boolean> {
  const { rowCount } = await sql.query(
    `UPDATE ride_plans
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE id = (
       SELECT id FROM ride_plans
       WHERE user_id = $1 AND route_id = $2 AND status = 'planned'
       ORDER BY planned_at DESC
       LIMIT 1
     )`,
    [userId, routeId]
  );
  return (rowCount ?? 0) > 0;
}

// ──── Routes ────
export async function getRoutes(filters: RouteFilters = {}): Promise<Route[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.county) {
    conditions.push(`r.county = $${idx++}`);
    params.push(filters.county);
  }
  if (filters.country) {
    conditions.push(`r.country = $${idx++}`);
    params.push(filters.country);
  }
  if (filters.discipline) {
    conditions.push(`r.discipline = $${idx++}`);
    params.push(filters.discipline);
  }
  if (filters.surface_type) {
    conditions.push(`r.surface_type = $${idx++}`);
    params.push(filters.surface_type);
  }
  if (filters.search) {
    conditions.push(`(r.name ILIKE $${idx} OR r.description ILIKE $${idx} OR r.county ILIKE $${idx} OR r.region ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  // Commercial relaunch trust gate. A public route must be an Irish road
  // route, published by a human reviewer, tied to a completed ride, and
  // accompanied by an explicit rights grant. Legacy verified flags and
  // community ratings are not provenance.
  conditions.push(`r.discipline = 'road'`);
  conditions.push(`r.surface_type = 'road'`);
  conditions.push(`r.country = 'Ireland'`);
  conditions.push(`r.publication_status = 'published'`);
  conditions.push(`r.human_ridden = TRUE`);
  conditions.push(`r.last_ridden_at >= CURRENT_DATE - INTERVAL '365 days'`);
  conditions.push(`r.rights_confirmed_at IS NOT NULL`);
  conditions.push(`r.current_version_id IS NOT NULL`);
  conditions.push(`EXISTS (
    SELECT 1 FROM ride_attestations ra
    WHERE ra.route_id = r.id
      AND ra.route_version_id = r.current_version_id
      AND ra.review_status = 'approved'
      AND ra.rights_granted_at IS NOT NULL
  )`);
  conditions.push(`EXISTS (
    SELECT 1 FROM route_reviews rr
    WHERE rr.route_id = r.id
      AND rr.route_version_id = r.current_version_id
      AND rr.decision = 'approved'
  )`);

  // Duration filtering (uses route fields directly, no aggregation needed)
  const avgSpeed = filters.avgSpeedKmh ?? DEFAULT_SPEED_KMH;
  if (filters.duration && filters.duration in DURATION_TIERS) {
    const tier = DURATION_TIERS[filters.duration as keyof typeof DURATION_TIERS];
    if ("maxMinutes" in tier && tier.maxMinutes !== undefined) {
      conditions.push(`(r.distance_km / $${idx}::numeric * 60 + r.elevation_gain_m / 10) <= $${idx + 1}::numeric`);
      params.push(avgSpeed, tier.maxMinutes);
      idx += 2;
    }
    if ("minMinutes" in tier && tier.minMinutes !== undefined) {
      conditions.push(`(r.distance_km / $${idx}::numeric * 60 + r.elevation_gain_m / 10) >= $${idx + 1}::numeric`);
      params.push(avgSpeed, tier.minMinutes);
      idx += 2;
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Haversine distance + proximity zone support
  const hasLocation = filters.lat !== undefined && filters.lng !== undefined;

  let latIdx = 0;
  let lngIdx = 0;
  if (hasLocation) {
    latIdx = idx++;
    lngIdx = idx++;
    params.push(filters.lat!, filters.lng!);
  }

  // Speed param index for estimated_minutes in SELECT
  const speedIdx = idx++;
  params.push(avgSpeed);

  // Build HAVING clauses
  const havingClauses: string[] = [];
  if (filters.verified) {
    // All rows that survive the public trust gate above are human-ridden.
    havingClauses.push("bool_or(r.human_ridden) = true");
  }
  if (hasLocation && filters.maxRadius !== undefined) {
    havingClauses.push(`(6371 * acos(
      cos(radians($${latIdx})) * cos(radians(r.start_lat)) *
      cos(radians(r.start_lng) - radians($${lngIdx})) +
      sin(radians($${latIdx})) * sin(radians(r.start_lat))
    )) <= $${idx}`);
    params.push(filters.maxRadius);
    idx++;
  }
  const having = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : "";

  // Determine ORDER BY
  const sortMap: Record<string, string> = {
    newest: "r.created_at DESC",
    distance: "r.distance_km DESC",
    rating: "avg_rating DESC NULLS LAST, rating_count DESC",
    nearby: hasLocation ? "haversine_distance ASC" : "r.created_at DESC",
    duration_match: "estimated_minutes ASC",
  };

  let orderBy: string;
  if (filters.sort && sortMap[filters.sort]) {
    orderBy = sortMap[filters.sort];
  } else if (hasLocation) {
    // Default with location: proximity zone with rating boost
    orderBy = "(base_zone + zone_boost) ASC, avg_rating DESC NULLS LAST";
  } else {
    // Default without location: highest rated first
    orderBy = "avg_rating DESC NULLS LAST, rating_count DESC";
  }

  const haversineExpr = hasLocation
    ? `6371 * acos(
        cos(radians($${latIdx})) * cos(radians(r.start_lat)) *
        cos(radians(r.start_lng) - radians($${lngIdx})) +
        sin(radians($${latIdx})) * sin(radians(r.start_lat))
      )`
    : "NULL::double precision";

  const limitVal = (filters.limit ?? 20) + 1; // fetch one extra to check hasMore
  const offsetVal = filters.offset ?? 0;
  const limitIdx = idx++;
  const offsetIdx = idx++;
  params.push(limitVal, offsetVal);

  const query = `
    WITH routes_with_distance AS (
      SELECT r.*,
        COALESCE(AVG(rt.score), 0) as avg_rating,
        COUNT(rt.id) as rating_count,
        (SELECT p.filename FROM photos p WHERE p.route_id = r.id ORDER BY p.created_at LIMIT 1) as cover_photo,
        (SELECT ra.rider_name FROM ride_attestations ra
          WHERE ra.route_id = r.id AND ra.route_version_id = r.current_version_id
            AND ra.review_status = 'approved' ORDER BY ra.reviewed_at DESC LIMIT 1) as ridden_by_name,
        (SELECT ra.evidence_type FROM ride_attestations ra
          WHERE ra.route_id = r.id AND ra.route_version_id = r.current_version_id
            AND ra.review_status = 'approved' ORDER BY ra.reviewed_at DESC LIMIT 1) as ride_evidence_type,
        (SELECT rr.created_at FROM route_reviews rr
          WHERE rr.route_id = r.id AND rr.route_version_id = r.current_version_id
            AND rr.decision = 'approved' ORDER BY rr.created_at DESC LIMIT 1) as reviewed_at,
        1 as is_verified,
        u.name as creator_name, u.avatar_url as creator_avatar,
        COALESCE((SELECT AVG(rt2.score) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating,
        COALESCE((SELECT COUNT(rt2.id) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating_count,
        (SELECT COUNT(*) FROM comments cm WHERE cm.route_id = r.id) as comment_count,
        (r.distance_km / $${speedIdx}::numeric * 60 + r.elevation_gain_m / 10) as estimated_minutes,
        ${haversineExpr} as haversine_distance
      FROM routes r
      LEFT JOIN ratings rt ON rt.route_id = r.id
      LEFT JOIN users u ON u.id = r.created_by
      ${where}
      GROUP BY r.id, u.name, u.avatar_url
      ${having}
    )
    SELECT *,
      CASE
        WHEN haversine_distance IS NULL THEN 3
        WHEN haversine_distance < 25 THEN 1
        WHEN haversine_distance < 75 THEN 2
        ELSE 3
      END AS base_zone,
      CASE
        WHEN avg_rating >= 4.5 AND rating_count >= 3 THEN -1
        ELSE 0
      END AS zone_boost
    FROM routes_with_distance
    ORDER BY ${orderBy}
    LIMIT $${limitIdx}::int OFFSET $${offsetIdx}::int
  `;

  const { rows } = await sql.query(query, params);
  return rows as Route[];
}

export async function getRoute(id: string): Promise<(Route & { is_verified?: number; creator_name?: string | null; creator_avatar?: string | null; creator_rating?: number; creator_rating_count?: number }) | undefined> {
  const { rows } = await sql`
    SELECT r.*,
      (SELECT ra.rider_name FROM ride_attestations ra
        WHERE ra.route_id = r.id AND ra.route_version_id = r.current_version_id
          AND ra.review_status = 'approved' AND ra.rights_granted_at IS NOT NULL
        ORDER BY ra.created_at DESC LIMIT 1) as ridden_by_name,
      (SELECT ra.evidence_type FROM ride_attestations ra
        WHERE ra.route_id = r.id AND ra.route_version_id = r.current_version_id
          AND ra.review_status = 'approved' AND ra.rights_granted_at IS NOT NULL
        ORDER BY ra.created_at DESC LIMIT 1) as ride_evidence_type,
      (SELECT rr.created_at FROM route_reviews rr
        WHERE rr.route_id = r.id AND rr.route_version_id = r.current_version_id
          AND rr.decision = 'approved' ORDER BY rr.created_at DESC LIMIT 1) as reviewed_at,
      CASE WHEN r.publication_status = 'published'
        AND r.discipline = 'road'
        AND r.surface_type = 'road'
        AND r.country = 'Ireland'
        AND r.human_ridden = TRUE
        AND r.last_ridden_at >= CURRENT_DATE - INTERVAL '365 days'
        AND r.rights_confirmed_at IS NOT NULL
        AND r.current_version_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM ride_attestations ra
          WHERE ra.route_id = r.id
            AND ra.route_version_id = r.current_version_id
            AND ra.review_status = 'approved'
            AND ra.rights_granted_at IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM route_reviews rr
          WHERE rr.route_id = r.id
            AND rr.route_version_id = r.current_version_id
            AND rr.decision = 'approved'
        ) THEN 1 ELSE 0 END as is_verified,
      u.name as creator_name, u.avatar_url as creator_avatar,
      COALESCE((SELECT AVG(rt2.score) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating,
      COALESCE((SELECT COUNT(rt2.id) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating_count
    FROM routes r
    LEFT JOIN users u ON u.id = r.created_by
    WHERE r.id = ${id}
  `;
  return rows[0] as (Route & { is_verified?: number; creator_name?: string | null; creator_avatar?: string | null; creator_rating?: number; creator_rating_count?: number }) | undefined;
}

export type NewRouteRecord = Omit<
  Route,
  "created_at" | "quality_status" | "operator_name" | "operator_url"
> & Partial<Pick<Route, "quality_status" | "operator_name" | "operator_url">>;

export async function insertRoute(route: NewRouteRecord): Promise<Route> {
  await sql`
    INSERT INTO routes (
      id, name, description, distance_km, elevation_gain_m, elevation_loss_m,
      surface_type, county, country, region, discipline, start_lat, start_lng,
      gpx_filename, coordinates, created_by, strava_activity_id,
      quality_status, operator_name, operator_url, publication_status,
      human_ridden, last_ridden_at, rights_confirmed_at
    )
    VALUES (
      ${route.id}, ${route.name}, ${route.description}, ${route.distance_km},
      ${route.elevation_gain_m}, ${route.elevation_loss_m}, ${route.surface_type},
      ${route.county}, ${route.country}, ${route.region}, ${route.discipline},
      ${route.start_lat}, ${route.start_lng}, ${route.gpx_filename},
      ${route.coordinates}, ${route.created_by}, ${route.strava_activity_id ?? null},
      ${route.quality_status ?? "pending"}, ${route.operator_name ?? null},
      ${route.operator_url ?? null}, ${route.publication_status ?? "draft"},
      ${route.human_ridden ?? false}, ${route.last_ridden_at ?? null},
      ${route.rights_confirmed_at ?? null}
    )
  `;
  return (await getRoute(route.id))!;
}

export interface InitialRouteProvenance {
  routeId: string;
  userId: string;
  riderName: string;
  riddenAt: string;
  evidenceType: "gpx" | "fit" | "tcx";
  evidenceReference?: string | null;
  sourcePlatform: "garmin" | "ridewithgps" | "komoot" | "wahoo" | "strava_export" | "other";
  sourceReference?: string | null;
  evidenceFileHash: string;
  evidenceStartedAt: string;
  evidenceEndedAt: string;
  evidencePointCount: number;
  evidenceTimestampedPointCount: number;
  coordinates: string;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
}

/**
 * Create the route, immutable first version and ride attestation in one SQL
 * statement. A failed version or attestation therefore cannot leave an
 * orphaned route that the contributor cannot safely retry.
 */
export async function createRiddenRouteSubmission(
  route: NewRouteRecord,
  evidence: Omit<InitialRouteProvenance, "routeId">
): Promise<Route> {
  const versionId = uuidv4();
  const attestationId = uuidv4();
  const geometryHash = createHash("sha256").update(evidence.coordinates).digest("hex");
  const confirmedAt = new Date().toISOString();

  const { rows } = await sql`
    WITH inserted_route AS (
      INSERT INTO routes (
        id, name, description, distance_km, elevation_gain_m, elevation_loss_m,
        surface_type, county, country, region, discipline, start_lat, start_lng,
        gpx_filename, coordinates, created_by, strava_activity_id,
        quality_status, operator_name, operator_url, publication_status,
        human_ridden, last_ridden_at, rights_confirmed_at
      ) VALUES (
        ${route.id}, ${route.name}, ${route.description}, ${route.distance_km},
        ${route.elevation_gain_m}, ${route.elevation_loss_m}, ${route.surface_type},
        ${route.county}, ${route.country}, ${route.region}, ${route.discipline},
        ${route.start_lat}, ${route.start_lng}, ${route.gpx_filename},
        ${route.coordinates}, ${route.created_by}, ${route.strava_activity_id ?? null},
        ${route.quality_status ?? "pending"}, ${route.operator_name ?? null},
        ${route.operator_url ?? null}, 'draft', FALSE, NULL, NULL
      )
      RETURNING id
    ), inserted_version AS (
      INSERT INTO route_versions (
        id, route_id, version_number, geometry_hash, coordinates, distance_km,
        elevation_gain_m, elevation_loss_m, created_by
      )
      SELECT
        ${versionId}, ir.id, 1, ${geometryHash}, ${evidence.coordinates},
        ${evidence.distanceKm}, ${evidence.elevationGainM}, ${evidence.elevationLossM},
        ${evidence.userId}
      FROM inserted_route ir
      RETURNING id, route_id
    ), inserted_attestation AS (
      INSERT INTO ride_attestations (
        id, route_id, route_version_id, rider_user_id, rider_name, ridden_at,
        evidence_type, evidence_reference, file_format, source_platform,
        source_reference, evidence_file_hash, evidence_started_at,
        evidence_ended_at, evidence_point_count,
        evidence_timestamped_point_count, rights_statement_version,
        rights_granted_at, privacy_confirmed_at, review_status
      )
      SELECT
        ${attestationId}, iv.route_id, iv.id, ${evidence.userId},
        ${evidence.riderName}, ${evidence.riddenAt}, ${evidence.evidenceType},
        ${evidence.evidenceReference ?? null}, ${evidence.evidenceType},
        ${evidence.sourcePlatform}, ${evidence.sourceReference ?? null},
        ${evidence.evidenceFileHash}, ${evidence.evidenceStartedAt},
        ${evidence.evidenceEndedAt}, ${evidence.evidencePointCount},
        ${evidence.evidenceTimestampedPointCount}, ${"2026-08-ireland-beta-v2"},
        ${confirmedAt}, ${confirmedAt}, 'pending'
      FROM inserted_version iv
      RETURNING route_id
    )
    UPDATE routes r
    SET current_version_id = iv.id,
        human_ridden = TRUE,
        last_ridden_at = ${evidence.riddenAt},
        rights_confirmed_at = ${confirmedAt},
        publication_status = 'in_review'
    FROM inserted_version iv
    WHERE r.id = iv.route_id
      AND EXISTS (
        SELECT 1 FROM inserted_attestation ia WHERE ia.route_id = r.id
      )
    RETURNING r.*
  `;

  const submitted = rows[0] as Route | undefined;
  if (!submitted) throw new Error("Route submission was not created atomically");
  return submitted;
}

export interface RouteRevisionInput {
  routeId: string;
  userId: string;
  riderName: string;
  description: string | null;
  riddenAt: string;
  evidenceType: "gpx" | "fit" | "tcx";
  evidenceReference: string;
  sourcePlatform: "garmin" | "ridewithgps" | "komoot" | "wahoo" | "strava_export" | "other";
  sourceReference: string | null;
  evidenceFileHash: string;
  evidenceStartedAt: string;
  evidenceEndedAt: string;
  evidencePointCount: number;
  evidenceTimestampedPointCount: number;
  coordinates: string;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  startLat: number;
  startLng: number;
}

/**
 * Supply fresh human evidence for a private/stale/quarantined route. Identical
 * geometry reuses its immutable version; changed geometry creates the next
 * version. Either path takes the route offline and back through review.
 */
export async function createRiddenRouteRevision(
  input: RouteRevisionInput
): Promise<Route | undefined> {
  const newVersionId = uuidv4();
  const attestationId = uuidv4();
  const geometryHash = createHash("sha256").update(input.coordinates).digest("hex");
  const confirmedAt = new Date().toISOString();

  const { rows } = await sql`
    WITH eligible_route AS (
      SELECT r.id,
        COALESCE((SELECT MAX(version_number) FROM route_versions WHERE route_id = r.id), 0) + 1 AS next_version
      FROM routes r
      WHERE r.id = ${input.routeId}
        AND r.created_by = ${input.userId}
        AND r.country = 'Ireland'
        AND r.discipline = 'road'
        AND r.surface_type = 'road'
        AND r.publication_status IN ('draft', 'stale', 'quarantined', 'retired')
      FOR UPDATE
    ), existing_version AS (
      SELECT rv.id, rv.route_id
      FROM route_versions rv
      JOIN eligible_route er ON er.id = rv.route_id
      WHERE rv.geometry_hash = ${geometryHash}
      LIMIT 1
    ), inserted_version AS (
      INSERT INTO route_versions (
        id, route_id, version_number, geometry_hash, coordinates, distance_km,
        elevation_gain_m, elevation_loss_m, created_by
      )
      SELECT
        ${newVersionId}, er.id, er.next_version, ${geometryHash},
        ${input.coordinates}, ${input.distanceKm}, ${input.elevationGainM},
        ${input.elevationLossM}, ${input.userId}
      FROM eligible_route er
      WHERE NOT EXISTS (SELECT 1 FROM existing_version)
      RETURNING id, route_id
    ), selected_version AS (
      SELECT id, route_id FROM existing_version
      UNION ALL
      SELECT id, route_id FROM inserted_version
    ), inserted_attestation AS (
      INSERT INTO ride_attestations (
        id, route_id, route_version_id, rider_user_id, rider_name, ridden_at,
        evidence_type, evidence_reference, file_format, source_platform,
        source_reference, evidence_file_hash, evidence_started_at,
        evidence_ended_at, evidence_point_count,
        evidence_timestamped_point_count, rights_statement_version,
        rights_granted_at, privacy_confirmed_at, review_status
      )
      SELECT
        ${attestationId}, sv.route_id, sv.id, ${input.userId},
        ${input.riderName}, ${input.riddenAt}, ${input.evidenceType},
        ${input.evidenceReference}, ${input.evidenceType}, ${input.sourcePlatform},
        ${input.sourceReference}, ${input.evidenceFileHash},
        ${input.evidenceStartedAt}, ${input.evidenceEndedAt},
        ${input.evidencePointCount}, ${input.evidenceTimestampedPointCount},
        ${"2026-08-ireland-beta-v2"}, ${confirmedAt}, ${confirmedAt}, 'pending'
      FROM selected_version sv
      RETURNING route_id, route_version_id
    )
    UPDATE routes r
    SET current_version_id = ia.route_version_id,
        description = ${input.description},
        distance_km = ${input.distanceKm},
        elevation_gain_m = ${input.elevationGainM},
        elevation_loss_m = ${input.elevationLossM},
        start_lat = ${input.startLat},
        start_lng = ${input.startLng},
        gpx_filename = ${input.evidenceReference},
        coordinates = ${input.coordinates},
        human_ridden = TRUE,
        last_ridden_at = ${input.riddenAt},
        rights_confirmed_at = ${confirmedAt},
        publication_status = 'in_review',
        verified = FALSE,
        quality_status = 'pending'
    FROM inserted_attestation ia
    WHERE r.id = ia.route_id
    RETURNING r.*
  `;

  return rows[0] as Route | undefined;
}

/**
 * Attach the first immutable geometry version and the rider's attestation.
 * The submission enters human review; this function never publishes it.
 */
export async function createInitialRouteProvenance(
  input: InitialRouteProvenance
): Promise<void> {
  const versionId = uuidv4();
  const attestationId = uuidv4();
  const geometryHash = createHash("sha256").update(input.coordinates).digest("hex");
  const rightsGrantedAt = new Date().toISOString();

  await sql`
    WITH inserted_version AS (
      INSERT INTO route_versions (
        id, route_id, version_number, geometry_hash, coordinates, distance_km,
        elevation_gain_m, elevation_loss_m, created_by
      ) VALUES (
        ${versionId}, ${input.routeId}, 1, ${geometryHash}, ${input.coordinates},
        ${input.distanceKm}, ${input.elevationGainM}, ${input.elevationLossM},
        ${input.userId}
      )
      RETURNING id
    ), inserted_attestation AS (
      INSERT INTO ride_attestations (
        id, route_id, route_version_id, rider_user_id, rider_name, ridden_at,
        evidence_type, evidence_reference, file_format, source_platform,
        source_reference, evidence_file_hash, evidence_started_at,
        evidence_ended_at, evidence_point_count,
        evidence_timestamped_point_count, rights_statement_version,
        rights_granted_at, privacy_confirmed_at, review_status
      )
      SELECT
        ${attestationId}, ${input.routeId}, id, ${input.userId},
        ${input.riderName}, ${input.riddenAt}, ${input.evidenceType},
        ${input.evidenceReference ?? null}, ${input.evidenceType},
        ${input.sourcePlatform}, ${input.sourceReference ?? null},
        ${input.evidenceFileHash}, ${input.evidenceStartedAt},
        ${input.evidenceEndedAt}, ${input.evidencePointCount},
        ${input.evidenceTimestampedPointCount}, ${"2026-08-ireland-beta-v2"},
        ${rightsGrantedAt}, ${rightsGrantedAt}, 'pending'
      FROM inserted_version
    )
    UPDATE routes
    SET current_version_id = ${versionId},
        human_ridden = TRUE,
        last_ridden_at = ${input.riddenAt},
        rights_confirmed_at = ${rightsGrantedAt},
        publication_status = 'in_review'
    WHERE id = ${input.routeId}
  `;
}

// ──── Users ────
export async function getUserByEmail(email: string): Promise<User | undefined> {
  const { rows } = await sql`SELECT * FROM users WHERE email = ${email}`;
  return rows[0] as User | undefined;
}

export async function getUserBySession(token: string): Promise<User | undefined> {
  const { rows } = await sql`SELECT * FROM users WHERE session_token = ${token} AND role != 'banned'`;
  return rows[0] as User | undefined;
}

export async function upsertUser(id: string, email: string, name: string | null, sessionToken: string): Promise<User> {
  const existing = await getUserByEmail(email);
  if (existing) {
    await sql`UPDATE users SET session_token = ${sessionToken}, name = COALESCE(${name}, name) WHERE email = ${email}`;
    return (await getUserByEmail(email))!;
  }
  await sql`INSERT INTO users (id, email, name, session_token) VALUES (${id}, ${email}, ${name}, ${sessionToken})`;
  return (await getUserByEmail(email))!;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const { rows } = await sql`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] as User | undefined;
}

export async function getUserByGoogleId(googleId: string): Promise<User | undefined> {
  const { rows } = await sql`SELECT * FROM users WHERE google_id = ${googleId}`;
  return rows[0] as User | undefined;
}

export async function upsertGoogleUser(
  id: string,
  googleId: string,
  email: string,
  name: string,
  avatarUrl: string | null,
  sessionToken: string
): Promise<User> {
  const existing = await getUserByGoogleId(googleId);
  if (existing) {
    await sql`
      UPDATE users
      SET session_token = ${sessionToken},
          name = COALESCE(${name}, name),
          avatar_url = COALESCE(${avatarUrl}, avatar_url),
          email = COALESCE(${email}, email)
      WHERE google_id = ${googleId}
    `;
    return (await getUserByGoogleId(googleId))!;
  }
  // Check if a user with this email already exists (e.g. from magic link)
  const existingByEmail = await getUserByEmail(email);
  if (existingByEmail) {
    await sql`
      UPDATE users
      SET session_token = ${sessionToken},
          google_id = ${googleId},
          name = COALESCE(${name}, name),
          avatar_url = COALESCE(${avatarUrl}, avatar_url)
      WHERE email = ${email}
    `;
    return (await getUserByGoogleId(googleId))!;
  }
  await sql`
    INSERT INTO users (id, email, name, avatar_url, google_id, session_token)
    VALUES (${id}, ${email}, ${name}, ${avatarUrl}, ${googleId}, ${sessionToken})
  `;
  return (await getUserByGoogleId(googleId))!;
}

export async function updateUserProfile(
  id: string,
  data: { name?: string; bio?: string; location?: string; avg_speed_kmh?: number }
): Promise<User | undefined> {
  await sql`
    UPDATE users
    SET name = COALESCE(${data.name ?? null}, name),
        bio = COALESCE(${data.bio ?? null}, bio),
        location = COALESCE(${data.location ?? null}, location),
        avg_speed_kmh = COALESCE(${data.avg_speed_kmh ?? null}, avg_speed_kmh)
    WHERE id = ${id}
  `;
  return getUserById(id);
}

export async function saveStravaTokens(
  userId: string,
  stravaId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  const encryptedAccessToken = sealToken(accessToken);
  const encryptedRefreshToken = sealToken(refreshToken);
  await sql`
    UPDATE users
    SET strava_id = ${stravaId},
        strava_access_token = ${encryptedAccessToken},
        strava_refresh_token = ${encryptedRefreshToken},
        strava_token_expires_at = ${expiresAt}
    WHERE id = ${userId}
  `;
}

export async function updateStravaTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  const encryptedAccessToken = sealToken(accessToken);
  const encryptedRefreshToken = sealToken(refreshToken);
  await sql`
    UPDATE users
    SET strava_access_token = ${encryptedAccessToken},
        strava_refresh_token = ${encryptedRefreshToken},
        strava_token_expires_at = ${expiresAt}
    WHERE id = ${userId}
  `;
}

export async function clearStravaTokens(userId: string): Promise<void> {
  await sql`
    UPDATE users
    SET strava_id = NULL,
        strava_access_token = NULL,
        strava_refresh_token = NULL,
        strava_token_expires_at = NULL
    WHERE id = ${userId}
  `;
}

export async function getRoutesByStravaActivityIds(activityIds: number[]): Promise<{ strava_activity_id: number }[]> {
  if (activityIds.length === 0) return [];
  const { rows } = await sql.query(
    `SELECT strava_activity_id FROM routes WHERE strava_activity_id = ANY($1::bigint[])`,
    [activityIds]
  );
  return rows as { strava_activity_id: number }[];
}

// ──── Magic links ────
export async function createMagicLink(id: string, email: string, token: string, expiresAt: Date): Promise<void> {
  await sql`
    INSERT INTO magic_links (id, email, token, expires_at)
    VALUES (${id}, ${email}, ${token}, ${expiresAt.toISOString()})
  `;
}

export async function validateMagicLink(token: string): Promise<{ email: string } | null> {
  const { rows } = await sql`
    SELECT * FROM magic_links
    WHERE token = ${token} AND used = FALSE AND expires_at > NOW()
  `;
  if (rows.length === 0) return null;
  await sql`UPDATE magic_links SET used = TRUE WHERE token = ${token}`;
  return { email: rows[0].email };
}

// ──── Follows ────
export async function followUser(id: string, followerId: string, followingId: string): Promise<void> {
  await sql`
    INSERT INTO follows (id, follower_id, following_id)
    VALUES (${id}, ${followerId}, ${followingId})
    ON CONFLICT (follower_id, following_id) DO NOTHING
  `;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  await sql`DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}`;
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}
  `;
  return rows.length > 0;
}

export async function getFollowerCount(userId: string): Promise<number> {
  const { rows } = await sql`SELECT COUNT(*) as c FROM follows WHERE following_id = ${userId}`;
  return Number(rows[0].c);
}

export async function getFollowingCount(userId: string): Promise<number> {
  const { rows } = await sql`SELECT COUNT(*) as c FROM follows WHERE follower_id = ${userId}`;
  return Number(rows[0].c);
}

export async function getFollowers(userId: string): Promise<User[]> {
  const { rows } = await sql`
    SELECT u.* FROM users u
    JOIN follows f ON f.follower_id = u.id
    WHERE f.following_id = ${userId}
    ORDER BY f.created_at DESC
  `;
  return rows as User[];
}

export async function getFollowing(userId: string): Promise<User[]> {
  const { rows } = await sql`
    SELECT u.* FROM users u
    JOIN follows f ON f.following_id = u.id
    WHERE f.follower_id = ${userId}
    ORDER BY f.created_at DESC
  `;
  return rows as User[];
}

// ──── Activity feed ────
export async function getUserActivityFeed(userId: string, page = 1, limit = 20): Promise<ActivityItem[]> {
  const offset = (page - 1) * limit;
  const { rows } = await sql.query(
    `
    SELECT * FROM (
      SELECT 'rating' as type, rt.route_id, r.name as route_name,
        CAST(rt.score AS TEXT) as detail, rt.created_at
      FROM ratings rt JOIN routes r ON r.id = rt.route_id
      WHERE rt.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}

      UNION ALL

      SELECT 'comment' as type, c.route_id, r.name as route_name,
        LEFT(c.body, 80) as detail, c.created_at
      FROM comments c JOIN routes r ON r.id = c.route_id
      WHERE c.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}

      UNION ALL

      SELECT 'condition' as type, co.route_id, r.name as route_name,
        co.status as detail, co.created_at
      FROM conditions co JOIN routes r ON r.id = co.route_id
      WHERE co.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}

      UNION ALL

      SELECT 'photo' as type, p.route_id, r.name as route_name,
        COALESCE(p.caption, 'Photo') as detail, p.created_at
      FROM photos p JOIN routes r ON r.id = p.route_id
      WHERE p.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}
    ) activity
    ORDER BY created_at DESC
    LIMIT $2::int OFFSET $3::int
    `,
    [userId, limit, offset]
  );
  return rows as ActivityItem[];
}

export async function getUserTotalKm(userId: string): Promise<number> {
  const { rows } = await sql.query(
    `SELECT COALESCE(SUM(r.distance_km), 0) as total
     FROM routes r
     WHERE r.id IN (SELECT route_id FROM ratings WHERE user_id = $1)
       AND ${PUBLIC_ROUTE_PREDICATE}`,
    [userId]
  );
  return Math.round(Number(rows[0].total));
}

// ──── Ratings ────
export async function getRouteRating(routeId: string): Promise<{ average: number; count: number }> {
  const { rows } = await sql`
    SELECT COALESCE(AVG(score), 0) as average, COUNT(*) as count FROM ratings WHERE route_id = ${routeId}
  `;
  const row = rows[0];
  return { average: Math.round(Number(row.average) * 10) / 10, count: Number(row.count) };
}

export async function getUserRating(routeId: string, userId: string): Promise<number | null> {
  const { rows } = await sql`
    SELECT score FROM ratings WHERE route_id = ${routeId} AND user_id = ${userId}
  `;
  return rows[0]?.score ?? null;
}

export async function upsertRating(id: string, routeId: string, userId: string, score: number): Promise<void> {
  const { rows } = await sql`SELECT id FROM ratings WHERE route_id = ${routeId} AND user_id = ${userId}`;
  if (rows.length > 0) {
    await sql`UPDATE ratings SET score = ${score} WHERE route_id = ${routeId} AND user_id = ${userId}`;
  } else {
    await sql`INSERT INTO ratings (id, route_id, user_id, score) VALUES (${id}, ${routeId}, ${userId}, ${score})`;
  }
}

// ──── Comments ────
export async function getRouteComments(routeId: string, limit = 10, offset = 0): Promise<Comment[]> {
  const { rows } = await sql`
    SELECT c.id, c.route_id, c.user_id, u.name as user_name, u.avatar_url as user_avatar, c.body, c.created_at
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.route_id = ${routeId}
    ORDER BY c.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows as Comment[];
}

export async function insertComment(id: string, routeId: string, userId: string, body: string): Promise<void> {
  await sql`INSERT INTO comments (id, route_id, user_id, body) VALUES (${id}, ${routeId}, ${userId}, ${body})`;
}

export async function deleteOwnComment(commentId: string, userId: string): Promise<boolean> {
  const { rowCount } = await sql`DELETE FROM comments WHERE id = ${commentId} AND user_id = ${userId}`;
  return (rowCount ?? 0) > 0;
}

export async function getCommentCount(routeId: string): Promise<number> {
  const { rows } = await sql`SELECT COUNT(*) as c FROM comments WHERE route_id = ${routeId}`;
  return Number(rows[0].c);
}

// ──── Photos ────
export async function getRoutePhotos(routeId: string): Promise<Photo[]> {
  const { rows } = await sql`
    SELECT p.id, p.route_id, p.user_id, u.name as user_name, p.filename, p.caption, p.created_at
    FROM photos p
    JOIN users u ON p.user_id = u.id
    WHERE p.route_id = ${routeId}
    ORDER BY p.created_at DESC
  `;
  return rows as Photo[];
}

export async function insertPhoto(id: string, routeId: string, userId: string, filename: string, caption: string | null): Promise<void> {
  await sql`INSERT INTO photos (id, route_id, user_id, filename, caption) VALUES (${id}, ${routeId}, ${userId}, ${filename}, ${caption})`;
}

// ──── Conditions ────
export async function getRouteConditions(routeId: string, limit = 10, offset = 0): Promise<Condition[]> {
  const { rows } = await sql`
    SELECT c.id, c.route_id, c.user_id, u.name as user_name, c.status, c.note, c.created_at
    FROM conditions c
    JOIN users u ON c.user_id = u.id
    WHERE c.route_id = ${routeId}
    ORDER BY c.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows as Condition[];
}

export async function getLatestCondition(routeId: string): Promise<Condition | undefined> {
  const { rows } = await sql`
    SELECT c.id, c.route_id, c.user_id, u.name as user_name, c.status, c.note, c.created_at
    FROM conditions c
    JOIN users u ON c.user_id = u.id
    WHERE c.route_id = ${routeId}
    ORDER BY c.created_at DESC
    LIMIT 1
  `;
  return rows[0] as Condition | undefined;
}

export async function insertCondition(id: string, routeId: string, userId: string, status: string, note: string): Promise<void> {
  if (status === "closed") {
    const incidentId = uuidv4();
    await sql`
      WITH inserted_condition AS (
        INSERT INTO conditions (id, route_id, user_id, status, note)
        VALUES (${id}, ${routeId}, ${userId}, ${status}, ${note})
        RETURNING id
      ), inserted_incident AS (
        INSERT INTO route_incidents (
          id, route_id, reported_by, condition_id, severity, status, summary
        )
        SELECT ${incidentId}, ${routeId}, ${userId}, id, 'critical', 'open', ${note}
        FROM inserted_condition
      )
      UPDATE routes
      SET publication_status = 'quarantined', verified = FALSE
      WHERE id = ${routeId}
    `;
    return;
  }

  if (status === "poor") {
    const incidentId = uuidv4();
    await sql`
      WITH inserted_condition AS (
        INSERT INTO conditions (id, route_id, user_id, status, note)
        VALUES (${id}, ${routeId}, ${userId}, ${status}, ${note})
        RETURNING id
      )
      INSERT INTO route_incidents (
        id, route_id, reported_by, condition_id, severity, status, summary
      )
      SELECT ${incidentId}, ${routeId}, ${userId}, id, 'review', 'open', ${note}
      FROM inserted_condition
    `;
    return;
  }

  await sql`
    INSERT INTO conditions (id, route_id, user_id, status, note)
    VALUES (${id}, ${routeId}, ${userId}, ${status}, ${note})
  `;
}

// ──── User profiles ────
export async function getUserRoutes(userId: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.* FROM routes r WHERE r.id IN (
      SELECT route_id FROM comments WHERE user_id = $1
      UNION
      SELECT route_id FROM ratings WHERE user_id = $1
    ) AND ${PUBLIC_ROUTE_PREDICATE}
    ORDER BY r.name`,
    [userId]
  );
  return rows as Route[];
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const [rated, commented, conds, photos] = await Promise.all([
    sql.query(`SELECT COUNT(*) as c FROM ratings x JOIN routes r ON r.id = x.route_id WHERE x.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}`, [userId]),
    sql.query(`SELECT COUNT(*) as c FROM comments x JOIN routes r ON r.id = x.route_id WHERE x.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}`, [userId]),
    sql.query(`SELECT COUNT(*) as c FROM conditions x JOIN routes r ON r.id = x.route_id WHERE x.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}`, [userId]),
    sql.query(`SELECT COUNT(*) as c FROM photos x JOIN routes r ON r.id = x.route_id WHERE x.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}`, [userId]),
  ]);
  return {
    routesRated: Number(rated.rows[0].c),
    commentsPosted: Number(commented.rows[0].c),
    conditionsReported: Number(conds.rows[0].c),
    photosUploaded: Number(photos.rows[0].c),
  };
}

export async function getCounties(): Promise<string[]> {
  const { rows } = await sql.query(
    `SELECT DISTINCT r.county FROM routes r WHERE ${PUBLIC_ROUTE_PREDICATE} ORDER BY r.county`
  );
  return rows.map((r) => r.county);
}

export async function getRegions(country?: string): Promise<string[]> {
  if (country) {
    const { rows } = await sql.query(
      `SELECT DISTINCT r.region FROM routes r
       WHERE ${PUBLIC_ROUTE_PREDICATE} AND r.country = $1 AND r.region IS NOT NULL
       ORDER BY r.region`,
      [country]
    );
    return rows.map((r) => r.region);
  }
  const { rows } = await sql.query(
    `SELECT DISTINCT r.region FROM routes r
     WHERE ${PUBLIC_ROUTE_PREDICATE} AND r.region IS NOT NULL ORDER BY r.region`
  );
  return rows.map((r) => r.region);
}

export async function getCountries(): Promise<string[]> {
  const { rows } = await sql.query(
    `SELECT DISTINCT r.country FROM routes r WHERE ${PUBLIC_ROUTE_PREDICATE} ORDER BY r.country`
  );
  return rows.map((r) => r.country);
}

// ──── Admin ────
export async function deleteRoute(id: string): Promise<void> {
  await sql`DELETE FROM ratings WHERE route_id = ${id}`;
  await sql`DELETE FROM comments WHERE route_id = ${id}`;
  await sql`DELETE FROM photos WHERE route_id = ${id}`;
  await sql`DELETE FROM conditions WHERE route_id = ${id}`;
  await sql`DELETE FROM routes WHERE id = ${id}`;
}

export async function deleteComment(id: string): Promise<void> {
  await sql`DELETE FROM comments WHERE id = ${id}`;
}

export async function deletePhoto(id: string): Promise<void> {
  await sql`DELETE FROM photos WHERE id = ${id}`;
}

export async function banUser(id: string): Promise<void> {
  await sql`UPDATE users SET role = 'banned', session_token = NULL WHERE id = ${id}`;
}

export async function unbanUser(id: string): Promise<void> {
  await sql`UPDATE users SET role = 'user' WHERE id = ${id}`;
}

export async function getAllUsers(page = 1, limit = 50): Promise<{ users: User[]; total: number }> {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    sql.query(
      `SELECT id, email, name, role, bio, avatar_url, location, created_at,
         avg_speed_kmh, strava_id
       FROM users ORDER BY created_at DESC LIMIT $1::int OFFSET $2::int`,
      [limit, offset]
    ),
    sql`SELECT COUNT(*) as c FROM users`,
  ]);
  return { users: data.rows as User[], total: Number(count.rows[0].c) };
}

export async function getAllComments(page = 1, limit = 50): Promise<{ comments: (AdminComment & { route_name: string })[]; total: number }> {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    sql.query(
      `SELECT c.id, c.route_id, c.user_id, u.name as user_name, u.email as user_email, c.body, c.created_at, r.name as route_name
       FROM comments c
       JOIN users u ON c.user_id = u.id
       JOIN routes r ON c.route_id = r.id
       ORDER BY c.created_at DESC
       LIMIT $1::int OFFSET $2::int`,
      [limit, offset]
    ),
    sql`SELECT COUNT(*) as c FROM comments`,
  ]);
  return { comments: data.rows as (AdminComment & { route_name: string })[], total: Number(count.rows[0].c) };
}

export interface AdminRouteReview extends Route {
  version_number: number | null;
  geometry_hash: string | null;
  rider_name: string | null;
  ridden_at: string | null;
  evidence_type: string | null;
  evidence_reference: string | null;
  source_platform: string | null;
  evidence_file_hash: string | null;
  evidence_started_at: string | null;
  evidence_ended_at: string | null;
  evidence_point_count: number | null;
  evidence_timestamped_point_count: number | null;
  attestation_status: string | null;
  latest_review_decision: string | null;
  latest_review_notes: string | null;
  open_incidents: number;
}

export interface ContributorRouteSubmission {
  id: string;
  name: string;
  description: string | null;
  distance_km: number;
  elevation_gain_m: number;
  county: string;
  country: string;
  region: string | null;
  publication_status: PublicationStatus;
  version_number: number | null;
  geometry_hash: string | null;
  ridden_at: string | null;
  evidence_type: string | null;
  source_platform: string | null;
  attestation_status: string | null;
  latest_review_decision: string | null;
  latest_review_notes: string | null;
  created_at: string;
}

export async function getRouteSubmissionsByContributor(
  contributorId: string
): Promise<ContributorRouteSubmission[]> {
  const { rows } = await sql.query(
    `SELECT r.id, r.name, r.description, r.distance_km, r.elevation_gain_m,
       r.county, r.country, r.region, r.publication_status, r.created_at,
       rv.version_number, rv.geometry_hash,
       ra.ridden_at, ra.evidence_type, ra.source_platform,
       ra.review_status AS attestation_status,
       rr.decision AS latest_review_decision,
       rr.review_notes AS latest_review_notes
     FROM routes r
     LEFT JOIN route_versions rv ON rv.id = r.current_version_id
     LEFT JOIN LATERAL (
       SELECT ridden_at, evidence_type, source_platform, review_status
       FROM ride_attestations
       WHERE route_id = r.id AND route_version_id = r.current_version_id
       ORDER BY created_at DESC LIMIT 1
     ) ra ON TRUE
     LEFT JOIN LATERAL (
       SELECT decision, review_notes
       FROM route_reviews
       WHERE route_id = r.id AND route_version_id = r.current_version_id
       ORDER BY created_at DESC LIMIT 1
     ) rr ON TRUE
     WHERE r.created_by = $1
     ORDER BY r.created_at DESC`,
    [contributorId]
  );
  return rows as ContributorRouteSubmission[];
}

export interface AdminRouteIncident {
  id: string;
  route_id: string;
  route_name: string;
  reporter_name: string | null;
  reporter_email: string | null;
  condition_status: string | null;
  severity: "review" | "critical";
  status: "open" | "resolved" | "dismissed";
  summary: string;
  created_at: string;
}

export interface ApprovedSegmentAssessment {
  id: string;
  route_id: string;
  route_version_id: string;
  assessor_name: string;
  assessed_at: string;
  start_index: number;
  end_index: number;
  direction: "forward" | "reverse";
  session_type: WorkoutSessionType;
  min_effort_seconds: number;
  max_effort_seconds: number;
  length_km: number;
  avg_gradient_pct: number;
  max_gradient_pct: number;
  gradient_variance: number;
  surface_rating: "good" | "mixed" | "poor";
  traffic_rating: "low" | "moderate" | "high";
  sightlines_rating: "clear" | "mixed" | "poor";
  junction_count: number;
  entry_notes: string;
  recovery_notes: string;
  runout_notes: string;
  hazards_notes: string | null;
}

export interface AdminSegmentAssessment extends ApprovedSegmentAssessment {
  ride_attestation_id: string;
  confirmed_by: string;
  confirmed_at: string;
  review_status: "pending" | "approved" | "rejected" | "revoked";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

export interface SegmentAssessmentInput {
  start_index: number;
  end_index: number;
  direction: "forward" | "reverse";
  session_type: WorkoutSessionType;
  min_effort_seconds: number;
  max_effort_seconds: number;
  length_km: number;
  avg_gradient_pct: number;
  max_gradient_pct: number;
  gradient_variance: number;
  surface_rating: "good" | "mixed" | "poor";
  traffic_rating: "low" | "moderate" | "high";
  sightlines_rating: "clear" | "mixed" | "poor";
  junction_count: number;
  entry_notes: string;
  recovery_notes: string;
  runout_notes: string;
  hazards_notes?: string | null;
}

export async function getRouteSegmentAssessments(routeId: string): Promise<AdminSegmentAssessment[]> {
  const { rows } = await sql`
    SELECT rsa.*
    FROM route_segment_assessments rsa
    JOIN routes r ON r.id = rsa.route_id
    WHERE rsa.route_id = ${routeId}
      AND rsa.route_version_id = r.current_version_id
    ORDER BY rsa.created_at DESC
  `;
  return rows as AdminSegmentAssessment[];
}

export async function createRouteSegmentAssessment(
  routeId: string,
  input: SegmentAssessmentInput,
  confirmedBy: string
): Promise<AdminSegmentAssessment | undefined> {
  const id = uuidv4();
  const { rows } = await sql`
    INSERT INTO route_segment_assessments (
      id, route_id, route_version_id, ride_attestation_id,
      assessor_user_id, assessor_name, assessed_at,
      assessment_statement_version, confirmed_by, confirmed_at,
      start_index, end_index, direction, session_type,
      min_effort_seconds, max_effort_seconds, length_km,
      avg_gradient_pct, max_gradient_pct, gradient_variance,
      surface_rating, traffic_rating, sightlines_rating, junction_count,
      entry_notes, recovery_notes, runout_notes, hazards_notes
    )
    SELECT
      ${id}, r.id, r.current_version_id, ra.id,
      ra.rider_user_id, ra.rider_name, ra.ridden_at,
      'segment-assessment-v1', ${confirmedBy}, NOW(),
      ${input.start_index}, ${input.end_index}, ${input.direction}, ${input.session_type},
      ${input.min_effort_seconds}, ${input.max_effort_seconds}, ${input.length_km},
      ${input.avg_gradient_pct}, ${input.max_gradient_pct}, ${input.gradient_variance},
      ${input.surface_rating}, ${input.traffic_rating}, ${input.sightlines_rating}, ${input.junction_count},
      ${input.entry_notes.trim()}, ${input.recovery_notes.trim()},
      ${input.runout_notes.trim()}, ${input.hazards_notes?.trim() || null}
    FROM routes r
    JOIN LATERAL (
      SELECT id, rider_user_id, rider_name, ridden_at
      FROM ride_attestations
      WHERE route_id = r.id
        AND route_version_id = r.current_version_id
        AND review_status = 'approved'
      ORDER BY reviewed_at DESC
      LIMIT 1
    ) ra ON TRUE
    WHERE r.id = ${routeId}
      AND r.publication_status = 'published'
      AND r.current_version_id IS NOT NULL
      AND ${input.end_index} < jsonb_array_length(r.coordinates::jsonb)
    RETURNING *
  `;
  return rows[0] as AdminSegmentAssessment | undefined;
}

export async function reviewRouteSegmentAssessment(
  assessmentId: string,
  decision: "approved" | "rejected",
  reviewerId: string,
  notes: string
): Promise<AdminSegmentAssessment | undefined> {
  const { rows } = await sql`
    UPDATE route_segment_assessments rsa
    SET review_status = ${decision},
        reviewed_by = ${reviewerId},
        reviewed_at = NOW(),
        review_notes = ${notes.trim()}
    FROM routes r, ride_attestations ra
    WHERE rsa.id = ${assessmentId}
      AND rsa.review_status = 'pending'
      AND r.id = rsa.route_id
      AND r.current_version_id = rsa.route_version_id
      AND ra.id = rsa.ride_attestation_id
      AND ra.route_id = rsa.route_id
      AND ra.route_version_id = rsa.route_version_id
      AND ra.review_status = 'approved'
      AND (rsa.assessor_user_id IS NULL OR rsa.assessor_user_id <> ${reviewerId})
      AND (
        ${decision} = 'rejected'
        OR (
          rsa.session_type IN ('endurance', 'tempo', 'sweet_spot', 'threshold')
          AND rsa.assessed_at >= CURRENT_DATE - (${INTERVAL_FRESHNESS_DAYS} * INTERVAL '1 day')
          AND rsa.surface_rating <> 'poor'
          AND rsa.traffic_rating = 'low'
          AND rsa.sightlines_rating = 'clear'
          AND rsa.junction_count = 0
        )
      )
    RETURNING rsa.*
  `;
  return rows[0] as AdminSegmentAssessment | undefined;
}

export async function getApprovedSegmentAssessments(
  routeIds: string[]
): Promise<ApprovedSegmentAssessment[]> {
  if (routeIds.length === 0) return [];
  const { rows } = await sql.query(
    `SELECT rsa.id, rsa.route_id, rsa.route_version_id,
       rsa.assessor_name, rsa.assessed_at, rsa.start_index, rsa.end_index,
       rsa.direction, rsa.session_type, rsa.min_effort_seconds,
       rsa.max_effort_seconds, rsa.length_km, rsa.avg_gradient_pct,
       rsa.max_gradient_pct, rsa.gradient_variance, rsa.surface_rating,
       rsa.traffic_rating, rsa.sightlines_rating, rsa.junction_count,
       rsa.entry_notes, rsa.recovery_notes, rsa.runout_notes, rsa.hazards_notes
     FROM route_segment_assessments rsa
     JOIN routes r ON r.id = rsa.route_id
     JOIN ride_attestations ra ON ra.id = rsa.ride_attestation_id
     WHERE rsa.route_id = ANY($1::text[])
       AND rsa.route_version_id = r.current_version_id
       AND rsa.review_status = 'approved'
       AND rsa.assessed_at >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
       AND ra.route_id = rsa.route_id
       AND ra.route_version_id = rsa.route_version_id
       AND ra.review_status = 'approved'
     ORDER BY rsa.route_id, rsa.start_index, rsa.end_index`,
    [routeIds, INTERVAL_FRESHNESS_DAYS]
  );
  return rows as ApprovedSegmentAssessment[];
}

export async function getOpenRouteIncidents(
  page = 1,
  limit = 50
): Promise<{ incidents: AdminRouteIncident[]; total: number }> {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    sql.query(
      `SELECT ri.id, ri.route_id, r.name AS route_name,
         u.name AS reporter_name, u.email AS reporter_email,
         c.status AS condition_status, ri.severity, ri.status,
         ri.summary, ri.created_at
       FROM route_incidents ri
       JOIN routes r ON r.id = ri.route_id
       LEFT JOIN users u ON u.id = ri.reported_by
       LEFT JOIN conditions c ON c.id = ri.condition_id
       WHERE ri.status = 'open'
       ORDER BY CASE ri.severity WHEN 'critical' THEN 0 ELSE 1 END, ri.created_at DESC
       LIMIT $1::int OFFSET $2::int`,
      [limit, offset]
    ),
    sql`SELECT COUNT(*) AS c FROM route_incidents WHERE status = 'open'`,
  ]);
  return {
    incidents: data.rows as AdminRouteIncident[],
    total: Number(count.rows[0].c),
  };
}

export async function resolveRouteIncident(
  incidentId: string,
  status: "resolved" | "dismissed",
  resolverId: string,
  resolutionNotes: string
): Promise<AdminRouteIncident | undefined> {
  const { rows } = await sql`
    WITH updated AS (
      UPDATE route_incidents
      SET status = ${status},
          resolution_notes = ${resolutionNotes.trim()},
          resolved_by = ${resolverId},
          resolved_at = NOW()
      WHERE id = ${incidentId}
        AND status = 'open'
      RETURNING *
    )
    SELECT u.id, u.route_id, r.name AS route_name,
      reporter.name AS reporter_name, reporter.email AS reporter_email,
      c.status AS condition_status, u.severity, u.status,
      u.summary, u.created_at
    FROM updated u
    JOIN routes r ON r.id = u.route_id
    LEFT JOIN users reporter ON reporter.id = u.reported_by
    LEFT JOIN conditions c ON c.id = u.condition_id
  `;
  return rows[0] as AdminRouteIncident | undefined;
}

export async function getAllRoutes(page = 1, limit = 50): Promise<{ routes: AdminRouteReview[]; total: number }> {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    sql.query(
      `SELECT r.*,
         rv.version_number,
         rv.geometry_hash,
         ra.rider_name,
         ra.ridden_at,
         ra.evidence_type,
         ra.evidence_reference,
         ra.source_platform,
         ra.evidence_file_hash,
         ra.evidence_started_at,
         ra.evidence_ended_at,
         ra.evidence_point_count,
         ra.evidence_timestamped_point_count,
         ra.review_status AS attestation_status,
         rr.decision AS latest_review_decision,
         rr.review_notes AS latest_review_notes,
         COALESCE(ri.open_incidents, 0)::int AS open_incidents
       FROM routes r
       LEFT JOIN route_versions rv ON rv.id = r.current_version_id
       LEFT JOIN LATERAL (
         SELECT rider_name, ridden_at, evidence_type, evidence_reference, source_platform,
           evidence_file_hash, evidence_started_at, evidence_ended_at,
           evidence_point_count, evidence_timestamped_point_count, review_status
         FROM ride_attestations
         WHERE route_id = r.id AND route_version_id = r.current_version_id
         ORDER BY created_at DESC LIMIT 1
       ) ra ON TRUE
       LEFT JOIN LATERAL (
         SELECT decision, review_notes
         FROM route_reviews
         WHERE route_id = r.id AND route_version_id = r.current_version_id
         ORDER BY created_at DESC LIMIT 1
       ) rr ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS open_incidents
         FROM route_incidents
         WHERE route_id = r.id AND status = 'open'
       ) ri ON TRUE
       ORDER BY
         CASE r.publication_status
           WHEN 'in_review' THEN 0
           WHEN 'quarantined' THEN 1
           WHEN 'stale' THEN 2
           WHEN 'draft' THEN 3
           WHEN 'published' THEN 4
           ELSE 5
         END,
         r.created_at DESC
       LIMIT $1::int OFFSET $2::int`,
      [limit, offset]
    ),
    sql`SELECT COUNT(*) as c FROM routes`,
  ]);
  return { routes: data.rows as AdminRouteReview[], total: Number(count.rows[0].c) };
}

export async function markExpiredRoutesStale(): Promise<number> {
  const { rowCount } = await sql`
    UPDATE routes
    SET publication_status = 'stale', verified = FALSE
    WHERE publication_status = 'published'
      AND (
        last_ridden_at IS NULL
        OR last_ridden_at < CURRENT_DATE - INTERVAL '365 days'
      )
  `;
  return rowCount ?? 0;
}

export async function setRoutePublicationStatus(
  routeId: string,
  status: "published" | "stale" | "quarantined" | "retired",
  reviewerId: string,
  reviewNotes?: string | null,
  checklist?: {
    evidence_checked: boolean;
    rights_checked: boolean;
    geometry_checked: boolean;
    start_finish_checked: boolean;
    road_suitability_checked: boolean;
    description_checked: boolean;
  }
): Promise<Route | undefined> {
  if (status === "published") {
    if (
      !checklist ||
      !Object.values(checklist).every(Boolean) ||
      !reviewNotes ||
      reviewNotes.trim().length < 20
    ) {
      return undefined;
    }
    const reviewId = uuidv4();
    const eventId = uuidv4();
    const { rowCount } = await sql`
      WITH eligible_route AS (
        SELECT r.id, r.current_version_id, r.publication_status, ra.id AS attestation_id
        FROM routes r
        JOIN LATERAL (
          SELECT id, rider_user_id
          FROM ride_attestations
          WHERE route_id = r.id
            AND route_version_id = r.current_version_id
            AND rights_granted_at IS NOT NULL
            AND review_status = 'pending'
          ORDER BY created_at DESC
          LIMIT 1
        ) ra ON TRUE
        WHERE r.id = ${routeId}
          AND r.publication_status = 'in_review'
          AND r.discipline = 'road'
          AND r.country = 'Ireland'
          AND r.human_ridden = TRUE
          AND r.last_ridden_at >= CURRENT_DATE - INTERVAL '365 days'
          AND r.rights_confirmed_at IS NOT NULL
          AND r.current_version_id IS NOT NULL
          AND (r.created_by IS NULL OR r.created_by <> ${reviewerId})
          AND (ra.rider_user_id IS NULL OR ra.rider_user_id <> ${reviewerId})
          AND NOT EXISTS (
            SELECT 1 FROM route_incidents ri
            WHERE ri.route_id = r.id AND ri.status = 'open'
          )
        FOR UPDATE OF r
      ), approved_attestation AS (
        UPDATE ride_attestations ra
        SET review_status = 'approved',
            reviewed_by = ${reviewerId},
            reviewed_at = NOW(),
            review_notes = ${reviewNotes ?? null}
        FROM eligible_route er
        WHERE ra.id = er.attestation_id
        RETURNING ra.route_id, ra.route_version_id
      ), inserted_review AS (
        INSERT INTO route_reviews (
          id, route_id, route_version_id, reviewer_id,
          evidence_checked, rights_checked, geometry_checked,
          start_finish_checked, road_suitability_checked, description_checked,
          review_notes, decision
        )
        SELECT
          ${reviewId}, ${routeId}, route_version_id, ${reviewerId},
          ${checklist.evidence_checked}, ${checklist.rights_checked},
          ${checklist.geometry_checked}, ${checklist.start_finish_checked},
          ${checklist.road_suitability_checked}, ${checklist.description_checked},
          ${reviewNotes.trim()}, 'approved'
        FROM approved_attestation
        RETURNING route_id, route_version_id
      ), updated_route AS (
        UPDATE routes r
        SET publication_status = 'published',
            verified = TRUE,
            quality_status = 'approved'
        FROM inserted_review ir
        WHERE r.id = ir.route_id
          AND r.current_version_id = ir.route_version_id
        RETURNING r.id, r.current_version_id
      )
      INSERT INTO route_publication_events (
        id, route_id, route_version_id, actor_id, from_status, to_status, reason
      )
      SELECT ${eventId}, ur.id, ur.current_version_id, ${reviewerId},
        er.publication_status, 'published', ${reviewNotes.trim()}
      FROM updated_route ur
      JOIN eligible_route er ON er.id = ur.id
    `;
    if (!rowCount) return undefined;
  } else {
    const eventId = uuidv4();
    const reason = reviewNotes?.trim() || `Administrator changed route status to ${status}`;
    await sql`
      WITH previous AS (
        SELECT id, current_version_id, publication_status
        FROM routes
        WHERE id = ${routeId}
        FOR UPDATE
      ), updated_route AS (
        UPDATE routes r
        SET publication_status = ${status}, verified = FALSE
        FROM previous p
        WHERE r.id = p.id
        RETURNING r.id, r.current_version_id
      )
      INSERT INTO route_publication_events (
        id, route_id, route_version_id, actor_id, from_status, to_status, reason
      )
      SELECT ${eventId}, ur.id, ur.current_version_id, ${reviewerId},
        p.publication_status, ${status}, ${reason}
      FROM updated_route ur
      JOIN previous p ON p.id = ur.id
    `;
  }

  return getRoute(routeId);
}

export async function rejectRouteSubmission(
  routeId: string,
  reviewerId: string,
  reviewNotes: string,
  checklist: {
    evidence_checked: boolean;
    rights_checked: boolean;
    geometry_checked: boolean;
    start_finish_checked: boolean;
    road_suitability_checked: boolean;
    description_checked: boolean;
  }
): Promise<Route | undefined> {
  if (reviewNotes.trim().length < 20) return undefined;
  const reviewId = uuidv4();
  const eventId = uuidv4();
  const { rowCount } = await sql`
    WITH eligible_route AS (
      SELECT r.id, r.current_version_id, r.publication_status, ra.id AS attestation_id
      FROM routes r
      JOIN LATERAL (
        SELECT id, rider_user_id
        FROM ride_attestations
        WHERE route_id = r.id
          AND route_version_id = r.current_version_id
          AND review_status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      ) ra ON TRUE
      WHERE r.id = ${routeId}
        AND r.publication_status = 'in_review'
        AND r.current_version_id IS NOT NULL
        AND (r.created_by IS NULL OR r.created_by <> ${reviewerId})
        AND (ra.rider_user_id IS NULL OR ra.rider_user_id <> ${reviewerId})
      FOR UPDATE OF r
    ), rejected_attestation AS (
      UPDATE ride_attestations ra
      SET review_status = 'rejected', reviewed_by = ${reviewerId},
          reviewed_at = NOW(), review_notes = ${reviewNotes.trim()}
      FROM eligible_route er
      WHERE ra.id = er.attestation_id
      RETURNING ra.route_id, ra.route_version_id
    ), inserted_review AS (
      INSERT INTO route_reviews (
        id, route_id, route_version_id, reviewer_id,
        evidence_checked, rights_checked, geometry_checked,
        start_finish_checked, road_suitability_checked, description_checked,
        review_notes, decision
      )
      SELECT
        ${reviewId}, route_id, route_version_id, ${reviewerId},
        ${checklist.evidence_checked}, ${checklist.rights_checked},
        ${checklist.geometry_checked}, ${checklist.start_finish_checked},
        ${checklist.road_suitability_checked}, ${checklist.description_checked},
        ${reviewNotes.trim()}, 'rejected'
      FROM rejected_attestation
      RETURNING route_id, route_version_id
    ), updated_route AS (
      UPDATE routes r
      SET publication_status = 'retired', verified = FALSE,
          quality_status = 'failed'
      FROM inserted_review ir
      WHERE r.id = ir.route_id AND r.current_version_id = ir.route_version_id
      RETURNING r.id, r.current_version_id
    )
    INSERT INTO route_publication_events (
      id, route_id, route_version_id, actor_id, from_status, to_status, reason
    )
    SELECT ${eventId}, ur.id, ur.current_version_id, ${reviewerId},
      er.publication_status, 'retired', ${reviewNotes.trim()}
    FROM updated_route ur
    JOIN eligible_route er ON er.id = ur.id
  `;
  if (!rowCount) return undefined;
  return getRoute(routeId);
}

// ──── SEO Queries ────

export async function getAllRoutesForSitemap(): Promise<{ id: string; created_at: string }[]> {
  const { rows } = await sql.query(
    `SELECT r.id, r.created_at FROM routes r WHERE ${PUBLIC_ROUTE_PREDICATE} ORDER BY r.created_at DESC`
  );
  return rows as { id: string; created_at: string }[];
}

export async function getRoutesByCountrySlug(slug: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count
     FROM routes r
     LEFT JOIN ratings rt ON rt.route_id = r.id
     WHERE ${PUBLIC_ROUTE_PREDICATE}
       AND LOWER(REPLACE(r.country, ' ', '-')) = $1
     GROUP BY r.id
     ORDER BY COALESCE(AVG(rt.score), 0) DESC, r.created_at DESC`,
    [slug]
  );
  return rows as Route[];
}

export async function getRoutesByRegionSlug(countrySlug: string, regionSlug: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count
     FROM routes r
     LEFT JOIN ratings rt ON rt.route_id = r.id
     WHERE ${PUBLIC_ROUTE_PREDICATE}
       AND LOWER(REPLACE(r.country, ' ', '-')) = $1
       AND LOWER(REPLACE(r.region, ' ', '-')) = $2
     GROUP BY r.id
     ORDER BY COALESCE(AVG(rt.score), 0) DESC, r.created_at DESC`,
    [countrySlug, regionSlug]
  );
  return rows as Route[];
}

export async function getCountryStats(countrySlug: string): Promise<{
  routeCount: number;
  totalDistanceKm: number;
  avgRating: number;
  disciplines: string[];
  displayName: string;
  regions: { name: string; routeCount: number }[];
} | null> {
  const { rows } = await sql.query(
    `WITH eligible AS (
       SELECT r.* FROM routes r
       WHERE ${PUBLIC_ROUTE_PREDICATE}
         AND LOWER(REPLACE(r.country, ' ', '-')) = $1
     )
     SELECT
       COUNT(*) as route_count,
       COALESCE(SUM(r.distance_km), 0) as total_distance,
       COALESCE((SELECT AVG(rt.score) FROM ratings rt JOIN eligible e ON e.id = rt.route_id), 0) as avg_rating,
       MIN(r.country) as display_name
     FROM eligible r`,
    [countrySlug]
  );

  if (!rows[0] || Number(rows[0].route_count) === 0) return null;

  const { rows: disciplineRows } = await sql.query(
    `SELECT DISTINCT r.discipline FROM routes r
     WHERE ${PUBLIC_ROUTE_PREDICATE}
       AND LOWER(REPLACE(r.country, ' ', '-')) = $1
     ORDER BY r.discipline`,
    [countrySlug]
  );

  const { rows: regionRows } = await sql.query(
    `SELECT r.region as name, COUNT(*) as route_count
     FROM routes r
     WHERE ${PUBLIC_ROUTE_PREDICATE}
       AND LOWER(REPLACE(r.country, ' ', '-')) = $1
       AND r.region IS NOT NULL
     GROUP BY r.region
     ORDER BY r.region`,
    [countrySlug]
  );

  return {
    routeCount: Number(rows[0].route_count),
    totalDistanceKm: Math.round(Number(rows[0].total_distance)),
    avgRating: Number(Number(rows[0].avg_rating).toFixed(1)),
    disciplines: disciplineRows.map((r) => r.discipline),
    displayName: rows[0].display_name,
    regions: regionRows.map((r) => ({ name: r.name, routeCount: Number(r.route_count) })),
  };
}

export async function getRegionStats(countrySlug: string, regionSlug: string): Promise<{
  routeCount: number;
  totalDistanceKm: number;
  avgRating: number;
  disciplines: string[];
  displayName: string;
  countryDisplayName: string;
} | null> {
  const { rows } = await sql.query(
    `WITH eligible AS (
       SELECT r.* FROM routes r
       WHERE ${PUBLIC_ROUTE_PREDICATE}
         AND LOWER(REPLACE(r.country, ' ', '-')) = $1
         AND LOWER(REPLACE(r.region, ' ', '-')) = $2
     )
     SELECT
       COUNT(*) as route_count,
       COALESCE(SUM(r.distance_km), 0) as total_distance,
       COALESCE((SELECT AVG(rt.score) FROM ratings rt JOIN eligible e ON e.id = rt.route_id), 0) as avg_rating,
       MIN(r.region) as display_name,
       MIN(r.country) as country_display_name
     FROM eligible r`,
    [countrySlug, regionSlug]
  );

  if (!rows[0] || Number(rows[0].route_count) === 0) return null;

  const { rows: disciplineRows } = await sql.query(
    `SELECT DISTINCT r.discipline FROM routes r
     WHERE ${PUBLIC_ROUTE_PREDICATE}
       AND LOWER(REPLACE(r.country, ' ', '-')) = $1
       AND LOWER(REPLACE(r.region, ' ', '-')) = $2
     ORDER BY r.discipline`,
    [countrySlug, regionSlug]
  );

  return {
    routeCount: Number(rows[0].route_count),
    totalDistanceKm: Math.round(Number(rows[0].total_distance)),
    avgRating: Number(Number(rows[0].avg_rating).toFixed(1)),
    disciplines: disciplineRows.map((r) => r.discipline),
    displayName: rows[0].display_name,
    countryDisplayName: rows[0].country_display_name,
  };
}

export async function getRelatedRoutes(
  routeId: string,
  country: string,
  region: string | null,
  limit: number
): Promise<Route[]> {
  if (region) {
    const { rows } = await sql.query(
      `SELECT r.* FROM routes r WHERE ${PUBLIC_ROUTE_PREDICATE}
       AND r.country = $1 AND r.region = $2 AND r.id != $3 ORDER BY r.created_at DESC LIMIT $4`,
      [country, region, routeId, limit]
    );
    if (rows.length > 0) return rows as Route[];
  }
  // Fall back to same country
  const { rows } = await sql.query(
    `SELECT r.* FROM routes r WHERE ${PUBLIC_ROUTE_PREDICATE}
     AND r.country = $1 AND r.id != $2 ORDER BY r.created_at DESC LIMIT $3`,
    [country, routeId, limit]
  );
  return rows as Route[];
}

// ──── Downloads ────
export async function trackDownload(id: string, routeId: string, userId: string): Promise<void> {
  await sql`
    INSERT INTO downloads (id, route_id, user_id)
    VALUES (${id}, ${routeId}, ${userId})
    ON CONFLICT (route_id, user_id) DO NOTHING
  `;
}

export async function getUserDownloads(userId: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.* FROM routes r
     JOIN downloads d ON d.route_id = r.id
     WHERE d.user_id = $1
       AND ${PUBLIC_ROUTE_PREDICATE}
     ORDER BY d.created_at DESC`,
    [userId]
  );
  return rows as Route[];
}

export async function getDownloadCount(routeId: string): Promise<number> {
  const { rows } = await sql`SELECT COUNT(*) as c FROM downloads WHERE route_id = ${routeId}`;
  return Number(rows[0].c);
}

// ──── Favourites ────
export async function addFavourite(id: string, routeId: string, userId: string): Promise<void> {
  await sql`
    INSERT INTO favourites (id, route_id, user_id)
    VALUES (${id}, ${routeId}, ${userId})
    ON CONFLICT (route_id, user_id) DO NOTHING
  `;
}

export async function removeFavourite(routeId: string, userId: string): Promise<boolean> {
  const { rowCount } = await sql`
    DELETE FROM favourites WHERE route_id = ${routeId} AND user_id = ${userId}
  `;
  return (rowCount ?? 0) > 0;
}

export async function getUserFavourites(userId: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.* FROM routes r
     JOIN favourites f ON f.route_id = r.id
     WHERE f.user_id = $1
       AND ${PUBLIC_ROUTE_PREDICATE}
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return rows as Route[];
}

export async function isFavourited(routeId: string, userId: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM favourites WHERE route_id = ${routeId} AND user_id = ${userId}
  `;
  return rows.length > 0;
}

export async function getFavouriteCount(routeId: string): Promise<number> {
  const { rows } = await sql`SELECT COUNT(*) as c FROM favourites WHERE route_id = ${routeId}`;
  return Number(rows[0].c);
}

// ──── Community Score ────
export async function getCommunityScore(userId: string): Promise<{ score: number; tier: string }> {
  const { rows } = await sql.query(
    `
    SELECT
      COALESCE((SELECT COUNT(*) FROM routes r WHERE r.created_by = $1 AND ${PUBLIC_ROUTE_PREDICATE}), 0) as routes_uploaded,
      COALESCE((SELECT COUNT(*) FROM ratings x JOIN routes r ON r.id = x.route_id WHERE x.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}), 0) as ratings_given,
      COALESCE((SELECT COUNT(*) FROM comments x JOIN routes r ON r.id = x.route_id WHERE x.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}), 0) as comments_posted,
      COALESCE((SELECT COUNT(*) FROM photos x JOIN routes r ON r.id = x.route_id WHERE x.user_id = $1 AND ${PUBLIC_ROUTE_PREDICATE}), 0) as photos_uploaded,
      COALESCE((SELECT COUNT(*) FROM follows WHERE following_id = $1), 0) as followers,
      COALESCE((
        SELECT SUM(avg_score * 5)
        FROM (
          SELECT AVG(rt.score) as avg_score
          FROM routes r
          JOIN ratings rt ON rt.route_id = r.id
          WHERE r.created_by = $1
            AND ${PUBLIC_ROUTE_PREDICATE}
          GROUP BY r.id
          HAVING COUNT(rt.id) >= 3
        ) rated_routes
      ), 0) as quality_bonus
    `,
    [userId]
  );

  const r = rows[0];
  const base =
    Number(r.routes_uploaded) * 10 +
    Number(r.ratings_given) * 2 +
    Number(r.comments_posted) * 3 +
    Number(r.photos_uploaded) * 5 +
    Number(r.followers) * 1;
  const score = Math.round(base + Number(r.quality_bonus));

  let tier = "Explorer";
  if (score > 250) tier = "Legend";
  else if (score > 100) tier = "Trailblazer";
  else if (score > 25) tier = "Pathfinder";

  return { score, tier };
}

// ──── User Loop Rating (Airbnb-style) ────
export async function getUserLoopRating(userId: string): Promise<{ average: number; totalRatings: number; routesRated: number }> {
  const { rows } = await sql.query(
    `
    SELECT
      COALESCE(AVG(rt.score), 0) as average,
      COUNT(rt.id) as total_ratings,
      COUNT(DISTINCT r.id) as routes_rated
    FROM routes r
    JOIN ratings rt ON rt.route_id = r.id
    WHERE r.created_by = $1
      AND ${PUBLIC_ROUTE_PREDICATE}
    `,
    [userId]
  );
  return {
    average: Math.round(Number(rows[0].average) * 10) / 10,
    totalRatings: Number(rows[0].total_ratings),
    routesRated: Number(rows[0].routes_rated),
  };
}

// ──── Uploaded Routes ────
export async function getUserUploadedRoutes(userId: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count
     FROM routes r
     LEFT JOIN ratings rt ON rt.route_id = r.id
     WHERE r.created_by = $1
       AND ${PUBLIC_ROUTE_PREDICATE}
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
    [userId]
  );
  return rows as Route[];
}

// ──── Messages ────
export interface Conversation {
  id: string;
  other_user_id: string;
  other_user_name: string | null;
  other_user_avatar: string | null;
  last_message: string;
  last_message_at: string;
  unread: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export async function getConversations(userId: string): Promise<Conversation[]> {
  const { rows } = await sql.query(
    `
    SELECT
      c.id,
      other_p.user_id as other_user_id,
      u.name as other_user_name,
      u.avatar_url as other_user_avatar,
      last_msg.body as last_message,
      last_msg.created_at as last_message_at,
      CASE WHEN last_msg.created_at > my_p.last_read_at THEN true ELSE false END as unread
    FROM conversations c
    JOIN conversation_participants my_p ON my_p.conversation_id = c.id AND my_p.user_id = $1
    JOIN conversation_participants other_p ON other_p.conversation_id = c.id AND other_p.user_id != $1
    JOIN users u ON u.id = other_p.user_id
    LEFT JOIN LATERAL (
      SELECT body, created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    ) last_msg ON true
    WHERE last_msg.body IS NOT NULL
    ORDER BY last_msg.created_at DESC
    `,
    [userId]
  );
  return rows as Conversation[];
}

export async function getOrCreateConversation(userId: string, otherUserId: string): Promise<string> {
  // Check for existing conversation between these two users
  const { rows: existing } = await sql.query(
    `
    SELECT c.id FROM conversations c
    JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = $1
    JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = $2
    LIMIT 1
    `,
    [userId, otherUserId]
  );

  if (existing.length > 0) return existing[0].id;

  // Create new conversation
  const convId = uuidv4();
  await sql`INSERT INTO conversations (id) VALUES (${convId})`;
  await sql`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (${convId}, ${userId})`;
  await sql`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (${convId}, ${otherUserId})`;
  return convId;
}

export async function getMessages(conversationId: string, userId: string, page = 1, limit = 50): Promise<Message[]> {
  const offset = (page - 1) * limit;

  // Mark as read
  await sql`
    UPDATE conversation_participants SET last_read_at = NOW()
    WHERE conversation_id = ${conversationId} AND user_id = ${userId}
  `;

  const { rows } = await sql.query(
    `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2::int OFFSET $3::int`,
    [conversationId, limit, offset]
  );
  return rows as Message[];
}

export async function sendMessage(id: string, conversationId: string, senderId: string, body: string): Promise<Message> {
  await sql`
    INSERT INTO messages (id, conversation_id, sender_id, body)
    VALUES (${id}, ${conversationId}, ${senderId}, ${body})
  `;

  // Update sender's last_read_at
  await sql`
    UPDATE conversation_participants SET last_read_at = NOW()
    WHERE conversation_id = ${conversationId} AND user_id = ${senderId}
  `;

  const { rows } = await sql`SELECT * FROM messages WHERE id = ${id}`;
  return rows[0] as Message;
}

export async function isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM conversation_participants WHERE conversation_id = ${conversationId} AND user_id = ${userId}
  `;
  return rows.length > 0;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { rows } = await sql.query(
    `
    SELECT COUNT(DISTINCT c.id) as c
    FROM conversations c
    JOIN conversation_participants my_p ON my_p.conversation_id = c.id AND my_p.user_id = $1
    JOIN messages m ON m.conversation_id = c.id AND m.created_at > my_p.last_read_at AND m.sender_id != $1
    `,
    [userId]
  );
  return Number(rows[0].c);
}

export async function getAdminStats(): Promise<{
  totalUsers: number;
  totalRoutes: number;
  totalComments: number;
  bannedUsers: number;
  beta: IrelandBetaMetrics;
}> {
  const [users, routes, comments, banned, beta] = await Promise.all([
    sql`SELECT COUNT(*) as c FROM users`,
    sql`SELECT COUNT(*) as c FROM routes`,
    sql`SELECT COUNT(*) as c FROM comments`,
    sql`SELECT COUNT(*) as c FROM users WHERE role = 'banned'`,
    getIrelandBetaMetrics(),
  ]);
  return {
    totalUsers: Number(users.rows[0].c),
    totalRoutes: Number(routes.rows[0].c),
    totalComments: Number(comments.rows[0].c),
    bannedUsers: Number(banned.rows[0].c),
    beta,
  };
}

export async function getIrelandBetaMetrics(): Promise<IrelandBetaMetrics> {
  const { rows } = await sql.query(buildIrelandBetaMetricsQuery(PUBLIC_ROUTE_PREDICATE));

  const row = rows[0];
  const routeViews28d = Number(row.route_views_28d);
  const actionConversions28d = Number(row.action_conversions_28d);
  const eligibleRidePlans = Number(row.eligible_ride_plans);
  const confirmedWithin14Days = Number(row.confirmed_within_14_days);
  const retentionCohortSize = Number(row.retention_cohort_size);
  const retainedAtFourWeeks = Number(row.retained_at_four_weeks);

  return {
    publicRoutes: Number(row.public_routes),
    activeRiders28d: Number(row.active_riders_28d),
    routeViews28d,
    actionConversions28d,
    routeActionRatePct: ratePercent(actionConversions28d, routeViews28d),
    eligibleRidePlans,
    confirmedWithin14Days,
    rideConfirmationRatePct: ratePercent(confirmedWithin14Days, eligibleRidePlans),
    retentionCohortSize,
    retainedAtFourWeeks,
    fourWeekRetentionPct: ratePercent(retainedAtFourWeeks, retentionCohortSize),
  };
}

// ──── Push Tokens ────
export async function savePushToken(id: string, userId: string, token: string, platform: string) {
  await sql`
    INSERT INTO push_tokens (id, user_id, token, platform)
    VALUES (${id}, ${userId}, ${token}, ${platform})
    ON CONFLICT (user_id, token) DO NOTHING
  `;
}

export async function getPushTokensForUser(userId: string) {
  const result = await sql`SELECT token, platform FROM push_tokens WHERE user_id = ${userId}`;
  return result.rows as { token: string; platform: string }[];
}

// ──── Collections ────

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  location: string | null;
  country: string | null;
  cover_image_url: string | null;
  discipline: "road" | "gravel" | "mtb" | "mixed";
  difficulty_range: string | null;
  total_routes_count: number;
  featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionWithRoutes extends Collection {
  routes: Route[];
}

export async function getCollections(): Promise<Collection[]> {
  const { rows } = await sql.query(`
    SELECT c.*, COUNT(DISTINCT r.id)::int AS total_routes_count
    FROM collections c
    JOIN collection_routes cr ON cr.collection_id = c.id
    JOIN routes r ON r.id = cr.route_id
    WHERE c.country = 'Ireland'
      AND ${PUBLIC_ROUTE_PREDICATE}
    GROUP BY c.id
    ORDER BY c.featured DESC, c.created_at DESC
  `);
  return rows as Collection[];
}

export async function getFeaturedCollections(): Promise<Collection[]> {
  const { rows } = await sql.query(`
    SELECT c.*, COUNT(DISTINCT r.id)::int AS total_routes_count
    FROM collections c
    JOIN collection_routes cr ON cr.collection_id = c.id
    JOIN routes r ON r.id = cr.route_id
    WHERE c.country = 'Ireland'
      AND c.featured = TRUE
      AND ${PUBLIC_ROUTE_PREDICATE}
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 6
  `);
  return rows as Collection[];
}

export async function getCollectionBySlug(slug: string): Promise<CollectionWithRoutes | null> {
  const { rows: collRows } = await sql`
    SELECT * FROM collections
    WHERE slug = ${slug} AND country = 'Ireland'
    LIMIT 1
  `;
  if (collRows.length === 0) return null;
  const collection = collRows[0] as Collection;

  const { rows: routeRows } = await sql.query(
    `SELECT r.*, cr.display_order
     FROM routes r
     JOIN collection_routes cr ON cr.route_id = r.id
     WHERE cr.collection_id = $1
       AND ${PUBLIC_ROUTE_PREDICATE}
     ORDER BY cr.display_order ASC, r.created_at ASC`,
    [collection.id]
  );

  if (routeRows.length === 0) return null;

  return { ...collection, total_routes_count: routeRows.length, routes: routeRows as Route[] };
}

export async function insertCollection(data: {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  location?: string | null;
  country?: string | null;
  cover_image_url?: string | null;
  discipline: string;
  difficulty_range?: string | null;
  featured?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
}): Promise<Collection> {
  const { rows } = await sql`
    INSERT INTO collections (
      id, name, slug, description, location, country, cover_image_url,
      discipline, difficulty_range, featured, seo_title, seo_description
    ) VALUES (
      ${data.id}, ${data.name}, ${data.slug}, ${data.description ?? null},
      ${data.location ?? null}, ${data.country ?? null}, ${data.cover_image_url ?? null},
      ${data.discipline}, ${data.difficulty_range ?? null}, ${data.featured ?? false},
      ${data.seo_title ?? null}, ${data.seo_description ?? null}
    )
    RETURNING *
  `;
  return rows[0] as Collection;
}

export async function addRouteToCollection(collectionId: string, routeId: string, displayOrder: number): Promise<void> {
  await sql`
    INSERT INTO collection_routes (collection_id, route_id, display_order)
    VALUES (${collectionId}, ${routeId}, ${displayOrder})
    ON CONFLICT (collection_id, route_id) DO UPDATE SET display_order = EXCLUDED.display_order
  `;
  await sql`
    UPDATE collections
    SET total_routes_count = (
      SELECT COUNT(*) FROM collection_routes WHERE collection_id = ${collectionId}
    ), updated_at = NOW()
    WHERE id = ${collectionId}
  `;
}


// ──── Garmin Connect tokens ────

export interface GarminTokens {
  access_token: string;
  token_secret: string;
}

export async function saveGarminTokens(
  userId: string,
  accessToken: string,
  tokenSecret: string
): Promise<void> {
  const encryptedAccessToken = sealToken(accessToken);
  const encryptedTokenSecret = sealToken(tokenSecret);
  await sql`
    INSERT INTO garmin_tokens (user_id, access_token, token_secret)
    VALUES (${userId}, ${encryptedAccessToken}, ${encryptedTokenSecret})
    ON CONFLICT (user_id)
    DO UPDATE SET access_token = ${encryptedAccessToken}, token_secret = ${encryptedTokenSecret}, connected_at = NOW()
  `;
}

export async function getGarminTokens(userId: string): Promise<GarminTokens | null> {
  const { rows } = await sql`
    SELECT access_token, token_secret FROM garmin_tokens WHERE user_id = ${userId}
  `;
  if (rows.length === 0) return null;
  try {
    return {
      access_token: openToken(rows[0].access_token),
      token_secret: openToken(rows[0].token_secret),
    };
  } catch {
    // Legacy plaintext or corrupted ciphertext must never be reused.
    await deleteGarminTokens(userId);
    return null;
  }
}

export async function deleteGarminTokens(userId: string): Promise<void> {
  await sql`DELETE FROM garmin_tokens WHERE user_id = ${userId}`;
}
