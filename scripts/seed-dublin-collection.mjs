/**
 * Seed: Dublin & Wicklow Collection
 *
 * Creates the Dublin collection and links all Ireland routes to it.
 * Idempotent — safe to re-run; uses ON CONFLICT.
 *
 * Run:
 *   node --env-file=.env.local scripts/seed-dublin-collection.mjs
 */

import { createPool } from "@vercel/postgres";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("❌ POSTGRES_URL is not set. Run with: node --env-file=.env.local scripts/seed-dublin-collection.mjs");
  process.exit(1);
}

const pool = createPool({ connectionString: POSTGRES_URL });

const DUBLIN_COLLECTION = {
  name: "Dublin & Wicklow",
  slug: "dublin",
  location: "Dublin & Wicklow, Ireland",
  country: "Ireland",
  discipline: "road",
  featured: true,
  difficulty_range: "Easy–Epic",
  seo_title: "Cycling in Dublin & Wicklow | The Loops Collection",
  seo_description:
    "The best road loops from Dublin and Wicklow — from flat canal spins to Sally Gap and the Wicklow 200. Verified by local riders.",
  description: `Dublin cyclists live twenty minutes from two very different kinds of riding. North: the lanes beyond Skerries — flat, fast, coastal, where the training groups hammer along in echelons when the wind comes off the Irish Sea. South: the Wicklow Mountains — Military Road, Sally Gap, Glenmacnass, the kind of climbs that break you with gradient and reward you with isolation.

The city itself is a reasonable launch pad. Marlay Park, Bull Island, Dun Laoghaire pier — all standard meetup points for weekend groups. Head south-west through the Featherbed or south-east via Enniskerry and within 30km you're on roads where the only traffic is sheep.

The range is what makes it. A Tuesday evening spin on the canals is 50km of dead-flat towpath riding, social pace, home for dinner. A Saturday epic — Blessington, Glendalough, Sally Gap, back via Glencree — is 150km and 2,500m of climbing through terrain that regularly surprises visitors with how remote it feels for a capital city.

Wicklow's roads are generally well-surfaced but narrow. The R115 (Military Road) is the most iconic stretch: 30km of high moorland with views to the coast on clear days. In winter, ice and crosswinds make the gap roads serious; in summer, the light lasts until 10pm and the mountains are empty.

For interval work: the N81 corridor (Blessington direction) offers long, flat, low-traffic stretches ideal for threshold sessions. The climb up Kilmashogue from Marlay Park is a classic VO2 test piece — short, steep, repeatable.`,
};

async function seed() {
  console.log("🌱 Seeding Dublin & Wicklow collection...\n");

  const { rows } = await pool.query(
    `INSERT INTO collections
       (name, slug, description, location, country, discipline, difficulty_range,
        featured, seo_title, seo_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (slug) DO UPDATE SET
       name             = EXCLUDED.name,
       description      = EXCLUDED.description,
       location         = EXCLUDED.location,
       country          = EXCLUDED.country,
       discipline       = EXCLUDED.discipline,
       difficulty_range = EXCLUDED.difficulty_range,
       featured         = EXCLUDED.featured,
       seo_title        = EXCLUDED.seo_title,
       seo_description  = EXCLUDED.seo_description,
       updated_at       = NOW()
     RETURNING id, name, slug`,
    [
      DUBLIN_COLLECTION.name,
      DUBLIN_COLLECTION.slug,
      DUBLIN_COLLECTION.description,
      DUBLIN_COLLECTION.location,
      DUBLIN_COLLECTION.country,
      DUBLIN_COLLECTION.discipline,
      DUBLIN_COLLECTION.difficulty_range,
      DUBLIN_COLLECTION.featured,
      DUBLIN_COLLECTION.seo_title,
      DUBLIN_COLLECTION.seo_description,
    ]
  );

  const collection = rows[0];
  console.log(`✅ Collection: "${collection.name}" (id=${collection.id}, slug="${collection.slug}")`);

  const { rows: dublinRoutes } = await pool.query(
    `SELECT id, name, distance_km
     FROM routes
     WHERE country = 'Ireland'
     ORDER BY distance_km`
  );

  if (dublinRoutes.length === 0) {
    console.log("⚠️  No Ireland routes found in DB. Run npm run seed first.");
  } else {
    console.log(`\nFound ${dublinRoutes.length} Ireland route(s) to link:`);
    for (let i = 0; i < dublinRoutes.length; i++) {
      const route = dublinRoutes[i];
      await pool.query(
        `INSERT INTO collection_routes (collection_id, route_id, display_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (collection_id, route_id) DO UPDATE SET display_order = EXCLUDED.display_order`,
        [collection.id, route.id, i]
      );
      console.log(`  ✓ Linked: ${route.name} (${route.distance_km} km)`);
    }
  }

  const { rows: summary } = await pool.query(
    `SELECT c.name, c.slug, c.featured, COUNT(cr.route_id) AS route_count
     FROM collections c
     LEFT JOIN collection_routes cr ON cr.collection_id = c.id
     WHERE c.slug = 'dublin'
     GROUP BY c.id`
  );
  summary.forEach((r) =>
    console.log(`\n📋 ${r.name} | slug: ${r.slug} | featured: ${r.featured} | routes: ${r.route_count}`)
  );

  console.log("\n🎉 Done!");
}

seed()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => pool.end());
