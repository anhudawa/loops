import "./legacy-route-materialization-disabled.mjs";
import { createPool } from "@vercel/postgres";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("POSTGRES_URL not set. Run with: node --env-file=.env.local " + process.argv[1]);
  process.exit(1);
}
const pool = createPool({ connectionString: POSTGRES_URL });

const DOWNLOADS = "/Users/anthonywalsh/Downloads";

// All 14 Eat Sleep Cycle routes from Wikiloc
const ROUTES = [
  {
    file: "el-torcal-road-advanced (1).gpx",
    name: "El Torcal (Road - Advanced)",
    description: "Challenging road ride through El Torcal Natural Park near Antequera, Málaga. Features dramatic karst limestone formations, mountain passes, and sweeping views across Andalucía. A must-ride for those exploring beyond Girona.",
    difficulty: "hard",
    surfaceType: "road",
    discipline: "road",
    county: "Málaga",
    country: "Spain",
    region: "Andalucía",
  },
  {
    file: "puerto-leon-road-advanced.gpx",
    name: "Puerto León (Road - Advanced)",
    description: "Scenic and demanding road climb up Puerto León in Málaga province. Quiet mountain roads through Mediterranean forest with panoramic coastal views. A classic Andalucían ascent chosen by Eat Sleep Cycle.",
    difficulty: "hard",
    surfaceType: "road",
    discipline: "road",
    county: "Málaga",
    country: "Spain",
    region: "Andalucía",
  },
  {
    file: "dos-kiwis-gravel-intermediate.gpx",
    name: "Dos Kiwis (Gravel - Intermediate)",
    description: "Intermediate gravel loop through the rolling countryside near Girona. Quiet farm tracks, shaded lanes, and gentle climbs through Catalonia's rural heartland. Curated by Eat Sleep Cycle.",
    difficulty: "moderate",
    surfaceType: "gravel",
    discipline: "gravel",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "sant-hilari-gravel-advanced.gpx",
    name: "Sant Hilari (Gravel - Advanced)",
    description: "Advanced gravel ride climbing through dense forest toward Sant Hilari Sacalm. Technical unpaved sections, significant elevation gain, and rewarding mountain views. A challenging gravel adventure from Eat Sleep Cycle.",
    difficulty: "hard",
    surfaceType: "gravel",
    discipline: "gravel",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "rocacorba-dust-gravel-advanced.gpx",
    name: "Rocacorba Dust (Gravel - Advanced)",
    description: "Advanced gravel take on the famous Rocacorba climb near Girona. Mixes paved and unpaved sections through forests and farmland with punchy climbs. A unique gravel perspective on one of Girona's iconic ascents.",
    difficulty: "hard",
    surfaceType: "gravel",
    discipline: "gravel",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "the-gravel-lanes-gravel-leisure.gpx",
    name: "The Gravel Lanes (Gravel - Leisure)",
    description: "Easy-going gravel ride along quiet lanes and farm tracks near Girona. Perfect for beginners or a recovery day — flat terrain, gentle surfaces, and peaceful countryside scenery. Curated by Eat Sleep Cycle.",
    difficulty: "easy",
    surfaceType: "gravel",
    discipline: "gravel",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "raid-emporda-gravel-epic.gpx",
    name: "Raid Empordà (Gravel - Epic)",
    description: "Epic all-day gravel adventure through the Empordà region of Girona. Covers a huge variety of terrain — vineyard tracks, forest trails, coastal paths, and medieval village roads. A signature Eat Sleep Cycle route.",
    difficulty: "expert",
    surfaceType: "gravel",
    discipline: "gravel",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "sant-andreu-salou-lanes-road-leisure.gpx",
    name: "Sant Andreu Salou Lanes (Road - Leisure)",
    description: "Relaxed road ride through the quiet lanes around Sant Andreu Salou near Girona. Gentle terrain, pretty villages, and a perfect introduction to Catalan cycling. An ideal warm-up or recovery ride.",
    difficulty: "easy",
    surfaceType: "road",
    discipline: "road",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "la-via-verda-damer-gravel-leisure.gpx",
    name: "La Via Verda d'Amer (Gravel - Leisure)",
    description: "Easy gravel spin along the Via Verda greenway near Amer, Girona. Flat, well-surfaced former railway path through beautiful river valley scenery. Perfect for families or a gentle spin between bigger rides.",
    difficulty: "easy",
    surfaceType: "gravel",
    discipline: "gravel",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "les-serres-mas-lunes-road-intermediate.gpx",
    name: "Les Serres Mas Llunes (Road - Intermediate)",
    description: "Intermediate road loop through the undulating terrain near Les Serres and Mas Llunes. Quiet country roads, steady climbs through woodland, and views across the Girona countryside. A solid mid-range ride.",
    difficulty: "moderate",
    surfaceType: "road",
    discipline: "road",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "el-monstre-de-banyoles-gravel-intermediate.gpx",
    name: "El Monstre de Banyoles (Gravel - Intermediate)",
    description: "Intermediate gravel loop starting from the iconic lake town of Banyoles. Mixed terrain through forests and farmland with some punchy climbs. Named 'The Monster' for its variety of surfaces and rolling terrain.",
    difficulty: "moderate",
    surfaceType: "gravel",
    discipline: "gravel",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "els-angels-and-santa-pelaia-road-intermediate.gpx",
    name: "Els Àngels and Santa Pelaia (Road - Intermediate)",
    description: "Classic intermediate road loop featuring the famous climb to Santuari dels Àngels — where Dalí was married — and the quieter ascent to Santa Pelaia. Rolling Girona countryside with two rewarding summit views.",
    difficulty: "moderate",
    surfaceType: "road",
    discipline: "road",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "the-rupit-loop-road-epic.gpx",
    name: "The Rupit Loop (Road - Epic)",
    description: "Epic full-day road ride to the medieval cliff-top village of Rupit in the Catalan Pre-Pyrenees. Multiple mountain passes, dramatic volcanic landscape of La Garrotxa, and over 3,000m of climbing. One of Eat Sleep Cycle's most demanding routes.",
    difficulty: "expert",
    surfaceType: "road",
    discipline: "road",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
  },
  {
    file: "costa-brava-classic-road-advanced.gpx",
    name: "Costa Brava Classic (Road - Advanced)",
    description: "Advanced road ride along the stunning Costa Brava coastline. Punchy coastal climbs, turquoise Mediterranean coves, and winding roads through seaside villages. A signature Eat Sleep Cycle route showcasing Girona's coastline.",
    difficulty: "hard",
    surfaceType: "road",
    discipline: "road",
    county: "Girona",
    country: "Spain",
    region: "Cataluña",
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
    `INSERT INTO routes (id, name, description, difficulty, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates, created_by, verified, operator_name, operator_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
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
      "Eat Sleep Cycle",
      "https://eatsleepcycle.com",
    ]
  );

  console.log(`  ✓ Inserted: ${route.name} — ${stats.distanceKm} km, +${stats.elevGain}m, ${coordsWithEle.length} pts, id=${uuid}`);
}

async function main() {
  console.log("Adding Eat Sleep Cycle routes to database...\n");

  for (const route of ROUTES) {
    await insertRoute(route);
  }

  // Summary
  const { rows } = await pool.query(
    `SELECT name, distance_km, elevation_gain_m, discipline, county FROM routes WHERE name LIKE '%Eat Sleep%' OR name IN (${ROUTES.map((_, i) => `$${i + 1}`).join(", ")}) ORDER BY county, distance_km`,
    ROUTES.map((r) => r.name)
  );
  console.log(`\n\nAll Eat Sleep Cycle routes (${rows.length}):`);
  rows.forEach((r) => console.log(`  ✓ [${r.discipline}] ${r.name} — ${r.distance_km} km, +${r.elevation_gain_m}m (${r.county})`));

  await pool.end();
  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
