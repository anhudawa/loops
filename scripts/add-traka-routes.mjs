import { createPool } from "@vercel/postgres";
import { randomUUID } from "crypto";

const POSTGRES_URL = "postgresql://neondb_owner:npg_NmxMEVUs4b9n@ep-square-violet-abmzjihi-pooler.eu-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

const pool = createPool({ connectionString: POSTGRES_URL });

const ROUTES = [
  { id: 46513147, name: "The Traka 100", difficulty: "hard" },
  { id: 46222155, name: "The Traka 200", difficulty: "hard" },
  { id: 51243342, name: "The Traka 360", difficulty: "expert" },
];

function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const result = [points[0]];
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

async function fetchAndInsert(route) {
  console.log(`Fetching ${route.name} (RWGPS ${route.id})...`);
  const res = await fetch(`https://ridewithgps.com/routes/${route.id}.json`);
  if (!res.ok) throw new Error(`Failed to fetch route ${route.id}: ${res.status}`);
  const data = await res.json();

  const rte = data.route || data;
  const trackPoints = rte.track_points || [];
  console.log(`  ${trackPoints.length} track points, ${(rte.distance / 1000).toFixed(1)} km`);

  // Downsample to ~8000 points max
  const sampled = downsample(trackPoints, 8000);

  const coordinates = sampled.map((p) => [
    Math.round(p.y * 1e6) / 1e6, // lat
    Math.round(p.x * 1e6) / 1e6, // lng
    Math.round((p.e || 0) * 10) / 10, // elevation
  ]);

  const distanceKm = Math.round((rte.distance / 1000) * 10) / 10;
  const elevGain = Math.round(rte.elevation_gain || 0);
  const elevLoss = Math.round(rte.elevation_loss || 0);
  const startLat = coordinates[0][0];
  const startLng = coordinates[0][1];

  const uuid = randomUUID();

  await pool.query(
    `INSERT INTO routes (id, name, description, difficulty, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates, created_by, verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      uuid,
      route.name,
      `The Traka ${route.name.split(" ").pop()} — 2026 provisional route through Girona's finest gravel terrain.`,
      route.difficulty,
      distanceKm,
      elevGain,
      elevLoss,
      "gravel",
      "Girona",
      "Spain",
      "Cataluña",
      "gravel",
      startLat,
      startLng,
      null,
      JSON.stringify(coordinates),
      null,
      true,
    ]
  );

  console.log(`  Inserted ${route.name}: ${distanceKm} km, +${elevGain}m, ${coordinates.length} points, id=${uuid}`);
  return uuid;
}

async function main() {
  // Add verified column if not exists
  await pool.query(`ALTER TABLE routes ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE`);

  // Insert routes
  for (const route of ROUTES) {
    await fetchAndInsert(route);
  }

  // Mark existing Traka Adventure as verified too
  const result = await pool.query(
    `UPDATE routes SET verified = true WHERE name ILIKE '%traka%'`
  );
  console.log(`\nMarked ${result.rowCount} Traka routes as verified.`);

  // Verify
  const { rows } = await pool.query(
    `SELECT id, name, distance_km, elevation_gain_m, verified FROM routes WHERE name ILIKE '%traka%' ORDER BY distance_km`
  );
  console.log("\nAll Traka routes:");
  rows.forEach((r) => console.log(`  ${r.verified ? "✓" : "✗"} ${r.name} — ${r.distance_km} km, +${r.elevation_gain_m}m`));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
