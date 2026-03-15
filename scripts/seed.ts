import { sql } from "@vercel/postgres";
import { v5 as uuidv5 } from "uuid";
import { readFileSync } from "fs";
import { join } from "path";
import { parseGpx } from "../src/lib/gpx";
import { parseFit } from "../src/lib/fit";

// ── Deterministic UUIDs ──
// All seed data uses UUID v5 with this namespace so we can identify and clean up seed data
const SEED_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // DNS namespace

function seedUuid(key: string): string {
  return uuidv5(`loops-seed:${key}`, SEED_NAMESPACE);
}

// ── Seed Users ──
const SEED_USERS = [
  { key: "ciaran.murphy", name: "Ciaran Murphy", bio: "Rides out of Marlay Park most weekends. Loves a big Wicklow day.", location: "South Dublin" },
  { key: "aoife.brennan", name: "Aoife Brennan", bio: "South Dublin, chasing every climb in the mountains.", location: "Rathfarnham" },
  { key: "declan.obrien", name: "Declan O'Brien", bio: "Howth regular. Sea air and suffering.", location: "Howth" },
  { key: "niamh.fitzgerald", name: "Niamh Fitzgerald", bio: "Commuter turned weekend warrior. Based in Ranelagh.", location: "Ranelagh" },
  { key: "ronan.kelly", name: "Ronan Kelly", bio: "Blessington area. Knows every back road in west Wicklow.", location: "Blessington" },
  { key: "sinead.walsh", name: "Sinead Walsh", bio: "Dun Laoghaire. Will ride anything with a coast road.", location: "Dun Laoghaire" },
  { key: "conor.byrne", name: "Conor Byrne", bio: "Rathmines. Prefers long steady efforts over punchy climbs.", location: "Rathmines" },
  { key: "emma.daly", name: "Emma Daly", bio: "Dalkey. Short loops during the week, big spins on Saturdays.", location: "Dalkey" },
  { key: "padraig.nolan", name: "Padraig Nolan", bio: "Lucan. Always looking for new routes west of the city.", location: "Lucan" },
  { key: "sarah.kavanagh", name: "Sarah Kavanagh", bio: "Greystones. If it doesn't have at least one gap road, not interested.", location: "Greystones" },
];

// ── Helpers ──
const DATA_DIR = join(__dirname, "seed-data");

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), "utf-8"));
}

function readGpx(filename: string): string {
  return readFileSync(join(DATA_DIR, "gpx", filename), "utf-8");
}

/** Returns a Date object N days before now, with some random hour jitter */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(Math.floor(Math.random() * 14) + 7); // 7am-9pm
  d.setMinutes(Math.floor(Math.random() * 60));
  return d;
}

