import { sql } from "@vercel/postgres";

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
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'moderate', 'hard', 'expert')),
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
export async function migrateDb() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_id TEXT UNIQUE`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE`;

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

  // Backfill orphaned routes — assign to first user (site creator)
  await sql`
    UPDATE routes SET created_by = (
      SELECT id FROM users ORDER BY created_at ASC LIMIT 1
    )
    WHERE created_by IS NULL
    AND EXISTS (SELECT 1 FROM users)
  `;
}

// ──── Types ────
export interface Route {
  id: string;
  name: string;
  description: string | null;
  difficulty: "easy" | "moderate" | "hard" | "expert";
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
}

export interface RouteFilters {
  difficulty?: string;
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

  if (filters.difficulty) {
    conditions.push(`r.difficulty = $${idx++}`);
    params.push(filters.difficulty);
  }
  if (filters.minDistance !== undefined) {
    conditions.push(`r.distance_km >= $${idx++}`);
    params.push(filters.minDistance);
  }
  if (filters.maxDistance !== undefined) {
    conditions.push(`r.distance_km <= $${idx++}`);
    params.push(filters.maxDistance);
  }
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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Haversine distance calculation for "Near Me"
  const hasLocation = filters.lat !== undefined && filters.lng !== undefined;
  const distanceSelect = hasLocation
    ? `, (6371 * acos(
        cos(radians($${idx})) * cos(radians(r.start_lat)) *
        cos(radians(r.start_lng) - radians($${idx + 1})) +
        sin(radians($${idx})) * sin(radians(r.start_lat))
      )) as distance_km_away`
    : "";

  if (hasLocation) {
    params.push(filters.lat!, filters.lng!);
    idx += 2;
  }

  const sortMap: Record<string, string> = {
    newest: "r.created_at DESC",
    distance: "r.distance_km DESC",
    rating: "avg_score DESC, rating_count DESC",
    nearby: hasLocation ? "distance_km_away ASC" : "r.created_at DESC",
  };
  const orderBy = hasLocation && !filters.sort
    ? "distance_km_away ASC"
    : sortMap[filters.sort || ""] || "r.created_at DESC";

  // Build HAVING clauses
  const havingClauses: string[] = [];
  if (filters.verified) {
    havingClauses.push("(bool_or(r.verified) = true OR (COUNT(rt.id) >= 3 AND COALESCE(AVG(rt.score), 0) >= 3.0))");
  }
  if (hasLocation && filters.maxRadius !== undefined) {
    havingClauses.push(`(6371 * acos(
      cos(radians($${idx - 2})) * cos(radians(r.start_lat)) *
      cos(radians(r.start_lng) - radians($${idx - 1})) +
      sin(radians($${idx - 2})) * sin(radians(r.start_lat))
    )) <= $${idx}`);
    params.push(filters.maxRadius);
    idx++;
  }
  const having = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : "";

  const query = `
    SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count,
      (SELECT p.filename FROM photos p WHERE p.route_id = r.id ORDER BY p.created_at LIMIT 1) as cover_photo,
      CASE WHEN r.verified = true OR (COUNT(rt.id) >= 3 AND COALESCE(AVG(rt.score), 0) >= 3.0) THEN 1 ELSE 0 END as is_verified,
      u.name as creator_name, u.avatar_url as creator_avatar,
      COALESCE((SELECT AVG(rt2.score) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating,
      COALESCE((SELECT COUNT(rt2.id) FROM routes r2 JOIN ratings rt2 ON rt2.route_id = r2.id WHERE r2.created_by = r.created_by), 0) as creator_rating_count,
      (SELECT COUNT(*) FROM comments cm WHERE cm.route_id = r.id) as comment_count
      ${distanceSelect}
    FROM routes r
    LEFT JOIN ratings rt ON rt.route_id = r.id
    LEFT JOIN users u ON u.id = r.created_by
    ${where}
    GROUP BY r.id, u.name, u.avatar_url
    ${having}
    ORDER BY ${orderBy}
  `;

  const { rows } = await sql.query(query, params);
  return rows as Route[];
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
  return rows[0] as (Route & { is_verified?: number; creator_name?: string | null; creator_avatar?: string | null; creator_rating?: number; creator_rating_count?: number }) | undefined;
}

