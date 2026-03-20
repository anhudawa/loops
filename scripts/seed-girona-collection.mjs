/**
 * Seed: Girona Collection
 *
 * Creates the Girona collection and links existing Girona routes to it.
 * Idempotent — safe to re-run; uses ON CONFLICT DO NOTHING.
 *
 * Run:
 *   node --env-file=.env.local scripts/seed-girona-collection.mjs
 */

import { createPool } from "@vercel/postgres";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("❌ POSTGRES_URL is not set. Run with: node --env-file=.env.local scripts/seed-girona-collection.mjs");
  process.exit(1);
}

const pool = createPool({ connectionString: POSTGRES_URL });

const GIRONA_COLLECTION = {
  name: "Girona Collection",
  slug: "girona",
  location: "Girona, Catalonia",
  country: "Spain",
  discipline: "mixed",
  featured: true,
  difficulty_range: "Moderate–Challenging",
  seo_title: "Cycling in Girona | The Loops Collection",
  seo_description:
    "Hand-picked road and gravel routes from Girona, Catalonia — the city that became European cycling's unofficial second home. Classics like Rocacorba, Els Àngels, and the Costa Brava coast road.",
  description: `Girona didn't become the preferred winter base for WorldTour professionals by accident. The medieval city sits at the intersection of everything that makes cycling here exceptional: warm light from October through April, roads that empty of traffic within ten minutes of the old town, and a density of quality climbs that no comparably sized city in Europe can match.

The geography does most of the work. To the east, the Gavarres — rounded hills of cork oak and maquis, criss-crossed by quiet back roads where you can string together 100km without touching a main road. To the north, the Pyrenean foothills rise sharply: the notoriously relentless grind to Mare de Déu del Mont, the long slog up to Sant Hilari Sacalm with its twisting forest descent to the Susqueda reservoir. Directly above the city, Rocacorba — a 10km climb averaging 5.9% that professionals use as a benchmark test and most visitors discover at slightly higher perceived exertion than anticipated.

The Costa Brava road to the east is something else entirely. Drop over the ridge above the Gavarres and the Mediterranean appears without warning, turquoise and flat, below switchbacks cut into limestone. The coastal section through Tossa de Mar and back via Sant Grau abbey is one of the genuinely great cycling days in Europe: long enough to hurt, varied enough to hold your attention.

For gravel, the fireroads and tracks through the Gavarres offer serious distance without technical difficulty — the kind of riding where a 29er hardtail and road bike both feel at home. The terrain between disciplines blurs pleasantly in this part of Catalonia.

The practical side: coffee at the Rambla, mechanics who have seen every conceivable malfunction, and a cycling culture that means café owners at the top of climbs know why you look the way you look. Girona is not a secret. The roads are still quiet.`,
};

async function seed() {
  console.log("🌱 Seeding Girona collection...\n");

  // Insert collection (idempotent via ON CONFLICT)
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
      GIRONA_COLLECTION.name,
      GIRONA_COLLECTION.slug,
      GIRONA_COLLECTION.description,
      GIRONA_COLLECTION.location,
      GIRONA_COLLECTION.country,
      GIRONA_COLLECTION.discipline,
      GIRONA_COLLECTION.difficulty_range,
      GIRONA_COLLECTION.featured,
      GIRONA_COLLECTION.seo_title,
      GIRONA_COLLECTION.seo_description,
    ]
  );

  const collection = rows[0];
  console.log(`✅ Collection: "${collection.name}" (id=${collection.id}, slug="${collection.slug}")`);

  // Find all Girona routes
  const { rows: gironaRoutes } = await pool.query(
    `SELECT id, name, distance_km
     FROM routes
     WHERE country = 'Spain' AND county = 'Girona'
     ORDER BY distance_km`
  );

  if (gironaRoutes.length === 0) {
    console.log("⚠️  No Girona routes found in DB. Run scripts/add-girona-routes.mjs first.");
  } else {
    console.log(`\nFound ${gironaRoutes.length} Girona route(s) to link:`);

    for (let i = 0; i < gironaRoutes.length; i++) {
      const route = gironaRoutes[i];
      await pool.query(
        `INSERT INTO collection_routes (collection_id, route_id, display_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (collection_id, route_id) DO UPDATE SET display_order = EXCLUDED.display_order`,
        [collection.id, route.id, i]
      );
      console.log(`  ✓ Linked: ${route.name} (${route.distance_km} km)`);
    }
  }

  // Summary
  const { rows: summary } = await pool.query(
    `SELECT c.name, c.slug, c.featured, COUNT(cr.route_id) AS route_count
     FROM collections c
     LEFT JOIN collection_routes cr ON cr.collection_id = c.id
     WHERE c.slug = 'girona'
     GROUP BY c.id`,
  );

  console.log("\n📋 Collection summary:");
  summary.forEach((r) =>
    console.log(`  ${r.name} | slug: ${r.slug} | featured: ${r.featured} | routes: ${r.route_count}`)
  );

  console.log("\n🎉 Done!");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => pool.end());
