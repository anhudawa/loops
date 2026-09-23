import { sql } from "@vercel/postgres";
import { v4 as uuidv4 } from "uuid";
import { DURATION_TIERS, DEFAULT_SPEED_KMH } from "@/config/constants";
import { clampSpeedKmh, rideMinutesSql } from "@/lib/ride-time";
import {
  computeUsageMetrics,
  type RawEventRow,
  type UsageMetrics,
} from "@/lib/metrics";

import { withPublicDescription } from "@/lib/public-route";

export { ANALYTICS_EVENTS } from "@/lib/metrics";

/**
 * Every route row read for display passes through here once: descriptions
 * lose operator attribution sentences ("Curated by Eat Sleep Cycle") —
 * owner decision, no public route attribution. Admin listings read raw.
 */
function publicRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((r) => withPublicDescription(r));
}

// ──── Init ────
export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      bio TEXT,
      avatar_url TEXT,
      location TEXT,
      session_token TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      distance_km REAL NOT NULL,
      elevation_gain_m REAL NOT NULL,
      elevation_loss_m REAL NOT NULL,
      surface_type TEXT NOT NULL CHECK(surface_type IN ('gravel', 'mixed', 'trail', 'road')),
      county TEXT NOT NULL,
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      gpx_filename TEXT,
      coordinates TEXT NOT NULL,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(route_id, user_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      caption TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS conditions (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('good', 'fair', 'poor', 'closed')),
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      follower_id TEXT NOT NULL REFERENCES users(id),
      following_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(follower_id, following_id),
      CHECK(follower_id != following_id)
    )
  `;
}

// ──── Migrations ────
// Memoise migrations so the ~25 idempotent ALTER/CREATE statements run ONCE
// per server process, not on every request. Previously every API route that
// called migrateDb() (18 of them) paid ~5-6s of DDL per request — that was the
// profile page's multi-second load.
let migrationsPromise: Promise<void> | null = null;
export function migrateDb(): Promise<void> {
  if (!migrationsPromise) {
    migrationsPromise = runMigrations().catch((err) => {
      // Let a later request retry rather than caching a failed migration.
      migrationsPromise = null;
      throw err;
    });
  }
  return migrationsPromise;
}

async function runMigrations() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_id TEXT UNIQUE`;
  // Email sign-in: the return path travels with the token (not a cookie).
  await sql`
    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS redirect TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE`;
  // Persisted quality score so the flagship "quality-scored" panel is instant
  // and resilient — it no longer depends on a live Overpass call per page view.
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS quality_score INT`;
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS quality_breakdown JSONB`;
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS quality_surface JSONB`;
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS road_report JSONB`;
  // Persisted scenery lookups (coast/water/forest/POIs per map area) so
  // repeat generations skip the slow public map query across instances.
  await sql`
    CREATE TABLE IF NOT EXISTS scenery_cache (
      key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS quality_scored_at TIMESTAMPTZ`;
  // Signup attribution (first-touch): which channel a rider came from.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_source TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_raw_source TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_medium TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_campaign TEXT`;
  // Newsletter (Saturday Spin) opt-in captured at signup.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS newsletter_opt_in BOOLEAN NOT NULL DEFAULT FALSE`;

  // Downloads tracking
  await sql`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(route_id, user_id)
    )
  `;

  // Verified column on routes
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE`;

  // Favourites
  await sql`
    CREATE TABLE IF NOT EXISTS favourites (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(route_id, user_id)
    )
  `;

  // Push tokens
  await sql`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, token)
    )
  `;

  // Conversations
  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS conversation_participants (
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      last_read_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (conversation_id, user_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      sender_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // User speed preference for duration filtering
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avg_speed_kmh REAL DEFAULT 25`;

  // Indexes for filter performance
  await sql`CREATE INDEX IF NOT EXISTS idx_routes_discipline ON routes(discipline)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_routes_surface_type ON routes(surface_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_route_ratings_route_id ON ratings(route_id)`;

  // Backfill orphaned routes — assign to first user (site creator)
  await sql`
    UPDATE routes SET created_by = (
      SELECT id FROM users ORDER BY created_at ASC LIMIT 1
    )
    WHERE created_by IS NULL
    AND EXISTS (SELECT 1 FROM users)
  `;

  // OAuth CSRF state tokens
  await sql`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      return_to TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS return_to TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_oauth_states_created_at ON oauth_states(created_at)`;

  // Strava OAuth tokens
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_access_token TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_token_expires_at BIGINT`;

  // Strava activity reference on routes for deduplication
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT`;

  // Difficulty: relax NOT NULL constraint so new routes can omit it
  await sql`ALTER TABLE routes ALTER COLUMN difficulty DROP NOT NULL`;
  await sql`ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_difficulty_check`;
  await sql`ALTER TABLE routes ALTER COLUMN difficulty SET DEFAULT NULL`;

  // Collections
  await sql`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      location TEXT,
      country TEXT,
      cover_image_url TEXT,
      discipline TEXT NOT NULL DEFAULT 'mixed' CHECK(discipline IN ('road', 'gravel', 'mtb', 'mixed')),
      difficulty_range TEXT,
      total_routes_count INTEGER NOT NULL DEFAULT 0,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      seo_title TEXT,
      seo_description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS collection_routes (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      display_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (collection_id, route_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections(slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_collections_featured ON collections(featured)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_collection_routes_collection_id ON collection_routes(collection_id)`;

  // Route quality status (set by scripts/run-full-quality-audit.mjs)
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS quality_status TEXT DEFAULT 'pending'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_routes_quality_status ON routes(quality_status)`;

  // Operator attribution — whose routes these are (e.g. "Eat Sleep Cycle")
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS operator_name TEXT`;
  await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS operator_url TEXT`;

  // Garmin Connect tokens (Courses API push)
  await sql`
    CREATE TABLE IF NOT EXISTS garmin_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      access_token TEXT NOT NULL,
      token_secret TEXT NOT NULL,
      connected_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // First-party product-usage events (evidence layer for the board).
  await ensureEventsTable();
}

