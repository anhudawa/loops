import { createPool } from "@vercel/postgres";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";

const POSTGRES_URL = "postgresql://neondb_owner:npg_NmxMEVUs4b9n@ep-square-violet-abmzjihi-pooler.eu-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require";
const pool = createPool({ connectionString: POSTGRES_URL });

const DOWNLOADS = "/Users/anthonywalsh/Downloads";

// Mallorca 5-star rated routes from Wikiloc
const ROUTES = [
  {
    file: "playa-de-palma-llucmajor-randa-santuari-de-cura-algaida-2904.gpx",
    name: "Playa de Palma – Randa – Santuari de Cura",
    description: "Classic road ride from Playa de Palma through Llucmajor to the hilltop monastery of Santuari de Cura in Randa, returning via Algaida. A rewarding climb with panoramic views across the Mallorcan plain from 548m. Popular with local cycling clubs.",
    difficulty: "moderate",
    surfaceType: "road",
    discipline: "road",
    county: "Mallorca",
    country: "Spain",
    region: "Balearic Islands",
  },
  {
    file: "mallorca-classics-lloseta-soller-sa-calobra-lloseta-117-km.gpx",
    name: "Mallorca Classics – Sa Calobra from Lloseta",
    description: "Epic 117 km road loop from Lloseta through Sóller to the legendary Sa Calobra descent and climb. One of the most iconic cycling routes in Europe, featuring the famous Coll dels Reis with its snaking hairpins down to the Mediterranean coast. A bucket-list ride for road cyclists.",
    difficulty: "expert",
    surfaceType: "road",
    discipline: "road",
    county: "Mallorca",
    country: "Spain",
    region: "Balearic Islands",
  },
  {
    file: "alcudia-cap-formentor-alcudia.gpx",
    name: "Alcúdia – Cap de Formentor",
    description: "Stunning out-and-back road ride from Alcúdia to the dramatic lighthouse at Cap de Formentor, Mallorca's northernmost point. Rolling coastal roads with turquoise sea views, punchy climbs through pine forest, and one of the most photogenic stretches of road in the Mediterranean.",
    difficulty: "hard",
    surfaceType: "road",
    discipline: "road",
    county: "Mallorca",
    country: "Spain",
    region: "Balearic Islands",
  },
  {
    file: "soller-orient-inca-caimari-sa-calobra-soller.gpx",
    name: "Sóller – Orient – Caimari – Sa Calobra Loop",
    description: "Monster 133 km road loop from Sóller through the Serra de Tramuntana mountains. Takes in Orient, Inca, Caimari, and the legendary Sa Calobra climb. Over 3,000m of climbing through Mallorca's most dramatic mountain scenery. An unforgettable full-day challenge.",
    difficulty: "expert",
    surfaceType: "road",
    discipline: "road",
    county: "Mallorca",
    country: "Spain",
    region: "Balearic Islands",
  },
  {
    file: "soller-deia-valldemossa-cycling-loop.gpx",
    name: "Sóller – Deià – Valldemossa Loop",
    description: "Beautiful 51 km road loop through the UNESCO-listed Serra de Tramuntana from Sóller. Passes through the charming artists' village of Deià and the historic town of Valldemossa where Chopin once stayed. Scenic coastal views and well-maintained mountain roads.",
    difficulty: "hard",
    surfaceType: "road",
    discipline: "road",
    county: "Mallorca",
    country: "Spain",
    region: "Balearic Islands",
  },
];

