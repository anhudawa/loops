#!/usr/bin/env node
// scripts/insert-girona-routes.mjs
//
// Inserts all 11 Girona collection routes into the routes table.
// Reads local GPX files from src/data/girona-collection/, parses
// coordinates, computes distance via haversine, then upserts using
// ON CONFLICT (slug) DO UPDATE for idempotency.
//
// Usage:
//   node scripts/insert-girona-routes.mjs           # uses DATABASE_URL from env
//   DATABASE_URL=file:./loops-dev.db node scripts/insert-girona-routes.mjs
//   POSTGRES_URL=... node scripts/insert-girona-routes.mjs  (Vercel env var alias)
//
// DB selection:
//   DATABASE_URL absent or starts with "file:"  → SQLite (better-sqlite3)
//   DATABASE_URL is a postgres:// URL           → Vercel Postgres / Neon

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../src/data/girona-collection');

// ── Route definitions ─────────────────────────────────────────────────────────
// Elevations from cycling references (epicroadrides, komoot, Traka event data).
// Descriptions written for cyclists who know the area.

const ROUTES = [
  {
    file: 'coll-de-bracons.gpx',
    name: 'Coll de Bracons',
    slug: 'coll-de-bracons',
    discipline: 'road',
    surface_type: 'road',
    distance_km: 105,
    elevation_gain_m: 2400,
    elevation_loss_m: 2400,
    description: `The back road to Bracons is one of those climbs that sorts out who trained over winter and who didn't. From Girona you head northwest through Anglès and Amer, passing the Pantà de Susqueda reservoir before the road pitches up through dense forest. The col tops out at 1,257m — not the highest around here, but sustained enough to hurt. On a clear morning the Pyrenees sit on the horizon all the way back down. The descent into the Vall d'en Bas is fast and technical; take the corner onto the factory road wide or you'll be scrubbing speed into the barrier. Loop back via Les Preses and Olot if you want a café stop before the long flat roll home.`,
  },
  {
    file: 'costa-brava-sant-grau.gpx',
    name: 'Costa Brava via Sant Grau',
    slug: 'costa-brava-sant-grau',
    discipline: 'road',
    surface_type: 'road',
    distance_km: 95,
    elevation_gain_m: 1230,
    elevation_loss_m: 1230,
    description: `The local's answer to a big day out — you earn the coast with 1,200m of climbing before you see saltwater. Leave Girona heading south, pick up Sant Grau from Quart, and settle in for the 6km monastery climb at a consistent 7–8%. The chapel at the top gets busy with Sunday walkers but the coffee machine inside is worth the queue. From there it's rolling ridge roads to Tossa de Mar and the first view of the Mediterranean. The coastal stretch north towards Lloret has fast descents where the road drops right to the water — keep your speed honest, the tarmac is greasy near the beach bars. Return through Santa Cristina and the Gavarres for a quiet finish.`,
  },
  {
    file: 'els-angels.gpx',
    name: 'Els Àngels Loop',
    slug: 'els-angels',
    discipline: 'road',
    surface_type: 'road',
    distance_km: 71,
    elevation_gain_m: 1080,
    elevation_loss_m: 1080,
    description: `Probably the most-ridden loop out of Girona, and for good reason. You can be through the city in fifteen minutes and onto quiet roads that feel nothing like the Costa Brava two-lane madness. The climb to Santuari dels Àngels is two distinct efforts — a warm-up drag through Celrà then the real climb from Bordils, steepening to 10% on the hairpins below the chapel. Dalí got married here; you'll be suffering too much to care about the architecture. The descent into the Baix Empordà is fast and well-surfaced, and the return through Púbol is flat enough to make up time you lost on the climbs. Under 1,100m of gain means it's achievable on tired legs — which is exactly when most people ride it.`,
  },
  {
    file: 'emporda-plain.gpx',
    name: 'Empordà Plain',
    slug: 'emporda-plain',
    discipline: 'gravel',
    surface_type: 'gravel',
    distance_km: 65,
    elevation_gain_m: 380,
    elevation_loss_m: 380,
    description: `When the tramuntana is blowing hard enough to knock you off the road climbs, the Empordà plain is where Girona riders go to turn their legs without drama. Flat fields, irrigation channels, the occasional flock of flamingos if you catch the Aiguamolls at the right time of year. The gravel here runs between agricultural plots on firm packed stone and holds well in dry weather. You're exposed though — there's nothing stopping the north wind and a headwind home from Roses can make 380m of gain feel like double. Good for long aerobic days, summer evening rides, or anyone still getting confidence on gravel.`,
  },
  {
    file: 'gravel-rocacorba.gpx',
    name: 'Gravel Rocacorba',
    slug: 'gravel-rocacorba',
    discipline: 'gravel',
    surface_type: 'gravel',
    distance_km: 55,
    elevation_gain_m: 1350,
    elevation_loss_m: 1350,
    description: `Rocacorba via the gravel approach is harder than it sounds. The road version already has a reputation — Porte, Thomas, and half the WorldTour peloton have used it as a benchmark — but coming from the back through Fontcoberta and Mieres on loose stone adds a different kind of suffering. The gradient is similar (5–9% average, 15% near the telecom tower) but traction is the extra variable. Views from the top span from the Costa Brava to the Pyrenees on a clear day. The gravel descent back into the Pla de l'Estany is loose in sections; run more tyre volume than you think you need. Café at Banyoles on the way back.`,
  },
  {
    file: 'la-traka-100.gpx',
    name: 'La Traka 100',
    slug: 'la-traka-100',
    discipline: 'gravel',
    surface_type: 'gravel',
    distance_km: 100,
    elevation_gain_m: 2200,
    elevation_loss_m: 2200,
    description: `La Traka is the one Girona locals point to when someone asks what gravel looks like around here. 100km, 2,200m of climbing, a mix of Pyrenean foothills fireroads and technical singletrack that'll test whether your bike fit holds up past hour four. The route links Girona into the Serra de l'Albera and back through the Empordà, with the hardest climbing saved for the middle section where there's no easy bail-out. The event version draws 1,500 riders each spring; doing it solo mid-week in October is a different experience — just you, wild boar tracks in the mud, and the occasional startled shepherd. Minimum 40mm tyre; 2.1" if you're running an MTB.`,
  },
  {
    file: 'les-gavarres.gpx',
    name: 'Les Gavarres Gravel',
    slug: 'les-gavarres',
    discipline: 'gravel',
    surface_type: 'gravel',
    distance_km: 80,
    elevation_gain_m: 1800,
    elevation_loss_m: 1800,
    description: `The Gavarres massif sits between Girona and the coast and most road cyclists drive straight through it on the C-66 without knowing what's underneath. The gravel network here is dense — cork oak forest, mossy fireroads, the occasional Roman ruin — and it's rarely crowded because the tracks don't go anywhere convenient. This loop climbs out of Girona through Sant Martí Vell, crosses the main ridge twice, and drops toward the coast near Palamós before turning inland. You'll want a route file and the ability to read it; some junctions have three plausible-looking options and the wrong one takes you into someone's farm.`,
  },
  {
    file: 'mare-de-deu-del-mont.gpx',
    name: 'Mare de Déu del Mont',
    slug: 'mare-de-deu-del-mont',
    discipline: 'road',
    surface_type: 'road',
    distance_km: 120,
    elevation_gain_m: 2250,
    elevation_loss_m: 2250,
    description: `Mare de Déu del Mont doesn't come up as often as Rocacorba or Els Àngels in conversation, which means the climb is usually quiet. The ascent from Beuda runs 18km at 5.4% average with sections hitting 14% on tight forest switchbacks — long enough to genuinely knock you about if you go too hard in the first half. The sanctuary at the summit is 11th century; the espresso machine in the café beside it is more recent and more important after 2,000m of climbing. Return via Banyoles for a flat rolling finish and a second coffee stop at the lakeside. Don't start this one in summer without a full bidon and two bars minimum.`,
  },
  {
    file: 'sant-hilari-susqueda.gpx',
    name: 'Sant Hilari & Susqueda',
    slug: 'sant-hilari-susqueda',
    discipline: 'road',
    surface_type: 'road',
    distance_km: 114,
    elevation_gain_m: 1710,
    elevation_loss_m: 1710,
    description: `This loop earns its 1,710m by never really letting you rest. From Girona you head northwest through Anglès and begin the long drag up to Sant Hilari Sacalm — 20km of gradual climbing through wooded hills, never steep enough to call a proper climb but relentless enough to hollow out your legs. The Susqueda dam descent is technical and spectacular, the road carved into the cliff face above the reservoir. Surface is rough and patched — demands attention. The return leg through Amer is easier going, rolling and fast if the wind is neutral. Bring a jacket; Sant Hilari sits at 800m and the clouds come in fast from the Atlantic.`,
  },
  {
    file: 'turo-de-lhome.gpx',
    name: "Turó de l'Home",
    slug: 'turo-de-lhome',
    discipline: 'gravel',
    surface_type: 'gravel',
    distance_km: 90,
    elevation_gain_m: 2100,
    elevation_loss_m: 2100,
    description: `The highest point in the Montseny massif at 1,706m, reached via a mix of tarmac and deteriorating fireroad that rewards bigger tyres and lower gears. Coming from the Girona side you approach through Sant Celoni, climbing through beech forest that goes orange in October in a way that makes you glad you didn't wait until November. The upper section above the tree line is loose stone on exposed ridge — wind can be a proper problem up here even in summer. The descent back is fast on the lower fireroads but drainage channels cut across the track every hundred metres and they'll launch you if you're not watching.`,
  },
  {
    file: 'via-verde-carrilet.gpx',
    name: 'Via Verde del Carrilet',
    slug: 'via-verde-carrilet',
    discipline: 'gravel',
    surface_type: 'gravel',
    distance_km: 54,
    elevation_gain_m: 200,
    elevation_loss_m: 200,
    description: `The old Carrilet railway ran from Olot to Girona and on to Sant Feliu de Guíxols — narrow gauge, closed 1969, converted to greenway. Packed gravel with occasional asphalt through town centres; rideable on a road bike in a pinch though 32–35mm is more comfortable. The Olot-to-Girona section gains barely 200m across 54km, genuinely flat by local standards — useful for recovery rides, groups with mixed ability, or anyone who wants to see the Garrotxa volcanic zone without suffering for it. Lava fields, beech forest, views of the Puig de la Sacra. Tourist traffic on summer weekends; weekday mornings it's mostly locals and school kids.`,
  },
];