// ──── Analytics events ────
//
// First-party usage instrumentation. NO PII ever lands in `properties`:
// route ids, distances, destination slugs and boolean flags only — never
// emails, IPs or user-agents. Writes are fire-and-safe: recordEvent never
// throws and never blocks the user path.

/**
 * Lazily create the events table + indexes, once per process. Cached so
 * hot-path recordEvent calls don't re-run DDL on every insert. Reset on
 * failure so a transient outage can retry on the next event.
 */
let eventsTableReady: Promise<void> | null = null;
function ensureEventsTable(): Promise<void> {
  if (!eventsTableReady) {
    eventsTableReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id),
          event TEXT NOT NULL,
          properties JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_events_event ON events(event)`;
    })().catch((err) => {
      eventsTableReady = null;
      throw err;
    });
  }
  return eventsTableReady;
}

/**
 * Record a first-party usage event. FIRE-AND-SAFE: wrapped in try/catch,
 * never throws, never blocks the user path. Callers on hot paths should
 * NOT await it (fire-and-forget) so the response is never delayed.
 *
 * `properties` must contain first-party, non-PII values only (route ids,
 * distances, slugs, boolean flags).
 */
export async function recordEvent(
  event: string,
  opts: { userId?: string | null; properties?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    await ensureEventsTable();
    await sql`
      INSERT INTO events (id, user_id, event, properties)
      VALUES (
        ${uuidv4()},
        ${opts.userId ?? null},
        ${event},
        ${JSON.stringify(opts.properties ?? {})}::jsonb
      )
    `;
  } catch {
    // Analytics must never break the user path — swallow and move on.
  }
}

/**
 * Aggregate usage metrics for the admin dashboard: this-week vs last-week
 * rolling 7-day windows, plus the timestamp recording started. Fail-soft:
 * returns null if the DB is unreachable or the table doesn't exist yet, so
 * the dashboard can render "metrics unavailable" instead of crashing.
 */
export async function getUsageMetrics(
  now: Date = new Date()
): Promise<{ metrics: UsageMetrics; since: string | null; signupSources: { source: string; count: number }[] } | null> {
  try {
    // Pull the 14-day window and aggregate in pure, unit-tested logic.
    const { rows } = await sql.query(
      `SELECT event, user_id, created_at, properties->>'new_user' AS new_user
       FROM events
       WHERE created_at >= NOW() - INTERVAL '14 days'`
    );
    const { rows: sinceRows } = await sql.query(
      `SELECT MIN(created_at) AS since FROM events`
    );
    const metrics = computeUsageMetrics(rows as RawEventRow[], now);
    const since = sinceRows[0]?.since ? String(sinceRows[0].since) : null;

    // Where this week's NEW signups came from (funnel attribution).
    const { rows: srcRows } = await sql.query(
      `SELECT COALESCE(NULLIF(properties->>'source',''), 'direct') AS source, COUNT(*)::int AS count
       FROM events
       WHERE event = 'auth_succeeded' AND properties->>'new_user' = 'true'
         AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY 1 ORDER BY 2 DESC`
    );
    const signupSources = srcRows.map((r) => ({
      source: String(r.source),
      count: Number(r.count),
    }));

    return { metrics, since, signupSources };
  } catch {
    return null;
  }
}

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
  /** Persisted quality score + factor breakdown (populated on first verified
   *  scoring; lets the detail page render instantly without live Overpass). */
  quality_score?: number | null;
  quality_breakdown?: Record<string, number> | null;
  quality_surface?: { paved_pct: number; unpaved_pct: number; unknown_pct: number } | null;
  /** Road Standard report saved with a generated/drawn route (trust rule:
   *  the compromise a rider saw when saving stays on the saved route). */
  road_report?: Record<string, unknown> | null;
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
  /** When there's no geolocation, sort routes in this country first (soft
   *  bias, not a filter) so a rider's default feed leads with home, not the
   *  globally top-rated (destination-heavy) list. */
  homeCountryBias?: string;
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
  user_email: string;
  user_avatar: string | null;
  body: string;
  created_at: string;
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

  // Only show approved routes (or legacy routes without a quality_status yet)
  conditions.push(`(r.quality_status = 'approved' OR r.quality_status IS NULL)`);

  // Duration filtering (uses route fields directly, no aggregation needed).
  // Riding minutes are the SQL twin of estimateRideMinutes in
  // src/lib/ride-time.ts — rideMinutesSql() is built from the same constants,
  // so cards, the tier filter, the sort and the FAQ can never disagree. The
  // rider's own avg_speed_kmh (clamped) replaces the road default as before.
  const avgSpeed = clampSpeedKmh(filters.avgSpeedKmh ?? DEFAULT_SPEED_KMH);
  if (filters.duration && filters.duration in DURATION_TIERS) {
    const tier = DURATION_TIERS[filters.duration as keyof typeof DURATION_TIERS];
    if ("maxMinutes" in tier && tier.maxMinutes !== undefined) {
      conditions.push(`${rideMinutesSql(`$${idx}`)} <= $${idx + 1}::numeric`);
      params.push(avgSpeed, tier.maxMinutes);
      idx += 2;
    }
    if ("minMinutes" in tier && tier.minMinutes !== undefined) {
      conditions.push(`${rideMinutesSql(`$${idx}`)} >= $${idx + 1}::numeric`);
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
    havingClauses.push("(bool_or(r.verified) = true OR (COUNT(rt.id) >= 3 AND COALESCE(AVG(rt.score), 0) >= 3.0))");
  }
  // Great-circle distance, with the parameters cast explicitly (a bare $n
  // inside radians() leaves the driver to guess the type) and the acos
  // argument clamped to [-1, 1] — floating error on a start point at or
  // very near the query point pushes it past 1 and acos raises
  // "input is out of range" for the WHOLE query.
  const haversineSql = `6371 * acos(LEAST(1::double precision, GREATEST(-1::double precision,
      cos(radians($${latIdx}::double precision)) * cos(radians(r.start_lat::double precision)) *
      cos(radians(r.start_lng::double precision) - radians($${lngIdx}::double precision)) +
      sin(radians($${latIdx}::double precision)) * sin(radians(r.start_lat::double precision))
    )))`;
  if (hasLocation && filters.maxRadius !== undefined) {
    havingClauses.push(`(${haversineSql}) <= $${idx}::double precision`);
    params.push(filters.maxRadius);
    idx++;
  }
  const having = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : "";

  // Determine ORDER BY
  // ORDER BY runs on the OUTER select over the CTE: columns are the CTE's
  // (created_at, distance_km, …), never `r.` — and computed aliases can be
  // used only as real columns, hence the extra subquery layer below.
  const sortMap: Record<string, string> = {
    newest: "created_at DESC",
    distance: "distance_km DESC",
    rating: "avg_rating DESC NULLS LAST, rating_count DESC",
    nearby: hasLocation ? "haversine_distance ASC" : "created_at DESC",
    duration_match: "estimated_minutes ASC",
  };

  let orderBy: string;
  if (filters.sort && sortMap[filters.sort]) {
    orderBy = sortMap[filters.sort];
  } else if (hasLocation) {
    // Default with location: proximity zone with rating boost
    orderBy = "(base_zone + zone_boost) ASC, avg_rating DESC NULLS LAST";
  } else if (filters.homeCountryBias) {
    // Default without location: home country first, then rating. Keeps
    // destinations discoverable below instead of leading with them.
    const hbIdx = idx++;
    params.push(filters.homeCountryBias);
    orderBy = `(CASE WHEN LOWER(country) = LOWER($${hbIdx}) THEN 0 ELSE 1 END) ASC, avg_rating DESC NULLS LAST, rating_count DESC`;
  } else {
    // Default without location and no home hint: highest rated first
    orderBy = "avg_rating DESC NULLS LAST, rating_count DESC";
  }

  const haversineExpr = hasLocation ? haversineSql : "NULL::double precision";

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
        CASE WHEN r.verified = true OR (COUNT(rt.id) >= 3 AND COALESCE(AVG(rt.score), 0) >= 3.0) THEN 1 ELSE 0 END as is_verified,
        u.name as creator_name, u.avatar_url as creator_avatar,
        COALESCE((SELECT AVG(rt2.score) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating,
        COALESCE((SELECT COUNT(rt2.id) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating_count,
        (SELECT COUNT(*) FROM comments cm WHERE cm.route_id = r.id) as comment_count,
        ${rideMinutesSql(`$${speedIdx}`)} as estimated_minutes,
        ${haversineExpr} as haversine_distance
      FROM routes r
      LEFT JOIN ratings rt ON rt.route_id = r.id
      LEFT JOIN users u ON u.id = r.created_by
      ${where}
      GROUP BY r.id, u.name, u.avatar_url
      ${having}
    )
    SELECT * FROM (
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
    ) zoned
    ORDER BY ${orderBy}, created_at DESC, id ASC
    LIMIT $${limitIdx}::int OFFSET $${offsetIdx}::int
  `;

  const { rows } = await sql.query(query, params);
  return publicRows(rows) as Route[];
}