function parseGpx(xml) {
  const coordinates = [];
  const elevations = [];

  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let match;
  while ((match = trkptRegex.exec(xml)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    coordinates.push([lat, lng]);
    const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
    elevations.push(eleMatch ? parseFloat(eleMatch[1]) : 0);
  }

  if (coordinates.length === 0) {
    const rteptRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/rtept>/g;
    while ((match = rteptRegex.exec(xml)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      coordinates.push([lat, lng]);
      const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
      elevations.push(eleMatch ? parseFloat(eleMatch[1]) : 0);
    }
  }

  return { coordinates, elevations };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeStats(coordinates, elevations) {
  let totalDist = 0;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < coordinates.length; i++) {
    totalDist += haversine(coordinates[i - 1][0], coordinates[i - 1][1], coordinates[i][0], coordinates[i][1]);
    const dEle = elevations[i] - elevations[i - 1];
    if (dEle > 0) gain += dEle;
    else loss += Math.abs(dEle);
  }
  return {
    distanceKm: Math.round(totalDist * 10) / 10,
    elevGain: Math.round(gain),
    elevLoss: Math.round(loss),
  };
}

function downsample(arr, maxPoints) {
  if (arr.length <= maxPoints) return arr;
  const step = arr.length / maxPoints;
  const result = [arr[0]];
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  result.push(arr[arr.length - 1]);
  return result;
}

async function insertRoute(route) {
  console.log(`\nProcessing: ${route.name}`);

  const filePath = `${DOWNLOADS}/${route.file}`;
  let xml;
  try {
    xml = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.log(`  SKIPPING: Could not read file ${route.file}: ${err.message}`);
    return;
  }

  const { coordinates, elevations } = parseGpx(xml);
  console.log(`  ${coordinates.length} track points`);

  if (coordinates.length === 0) {
    console.log(`  SKIPPING: No track points found`);
    return;
  }

  const stats = computeStats(coordinates, elevations);
  console.log(`  Computed: ${stats.distanceKm} km, +${stats.elevGain}m / -${stats.elevLoss}m`);

  // Downsample to max 8000 points
  const sampled = downsample(coordinates, 8000);
  const sampledEle = downsample(elevations, 8000);

  const coordsWithEle = sampled.map((c, i) => [
    Math.round(c[0] * 1e6) / 1e6,
    Math.round(c[1] * 1e6) / 1e6,
    Math.round((sampledEle[i] || 0) * 10) / 10,
  ]);

  const uuid = randomUUID();

  await pool.query(
    `INSERT INTO routes (id, name, description, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates, created_by, verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      uuid,
      route.name,
      route.description,
      route.difficulty,
      stats.distanceKm,
      stats.elevGain,
      stats.elevLoss,
      route.surfaceType,
      route.county,
      route.country,
      route.region,
      route.discipline,
      coordsWithEle[0][0],
      coordsWithEle[0][1],
      null,
      JSON.stringify(coordsWithEle),
      null,
      true,
    ]
  );

  console.log(`  ✓ Inserted: ${route.name} — ${stats.distanceKm} km, +${stats.elevGain}m, ${coordsWithEle.length} pts, id=${uuid}`);
}

async function main() {
  console.log("Adding Mallorca 5-star routes to database...\n");

  // First check for existing Mallorca routes to avoid duplicates
  const { rows: existing } = await pool.query(
    `SELECT name FROM routes WHERE county = 'Mallorca'`
  );
  const existingNames = new Set(existing.map(r => r.name));

  if (existingNames.size > 0) {
    console.log(`Found ${existingNames.size} existing Mallorca routes, will skip duplicates.\n`);
  }

  for (const route of ROUTES) {
    if (existingNames.has(route.name)) {
      console.log(`\nSKIPPING (already exists): ${route.name}`);
      continue;
    }
    await insertRoute(route);
  }

  // Summary
  const { rows } = await pool.query(
    `SELECT name, distance_km, elevation_gain_m, discipline, county FROM routes WHERE county = 'Mallorca' ORDER BY distance_km`
  );
  console.log(`\n\nAll Mallorca routes (${rows.length}):`);
  rows.forEach((r) => console.log(`  ✓ [${r.discipline}] ${r.name} — ${r.distance_km} km, +${r.elevation_gain_m}m`));

  await pool.end();
  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
