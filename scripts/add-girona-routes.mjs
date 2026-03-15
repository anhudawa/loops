import { createPool } from "@vercel/postgres";
import { randomUUID } from "crypto";
import { parseString } from "xml2js";
import { promisify } from "util";

const parseXml = promisify(parseString);

const POSTGRES_URL = "postgresql://neondb_owner:npg_NmxMEVUs4b9n@ep-square-violet-abmzjihi-pooler.eu-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require";
const pool = createPool({ connectionString: POSTGRES_URL });

const ROUTES = [
  {
    name: "Costa Brava Coastline via Sant Grau",
    gpxUrl: "https://epicroadrides.com/wp-content/uploads/2018/02/Cycling_Costa_Brava_via_Tossa_de_Mar_and_Sant_Grau.gpx",
    surfaceType: "road",
    description: "Classic Girona loop to the Costa Brava coastline through Sant Grau. Features a 6.3km climb to Sant Grau monastery, stunning coastal roads past crystal clear bays near Tossa de Mar, returning via quiet country lanes.",
    distanceKm: 95,
    elevGain: 1230,
  },
  {
    name: "Els Àngels Loop, Girona",
    gpxUrl: "https://epicroadrides.com/wp-content/uploads/2018/02/Els_Àngels_Girona_loop.gpx",
    surfaceType: "road",
    description: "Popular Girona cycling loop featuring the classic climb to Santuari dels Àngels chapel where Salvador Dalí got married. Two climbs through woodland and medieval villages in the Gavarres mountains.",
    distanceKm: 71,
    elevGain: 1080,
  },
  {
    name: "Mare de Déu del Mont Loop",
    gpxUrl: "https://epicroadrides.com/wp-content/uploads/2018/02/Mare_De_Déu_Del_Mont_loop.gpx",
    surfaceType: "road",
    description: "Challenging Girona loop centred on the notorious Mare de Déu del Mont climb — 18km averaging 5.4% with sections hitting 14%. Quiet rolling countryside, forest terrain, and panoramic summit views. Returns via Banyoles lake.",
    distanceKm: 120,
    elevGain: 2250,
  },
  {
    name: "Rocacorba, Girona",
    gpxUrl: "https://epicroadrides.com/wp-content/uploads/2018/02/Rocacorba_Girona.gpx",
    surfaceType: "road",
    description: "Girona's answer to Alpe d'Huez. A 25km warm-up through flat countryside before the famous 10km Rocacorba climb — averaging 5-9.5% with sections reaching 15% near the summit.",
    distanceKm: 37,
    elevGain: 750,
  },
  {
    name: "Sant Hilari Sacalm & Susqueda Dam Loop",
    gpxUrl: "https://epicroadrides.com/wp-content/uploads/2018/02/Sant_Hilari_Sacalm_and_Panta_de_Susqueda_dam_loop.gpx",
    surfaceType: "road",
    description: "Punchy Girona loop with 1,710m of climbing through quiet winding roads. Features a gradual 20km climb to Sant Hilari Sacalm, twisting forest descents, and the dramatic Susqueda dam and reservoir.",
    distanceKm: 114,
    elevGain: 1710,
  },
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

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchAndParseGpx(url) {
  console.log(`  Fetching GPX: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const text = await res.text();
  const xml = await parseXml(text);

  // Extract track points from GPX
  let points = [];
  const gpx = xml.gpx;
  if (gpx.trk) {
    for (const trk of gpx.trk) {
      for (const seg of trk.trkseg || []) {
        for (const pt of seg.trkpt || []) {
          const lat = parseFloat(pt.$.lat);
          const lng = parseFloat(pt.$.lon);
          const ele = pt.ele ? parseFloat(pt.ele[0]) : 0;
          points.push({ lat, lng, ele });
        }
      }
    }
  } else if (gpx.rte) {
    for (const rte of gpx.rte) {
      for (const pt of rte.rtept || []) {
        const lat = parseFloat(pt.$.lat);
        const lng = parseFloat(pt.$.lon);
        const ele = pt.ele ? parseFloat(pt.ele[0]) : 0;
        points.push({ lat, lng, ele });
      }
    }
  }
  return points;
}

function computeStats(points) {
  let totalDist = 0;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < points.length; i++) {
    totalDist += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    const dEle = points[i].ele - points[i - 1].ele;
    if (dEle > 0) gain += dEle;
    else loss += Math.abs(dEle);
  }
  return { distanceKm: Math.round(totalDist * 10) / 10, elevGain: Math.round(gain), elevLoss: Math.round(loss) };
}

async function insertRoute(route) {
  console.log(`\nProcessing: ${route.name}`);

  const points = await fetchAndParseGpx(route.gpxUrl);
  console.log(`  ${points.length} track points`);

  if (points.length === 0) {
    console.log(`  SKIPPING: No track points found`);
    return;
  }

  const stats = computeStats(points);
  console.log(`  Computed: ${stats.distanceKm} km, +${stats.elevGain}m / -${stats.elevLoss}m`);

  // Use provided values if GPX stats seem off (GPX might lack elevation)
  const distanceKm = stats.distanceKm > 5 ? stats.distanceKm : route.distanceKm;
  const elevGain = stats.elevGain > 50 ? stats.elevGain : route.elevGain;
  const elevLoss = stats.elevLoss > 50 ? stats.elevLoss : route.elevGain; // fallback

  const sampled = downsample(points, 8000);
  const coordinates = sampled.map((p) => [
    Math.round(p.lat * 1e6) / 1e6,
    Math.round(p.lng * 1e6) / 1e6,
    Math.round(p.ele * 10) / 10,
  ]);

  const uuid = randomUUID();

  await pool.query(
    `INSERT INTO routes (id, name, description, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates, created_by, verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      uuid,
      route.name,
      route.description,
      distanceKm,
      elevGain,
      elevLoss,
      route.surfaceType,
      "Girona",
      "Spain",
      "Cataluña",
      "road",
      coordinates[0][0],
      coordinates[0][1],
      null,
      JSON.stringify(coordinates),
      null,
      true,
    ]
  );

  console.log(`  ✓ Inserted: ${route.name} — ${distanceKm} km, +${elevGain}m, ${coordinates.length} pts, id=${uuid}`);
}

async function main() {
  await pool.query(`ALTER TABLE routes ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE`);

  for (const route of ROUTES) {
    await insertRoute(route);
  }

  const { rows } = await pool.query(
    `SELECT name, distance_km, elevation_gain_m, verified FROM routes WHERE county = 'Girona' ORDER BY distance_km`
  );
  console.log("\n\nAll Girona routes:");
  rows.forEach((r) => console.log(`  ${r.verified ? "✓" : "✗"} ${r.name} — ${r.distance_km} km, +${r.elevation_gain_m}m`));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