export async function getRoute(id: string): Promise<(Route & { is_verified?: number; creator_name?: string | null; creator_avatar?: string | null; creator_rating?: number; creator_rating_count?: number }) | undefined> {
  const { rows } = await sql`
    SELECT r.*,
      CASE WHEN r.verified = true
        OR ((SELECT COUNT(*) FROM ratings WHERE route_id = r.id) >= 3
            AND (SELECT COALESCE(AVG(score), 0) FROM ratings WHERE route_id = r.id) >= 3.0)
        THEN 1 ELSE 0 END as is_verified,
      u.name as creator_name, u.avatar_url as creator_avatar,
      COALESCE((SELECT AVG(rt2.score) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating,
      COALESCE((SELECT COUNT(rt2.id) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating_count
    FROM routes r
    LEFT JOIN users u ON u.id = r.created_by
    WHERE r.id = ${id}
  `;
  return (rows[0] ? withPublicDescription(rows[0]) : undefined) as (Route & { is_verified?: number; creator_name?: string | null; creator_avatar?: string | null; creator_rating?: number; creator_rating_count?: number }) | undefined;
}

/** Persist a verified quality score on a route so the detail page can show it
 *  instantly next time without re-hitting Overpass. Fire-and-safe. */
export async function storeRouteRoadReport(routeId: string, report: unknown): Promise<void> {
  try {
    await sql`UPDATE routes SET road_report = ${JSON.stringify(report)}::jsonb WHERE id = ${routeId}`;
  } catch (err) {
    console.error("[db] storeRouteRoadReport failed:", err instanceof Error ? err.message : err);
  }
}

