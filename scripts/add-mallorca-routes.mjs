import { createPool } from "@vercel/postgres";
import { randomUUID } from "crypto";

const POSTGRES_URL = "postgresql://neondb_owner:npg_NmxMEVUs4b9n@ep-square-violet-abmzjihi-pooler.eu-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

const pool = createPool({ connectionString: POSTGRES_URL });

const ROUTES = [
  { id: 36069772, name: "Cap Formentor", surface: "road" },
  { id: 29010051, name: "Bay of Pollensa Loop", surface: "road" },
  { id: 19189792, name: "Puig Major Loop", surface: "road" },
  { id: 28958575, name: "Andratx to Pollensa via Sa Calobra", surface: "road" },
  { id: 41610233, name: "Puig de Randa Loop", surface: "road" },
  { id: 41610231, name: "Santa Magdalena & La Victoria", surface: "road" },
  { id: 41610234, name: "Southern Coast Classic", surface: "road" },
  { id: 5894608, name: "Loop of Mallorca", surface: "road" },
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

// Get Anthony's user ID
async function getAnthonyId() {
  const { rows } = await pool.query(`SELECT id FROM users WHERE name ILIKE '%anthony%' LIMIT 1`);
  if (rows.length === 0) throw new Error("Anthony user not found");
  return rows[0].id;
}

async function fetchAndInsert(route, createdBy) {
  console.log(`Fetching ${route.name} (RWGPS ${route.id})...`);
  const res = await fetch(`https://ridewithgps.com/routes/${route.id}.json`);
  if (!res.ok) throw new Error(`Failed to fetch route ${route.id}: ${res.status}`);
  const data = await res.json();

  const rte = data.route || data;
  const trackPoints = rte.track_points || [];
  console.log(`  ${trackPoints.length} track points, ${(rte.distance / 1000).toFixed(1)} km`);

  const sampled = downsample(trackPoints, 8000);

  const coordinates = sampled.map((p) => [
    Math.round(p.y * 1e6) / 1e6,
    Math.round(p.x * 1e6) / 1e6,
    Math.round((p.e || 0) * 10) / 10,
  ]);

  const distanceKm = Math.round((rte.distance / 1000) * 10) / 10;
  const elevGain = Math.round(rte.elevation_gain || 0);
  const elevLoss = Math.round(rte.elevation_loss || 0);

  const uuid = randomUUID();

  await pool.query(
    `INSERT INTO routes (id, name, description, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates, created_by, verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      uuid,
      route.name,
      rte.description || `Classic Mallorca road cycling route — ${distanceKm}km with ${elevGain}m of climbing.`,
      distanceKm,
      elevGain,
      elevLoss,
      route.surface,
      "Mallorca",
      "Spain",
      "Mallorca",
      "road",
      coordinates[0][0],
      coordinates[0][1],
      null,
      JSON.stringify(coordinates),
      createdBy,
      true,
    ]
  );

  console.log(`  ✓ ${route.name}: ${distanceKm}km, +${elevGain}m, ${coordinates.length} pts`);
  return uuid;
}

async function main() {
  const anthonyId = await getAnthonyId();
  console.log(`Using Anthony's account: ${anthonyId}\n`);

  for (const route of ROUTES) {
    await fetchAndInsert(route, anthonyId);
  }

  // Verify
  const { rows } = await pool.query(
    `SELECT name, distance_km, elevation_gain_m, verified FROM routes WHERE region = 'Mallorca' ORDER BY distance_km`
  );
  console.log("\nAll Mallorca routes:");
  rows.forEach((r) => console.log(`  ${r.verified ? "✓" : "✗"} ${r.name} — ${r.distance_km}km, +${r.elevation_gain_m}m`));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
