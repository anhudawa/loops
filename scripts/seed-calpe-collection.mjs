/**
 * Seed: Calpe & Costa Blanca Collection
 *
 * Creates the Calpe hub collection and links all Costa Blanca routes.
 * Idempotent — safe to re-run; uses ON CONFLICT.
 *
 * Run:
 *   node --env-file=.env.local scripts/seed-calpe-collection.mjs
 */

import { createPool } from "@vercel/postgres";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("❌ POSTGRES_URL is not set. Run with: node --env-file=.env.local scripts/seed-calpe-collection.mjs");
  process.exit(1);
}

const pool = createPool({ connectionString: POSTGRES_URL });

const CALPE_COLLECTION = {
  name: "Calpe & Costa Blanca",
  slug: "calpe",
  location: "Calpe, Alicante",
  country: "Spain",
  discipline: "road",
  featured: true,
  difficulty_range: "Moderate–Expert",
  seo_title: "Cycling in Calpe & Costa Blanca | The Loops Collection",
  seo_description:
    "Road cycling routes from Calpe and the Costa Blanca — Coll de Rates, Guadalest, Bernia, Benidorm loops and more. Where the pros train in winter.",
  description: `Calpe exists at the intersection of flat coastal training roads and serious mountain climbing, which is why half the professional peloton has spent at least one January here. The town itself is unremarkable — a medium-density Spanish resort with a distinctive rock (the Peñón de Ifach) jutting out of the harbour. The riding is not unremarkable at all.

The signature climb is the Coll de Rates: 6.5km at 5.4% average, topping out at 626m with views across the entire Marina Alta. The Vuelta a España uses it regularly. Every training camp based in Calpe uses it obsessively. The approach from Parcent through the Jalon Valley wine country is one of the better warm-up roads in European cycling — wide, smooth, gently rising, and quiet enough that you can ride three abreast without incident.

Inland from the coast, the terrain stacks up fast. The Sierra de Bernia loop — short, aggressive, with gradients touching 15% — is the kind of ride that looks reasonable on paper and less reasonable at kilometre four. Guadalest, further in, adds a reservoir, a castle on a cliff, and a proper 20km approach climb. The Alcalali loop through Castell de Castells is the century ride: 160km, 2,000m of climbing, and roads that empty of traffic the moment you leave the N332 corridor.

The coastal road itself serves a purpose. The stretch between Calpe and Benidorm via Altea is flat, fast, and mostly has a cycle lane — ideal for tempo work, interval sessions, or easy recovery spins. The morning group rides that leave from the Calpe harbour wall at 9am sharp are a rite of passage for visiting riders.

Climate: riding is possible year-round, but the sweet spot is October through April when temperatures sit between 15-22°C and rain is sparse. Summer is rideable but hot — start before 7am or don't start.`,
};

async function seed() {
  console.log("🌱 Seeding Calpe & Costa Blanca collection...\n");

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
      CALPE_COLLECTION.name,
      CALPE_COLLECTION.slug,
      CALPE_COLLECTION.description,
      CALPE_COLLECTION.location,
      CALPE_COLLECTION.country,
      CALPE_COLLECTION.discipline,
      CALPE_COLLECTION.difficulty_range,
      CALPE_COLLECTION.featured,
      CALPE_COLLECTION.seo_title,
      CALPE_COLLECTION.seo_description,
    ]
  );

  const collection = rows[0];
  console.log(`✅ Collection: "${collection.name}" (id=${collection.id}, slug="${collection.slug}")`);

  const { rows: calpeRoutes } = await pool.query(
    `SELECT id, name, distance_km
     FROM routes
     WHERE country = 'Spain' AND (county = 'Alicante' OR region = 'Costa Blanca')
     ORDER BY distance_km`
  );

  if (calpeRoutes.length === 0) {
    console.log("⚠️  No Costa Blanca routes found. Run: node --env-file=.env.local scripts/import-routes.mjs scripts/hub-data/calpe.json");
  } else {
    console.log(`\nFound ${calpeRoutes.length} route(s) to link:`);
    for (let i = 0; i < calpeRoutes.length; i++) {
      const route = calpeRoutes[i];
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
     WHERE c.slug = 'calpe'
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