export async function storeRouteQuality(
  routeId: string,
  quality: { total: number; breakdown: Record<string, number>; surface_breakdown?: unknown }
): Promise<void> {
  try {
    await sql`
      UPDATE routes
      SET quality_score = ${Math.round(quality.total)},
          quality_breakdown = ${JSON.stringify(quality.breakdown)}::jsonb,
          quality_surface = ${quality.surface_breakdown ? JSON.stringify(quality.surface_breakdown) : null}::jsonb,
          quality_scored_at = NOW()
      WHERE id = ${routeId}
    `;
  } catch {
    // Caching the score is best-effort; never break the request.
  }
}

/** Trim and collapse whitespace in a stored label ("Tipperary " → "Tipperary"). */
export function cleanLabel<T extends string | null | undefined>(v: T): T {
  return (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v) as T;
}

export async function insertRoute(
  route: Omit<Route, "created_at" | "quality_status" | "operator_name" | "operator_url"> &
    Partial<Pick<Route, "quality_status" | "operator_name" | "operator_url">>
): Promise<Route> {
  route = { ...route, name: cleanLabel(route.name), county: cleanLabel(route.county), region: cleanLabel(route.region), country: cleanLabel(route.country) };
  await sql`
    INSERT INTO routes (id, name, description, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates, created_by, strava_activity_id, operator_name, operator_url)
    VALUES (${route.id}, ${route.name}, ${route.description}, ${route.distance_km}, ${route.elevation_gain_m}, ${route.elevation_loss_m}, ${route.surface_type}, ${route.county}, ${route.country}, ${route.region}, ${route.discipline}, ${route.start_lat}, ${route.start_lng}, ${route.gpx_filename}, ${route.coordinates}, ${route.created_by}, ${route.strava_activity_id ?? null}, ${route.operator_name ?? null}, ${route.operator_url ?? null})
  `;
  return (await getRoute(route.id))!;
}

/** A LOOPS-curated route from a bundled library file (src/data/hub-bundles).
 *  Shown publicly (approved) but NOT verified — self-sourced, not an
 *  external operator's route. Idempotent: an existing name+county is skipped. */
export async function insertCuratedRoute(r: {
  id: string; name: string; description: string | null; county: string; country: string; region: string;
  discipline: string; surface_type: string; distance_km: number; elevation_gain_m: number; elevation_loss_m: number;
  coordinates: number[][]; road_report: unknown;
}): Promise<"inserted" | "exists"> {
  r = { ...r, name: cleanLabel(r.name), county: cleanLabel(r.county), region: cleanLabel(r.region), country: cleanLabel(r.country) };
  await migrateDb();
  const { rows } = await sql`SELECT id FROM routes WHERE name = ${r.name} AND county = ${r.county} LIMIT 1`;
  if (rows.length > 0) return "exists";
  await sql`
    INSERT INTO routes (
      id, name, description, distance_km, elevation_gain_m, elevation_loss_m,
      surface_type, county, country, region, discipline,
      start_lat, start_lng, gpx_filename, coordinates,
      created_by, verified, quality_status, operator_name, operator_url, road_report
    ) VALUES (
      ${r.id}, ${r.name}, ${r.description}, ${r.distance_km}, ${r.elevation_gain_m}, ${r.elevation_loss_m},
      ${r.surface_type}, ${r.county}, ${r.country}, ${r.region}, ${r.discipline},
      ${r.coordinates[0][0]}, ${r.coordinates[0][1]}, ${null}, ${JSON.stringify(r.coordinates)},
      ${null}, FALSE, 'approved', 'LOOPS', 'https://www.loops.ie', ${JSON.stringify(r.road_report)}::jsonb
    )
  `;
  return "inserted";
}

/** Replace a stored route's track (a rebuilt version of the same ride): new
 *  coordinates, distance and climbing, a fresh road report, quality reset.
 *  Matched by name within a country. Returns how many rows changed (0 = no
 *  such route, 1 = replaced). */
export async function replaceRouteTrack(r: {
  name: string; country: string; coordinates: number[][]; distance_km: number;
  elevation_gain_m: number; elevation_loss_m: number; road_report: unknown;
}): Promise<number> {
  await migrateDb();
  const { rowCount } = await sql`
    UPDATE routes
    SET coordinates = ${JSON.stringify(r.coordinates)}, distance_km = ${r.distance_km},
        elevation_gain_m = ${r.elevation_gain_m}, elevation_loss_m = ${r.elevation_loss_m},
        start_lat = ${r.coordinates[0][0]}, start_lng = ${r.coordinates[0][1]},
        road_report = ${JSON.stringify(r.road_report)}::jsonb,
        quality_score = NULL, quality_breakdown = NULL, quality_surface = NULL, quality_scored_at = NULL
    WHERE name = ${r.name} AND country = ${r.country}
  `;
  return rowCount ?? 0;
}

/**
 * Library data hygiene (admin, one tap, idempotent). Every change is a
 * label normalisation — nothing is deleted. Returns rows changed per fix.
 */
export const TEST_UPLOAD_IDS = [
  "033a076f-474c-4485-b98c-c0965c7de711",
  "1ee51944-419f-4ceb-ba36-029805d334e6",
  "393ca702-24fc-4e05-84ca-533874b30194",
  "b31b023b-40b3-4097-be47-daaf92b54cf1",
] as const;

