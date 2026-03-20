-- Collections schema
-- Apply with:
--   psql $POSTGRES_URL_NON_POOLING < scripts/collections-schema.sql

CREATE TABLE IF NOT EXISTS collections (
  id               SERIAL        PRIMARY KEY,
  name             VARCHAR(255)  NOT NULL,
  slug             VARCHAR(255)  UNIQUE NOT NULL,
  description      TEXT,
  location         VARCHAR(255),
  country          VARCHAR(100),
  cover_image_url  TEXT,
  discipline       VARCHAR(20)   CHECK (discipline IN ('road', 'gravel', 'mtb', 'mixed')),
  difficulty_range VARCHAR(50),
  featured         BOOLEAN       DEFAULT false,
  seo_title        VARCHAR(255),
  seo_description  TEXT,
  created_at       TIMESTAMP     DEFAULT NOW(),
  updated_at       TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_routes (
  collection_id  INTEGER  REFERENCES collections(id) ON DELETE CASCADE,
  route_id       TEXT     REFERENCES routes(id) ON DELETE CASCADE,
  display_order  INTEGER  DEFAULT 0,
  PRIMARY KEY (collection_id, route_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_routes_collection_id
  ON collection_routes(collection_id);

CREATE INDEX IF NOT EXISTS idx_collection_routes_route_id
  ON collection_routes(route_id);
