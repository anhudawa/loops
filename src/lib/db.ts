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

// ──── Types ────
export interface Route {
  id: string;
  name: string;
  description: string | null;
  difficulty: "easy" | "moderate" | "hard" | "expert";
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  surface_type: "gravel" | "mixed" | "trail" | "road";
  county: string;
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
  surface_type?: string;
  search?: string;
  sort?: string;
  verified?: boolean;
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
  if (filters.surface_type) {
    conditions.push(`r.surface_type = $${idx++}`);
    params.push(filters.surface_type);
  }
  if (filters.search) {
    conditions.push(`(r.name ILIKE $${idx} OR r.description ILIKE $${idx} OR r.county ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sortMap: Record<string, string> = {
    name: "r.name ASC",
    newest: "r.created_at DESC",
    distance: "r.distance_km DESC",
    rating: "avg_score DESC, rating_count DESC",
  };
  const orderBy = sortMap[filters.sort || ""] || "r.name ASC";

  const having = filters.verified ? "HAVING COUNT(rt.id) >= 3 AND COALESCE(AVG(rt.score), 0) >= 3.0" : "";

  const query = `
    SELECT r.*, COALESCE(AVG(rt.score), 0) as avg_score, COUNT(rt.id) as rating_count,
      (SELECT p.filename FROM photos p WHERE p.route_id = r.id ORDER BY p.created_at LIMIT 1) as cover_photo,
      CASE WHEN COUNT(rt.id) >= 3 AND COALESCE(AVG(rt.score), 0) >= 3.0 THEN 1 ELSE 0 END as is_verified
    FROM routes r
    LEFT JOIN ratings rt ON rt.route_id = r.id
    ${where}
    GROUP BY r.id
    ${having}
    ORDER BY ${orderBy}
  `;

  const { rows } = await sql.query(query, params);
  return rows as Route[];
}

export async function getRoute(id: string): Promise<(Route & { is_verified?: number }) | undefined> {
  const { rows } = await sql`
    SELECT r.*,
      CASE WHEN (SELECT COUNT(*) FROM ratings WHERE route_id = r.id) >= 3
        AND (SELECT COALESCE(AVG(score), 0) FROM ratings WHERE route_id = r.id) >= 3.0
        THEN 1 ELSE 0 END as is_verified
    FROM routes r WHERE r.id = ${id}
  `;
  return rows[0] as (Route & { is_verified?: number }) | undefined;
}

export async function insertRoute(route: Omit<Route, "created_at">): Promise<Route> {
  await sql`
    INSERT INTO routes (id, name, description, difficulty, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, start_lat, start_lng, gpx_filename, coordinates, created_by)
    VALUES (${route.id}, ${route.name}, ${route.description}, ${route.difficulty}, ${route.distance_km}, ${route.elevation_gain_m}, ${route.elevation_loss_m}, ${route.surface_type}, ${route.county}, ${route.start_lat}, ${route.start_lng}, ${route.gpx_filename}, ${route.coordinates}, ${route.created_by})
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
    SELECT c.id, c.route_id, c.user_id, u.name as user_name, u.email as user_email, c.body, c.created_at
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
