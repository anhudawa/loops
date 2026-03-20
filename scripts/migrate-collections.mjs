/**
 * Migration: Add collections and collection_routes tables
 *
 * Run against dev (Neon Postgres):
 *   node --env-file=.env.local scripts/migrate-collections.mjs
 *
 * Run against prod (Vercel Postgres via Vercel CLI):
 *   vercel env pull .env.production.local --environment=production
 *   node --env-file=.env.production.local scripts/migrate-collections.mjs
 *   # Or directly via psql:
 *   psql $POSTGRES_URL_NON_POOLING -f scripts/collections-schema.sql
 */

import { createPool } from "@vercel/postgres";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("❌ POSTGRES_URL is not set. Run with: node --env-file=.env.local scripts/migrate-collections.mjs");
  process.exit(1);
}

const pool = createPool({ connectionString: POSTGRES_URL });

async function migrate() {
  console.log("🚀 Running collections migration...\n");

  // collections table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      description TEXT,
      location VARCHAR(255),
      country VARCHAR(100),
      cover_image_url TEXT,
      discipline VARCHAR(20) CHECK (discipline IN ('road', 'gravel', 'mtb', 'mixed')),
      difficulty_range VARCHAR(50),
      featured BOOLEAN DEFAULT false,
      seo_title VARCHAR(255),
      seo_description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("✅ collections table created (or already exists)");

  // collection_routes junction table
  // Note: routes.id is TEXT (UUID) in this schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collection_routes (
      collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
      route_id TEXT REFERENCES routes(id) ON DELETE CASCADE,
      display_order INTEGER DEFAULT 0,
      PRIMARY KEY (collection_id, route_id)
    )
  `);
  console.log("✅ collection_routes junction table created (or already exists)");

  // Index for fast route lookups by collection
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_collection_routes_collection_id
      ON collection_routes(collection_id)
  `);
  console.log("✅ Index on collection_routes(collection_id) created");

  // Index for fast collection lookups by route
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_collection_routes_route_id
      ON collection_routes(route_id)
  `);
  console.log("✅ Index on collection_routes(route_id) created");

  console.log("\n🎉 Collections migration complete!");
}

migrate()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => pool.end());
