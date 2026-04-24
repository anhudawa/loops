/**
 * Seed: Mallorca Collection
 *
 * Creates the Mallorca collection and links all Mallorca routes to it.
 * Idempotent — safe to re-run; uses ON CONFLICT.
 *
 * Run:
 *   node --env-file=.env.local scripts/seed-mallorca-collection.mjs
 */

import { createPool } from "@vercel/postgres";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("❌ POSTGRES_URL is not set. Run with: node --env-file=.env.local scripts/seed-mallorca-collection.mjs");
  process.exit(1);
}

const pool = createPool({ connectionString: POSTGRES_URL });

const MALLORCA_COLLECTION = {
  name: "Mallorca",
  slug: "mallorca",
  location: "Mallorca, Balearic Islands",
  country: "Spain",
  discipline: "road",
  featured: true,
  difficulty_range: "Moderate–Expert",
  seo_title: "Cycling in Mallorca | The Loops Collection",
  seo_description:
    "Premium road cycling loops from Mallorca — Sa Calobra, Cap de Formentor, Orient, Randa and more. Verified routes with GPX downloads.",
  description: `Mallorca earned its reputation as Europe's premier early-season training destination through a combination of climate, terrain, and infrastructure that no competitor has managed to replicate. January temperatures in the mid-teens, rainfall measured in single-digit days per month, and a road network that was resurfaced comprehensively in the early 2000s and has been maintained since.

The Serra de Tramuntana along the north-west coast provides the headline climbs. Sa Calobra — the 10km descent (and return ascent) down 26 hairpins to a cove at the base of a canyon — is cycling's version of a pilgrimage route. The road was built in the 1930s to connect the isolated village to the rest of the island and feels it: narrow, exposed, and engineered to make every metre memorable. Cap de Formentor, the island's north-eastern tip, is flatter but no less dramatic: a long peninsula ride ending at a lighthouse above open Mediterranean.

Away from the showpieces, the interior is where the riding quietly excels. The climbs up to Orient from Bunyola, the loop through Caimari to the monastery at Lluc, the rolling roads south through Randa — all are long-weekend rides that would be destination-worthy anywhere else but here compete for attention with a top five that is unreasonably stacked.

The coastal plain around Palma and the south-east offers fast, flat training terrain. The Playa de Palma strip road is where teams do early-season base miles. Inland from there, the roads through Algaida and Montuïri are quiet, well-surfaced, and roll gently enough that you can hold a conversation or a pace line.

Logistics: Palma airport is a 15-minute transfer from most cycling hotels. Bike hire is excellent (Canyon, Specialized, Pinarello fleets at most shops). The island is small enough that any route can start and end at your hotel without a transfer.`,
};

async function seed() {
  console.log("🌱 Seeding Mallorca collection...\n");

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
      MALLORCA_COLLECTION.name,
      MALLORCA_COLLECTION.slug,
      MALLORCA_COLLECTION.description,
      MALLORCA_COLLECTION.location,
      MALLORCA_COLLECTION.country,
      MALLORCA_COLLECTION.discipline,
      MALLORCA_COLLECTION.difficulty_range,
      MALLORCA_COLLECTION.featured,
      MALLORCA_COLLECTION.seo_title,
      MALLORCA_COLLECTION.seo_description,
    ]
  );

  const collection = rows[0];
  console.log(`✅ Collection: "${collection.name}" (id=${collection.id}, slug="${collection.slug}")`);

  const { rows: mallorcaRoutes } = await pool.query(
    `SELECT id, name, distance_km
     FROM routes
     WHERE country = 'Spain' AND (county = 'Mallorca' OR county = 'Balearic Islands')
     ORDER BY distance_km`
  );

  if (mallorcaRoutes.length === 0) {
    console.log("⚠️  No Mallorca routes found in DB. Run scripts/add-mallorca-routes.mjs first.");
  } else {
    console.log(`\nFound ${mallorcaRoutes.length} Mallorca route(s) to link:`);
    for (let i = 0; i < mallorcaRoutes.length; i++) {
      const route = mallorcaRoutes[i];
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
     WHERE c.slug = 'mallorca'
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
