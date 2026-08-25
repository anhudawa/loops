-- LOOPS runtime schema baseline.
--
-- This migration replaces the legacy pattern of creating and altering tables
-- inside web requests. It is intentionally idempotent so it can prepare both
-- the existing database and a fresh database before the provenance migrations.

BEGIN;

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
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS session_token TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS strava_id TEXT,
  ADD COLUMN IF NOT EXISTS google_id TEXT,
  ADD COLUMN IF NOT EXISTS avg_speed_kmh REAL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS strava_access_token TEXT,
  ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS strava_token_expires_at BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_session_token_unique ON users(session_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_strava_id_unique ON users(strava_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id_unique ON users(google_id);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  distance_km REAL NOT NULL,
  elevation_gain_m REAL NOT NULL,
  elevation_loss_m REAL NOT NULL,
  surface_type TEXT NOT NULL,
  county TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Ireland',
  region TEXT,
  discipline TEXT NOT NULL DEFAULT 'road',
  difficulty TEXT,
  start_lat REAL NOT NULL,
  start_lng REAL NOT NULL,
  gpx_filename TEXT,
  coordinates TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  strava_activity_id BIGINT,
  quality_status TEXT DEFAULT 'pending',
  operator_name TEXT,
  operator_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'Ireland',
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'road',
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT,
  ADD COLUMN IF NOT EXISTS quality_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS operator_name TEXT,
  ADD COLUMN IF NOT EXISTS operator_url TEXT;

ALTER TABLE routes ALTER COLUMN difficulty DROP NOT NULL;
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_difficulty_check;
ALTER TABLE routes ALTER COLUMN difficulty SET DEFAULT NULL;

CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(route_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conditions (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('good', 'fair', 'poor', 'closed')),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL REFERENCES users(id),
  following_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK(follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS downloads (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id),
  user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(route_id, user_id)
);

CREATE TABLE IF NOT EXISTS favourites (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(route_id, user_id)
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  return_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS return_to TEXT;

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  location TEXT,
  country TEXT,
  cover_image_url TEXT,
  discipline TEXT NOT NULL DEFAULT 'mixed' CHECK (discipline IN ('road', 'gravel', 'mtb', 'mixed')),
  difficulty_range TEXT,
  total_routes_count INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_routes (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, route_id)
);

CREATE TABLE IF NOT EXISTS garmin_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_secret TEXT NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_discipline ON routes(discipline);
CREATE INDEX IF NOT EXISTS idx_routes_surface_type ON routes(surface_type);
CREATE INDEX IF NOT EXISTS idx_route_ratings_route_id ON ratings(route_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_created_at ON oauth_states(created_at);
CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections(slug);
CREATE INDEX IF NOT EXISTS idx_collections_featured ON collections(featured);
CREATE INDEX IF NOT EXISTS idx_collection_routes_collection_id ON collection_routes(collection_id);
CREATE INDEX IF NOT EXISTS idx_routes_quality_status ON routes(quality_status);

UPDATE routes SET created_by = (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 1
)
WHERE created_by IS NULL
  AND EXISTS (SELECT 1 FROM users);

COMMIT;