// ── GPX parsing ───────────────────────────────────────────────────────────────

function parseGpx(content) {
  const points = [];
  const re = /<trkpt\b[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    points.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  if (points.length === 0) {
    // Try reversed attribute order
    const re2 = /<trkpt\b[^>]*\blon="([^"]+)"[^>]*\blat="([^"]+)"/g;
    while ((m = re2.exec(content)) !== null) {
      points.push([parseFloat(m[2]), parseFloat(m[1])]);
    }
  }
  return points;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeDistance(points) {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversineKm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  return Math.round(dist * 10) / 10;
}

// Downsample to at most maxPoints while preserving start/end
function downsample(points, maxPoints = 8000) {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const out = [points[0]];
  for (let i = 1; i < maxPoints - 1; i++) out.push(points[Math.round(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

// ── DB abstraction ────────────────────────────────────────────────────────────

function isPostgresUrl(url) {
  return url && (url.startsWith('postgres://') || url.startsWith('postgresql://'));
}

async function buildPostgresDb(connectionString) {
  const { createPool } = await import('@vercel/postgres');
  const pool = createPool({ connectionString });

  return {
    async setup() {
      await pool.query(`ALTER TABLE routes ADD COLUMN IF NOT EXISTS slug TEXT`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_slug ON routes(slug)`);
      await pool.query(`ALTER TABLE routes ADD COLUMN IF NOT EXISTS gpx_data TEXT`);
    },
    async upsert(route) {
      await pool.query(
        `INSERT INTO routes
           (id, name, slug, description, distance_km, elevation_gain_m, elevation_loss_m,
            surface_type, county, country, region, discipline,
            start_lat, start_lng, gpx_filename, gpx_data, coordinates,
            verified, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
         ON CONFLICT (slug) DO UPDATE SET
           name            = EXCLUDED.name,
           description     = EXCLUDED.description,
           distance_km     = EXCLUDED.distance_km,
           elevation_gain_m = EXCLUDED.elevation_gain_m,
           elevation_loss_m = EXCLUDED.elevation_loss_m,
           surface_type    = EXCLUDED.surface_type,
           discipline      = EXCLUDED.discipline,
           coordinates     = EXCLUDED.coordinates,
           gpx_data        = EXCLUDED.gpx_data,
           gpx_filename    = EXCLUDED.gpx_filename`,
        [
          route.id, route.name, route.slug, route.description,
          route.distance_km, route.elevation_gain_m, route.elevation_loss_m,
          route.surface_type, route.county, route.country, route.region, route.discipline,
          route.start_lat, route.start_lng, route.gpx_filename, route.gpx_data,
          route.coordinates, true,
        ]
      );
    },
    async verify() {
      const { rows } = await pool.query(
        `SELECT slug, name, distance_km, elevation_gain_m, discipline
         FROM routes WHERE country = 'Spain' AND region = 'Girona'
         ORDER BY discipline, distance_km`
      );
      return rows;
    },
    async close() { await pool.end(); },
  };
}

function buildSqliteDb(dbPath) {
  const BetterSqlite = (await import('better-sqlite3')).default;
  const db = new BetterSqlite(dbPath);
  db.pragma('journal_mode = WAL');

  return {
    async setup() {
      // Minimal routes table for local dev/testing
      db.exec(`
        CREATE TABLE IF NOT EXISTS routes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE,
          description TEXT,
          distance_km REAL NOT NULL,
          elevation_gain_m REAL NOT NULL,
          elevation_loss_m REAL NOT NULL,
          surface_type TEXT NOT NULL,
          county TEXT NOT NULL DEFAULT 'Girona',
          country TEXT,
          region TEXT,
          discipline TEXT,
          start_lat REAL NOT NULL,
          start_lng REAL NOT NULL,
          gpx_filename TEXT,
          gpx_data TEXT,
          coordinates TEXT NOT NULL,
          verified INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
    },
    async upsert(route) {
      const stmt = db.prepare(`
        INSERT INTO routes
          (id, name, slug, description, distance_km, elevation_gain_m, elevation_loss_m,
           surface_type, county, country, region, discipline,
           start_lat, start_lng, gpx_filename, gpx_data, coordinates, verified)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
        ON CONFLICT(slug) DO UPDATE SET
          name             = excluded.name,
          description      = excluded.description,
          distance_km      = excluded.distance_km,
          elevation_gain_m = excluded.elevation_gain_m,
          elevation_loss_m = excluded.elevation_loss_m,
          surface_type     = excluded.surface_type,
          discipline       = excluded.discipline,
          coordinates      = excluded.coordinates,
          gpx_data         = excluded.gpx_data,
          gpx_filename     = excluded.gpx_filename
      `);
      stmt.run(
        route.id, route.name, route.slug, route.description,
        route.distance_km, route.elevation_gain_m, route.elevation_loss_m,
        route.surface_type, route.county, route.country, route.region, route.discipline,
        route.start_lat, route.start_lng, route.gpx_filename, route.gpx_data,
        route.coordinates,
      );
    },
    async verify() {
      return db.prepare(
        `SELECT slug, name, distance_km, elevation_gain_m, discipline
         FROM routes WHERE country = 'Spain' AND region = 'Girona'
         ORDER BY discipline, distance_km`
      ).all();
    },
    async close() { db.close(); },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  const isSqlite = !isPostgresUrl(dbUrl);

  let dbPath = '';
  if (isSqlite) {
    dbPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : join(__dirname, '../loops-dev.db');
    console.log(`DB mode : SQLite → ${dbPath}`);
  } else {
    console.log(`DB mode : Postgres (${dbUrl.split('@')[1]?.split('/')[0] ?? 'unknown host'})`);
  }

  const db = isSqlite ? await buildSqliteDb(dbPath) : await buildPostgresDb(dbUrl);

  console.log('Running setup (add slug + gpx_data columns if absent)...');
  await db.setup();

  const gpxFiles = readdirSync(DATA_DIR).filter(f => f.endsWith('.gpx'));
  const routesByFile = Object.fromEntries(ROUTES.map(r => [r.file, r]));
  const missing = ROUTES.filter(r => !gpxFiles.includes(r.file)).map(r => r.file);
  if (missing.length) {
    console.warn(`\nWARN: GPX files not found: ${missing.join(', ')}`);
  }

  console.log(`\nInserting ${ROUTES.length} routes...\n`);

  for (const def of ROUTES) {
    const gpxPath = join(DATA_DIR, def.file);
    let gpxContent;
    try {
      gpxContent = readFileSync(gpxPath, 'utf8');
    } catch {
      console.log(`  SKIP  ${def.slug} — file not found`);
      continue;
    }

    const rawPoints = parseGpx(gpxContent);
    if (rawPoints.length === 0) {
      console.log(`  SKIP  ${def.slug} — no track points in GPX`);
      continue;
    }

    const sampledPoints = downsample(rawPoints);
    const computedDist = computeDistance(rawPoints);

    // Use computed distance if it's plausible, else fall back to reference value
    const distanceKm = computedDist > 5 ? computedDist : def.distance_km;

    const route = {
      id: randomUUID(),
      name: def.name,
      slug: def.slug,
      description: def.description.trim(),
      distance_km: distanceKm,
      elevation_gain_m: def.elevation_gain_m,
      elevation_loss_m: def.elevation_loss_m,
      surface_type: def.surface_type,
      county: 'Girona',
      country: 'Spain',
      region: 'Girona',
      discipline: def.discipline,
      start_lat: sampledPoints[0][0],
      start_lng: sampledPoints[0][1],
      gpx_filename: def.file,
      gpx_data: gpxContent,
      coordinates: JSON.stringify(sampledPoints),
    };

    await db.upsert(route);
    console.log(
      `  ✓  ${def.slug.padEnd(30)}  ${String(rawPoints.length).padStart(5)} pts  ` +
      `${String(sampledPoints.length).padStart(4)} stored  ` +
      `${String(distanceKm).padStart(6)} km  +${def.elevation_gain_m}m`
    );
  }

  console.log('\nVerifying inserted rows...\n');
  const rows = await db.verify();

  const W = 72;
  console.log('─'.repeat(W));
  console.log(
    'Slug'.padEnd(32) + 'Disc'.padEnd(8) +
    'Dist km'.padStart(8) + '  +Elev m'
  );
  console.log('─'.repeat(W));
  for (const r of rows) {
    console.log(
      r.slug.padEnd(32) + r.discipline.padEnd(8) +
      String(r.distance_km).padStart(8) + '  +' + r.elevation_gain_m
    );
  }
  console.log('─'.repeat(W));
  console.log(`${rows.length} Girona routes in DB.\n`);

  await db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
