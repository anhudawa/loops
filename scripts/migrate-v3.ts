import { sql } from "@vercel/postgres";

async function migrate() {
  console.log("🚀 Running v3 migration: country, region, discipline...\n");

  // Add country column
  await sql`
    DO $$ BEGIN
      ALTER TABLE routes ADD COLUMN country TEXT NOT NULL DEFAULT 'Ireland';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `;
  console.log("✅ Added country column");

  // Add region column
  await sql`
    DO $$ BEGIN
      ALTER TABLE routes ADD COLUMN region TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `;
  console.log("✅ Added region column");

  // Backfill: copy county → region for existing rows
  await sql`UPDATE routes SET region = county WHERE region IS NULL`;
  console.log("✅ Backfilled region from county");

  // Add discipline column
  await sql`
    DO $$ BEGIN
      ALTER TABLE routes ADD COLUMN discipline TEXT NOT NULL DEFAULT 'gravel';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `;
  console.log("✅ Added discipline column");

  // Expand surface_type CHECK constraint to allow new MTB surfaces
  // Drop old constraint, add new one
  try {
    await sql`ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_surface_type_check`;
    await sql`ALTER TABLE routes ADD CONSTRAINT routes_surface_type_check CHECK(surface_type IN ('gravel', 'mixed', 'trail', 'road', 'singletrack', 'technical'))`;
    console.log("✅ Expanded surface_type constraint");
  } catch (e) {
    console.log("⚠️  surface_type constraint update skipped (may already be updated)");
  }

  // Add discipline CHECK constraint
  try {
    await sql`ALTER TABLE routes ADD CONSTRAINT routes_discipline_check CHECK(discipline IN ('road', 'gravel', 'mtb'))`;
    console.log("✅ Added discipline constraint");
  } catch (e) {
    console.log("⚠️  discipline constraint already exists");
  }

  console.log("\n🎉 v3 migration complete!");
  process.exit(0);
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