export async function insertRoute(route: Omit<Route, "created_at">): Promise<Route> {
  await sql`
    INSERT INTO routes (id, name, description, difficulty, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates, created_by)
    VALUES (${route.id}, ${route.name}, ${route.description}, ${route.difficulty}, ${route.distance_km}, ${route.elevation_gain_m}, ${route.elevation_loss_m}, ${route.surface_type}, ${route.county}, ${route.country}, ${route.region}, ${route.discipline}, ${route.start_lat}, ${route.start_lng}, ${route.gpx_filename}, ${route.coordinates}, ${route.created_by})
  `;
  return (await getRoute(route.id))!;
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

export async function getUserByStravaId(stravaId: string): Promise<User | undefined> {
  const { rows } = await sql`SELECT * FROM users WHERE strava_id = ${stravaId}`;
  return rows[0] as User | undefined;
}

export async function upsertStravaUser(
  id: string,
  stravaId: string,
  name: string,
  avatarUrl: string | null,
  sessionToken: string
): Promise<User> {
  const existing = await getUserByStravaId(stravaId);
  if (existing) {
    await sql`
      UPDATE users
      SET session_token = ${sessionToken},
          name = COALESCE(${name}, name),
          avatar_url = COALESCE(${avatarUrl}, avatar_url)
      WHERE strava_id = ${stravaId}
    `;
    return (await getUserByStravaId(stravaId))!;
  }
  const placeholderEmail = `strava_${stravaId}@strava.user`;
  await sql`
    INSERT INTO users (id, email, name, avatar_url, strava_id, session_token)
    VALUES (${id}, ${placeholderEmail}, ${name}, ${avatarUrl}, ${stravaId}, ${sessionToken})
  `;
  return (await getUserByStravaId(stravaId))!;
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
  data: { name?: string; bio?: string; location?: string }
): Promise<User | undefined> {
  await sql`
    UPDATE users
    SET name = COALESCE(${data.name ?? null}, name),
        bio = COALESCE(${data.bio ?? null}, bio),
        location = COALESCE(${data.location ?? null}, location)
    WHERE id = ${id}
  `;
  return getUserById(id);
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
    LIMIT $2 OFFSET $3
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
export async function getRouteComments(routeId: string): Promise<Comment[]> {
  const { rows } = await sql`
    SELECT c.id, c.route_id, c.user_id, u.name as user_name, u.email as user_email, u.avatar_url as user_avatar, c.body, c.created_at
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.route_id = ${routeId}
    ORDER BY c.created_at DESC
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
export async function getRouteConditions(routeId: string): Promise<Condition[]> {
  const { rows } = await sql`
    SELECT c.id, c.route_id, c.user_id, u.name as user_name, c.status, c.note, c.created_at
    FROM conditions c
    JOIN users u ON c.user_id = u.id
    WHERE c.route_id = ${routeId}
    ORDER BY c.created_at DESC
    LIMIT 10
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
  return rows as Route[];
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
  const { rows } = await sql`SELECT DISTINCT county FROM routes ORDER BY county`;
  return rows.map((r) => r.county);
}

export async function getRegions(country?: string): Promise<string[]> {
  if (country) {
    const { rows } = await sql`SELECT DISTINCT region FROM routes WHERE country = ${country} AND region IS NOT NULL ORDER BY region`;
    return rows.map((r) => r.region);
  }
  const { rows } = await sql`SELECT DISTINCT region FROM routes WHERE region IS NOT NULL ORDER BY region`;
  return rows.map((r) => r.region);
}

export async function getCountries(): Promise<string[]> {
  const { rows } = await sql`SELECT DISTINCT country FROM routes ORDER BY country`;
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
    sql.query(`SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
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
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    sql`SELECT COUNT(*) as c FROM comments`,
  ]);
  return { comments: data.rows as (Comment & { route_name: string })[], total: Number(count.rows[0].c) };
}

export async function getAllRoutes(page = 1, limit = 50): Promise<{ routes: Route[]; total: number }> {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    sql.query(`SELECT * FROM routes ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    sql`SELECT COUNT(*) as c FROM routes`,
  ]);
  return { routes: data.rows as Route[], total: Number(count.rows[0].c) };
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
  const { rows } = await sql`
    SELECT r.* FROM routes r
    JOIN favourites f ON f.route_id = r.id
    WHERE f.user_id = ${userId}
    ORDER BY f.created_at DESC
  `;
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
  const convId = require("uuid").v4();
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
    `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
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