export async function tidyLibraryData(): Promise<Record<string, number>> {
  await migrateDb();
  const n = (r: { rowCount: number | null }) => r.rowCount ?? 0;
  const out: Record<string, number> = {};
  out.whitespace = n(await sql`
    UPDATE routes SET
      name = regexp_replace(TRIM(name), '\s{2,}', ' ', 'g'),
      region = regexp_replace(TRIM(region), '\s{2,}', ' ', 'g'),
      county = regexp_replace(TRIM(county), '\s{2,}', ' ', 'g')
    WHERE name <> regexp_replace(TRIM(name), '\s{2,}', ' ', 'g')
       OR region <> regexp_replace(TRIM(region), '\s{2,}', ' ', 'g')
       OR county <> regexp_replace(TRIM(county), '\s{2,}', ' ', 'g')`);
  out.london = n(await sql`
    UPDATE routes SET region = CASE WHEN region = 'london' THEN 'London' ELSE region END,
                      county = CASE WHEN county = 'london' THEN 'London' ELSE county END
    WHERE region = 'london' OR county = 'london'`);
  out.mallorca = n(await sql`
    UPDATE routes SET
      region = CASE WHEN region IN ('Majorca', 'Balearic Islands', 'Islas Baleares') THEN 'Mallorca' ELSE region END,
      county = CASE WHEN county IN ('Majorca', 'Balearic Islands', 'Islas Baleares') THEN 'Mallorca' ELSE county END
    WHERE country = 'Spain'
      AND (region IN ('Majorca', 'Balearic Islands', 'Islas Baleares') OR county IN ('Majorca', 'Balearic Islands', 'Islas Baleares'))`);
  out.girona = n(await sql`
    UPDATE routes SET region = 'Girona' WHERE country = 'Spain' AND region = 'Cataluña'`);
  out.featured_collections = n(await sql`
    UPDATE collections SET featured = TRUE WHERE slug IN ('mallorca', 'calpe', 'dublin') AND featured = FALSE`);
  return out;
}

/** Hide (not delete) the four known test uploads; reversible via quality_status. */
export async function hideTestUploads(): Promise<number> {
  await migrateDb();
  const { rowCount } = await sql.query(
    `UPDATE routes SET quality_status = 'pending' WHERE id = ANY($1::text[]) AND (quality_status IS NULL OR quality_status <> 'pending')`,
    [TEST_UPLOAD_IDS as unknown as string[]]
  );
  return rowCount ?? 0;
}

// ──── Users ────
export async function getUserByEmail(email: string): Promise<User | undefined> {
  const { rows } = await sql`SELECT * FROM users WHERE email = ${email}`;
  return rows[0] as User | undefined;
}

/** Email (magic-link) sign-in: existing account by email gets a new
 *  session; otherwise a new rider is created with first-touch attribution. */
export async function upsertEmailUser(
  id: string,
  email: string,
  sessionToken: string,
  attribution?: { source: string; raw_source: string | null; medium: string | null; campaign: string | null } | null
): Promise<{ user: User; isNew: boolean }> {
  const existing = await getUserByEmail(email);
  if (existing) {
    await sql`UPDATE users SET session_token = ${sessionToken} WHERE id = ${existing.id}`;
    return { user: (await getUserByEmail(email))!, isNew: false };
  }
  const name = email.split("@")[0].replace(/[._-]+/g, " ").slice(0, 40) || "Rider";
  await sql`
    INSERT INTO users (id, email, name, session_token,
                       signup_source, signup_raw_source, signup_medium, signup_campaign)
    VALUES (${id}, ${email}, ${name}, ${sessionToken},
            ${attribution?.source ?? null}, ${attribution?.raw_source ?? null},
            ${attribution?.medium ?? null}, ${attribution?.campaign ?? null})
  `;
  return { user: (await getUserByEmail(email))!, isNew: true };
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
  sessionToken: string,
  attribution?: { source: string; raw_source: string | null; medium: string | null; campaign: string | null } | null
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
  // New user: record first-touch attribution at signup (nullable).
  await sql`
    INSERT INTO users (id, email, name, avatar_url, google_id, session_token,
                       signup_source, signup_raw_source, signup_medium, signup_campaign)
    VALUES (${id}, ${email}, ${name}, ${avatarUrl}, ${googleId}, ${sessionToken},
            ${attribution?.source ?? null}, ${attribution?.raw_source ?? null},
            ${attribution?.medium ?? null}, ${attribution?.campaign ?? null})
  `;
  return (await getUserByGoogleId(googleId))!;
}

