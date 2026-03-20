/**
 * Create collections tables in the dev (Neon Postgres) database.
 *
 * This project uses Neon Postgres for both local dev and production —
 * there is no local SQLite. The same schema runs against the dev DB via
 * .env.local and production via Vercel's environment.
 *
 * ─── Dev (local) ─────────────────────────────────────────────────────────────
 *
 *   node --env-file=.env.local scripts/create-collections-tables.mjs
 *
 * ─── Production (Vercel Postgres / Neon) ─────────────────────────────────────
 *
 *   Option 1: Pull production env and run this script
 *     vercel env pull .env.production.local --environment=production
 *     node --env-file=.env.production.local scripts/create-collections-tables.mjs
 *
 *   Option 2: Direct psql against the non-pooled production URL
 *     psql $POSTGRES_URL_NON_POOLING < scripts/collections-schema.sql
 *
 *   Option 3: Vercel CLI one-liner
 *     vercel postgres query "$(cat scripts/collections-schema.sql)"
 *
 * ─── SQL (for reference / manual runs) ───────────────────────────────────────
 *
 *   See: scripts/collections-schema.sql
 *
 */

import { createPool } from "@vercel/postgres";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error([
    "❌  POSTGRES_URL is not set.",
    "",
    "For dev:  node --env-file=.env.local scripts/create-collections-tables.mjs",
    "For prod: vercel env pull .env.production.local --environment=production",
    "          node --env-file=.env.production.local scripts/create-collections-tables.mjs",
  ].join("\n"));
  process.exit(1);
}

const pool = createPool({ connectionString: POSTGRES_URL });

async function run() {
  const env = POSTGRES_URL.includes("localhost") ? "local" : "remote";
  console.log(`🔌 Connected to ${env} Postgres\n`);
  console.log("📦 Creating collections tables...\n");

  await pool.query(`
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
    )
  `);
  console.log("✅ collections");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS collection_routes (
      collection_id  INTEGER  REFERENCES collections(id) ON DELETE CASCADE,
      route_id       TEXT     REFERENCES routes(id) ON DELETE CASCADE,
      display_order  INTEGER  DEFAULT 0,
      PRIMARY KEY (collection_id, route_id)
    )
  `);
  console.log("✅ collection_routes");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_collection_routes_collection_id
      ON collection_routes(collection_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_collection_routes_route_id
      ON collection_routes(route_id)
  `);
  console.log("✅ indexes");

  // Verify
  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('collections', 'collection_routes')
    ORDER BY table_name
  `);

  console.log(`\n📋 Tables confirmed in DB: ${rows.map((r) => r.table_name).join(", ")}`);
  console.log("\n🎉 Done. Run seed script next:");
  console.log("   node --env-file=.env.local scripts/seed-girona-collection.mjs\n");
}

run()
  .catch((e) => {
    console.error("Failed:", e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
