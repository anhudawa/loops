import { sql } from "@vercel/postgres";
import { v4 as uuidv4 } from "uuid";

interface SeedRoute {
  name: string;
  description: string;
  difficulty: string;
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  surface_type: string;
  county: string;
  country: string;
  region: string;
  discipline: string;
  coordinates: [number, number][];
}

const routes: SeedRoute[] = [
  {
    name: "Ballyhoura Mountain Loop",
    description: "Epic gravel loop through the Ballyhoura Mountains. Ireland's largest mountain bike trail network with stunning views of the Golden Vale. Mix of forest roads and purpose-built gravel trails.",
    difficulty: "hard",
    distance_km: 48,
    elevation_gain_m: 920,
    elevation_loss_m: 920,
    surface_type: "gravel",
    county: "Limerick",
    country: "Ireland",
    region: "Limerick",
    discipline: "gravel",
    coordinates: [
      [52.3345, -8.5012], [52.3380, -8.4950], [52.3420, -8.4880],
      [52.3470, -8.4800], [52.3510, -8.4720], [52.3480, -8.4640],
      [52.3440, -8.4560], [52.3400, -8.4490], [52.3350, -8.4420],
      [52.3310, -8.4500], [52.3280, -8.4580], [52.3300, -8.4660],
      [52.3320, -8.4750], [52.3340, -8.4840], [52.3345, -8.5012],
    ],
  },
  {
    name: "Great Western Greenway",
    description: "Beautiful coastal gravel trail from Westport to Achill Island. Follows the old Westport-Achill railway line with incredible views of Clew Bay and Croagh Patrick. Mostly flat and well-maintained.",
    difficulty: "easy",
    distance_km: 42,
    elevation_gain_m: 180,
    elevation_loss_m: 150,
    surface_type: "gravel",
    county: "Mayo",
    country: "Ireland",
    region: "Mayo",
    discipline: "gravel",
    coordinates: [
      [53.8000, -9.5200], [53.8050, -9.5400], [53.8100, -9.5600],
      [53.8150, -9.5850], [53.8200, -9.6100], [53.8250, -9.6350],
      [53.8350, -9.6600], [53.8450, -9.6850], [53.8550, -9.7100],
      [53.8650, -9.7400], [53.8750, -9.7700], [53.8850, -9.8000],
      [53.8950, -9.8300], [53.9050, -9.8600], [53.9150, -9.8900],
    ],
  },
  {
    name: "Waterford Greenway",
    description: "Ireland's longest off-road walking and cycling trail. Runs from Waterford City to Dungarvan along the old railway line. Smooth gravel surface through beautiful Deise countryside, passing the magnificent Durrow Tunnel.",
    difficulty: "easy",
    distance_km: 46,
    elevation_gain_m: 200,
    elevation_loss_m: 220,
    surface_type: "gravel",
    county: "Waterford",
    country: "Ireland",
    region: "Waterford",
    discipline: "gravel",
    coordinates: [
      [52.2593, -7.1101], [52.2550, -7.1400], [52.2500, -7.1700],
      [52.2450, -7.2000], [52.2400, -7.2350], [52.2350, -7.2700],
      [52.2280, -7.3050], [52.2200, -7.3400], [52.2100, -7.3750],
      [52.2000, -7.4100], [52.1900, -7.4450], [52.0938, -7.6179],
    ],
  },
  {
    name: "Slieve Bloom Gravel Circuit",
    description: "Remote gravel circuit through the Slieve Bloom Mountains in the heart of Ireland. Quiet forest roads with barely any traffic. A hidden gem with blanket bogs and panoramic views of the midlands.",
    difficulty: "moderate",
    distance_km: 55,
    elevation_gain_m: 680,
    elevation_loss_m: 680,
    surface_type: "gravel",
    county: "Laois",
    country: "Ireland",
    region: "Laois",
    discipline: "gravel",
    coordinates: [
      [53.0500, -7.6000], [53.0550, -7.5800], [53.0600, -7.5600],
      [53.0650, -7.5400], [53.0700, -7.5200], [53.0750, -7.5000],
      [53.0700, -7.4800], [53.0650, -7.4600], [53.0600, -7.4800],
      [53.0550, -7.5000], [53.0500, -7.5200], [53.0480, -7.5400],
      [53.0490, -7.5600], [53.0500, -7.5800], [53.0500, -7.6000],
    ],
  },
  {
    name: "Glendalough Wicklow Gravel",
    description: "Stunning gravel ride through the Wicklow Mountains starting from the famous monastic site at Glendalough. Forest tracks wind through ancient oak woodland and past glacial lakes. Technical in places with loose gravel descents.",
    difficulty: "hard",
    distance_km: 38,
    elevation_gain_m: 850,
    elevation_loss_m: 850,
    surface_type: "mixed",
    county: "Wicklow",
    country: "Ireland",
    region: "Wicklow",
    discipline: "gravel",
    coordinates: [
      [53.0113, -6.3296], [53.0150, -6.3200], [53.0200, -6.3100],
      [53.0250, -6.3000], [53.0300, -6.2900], [53.0350, -6.2800],
      [53.0400, -6.2700], [53.0350, -6.2600], [53.0300, -6.2500],
      [53.0250, -6.2600], [53.0200, -6.2700], [53.0150, -6.2800],
      [53.0120, -6.3000], [53.0113, -6.3296],
    ],
  },
  {
    name: "Connemara Bog Road Explorer",
    description: "Wild gravel adventure through the Connemara bogs on ancient boreen roads. Passes through some of Ireland's most remote and beautiful landscapes with views of the Twelve Bens mountain range. Expect gates, cattle grids, and solitude.",
    difficulty: "moderate",
    distance_km: 62,
    elevation_gain_m: 520,
    elevation_loss_m: 520,
    surface_type: "mixed",
    county: "Galway",
    country: "Ireland",
    region: "Galway",
    discipline: "gravel",
    coordinates: [
      [53.4500, -9.8800], [53.4550, -9.9000], [53.4600, -9.9200],
      [53.4650, -9.9400], [53.4700, -9.9600], [53.4750, -9.9800],
      [53.4800, -10.0000], [53.4750, -10.0200], [53.4700, -10.0000],
      [53.4650, -9.9800], [53.4600, -9.9600], [53.4550, -9.9400],
      [53.4520, -9.9200], [53.4500, -9.9000], [53.4500, -9.8800],
    ],
  },
  {
    name: "Old Kenmare Road",
    description: "Historic route through Killarney National Park on the Old Kenmare Road. Ancient pathway with rough gravel and stone surfaces. Incredible mountain scenery, ancient oak forests, and likely encounters with wild deer.",
    difficulty: "moderate",
    distance_km: 28,
    elevation_gain_m: 450,
    elevation_loss_m: 480,
    surface_type: "trail",
    county: "Kerry",
    country: "Ireland",
    region: "Kerry",
    discipline: "gravel",
    coordinates: [
      [51.9840, -9.5070], [51.9800, -9.5200], [51.9750, -9.5350],
      [51.9700, -9.5500], [51.9650, -9.5650], [51.9600, -9.5800],
      [51.9550, -9.5950], [51.9500, -9.6100], [51.9450, -9.6250],
      [51.9400, -9.6400], [51.9350, -9.6550],
    ],
  },
  {
    name: "Cuilcagh Boardwalk & Gravel Trails",
    description: "Gravel trails leading to the famous Cuilcagh Boardwalk (Stairway to Heaven). Well-maintained gravel paths through the Marble Arch Caves Global Geopark with dramatic mountain scenery on the Fermanagh border.",
    difficulty: "moderate",
    distance_km: 24,
    elevation_gain_m: 380,
    elevation_loss_m: 380,
    surface_type: "gravel",
    county: "Cavan",
    country: "Ireland",
    region: "Cavan",
    discipline: "gravel",
    coordinates: [
      [54.2000, -7.8000], [54.2050, -7.7900], [54.2100, -7.7800],
      [54.2150, -7.7700], [54.2200, -7.7600], [54.2250, -7.7500],
      [54.2200, -7.7400], [54.2150, -7.7500], [54.2100, -7.7600],
      [54.2050, -7.7700], [54.2000, -7.7800], [54.2000, -7.8000],
    ],
  },
  {
    name: "Portumna Forest Park Loop",
    description: "Pleasant forest gravel loop in Portumna Forest Park on the shores of Lough Derg. Well-maintained forest roads ideal for beginners. Beautiful lakeside sections and diverse woodland habitats.",
    difficulty: "easy",
    distance_km: 18,
    elevation_gain_m: 85,
    elevation_loss_m: 85,
    surface_type: "gravel",
    county: "Galway",
    country: "Ireland",
    region: "Galway",
    discipline: "gravel",
    coordinates: [
      [53.0850, -8.2200], [53.0880, -8.2150], [53.0910, -8.2100],
      [53.0940, -8.2050], [53.0960, -8.2000], [53.0940, -8.1950],
      [53.0910, -8.1900], [53.0880, -8.1950], [53.0860, -8.2000],
      [53.0850, -8.2050], [53.0850, -8.2100], [53.0850, -8.2200],
    ],
  },
  {
    name: "Mourne Mountains Gravel",
    description: "Challenging gravel ride through the majestic Mourne Mountains. Rocky forest tracks and old quarry roads with significant climbing. Spectacular granite mountain scenery and views to the Irish Sea. Parts can be very rough.",
    difficulty: "expert",
    distance_km: 45,
    elevation_gain_m: 1200,
    elevation_loss_m: 1200,
    surface_type: "trail",
    county: "Down",
    country: "Ireland",
    region: "Down",
    discipline: "gravel",
    coordinates: [
      [54.1500, -5.9500], [54.1550, -5.9400], [54.1600, -5.9300],
      [54.1650, -5.9200], [54.1700, -5.9100], [54.1750, -5.9000],
      [54.1800, -5.8900], [54.1750, -5.8800], [54.1700, -5.8900],
      [54.1650, -5.9000], [54.1600, -5.9100], [54.1550, -5.9200],
      [54.1520, -5.9300], [54.1500, -5.9400], [54.1500, -5.9500],
    ],
  },
  {
    name: "Coillte Ticknock Forest",
    description: "Quick after-work gravel ride in the Dublin Mountains. Forest fire roads with great views over Dublin Bay. Easily accessible from the city and a favourite for Dublin gravel riders. Can link up with other trails for longer rides.",
    difficulty: "easy",
    distance_km: 15,
    elevation_gain_m: 280,
    elevation_loss_m: 280,
    surface_type: "gravel",
    county: "Dublin",
    country: "Ireland",
    region: "Dublin",
    discipline: "gravel",
    coordinates: [
      [53.2420, -6.2400], [53.2450, -6.2350], [53.2480, -6.2300],
      [53.2510, -6.2250], [53.2530, -6.2200], [53.2510, -6.2150],
      [53.2480, -6.2200], [53.2450, -6.2250], [53.2430, -6.2300],
      [53.2420, -6.2350], [53.2420, -6.2400],
    ],
  },
  {
    name: "Castlepook to Galtee Crossing",
    description: "Long gravel adventure linking Castlepook woodland to the Galtee Mountains. Quiet back roads, forestry tracks, and mountain paths. One of the best multi-terrain gravel rides in Munster with challenging climbs and rewarding descents.",
    difficulty: "expert",
    distance_km: 72,
    elevation_gain_m: 1400,
    elevation_loss_m: 1400,
    surface_type: "mixed",
    county: "Cork",
    country: "Ireland",
    region: "Cork",
    discipline: "gravel",
    coordinates: [
      [52.2000, -8.5500], [52.2100, -8.5300], [52.2200, -8.5100],
      [52.2300, -8.4900], [52.2400, -8.4700], [52.2500, -8.4500],
      [52.2600, -8.4300], [52.2700, -8.4100], [52.2600, -8.3900],
      [52.2500, -8.3700], [52.2400, -8.3900], [52.2300, -8.4100],
      [52.2200, -8.4300], [52.2100, -8.4500], [52.2000, -8.4700],
      [52.2000, -8.5500],
    ],
  },
  // UK routes
  {
    name: "Yorkshire Dales Gravel Explorer",
    description: "Classic gravel ride through the Yorkshire Dales. Bridleways and green lanes connect stunning limestone valleys. Expect gates, river crossings, and breathtaking views of the Dales.",
    difficulty: "hard",
    distance_km: 65,
    elevation_gain_m: 1100,
    elevation_loss_m: 1100,
    surface_type: "gravel",
    county: "Yorkshire",
    country: "UK",
    region: "Yorkshire",
    discipline: "gravel",
    coordinates: [
      [54.1500, -2.1500], [54.1600, -2.1300], [54.1700, -2.1100],
      [54.1800, -2.0900], [54.1900, -2.0700], [54.1800, -2.0500],
      [54.1700, -2.0300], [54.1600, -2.0500], [54.1500, -2.0700],
      [54.1400, -2.0900], [54.1400, -2.1100], [54.1500, -2.1300],
      [54.1500, -2.1500],
    ],
  },
  {
    name: "Lake District MTB Epic",
    description: "Technical mountain biking through the Lake District fells. Rocky singletrack, steep descents, and incredible mountain scenery. Not for the faint-hearted.",
    difficulty: "expert",
    distance_km: 35,
    elevation_gain_m: 1350,
    elevation_loss_m: 1350,
    surface_type: "singletrack",
    county: "Cumbria",
    country: "UK",
    region: "Cumbria",
    discipline: "mtb",
    coordinates: [
      [54.4600, -3.0800], [54.4650, -3.0700], [54.4700, -3.0600],
      [54.4750, -3.0500], [54.4800, -3.0400], [54.4750, -3.0300],
      [54.4700, -3.0200], [54.4650, -3.0300], [54.4600, -3.0400],
      [54.4550, -3.0500], [54.4550, -3.0600], [54.4600, -3.0700],
      [54.4600, -3.0800],
    ],
  },
  // USA routes
  {
    name: "Leadville Colorado Gravel",
    description: "High-altitude gravel riding near Leadville, Colorado. Climb above 10,000 ft on mining roads with panoramic Rocky Mountain views. Thin air and remote terrain make this a true adventure.",
    difficulty: "expert",
    distance_km: 80,
    elevation_gain_m: 1800,
    elevation_loss_m: 1800,
    surface_type: "gravel",
    county: "Colorado",
    country: "USA",
    region: "Colorado",
    discipline: "gravel",
    coordinates: [
      [39.2400, -106.2900], [39.2500, -106.2700], [39.2600, -106.2500],
      [39.2700, -106.2300], [39.2800, -106.2100], [39.2900, -106.1900],
      [39.2800, -106.1700], [39.2700, -106.1900], [39.2600, -106.2100],
      [39.2500, -106.2300], [39.2400, -106.2500], [39.2400, -106.2700],
      [39.2400, -106.2900],
    ],
  },
  {
    name: "Vermont Green Mountain Road Loop",
    description: "Stunning road cycling through Vermont's Green Mountains. Covered bridges, maple farms, and rolling hills. The quintessential New England road ride with classic fall foliage.",
    difficulty: "moderate",
    distance_km: 95,
    elevation_gain_m: 900,
    elevation_loss_m: 900,
    surface_type: "road",
    county: "Vermont",
    country: "USA",
    region: "Vermont",
    discipline: "road",
    coordinates: [
      [44.2600, -72.5800], [44.2700, -72.5600], [44.2800, -72.5400],
      [44.2900, -72.5200], [44.3000, -72.5000], [44.3100, -72.4800],
      [44.3000, -72.4600], [44.2900, -72.4800], [44.2800, -72.5000],
      [44.2700, -72.5200], [44.2650, -72.5400], [44.2600, -72.5600],
      [44.2600, -72.5800],
    ],
  },
  // Spain routes
  {
    name: "Girona Gravel Classic",
    description: "The iconic gravel route from Girona into the Gavarres hills. Follows ancient paths through cork oak forests and medieval villages. A favourite of the international pro peloton who call Girona home.",
    difficulty: "moderate",
    distance_km: 58,
    elevation_gain_m: 750,
    elevation_loss_m: 750,
    surface_type: "gravel",
    county: "Girona",
    country: "Spain",
    region: "Girona",
    discipline: "gravel",
    coordinates: [
      [41.9794, 2.8214], [41.9700, 2.8400], [41.9600, 2.8600],
      [41.9500, 2.8800], [41.9400, 2.9000], [41.9300, 2.9200],
      [41.9400, 2.9400], [41.9500, 2.9200], [41.9600, 2.9000],
      [41.9700, 2.8800], [41.9750, 2.8600], [41.9794, 2.8400],
      [41.9794, 2.8214],
    ],
  },
  {
    name: "Mallorca Sa Calobra Road Climb",
    description: "The legendary Sa Calobra road climb in Mallorca. 9.4 km of twisting hairpins through dramatic limestone gorges. A bucket-list road cycling destination with a 680m climb.",
    difficulty: "hard",
    distance_km: 42,
    elevation_gain_m: 1050,
    elevation_loss_m: 1050,
    surface_type: "road",
    county: "Mallorca",
    country: "Spain",
    region: "Mallorca",
    discipline: "road",
    coordinates: [
      [39.8500, 2.8000], [39.8450, 2.8100], [39.8400, 2.8200],
      [39.8350, 2.8300], [39.8300, 2.8400], [39.8250, 2.8500],
      [39.8200, 2.8600], [39.8250, 2.8700], [39.8300, 2.8600],
      [39.8350, 2.8500], [39.8400, 2.8400], [39.8450, 2.8300],
      [39.8500, 2.8200], [39.8500, 2.8000],
    ],
  },
];