/** Record a rider's newsletter opt-in (set at signup). Idempotent. */
export async function markNewsletterOptIn(userId: string): Promise<void> {
  await sql`UPDATE users SET newsletter_opt_in = TRUE WHERE id = ${userId}`;
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
  await sql`
    UPDATE users
    SET strava_id = ${stravaId},
        strava_access_token = ${accessToken},
        strava_refresh_token = ${refreshToken},
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
  await sql`
    UPDATE users
    SET strava_access_token = ${accessToken},
        strava_refresh_token = ${refreshToken},
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
export async function createMagicLink(id: string, email: string, token: string, expiresAt: Date, redirect: string | null = null): Promise<void> {
  await sql`
    INSERT INTO magic_links (id, email, token, expires_at, redirect)
    VALUES (${id}, ${email}, ${token}, ${expiresAt.toISOString()}, ${redirect})
  `;
}

/** Valid, unused link → its email and (when the rider asked from a page) where to return. */
export async function validateMagicLink(token: string): Promise<{ email: string; redirect: string | null } | null> {
  const { rows } = await sql`
    SELECT * FROM magic_links
    WHERE token = ${token} AND used = FALSE AND expires_at > NOW()
  `;
  if (rows.length === 0) return null;
  await sql`UPDATE magic_links SET used = TRUE WHERE token = ${token}`;
  return { email: rows[0].email, redirect: rows[0].redirect ?? null };
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
      WHERE rt.user_id = $1

      UNION ALL

      SELECT 'comment' as type, c.route_id, r.name as route_name,
        LEFT(c.body, 80) as detail, c.created_at
      FROM comments c JOIN routes r ON r.id = c.route_id
      WHERE c.user_id = $1

      UNION ALL

      SELECT 'condition' as type, co.route_id, r.name as route_name,
        co.status as detail, co.created_at
      FROM conditions co JOIN routes r ON r.id = co.route_id
      WHERE co.user_id = $1

      UNION ALL

      SELECT 'photo' as type, p.route_id, r.name as route_name,
        COALESCE(p.caption, 'Photo') as detail, p.created_at
      FROM photos p JOIN routes r ON r.id = p.route_id
      WHERE p.user_id = $1
    ) activity
    ORDER BY created_at DESC
    LIMIT $2::int OFFSET $3::int
    `,
    [userId, limit, offset]
  );
  return rows as ActivityItem[];
}

export async function getUserTotalKm(userId: string): Promise<number> {
  const { rows } = await sql`
    SELECT COALESCE(SUM(r.distance_km), 0) as total
    FROM routes r
    WHERE r.id IN (SELECT route_id FROM ratings WHERE user_id = ${userId})
  `;
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
    SELECT c.id, c.route_id, c.user_id, u.name as user_name, u.email as user_email, u.avatar_url as user_avatar, c.body, c.created_at
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
  await sql`INSERT INTO conditions (id, route_id, user_id, status, note) VALUES (${id}, ${routeId}, ${userId}, ${status}, ${note})`;
}

// ──── User profiles ────
export async function getUserRoutes(userId: string): Promise<Route[]> {
  const { rows } = await sql`
    SELECT * FROM routes WHERE id IN (
      SELECT route_id FROM comments WHERE user_id = ${userId}
      UNION
      SELECT route_id FROM ratings WHERE user_id = ${userId}
    ) ORDER BY name
  `;
  return publicRows(rows) as Route[];
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const [rated, commented, conds, photos] = await Promise.all([
    sql`SELECT COUNT(*) as c FROM ratings WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as c FROM comments WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as c FROM conditions WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as c FROM photos WHERE user_id = ${userId}`,
  ]);
  return {
    routesRated: Number(rated.rows[0].c),
    commentsPosted: Number(commented.rows[0].c),
    conditionsReported: Number(conds.rows[0].c),
    photosUploaded: Number(photos.rows[0].c),
  };
}

export async function getCounties(): Promise<string[]> {
  const { rows } = await sql`SELECT DISTINCT county FROM routes WHERE (quality_status = 'approved' OR quality_status IS NULL) ORDER BY county`;
  return rows.map((r) => r.county);
}

export async function getRegions(country?: string): Promise<string[]> {
  if (country) {
    const { rows } = await sql`SELECT DISTINCT region FROM routes WHERE country = ${country} AND region IS NOT NULL AND (quality_status = 'approved' OR quality_status IS NULL) ORDER BY region`;
    return rows.map((r) => r.region);
  }
  const { rows } = await sql`SELECT DISTINCT region FROM routes WHERE region IS NOT NULL AND (quality_status = 'approved' OR quality_status IS NULL) ORDER BY region`;
  return rows.map((r) => r.region);
}

export async function getCountries(): Promise<string[]> {
  const { rows } = await sql`SELECT DISTINCT country FROM routes WHERE (quality_status = 'approved' OR quality_status IS NULL) ORDER BY country`;
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
    sql.query(`SELECT * FROM users ORDER BY created_at DESC LIMIT $1::int OFFSET $2::int`, [limit, offset]),
    sql`SELECT COUNT(*) as c FROM users`,
  ]);
  return { users: data.rows as User[], total: Number(count.rows[0].c) };
}

export async function getAllComments(page = 1, limit = 50): Promise<{ comments: (Comment & { route_name: string })[]; total: number }> {
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
  return { comments: data.rows as (Comment & { route_name: string })[], total: Number(count.rows[0].c) };
}

export async function getAllRoutes(page = 1, limit = 50): Promise<{ routes: Route[]; total: number }> {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    sql.query(`SELECT * FROM routes ORDER BY created_at DESC LIMIT $1::int OFFSET $2::int`, [limit, offset]),
    sql`SELECT COUNT(*) as c FROM routes`,
  ]);
  return { routes: data.rows as Route[], total: Number(count.rows[0].c) };
}

// ──── SEO Queries ────

export async function getAllRoutesForSitemap(): Promise<{ id: string; created_at: string }[]> {
  const { rows } = await sql`SELECT id, created_at FROM routes WHERE (quality_status = 'approved' OR quality_status IS NULL) ORDER BY created_at DESC`;
  return rows as { id: string; created_at: string }[];
}

/**
 * SQL expression that reproduces slugify() (src/lib/seo.ts) for a column, so a
 * URL slug (accent-stripped, apostrophe-deleted, whitespace-hyphenated) matches
 * the accented name stored in the DB. Without this, `/routes/country/spain/
 * cataluna` never matches the stored region "Cataluña" and every accented
 * region (Girona, Málaga, Nice…) 404s. Uses only core SQL — no extensions.
 */
function slugSql(col: string): string {
  // LOWER first (handles accented uppercase), TRANSLATE strips diacritics,
  // then: delete anything not [a-z0-9 space -], whitespace→'-', collapse '-',
  // trim leading/trailing '-'. Mirrors slugify()'s regex chain exactly.
  return (
    "TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(" +
    `TRANSLATE(LOWER(${col}), ` +
    "'àáâãäåèéêëìíîïòóôõöùúûüýÿñç', 'aaaaaaeeeeiiiiooooouuuuyync')" +
    ", '[^a-z0-9[:space:]-]', '', 'g'), '[[:space:]]+', '-', 'g'), '-+', '-', 'g'))"
  );
}

export async function getRoutesByCountrySlug(slug: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count
     FROM routes r
     LEFT JOIN ratings rt ON rt.route_id = r.id
     WHERE ${slugSql("r.country")} = $1 AND (r.quality_status = 'approved' OR r.quality_status IS NULL)
     GROUP BY r.id
     ORDER BY COALESCE(AVG(rt.score), 0) DESC, r.created_at DESC`,
    [slug]
  );
  return publicRows(rows) as Route[];
}