// ── Main ──
async function seed() {
  console.log("🌱 Dublin Route Seeding");
  console.log("=======================\n");

  // 1. Load data files
  const manifest = readJson<{
    routes: Array<{
      gpx: string;
      name: string;
      description: string;
      county: string;
      country: string;
      assignedUser: string;
    }>;
  }>("manifest.json");

  const commentsData = readJson<{
    comments: Array<{
      routeIndex: number;
      userKey: string;
      body: string;
      daysAfterRoute: number;
    }>;
  }>("comments.json");

  const ratingsData = readJson<{
    ratings: Array<{
      routeIndex: number;
      userKey: string;
      score: number;
      daysAfterRoute: number;
    }>;
  }>("ratings.json");

  // 2. Build user ID map
  const userIds: Record<string, string> = {};
  for (const u of SEED_USERS) {
    userIds[u.key] = seedUuid(`user:${u.key}`);
  }

  // 3. Clean up existing seed data (order matters: comments/ratings first, then routes, then users)
  console.log("Cleaning existing seed data...");
  const seedUserIds = Object.values(userIds);
  for (const uid of seedUserIds) {
    await sql`DELETE FROM comments WHERE user_id = ${uid}`;
    await sql`DELETE FROM ratings WHERE user_id = ${uid}`;
  }
  // Also delete any ratings/comments that reference seed routes (by other users)
  for (const uid of seedUserIds) {
    await sql`DELETE FROM comments WHERE route_id IN (SELECT id FROM routes WHERE created_by = ${uid})`;
    await sql`DELETE FROM ratings WHERE route_id IN (SELECT id FROM routes WHERE created_by = ${uid})`;
    await sql`DELETE FROM routes WHERE created_by = ${uid}`;
  }
  for (const uid of seedUserIds) {
    await sql`DELETE FROM users WHERE id = ${uid}`;
  }

  // 4. Create seed users
  console.log("Creating 10 seed users...");
  for (const u of SEED_USERS) {
    const id = userIds[u.key];
    const email = `${u.key}@seed.loops.ie`;
    const avatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(u.name)}`;
    const createdAt = daysAgo(90 + Math.floor(Math.random() * 30)); // 90-120 days ago

    await sql`
      INSERT INTO users (id, email, name, bio, location, avatar_url, created_at)
      VALUES (${id}, ${email}, ${u.name}, ${u.bio}, ${u.location}, ${avatarUrl}, ${createdAt.toISOString()})
    `;
    console.log(`  ✓ ${u.name} (${u.location})`);
  }

  // 5. Parse GPX files and insert routes
  console.log("\nParsing GPX files and inserting routes...");
  const routeIds: string[] = [];
  const routeCreatedAts: Date[] = [];

  for (let i = 0; i < manifest.routes.length; i++) {
    const r = manifest.routes[i];
    const routeId = seedUuid(`route:${r.gpx}`);
    routeIds.push(routeId);

    // Parse route file (GPX or FIT)
    const ext = r.gpx.split(".").pop()?.toLowerCase();
    let parsed;
    if (ext === "fit") {
      const buf = readFileSync(join(DATA_DIR, "gpx", r.gpx));
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      parsed = await parseFit(ab);
    } else {
      const gpxContent = readGpx(r.gpx);
      parsed = parseGpx(gpxContent);
    }

    if (parsed.coordinates.length === 0) {
      console.error(`  ✗ ${r.name} — no coordinates found in ${r.gpx}`);
      routeCreatedAts.push(new Date());
      continue;
    }

    const startLat = parsed.coordinates[0][0];
    const startLng = parsed.coordinates[0][1];
    const createdBy = userIds[r.assignedUser];
    const createdAt = daysAgo(60 + Math.floor(Math.random() * 30)); // 60-90 days ago
    routeCreatedAts.push(createdAt);

    // Include elevation as 3rd element in coordinates (matches upload API format)
    const coordsWithElevation = parsed.coordinates.map((coord, idx) => {
      const ele = parsed.elevations[idx] ?? 0;
      return [coord[0], coord[1], Math.round(ele * 10) / 10];
    });

    await sql`
      INSERT INTO routes (
        id, name, description, distance_km,
        elevation_gain_m, elevation_loss_m, surface_type,
        county, country, region, discipline,
        start_lat, start_lng, gpx_filename, coordinates,
        created_by, created_at
      ) VALUES (
        ${routeId}, ${r.name}, ${r.description}, ${parsed.distance_km},
        ${parsed.elevation_gain_m}, ${parsed.elevation_loss_m}, ${"road"},
        ${r.county}, ${r.country}, ${r.county}, ${"road"},
        ${startLat}, ${startLng}, ${r.gpx}, ${JSON.stringify(coordsWithElevation)},
        ${createdBy}, ${createdAt.toISOString()}
      )
    `;

    console.log(`  ✓ ${r.name} — ${parsed.distance_km.toFixed(1)}km, ${parsed.elevation_gain_m.toFixed(0)}m gain, ${parsed.coordinates.length} points`);
  }

  // 6. Insert ratings
  console.log(`\nInserting ${ratingsData.ratings.length} ratings...`);
  for (const r of ratingsData.ratings) {
    const routeId = routeIds[r.routeIndex];
    const userId = userIds[r.userKey];
    if (!routeId || !userId) {
      console.error(`  ✗ Missing route[${r.routeIndex}] or user[${r.userKey}]`);
      continue;
    }
    const ratingId = seedUuid(`rating:${r.routeIndex}:${r.userKey}`);
    const routeDate = routeCreatedAts[r.routeIndex];
    const createdAt = new Date(routeDate.getTime() + r.daysAfterRoute * 24 * 60 * 60 * 1000);

    await sql`
      INSERT INTO ratings (id, route_id, user_id, score, created_at)
      VALUES (${ratingId}, ${routeId}, ${userId}, ${r.score}, ${createdAt.toISOString()})
    `;
  }
  console.log("  ✓ Done");

  // 7. Insert comments
  console.log(`\nInserting ${commentsData.comments.length} comments...`);
  for (const c of commentsData.comments) {
    const routeId = routeIds[c.routeIndex];
    const userId = userIds[c.userKey];
    if (!routeId || !userId) {
      console.error(`  ✗ Missing route[${c.routeIndex}] or user[${c.userKey}]`);
      continue;
    }
    const commentId = seedUuid(`comment:${c.routeIndex}:${c.userKey}:${c.daysAfterRoute}`);
    const routeDate = routeCreatedAts[c.routeIndex];
    const createdAt = new Date(routeDate.getTime() + c.daysAfterRoute * 24 * 60 * 60 * 1000);

    await sql`
      INSERT INTO comments (id, route_id, user_id, body, created_at)
      VALUES (${commentId}, ${routeId}, ${userId}, ${c.body}, ${createdAt.toISOString()})
    `;
  }
  console.log("  ✓ Done");

  // 8. Summary
  console.log("\n=======================");
  console.log(`✅ Seeded ${routeIds.length} routes, ${SEED_USERS.length} users, ${ratingsData.ratings.length} ratings, ${commentsData.comments.length} comments`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