// Also seed some ratings for verified badge testing
const seedRatings = [
  { routeName: "Great Western Greenway", scores: [5, 4, 5, 4] },
  { routeName: "Waterford Greenway", scores: [4, 5, 4, 5, 4] },
];

async function seed() {
  // Create tables
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      session_token TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'moderate', 'hard', 'expert')),
      distance_km REAL NOT NULL,
      elevation_gain_m REAL NOT NULL,
      elevation_loss_m REAL NOT NULL,
      surface_type TEXT NOT NULL CHECK(surface_type IN ('gravel', 'mixed', 'trail', 'road')),
      county TEXT NOT NULL,
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      gpx_filename TEXT,
      coordinates TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(route_id, user_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      caption TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS conditions (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL REFERENCES routes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('good', 'fair', 'poor', 'closed')),
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Clear existing data
  await sql`DELETE FROM conditions`;
  await sql`DELETE FROM photos`;
  await sql`DELETE FROM comments`;
  await sql`DELETE FROM ratings`;
  await sql`DELETE FROM routes`;
  await sql`DELETE FROM users`;

  // Insert routes
  const routeIds: Record<string, string> = {};
  for (const route of routes) {
    const id = uuidv4();
    routeIds[route.name] = id;
    await sql`
      INSERT INTO routes (id, name, description, difficulty, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates)
      VALUES (${id}, ${route.name}, ${route.description}, ${route.difficulty}, ${route.distance_km}, ${route.elevation_gain_m}, ${route.elevation_loss_m}, ${route.surface_type}, ${route.county}, ${route.country}, ${route.region}, ${route.discipline}, ${route.coordinates[0][0]}, ${route.coordinates[0][1]}, ${null}, ${JSON.stringify(route.coordinates)})
    `;
  }

  // Create seed users for ratings
  const seedUsers: string[] = [];
  for (let i = 0; i < 5; i++) {
    const userId = uuidv4();
    seedUsers.push(userId);
    await sql`INSERT INTO users (id, email, name) VALUES (${userId}, ${`rider${i + 1}@loops.ie`}, ${`Rider ${i + 1}`})`;
  }

  // Insert ratings
  for (const sr of seedRatings) {
    const routeId = routeIds[sr.routeName];
    if (!routeId) continue;
    for (let i = 0; i < sr.scores.length; i++) {
      await sql`INSERT INTO ratings (id, route_id, user_id, score) VALUES (${uuidv4()}, ${routeId}, ${seedUsers[i]}, ${sr.scores[i]})`;
    }
  }

  console.log(`Seeded ${routes.length} routes and ${seedRatings.length} sets of ratings`);
}

seed().catch(console.error);