export async function getRoutesByRegionSlug(countrySlug: string, regionSlug: string): Promise<Route[]> {
  const { rows } = await sql.query(
    `SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count
     FROM routes r
     LEFT JOIN ratings rt ON rt.route_id = r.id
     WHERE ${slugSql("r.country")} = $1 AND (r.quality_status = 'approved' OR r.quality_status IS NULL)
       AND ${slugSql("r.region")} = $2
     GROUP BY r.id
     ORDER BY COALESCE(AVG(rt.score), 0) DESC, r.created_at DESC`,
    [countrySlug, regionSlug]
  );
  return publicRows(rows) as Route[];
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
    `SELECT
       COUNT(*) as route_count,
       COALESCE(SUM(distance_km), 0) as total_distance,
       COALESCE((SELECT AVG(rt.score) FROM ratings rt JOIN routes r2 ON rt.route_id = r2.id WHERE ${slugSql("r2.country")} = $1), 0) as avg_rating,
       MIN(country) as display_name
     FROM routes
     WHERE (quality_status = 'approved' OR quality_status IS NULL) AND ${slugSql("country")} = $1`,
    [countrySlug]
  );

  if (!rows[0] || Number(rows[0].route_count) === 0) return null;

  const { rows: disciplineRows } = await sql.query(
    `SELECT DISTINCT discipline FROM routes WHERE (quality_status = 'approved' OR quality_status IS NULL) AND ${slugSql("country")} = $1 ORDER BY discipline`,
    [countrySlug]
  );

  const { rows: regionRows } = await sql.query(
    `SELECT region as name, COUNT(*) as route_count
     FROM routes
     WHERE (quality_status = 'approved' OR quality_status IS NULL) AND ${slugSql("country")} = $1 AND region IS NOT NULL
     GROUP BY region
     ORDER BY region`,
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
    `SELECT
       COUNT(*) as route_count,
       COALESCE(SUM(distance_km), 0) as total_distance,
       COALESCE((SELECT AVG(rt.score) FROM ratings rt JOIN routes r2 ON rt.route_id = r2.id WHERE ${slugSql("r2.country")} = $1 AND ${slugSql("r2.region")} = $2), 0) as avg_rating,
       MIN(region) as display_name,
       MIN(country) as country_display_name
     FROM routes
     WHERE (quality_status = 'approved' OR quality_status IS NULL) AND ${slugSql("country")} = $1
       AND ${slugSql("region")} = $2`,
    [countrySlug, regionSlug]
  );

  if (!rows[0] || Number(rows[0].route_count) === 0) return null;

  const { rows: disciplineRows } = await sql.query(
    `SELECT DISTINCT discipline FROM routes WHERE (quality_status = 'approved' OR quality_status IS NULL) AND ${slugSql("country")} = $1 AND ${slugSql("region")} = $2 ORDER BY discipline`,
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
      `SELECT * FROM routes WHERE (quality_status = 'approved' OR quality_status IS NULL) AND country = $1 AND region = $2 AND id != $3 ORDER BY created_at DESC LIMIT $4`,
      [country, region, routeId, limit]
    );
    if (rows.length > 0) return publicRows(rows) as Route[];
  }
  // Fall back to same country
  const { rows } = await sql.query(
    `SELECT * FROM routes WHERE (quality_status = 'approved' OR quality_status IS NULL) AND country = $1 AND id != $2 ORDER BY created_at DESC LIMIT $3`,
    [country, routeId, limit]
  );
  return publicRows(rows) as Route[];
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
  const { rows } = await sql`
    SELECT r.* FROM routes r
    JOIN downloads d ON d.route_id = r.id
    WHERE d.user_id = ${userId}
    ORDER BY d.created_at DESC
  `;
  return publicRows(rows) as Route[];
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
  const { rows } = await sql`
    SELECT r.* FROM routes r
    JOIN favourites f ON f.route_id = r.id
    WHERE f.user_id = ${userId}
    ORDER BY f.created_at DESC
  `;
  return publicRows(rows) as Route[];
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
      COALESCE((SELECT COUNT(*) FROM routes WHERE created_by = $1), 0) as routes_uploaded,
      COALESCE((SELECT COUNT(*) FROM ratings WHERE user_id = $1), 0) as ratings_given,
      COALESCE((SELECT COUNT(*) FROM comments WHERE user_id = $1), 0) as comments_posted,
      COALESCE((SELECT COUNT(*) FROM photos WHERE user_id = $1), 0) as photos_uploaded,
      COALESCE((SELECT COUNT(*) FROM follows WHERE following_id = $1), 0) as followers,
      COALESCE((
        SELECT SUM(avg_score * 5)
        FROM (
          SELECT AVG(rt.score) as avg_score
          FROM routes r
          JOIN ratings rt ON rt.route_id = r.id
          WHERE r.created_by = $1
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
  const { rows } = await sql`
    SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count
    FROM routes r
    LEFT JOIN ratings rt ON rt.route_id = r.id
    WHERE r.created_by = ${userId}
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `;
  return publicRows(rows) as Route[];
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
}> {
  const [users, routes, comments, banned] = await Promise.all([
    sql`SELECT COUNT(*) as c FROM users`,
    sql`SELECT COUNT(*) as c FROM routes`,
    sql`SELECT COUNT(*) as c FROM comments`,
    sql`SELECT COUNT(*) as c FROM users WHERE role = 'banned'`,
  ]);
  return {
    totalUsers: Number(users.rows[0].c),
    totalRoutes: Number(routes.rows[0].c),
    totalComments: Number(comments.rows[0].c),
    bannedUsers: Number(banned.rows[0].c),
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
  /** First route in the collection — used for a route-shape card thumbnail
   *  when there's no cover_image_url. Populated by getCollections. */
  cover_route_id?: string | null;
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

// Live route count (the stored total_routes_count drifts — seeds link routes
// without updating it) + a representative route for the card thumbnail.
const COLLECTION_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM collection_routes cr WHERE cr.collection_id = c.id) AS total_routes_count,
    (SELECT cr.route_id FROM collection_routes cr
       JOIN routes r2 ON r2.id = cr.route_id
       WHERE cr.collection_id = c.id
         AND r2.coordinates IS NOT NULL AND r2.coordinates <> '' AND r2.coordinates <> '[]'
       ORDER BY cr.display_order ASC LIMIT 1) AS cover_route_id
  FROM collections c`;

export async function getCollections(): Promise<Collection[]> {
  const { rows } = await sql.query(
    `${COLLECTION_SELECT} ORDER BY c.featured DESC, c.created_at DESC`
  );
  return rows as Collection[];
}

export async function getFeaturedCollections(): Promise<Collection[]> {
  const { rows } = await sql.query(
    `${COLLECTION_SELECT} WHERE c.featured = TRUE ORDER BY c.created_at DESC LIMIT 6`
  );
  return rows as Collection[];
}

export async function getCollectionBySlug(slug: string): Promise<CollectionWithRoutes | null> {
  const { rows: collRows } = await sql`
    SELECT * FROM collections WHERE slug = ${slug} LIMIT 1
  `;
  if (collRows.length === 0) return null;
  const collection = collRows[0] as Collection;

  const { rows: routeRows } = await sql`
    SELECT r.*, cr.display_order
    FROM routes r
    JOIN collection_routes cr ON cr.route_id = r.id
    WHERE cr.collection_id = ${collection.id}
    ORDER BY cr.display_order ASC, r.created_at ASC
  `;

  // Use the live linked-route count, not the stored total_routes_count (which
  // the seed scripts don't keep in sync) — otherwise the detail header reads
  // "routes" with no number.
  return {
    ...collection,
    total_routes_count: routeRows.length,
    routes: publicRows(routeRows) as Route[],
  };
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
  await sql`
    INSERT INTO garmin_tokens (user_id, access_token, token_secret)
    VALUES (${userId}, ${accessToken}, ${tokenSecret})
    ON CONFLICT (user_id)
    DO UPDATE SET access_token = ${accessToken}, token_secret = ${tokenSecret}, connected_at = NOW()
  `;
}

export async function getGarminTokens(userId: string): Promise<GarminTokens | null> {
  const { rows } = await sql`
    SELECT access_token, token_secret FROM garmin_tokens WHERE user_id = ${userId}
  `;
  return rows.length > 0
    ? { access_token: rows[0].access_token, token_secret: rows[0].token_secret }
    : null;
}

export async function deleteGarminTokens(userId: string): Promise<void> {
  await sql`DELETE FROM garmin_tokens WHERE user_id = ${userId}`;
}


/** Persist repaired coordinates/elevation after an elevation backfill. */
export async function updateRouteElevation(
  id: string,
  coordinates: string,
  gainM: number,
  lossM: number
): Promise<void> {
  await sql`
    UPDATE routes
    SET coordinates = ${coordinates}, elevation_gain_m = ${gainM}, elevation_loss_m = ${lossM}
    WHERE id = ${id}
  `;
}

/** Persist a repaired track (gap healing): coordinates + recomputed distance.
 *  The stored quality score is cleared so it is re-scored on the new track. */
export async function updateRouteGeometry(id: string, coordinates: string, distanceKm: number): Promise<void> {
  await sql`
    UPDATE routes
    SET coordinates = ${coordinates}, distance_km = ${distanceKm},
        quality_score = NULL, quality_breakdown = NULL, quality_surface = NULL, quality_scored_at = NULL
    WHERE id = ${id}
  `;
}

// ── Scenery cache ─────────────────────────────────────────────────────────────

const SCENERY_CACHE_TTL_DAYS = 45;

/** Cached scenery payload for a map area, or null (miss, stale, or DB down). */
export async function getSceneryCache(key: string): Promise<unknown | null> {
  try {
    await migrateDb();
    const { rows } = await sql`
      SELECT payload FROM scenery_cache
      WHERE key = ${key} AND created_at > NOW() - (${SCENERY_CACHE_TTL_DAYS} || ' days')::interval
    `;
    return rows[0]?.payload ?? null;
  } catch {
    return null;
  }
}

/** Store a scenery payload (fire-and-forget safe; never throws). */
export async function setSceneryCache(key: string, payload: unknown): Promise<void> {
  try {
    await migrateDb();
    await sql`
      INSERT INTO scenery_cache (key, payload, created_at)
      VALUES (${key}, ${JSON.stringify(payload)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()
    `;
  } catch (err) {
    console.error("[db] setSceneryCache failed:", err instanceof Error ? err.message : err);
  }
}

