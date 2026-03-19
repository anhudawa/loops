# Dublin Route Seeding Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed LOOPS with 10 real Dublin road cycling routes (from real GPX files) attributed to 10 realistic fake users, with ratings and comments, replacing the existing fake seed data.

**Architecture:** A replacement `scripts/seed.ts` reads GPX files from `scripts/seed-data/gpx/`, parses them through the existing `route-parser.ts` pipeline, and inserts routes + users + ratings + comments into Vercel Postgres. Seed users have deterministic UUIDs for idempotent re-runs. All seed data (manifest, GPX files, comments, ratings) lives in JSON/GPX files under `scripts/seed-data/`.

**Tech Stack:** TypeScript, Vercel Postgres (`@vercel/postgres`), uuid v5, existing `route-parser.ts` / `gpx.ts` / `geo-utils.ts`

**Spec:** `docs/superpowers/specs/2026-03-14-dublin-route-seeding-design.md`

---

## Chunk 1: GPX Sourcing & Seed Data Files

This chunk is a **manual + automated hybrid**. The human needs to find and download real GPX files. The coding tasks create the data scaffolding.

---

### Task 1: Source GPX Files (Manual — Human Task)

For each of the 10 routes below, find a real GPX file and save it to `scripts/seed-data/gpx/`. The app's existing upload flow supports RideWithGPS URL import, so RideWithGPS is the fastest source.

**Sourcing priority:**
1. **RideWithGPS** — search by route name/area, download GPX
2. **ActiveMe.ie** — Route 10 has a direct GPX download
3. **Komoot** — fallback
4. **Manual plotting** — last resort, use RideWithGPS route planner to trace the roads and export

| # | File Name | Route Name | ~Dist | Search Terms |
|---|-----------|-----------|-------|--------------|
| 1 | `howth-head-loop.gpx` | Howth Head Loop | 37km | "Howth loop cycling Dublin" |
| 2 | `sally-gap-roundwood.gpx` | Sally Gap from Roundwood | 42km | "Sally Gap Roundwood cycling loop" |
| 3 | `glenmacnass-glencree.gpx` | Glenmacnass & Glencree Loop | 63km | "Glenmacnass Sally Gap Glencree Enniskerry cycling" |
| 4 | `shay-elliott-slieve-maan.gpx` | Shay Elliott & Slieve Maan | 59km | "Shay Elliott memorial climb cycling Wicklow" |
| 5 | `roundwood-rathdrum.gpx` | Roundwood & Rathdrum Figure of 8 | 48km | "Roundwood Rathdrum cycling loop Wicklow" |
| 6 | `tinahely-loop.gpx` | Tinahely Loop | 70km | "Tinahely Shillelagh cycling loop Wicklow" |
| 7 | `wicklow-gap-sally-gap-blessington.gpx` | Wicklow Gap, Sally Gap & Blessington | 70km | "Wicklow Gap Sally Gap Blessington cycling loop" |
| 8 | `meeting-of-the-waters.gpx` | Meeting of the Waters | 80km | "Aughrim Glenmalure Avoca cycling loop Wicklow" |
| 9 | `rathdrum-wicklow-gap.gpx` | Rathdrum-Wicklow Gap-Dublin | 74km | "Rathdrum Wicklow Gap cycling" |
| 10 | `blessington-glendalough-sally-gap.gpx` | Blessington-Glendalough-Sally Gap Loop | 101km | "Blessington Glendalough Sally Gap cycling loop" — also try ActiveMe.ie direct download |

- [ ] **Step 1: Create the GPX directory**

```bash
mkdir -p scripts/seed-data/gpx
```

- [ ] **Step 2: Download GPX files for all 10 routes**

Save each file with the exact filename from the table above. Verify each file is valid XML with `<trkpt>` or `<rtept>` elements (open in a text editor and check).

- [ ] **Step 3: Verify GPX files parse correctly**

For each GPX file, quickly check it contains coordinate data:

```bash
# Should output trkpt or rtept count for each file
for f in scripts/seed-data/gpx/*.gpx; do
  echo "$f: $(grep -c 'trkpt\|rtept' "$f") points"
done
```

Every file should have at least 50 points. If a file has 0, it may use a different format — inspect and fix.

---

### Task 2: Create Seed Data JSON Files

**Files:**
- Create: `scripts/seed-data/manifest.json`
- Create: `scripts/seed-data/comments.json`
- Create: `scripts/seed-data/ratings.json`

- [ ] **Step 1: Create manifest.json**

This maps each route to its GPX file, metadata, and assigned user. The `difficulty` values here are overrides — distance/elevation come from GPX parsing.

```json
{
  "routes": [
    {
      "gpx": "howth-head-loop.gpx",
      "name": "Howth Head Loop",
      "description": "Coastal loop around the Howth peninsula with views of Dublin Bay and Ireland's Eye. A Dublin cycling classic.",
      "difficulty": "easy",
      "county": "Dublin",
      "assignedUser": "declan.obrien"
    },
    {
      "gpx": "sally-gap-roundwood.gpx",
      "name": "Sally Gap from Roundwood",
      "description": "Punchy loop from Roundwood over the Sally Gap. Lough Tay views and the Military Road make this a Wicklow highlight.",
      "difficulty": "hard",
      "county": "Wicklow",
      "assignedUser": "niamh.fitzgerald"
    },
    {
      "gpx": "glenmacnass-glencree.gpx",
      "name": "Glenmacnass & Glencree Loop",
      "description": "From Laragh past Glenmacnass Waterfall to Sally Gap, through Glencree and Enniskerry, back via Long Hill. A proper Wicklow tour.",
      "difficulty": "hard",
      "county": "Wicklow",
      "assignedUser": "sinead.walsh"
    },
    {
      "gpx": "shay-elliott-slieve-maan.gpx",
      "name": "Shay Elliott & Slieve Maan",
      "description": "Tough climbing loop from Laragh through Glenmalure to the Shay Elliott Memorial. Views to Lugnaquilla on a clear day.",
      "difficulty": "hard",
      "county": "Wicklow",
      "assignedUser": "aoife.brennan"
    },
    {
      "gpx": "roundwood-rathdrum.gpx",
      "name": "Roundwood & Rathdrum Figure of 8",
      "description": "Rolling figure-of-eight through Roundwood, Anamoe, and Rathdrum. Quiet roads past the Vartry Reservoir.",
      "difficulty": "moderate",
      "county": "Wicklow",
      "assignedUser": "emma.daly"
    },
    {
      "gpx": "tinahely-loop.gpx",
      "name": "Tinahely Loop",
      "description": "Easier Wicklow loop on quiet roads through Shillelagh, Tinahely, and Kiltegan. Minimal climbing, maximum countryside.",
      "difficulty": "moderate",
      "county": "Wicklow",
      "assignedUser": "ronan.kelly"
    },
    {
      "gpx": "wicklow-gap-sally-gap-blessington.gpx",
      "name": "Wicklow Gap, Sally Gap & Blessington",
      "description": "The classic double-gap loop. Wicklow Gap past the lead mines, Sally Gap, and Blessington Lakes. 1,000m of climbing.",
      "difficulty": "hard",
      "county": "Wicklow",
      "assignedUser": "ciaran.murphy"
    },
    {
      "gpx": "meeting-of-the-waters.gpx",
      "name": "Meeting of the Waters",
      "description": "From Aughrim through Glenmalure and Laragh, past the Shay Elliott, and down to Avoca's Meeting of the Waters. Two big climbs.",
      "difficulty": "hard",
      "county": "Wicklow",
      "assignedUser": "ronan.kelly"
    },
    {
      "gpx": "rathdrum-wicklow-gap.gpx",
      "name": "Rathdrum-Wicklow Gap-Dublin",
      "description": "Long route from Rathdrum over the Wicklow Gap and Ballinascorney. Blessington Lakes provide the scenic highlight.",
      "difficulty": "expert",
      "county": "Wicklow",
      "assignedUser": "conor.byrne"
    },
    {
      "gpx": "blessington-glendalough-sally-gap.gpx",
      "name": "Blessington-Glendalough-Sally Gap Loop",
      "description": "The big Wicklow day out. Blessington Lakes to Glendalough, past Lough Tay to Sally Gap, and back. Epic in every sense.",
      "difficulty": "expert",
      "county": "Wicklow",
      "assignedUser": "ciaran.murphy"
    }
  ]
}
```

- [ ] **Step 2: Create comments.json**

Each comment has a `routeIndex` (0-9 matching the manifest order), a `userKey` (matching the user key format `firstname.lastname`), and a `body`. Comments are attributed to users who did NOT upload that route. Stagger `daysAfterRoute` for timestamp realism.

```json
{
  "comments": [
    { "routeIndex": 0, "userKey": "ciaran.murphy", "body": "Great spin out to Howth. Summit road is class on a clear day.", "daysAfterRoute": 5 },
    { "routeIndex": 0, "userKey": "emma.daly", "body": "Did this midweek, barely any traffic. Perfect after-work loop.", "daysAfterRoute": 12 },
    { "routeIndex": 1, "userKey": "sarah.kavanagh", "body": "Sally Gap never disappoints. Lough Tay views are unreal.", "daysAfterRoute": 3 },
    { "routeIndex": 2, "userKey": "aoife.brennan", "body": "Glenmacnass waterfall section is stunning. Bring layers for the top.", "daysAfterRoute": 8 },
    { "routeIndex": 2, "userKey": "padraig.nolan", "body": "Long Hill on the way back is sneaky hard after all that climbing.", "daysAfterRoute": 15 },
    { "routeIndex": 3, "userKey": "conor.byrne", "body": "The climb to Shay Elliott memorial is no joke. Legs were in bits.", "daysAfterRoute": 4 },
    { "routeIndex": 4, "userKey": "niamh.fitzgerald", "body": "Lovely quiet roads. Vartry Reservoir section is really peaceful.", "daysAfterRoute": 7 },
    { "routeIndex": 5, "userKey": "padraig.nolan", "body": "Good one for an easy day. Roads around Tinahely are surprisingly good.", "daysAfterRoute": 10 },
    { "routeIndex": 6, "userKey": "sarah.kavanagh", "body": "Both gaps in one loop. This is the definitive Wicklow ride.", "daysAfterRoute": 2 },
    { "routeIndex": 6, "userKey": "aoife.brennan", "body": "Blessington Lakes on the way back is a lovely way to finish.", "daysAfterRoute": 18 },
    { "routeIndex": 7, "userKey": "sinead.walsh", "body": "Meeting of the Waters is gorgeous. Avoca valley is worth stopping for.", "daysAfterRoute": 6 },
    { "routeIndex": 7, "userKey": "ciaran.murphy", "body": "Two proper climbs on this one. Bring food.", "daysAfterRoute": 14 },
    { "routeIndex": 8, "userKey": "emma.daly", "body": "Wicklow Gap descent is brilliant. Watch the crosswinds at the top though.", "daysAfterRoute": 9 },
    { "routeIndex": 9, "userKey": "sarah.kavanagh", "body": "Did this as a full day out. Absolutely brilliant. Pack two bidons.", "daysAfterRoute": 3 },
    { "routeIndex": 9, "userKey": "declan.obrien", "body": "Epic route. Sally Gap section with Lough Tay is the highlight for me.", "daysAfterRoute": 20 },
    { "routeIndex": 9, "userKey": "niamh.fitzgerald", "body": "My longest ride so far. Tough but worth every kilometre.", "daysAfterRoute": 25 }
  ]
}
```

- [ ] **Step 3: Create ratings.json**

Each user rates 3-5 routes they didn't upload. Scores are 3-5 (curated quality routes). Every route gets at least 2 ratings.

```json
{
  "ratings": [
    { "routeIndex": 0, "userKey": "ciaran.murphy", "score": 4, "daysAfterRoute": 3 },
    { "routeIndex": 0, "userKey": "aoife.brennan", "score": 4, "daysAfterRoute": 7 },
    { "routeIndex": 0, "userKey": "emma.daly", "score": 5, "daysAfterRoute": 10 },
    { "routeIndex": 0, "userKey": "sarah.kavanagh", "score": 4, "daysAfterRoute": 14 },
    { "routeIndex": 1, "userKey": "ciaran.murphy", "score": 5, "daysAfterRoute": 2 },
    { "routeIndex": 1, "userKey": "sarah.kavanagh", "score": 5, "daysAfterRoute": 5 },
    { "routeIndex": 1, "userKey": "conor.byrne", "score": 4, "daysAfterRoute": 11 },
    { "routeIndex": 2, "userKey": "aoife.brennan", "score": 5, "daysAfterRoute": 4 },
    { "routeIndex": 2, "userKey": "padraig.nolan", "score": 4, "daysAfterRoute": 9 },
    { "routeIndex": 2, "userKey": "ronan.kelly", "score": 5, "daysAfterRoute": 16 },
    { "routeIndex": 3, "userKey": "conor.byrne", "score": 4, "daysAfterRoute": 3 },
    { "routeIndex": 3, "userKey": "ciaran.murphy", "score": 5, "daysAfterRoute": 8 },
    { "routeIndex": 3, "userKey": "padraig.nolan", "score": 4, "daysAfterRoute": 13 },
    { "routeIndex": 4, "userKey": "niamh.fitzgerald", "score": 4, "daysAfterRoute": 5 },
    { "routeIndex": 4, "userKey": "sinead.walsh", "score": 3, "daysAfterRoute": 12 },
    { "routeIndex": 4, "userKey": "padraig.nolan", "score": 4, "daysAfterRoute": 18 },
    { "routeIndex": 5, "userKey": "padraig.nolan", "score": 3, "daysAfterRoute": 6 },
    { "routeIndex": 5, "userKey": "emma.daly", "score": 4, "daysAfterRoute": 10 },
    { "routeIndex": 5, "userKey": "sarah.kavanagh", "score": 3, "daysAfterRoute": 15 },
    { "routeIndex": 6, "userKey": "sarah.kavanagh", "score": 5, "daysAfterRoute": 2 },
    { "routeIndex": 6, "userKey": "aoife.brennan", "score": 5, "daysAfterRoute": 7 },
    { "routeIndex": 6, "userKey": "declan.obrien", "score": 4, "daysAfterRoute": 12 },
    { "routeIndex": 6, "userKey": "niamh.fitzgerald", "score": 5, "daysAfterRoute": 19 },
    { "routeIndex": 7, "userKey": "sinead.walsh", "score": 4, "daysAfterRoute": 4 },
    { "routeIndex": 7, "userKey": "ciaran.murphy", "score": 5, "daysAfterRoute": 9 },
    { "routeIndex": 7, "userKey": "emma.daly", "score": 4, "daysAfterRoute": 16 },
    { "routeIndex": 8, "userKey": "emma.daly", "score": 5, "daysAfterRoute": 5 },
    { "routeIndex": 8, "userKey": "aoife.brennan", "score": 4, "daysAfterRoute": 11 },
    { "routeIndex": 8, "userKey": "sinead.walsh", "score": 4, "daysAfterRoute": 17 },
    { "routeIndex": 9, "userKey": "ronan.kelly", "score": 5, "daysAfterRoute": 2 },
    { "routeIndex": 9, "userKey": "declan.obrien", "score": 5, "daysAfterRoute": 8 },
    { "routeIndex": 9, "userKey": "niamh.fitzgerald", "score": 5, "daysAfterRoute": 14 },
    { "routeIndex": 9, "userKey": "conor.byrne", "score": 4, "daysAfterRoute": 22 },
    { "routeIndex": 1, "userKey": "declan.obrien", "score": 4, "daysAfterRoute": 8 },
    { "routeIndex": 3, "userKey": "ronan.kelly", "score": 5, "daysAfterRoute": 10 },
    { "routeIndex": 5, "userKey": "ronan.kelly", "score": 4, "daysAfterRoute": 8 },
    { "routeIndex": 1, "userKey": "sinead.walsh", "score": 5, "daysAfterRoute": 14 },
    { "routeIndex": 3, "userKey": "declan.obrien", "score": 4, "daysAfterRoute": 18 }
  ]
}
```

- [ ] **Step 4: Commit seed data files**

```bash
git add scripts/seed-data/
git commit -m "feat: add Dublin route seed data (manifest, comments, ratings)"
```

Note: GPX files will be committed separately after download/verification.

---

## Chunk 2: Replacement Seed Script

### Task 3: Write the Seed Script

**Files:**
- Replace: `scripts/seed.ts`

The new seed script:
1. Reads the manifest, comments, and ratings JSON files
2. Generates deterministic UUIDs for seed users (UUID v5 with namespace)
3. Deletes any existing seed data (by seed user IDs) — preserving real user data
4. Creates 10 users with bios, locations, DiceBear avatars
5. Parses each GPX file through the existing `parseGpx()` function
6. Inserts routes with parsed coordinates/distance/elevation and metadata from manifest
7. Inserts ratings and comments with staggered timestamps

- [ ] **Step 1: Write the replacement seed.ts**

```typescript
import { sql } from "@vercel/postgres";
import { v5 as uuidv5 } from "uuid";
import { readFileSync } from "fs";
import { join } from "path";
import { parseGpx } from "../src/lib/gpx";

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
      difficulty: string;
      county: string;
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

  // 3. Clean up existing seed data
  console.log("Cleaning existing seed data...");
  const seedUserIds = Object.values(userIds);
  for (const uid of seedUserIds) {
    await sql`DELETE FROM comments WHERE user_id = ${uid}`;
    await sql`DELETE FROM ratings WHERE user_id = ${uid}`;
    await sql`DELETE FROM routes WHERE created_by = ${uid}`;
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
  const routeCreatedAts: Date[] = []; // Track for relative comment/rating timestamps

  for (let i = 0; i < manifest.routes.length; i++) {
    const r = manifest.routes[i];
    const routeId = seedUuid(`route:${r.gpx}`);
    routeIds.push(routeId);

    // Parse GPX
    const gpxContent = readGpx(r.gpx);
    const parsed = parseGpx(gpxContent);

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

    await sql`
      INSERT INTO routes (
        id, name, description, difficulty, distance_km,
        elevation_gain_m, elevation_loss_m, surface_type,
        county, country, region, discipline,
        start_lat, start_lng, gpx_filename, coordinates,
        created_by, created_at
      ) VALUES (
        ${routeId}, ${r.name}, ${r.description}, ${r.difficulty}, ${parsed.distance_km},
        ${parsed.elevation_gain_m}, ${parsed.elevation_loss_m}, ${"road"},
        ${r.county}, ${"Ireland"}, ${r.county}, ${"road"},
        ${startLat}, ${startLng}, ${r.gpx}, ${JSON.stringify(parsed.coordinates)},
        ${createdBy}, ${createdAt.toISOString()}
      )
    `;

    console.log(`  ✓ ${r.name} — ${parsed.distance_km.toFixed(1)}km, ${parsed.elevation_gain_m.toFixed(0)}m gain, ${parsed.coordinates.length} points`);
  }

  // 6. Insert ratings
  console.log(`\nInserting ratings...`);
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
  console.log(`\nInserting comments...`);
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
```

- [ ] **Step 2: Verify the script compiles**

```bash
cd /Users/anthonywalsh/Desktop/loops
npx tsc --noEmit scripts/seed.ts --esModuleInterop --module commonjs --moduleResolution node --resolveJsonModule --skipLibCheck
```

If this fails due to path resolution with `../src/lib/gpx`, you may need to run the script with `tsx` instead:

```bash
npx tsx scripts/seed.ts
```

- [ ] **Step 3: Install uuid v5 if not available**

Check if uuid package supports v5:

```bash
cd /Users/anthonywalsh/Desktop/loops
node -e "const { v5 } = require('uuid'); console.log(typeof v5)"
```

Should print `function`. If it prints `undefined`, the uuid package is too old — run `npm install uuid@latest`.

- [ ] **Step 4: Commit the seed script**

```bash
git add scripts/seed.ts
git commit -m "feat: replace seed script with Dublin route seeding"
```

---

### Task 4: Run the Seed Script

- [ ] **Step 1: Ensure environment variables are set**

The script needs `POSTGRES_URL` (or the Vercel Postgres env vars). Check:

```bash
echo $POSTGRES_URL
```

If not set, you can pull them from Vercel:

```bash
npx vercel env pull .env.local
source .env.local
```

Or run with `vercel env`:

```bash
npx vercel env pull && npx tsx scripts/seed.ts
```

- [ ] **Step 2: Run the seed**

```bash
cd /Users/anthonywalsh/Desktop/loops
npx tsx scripts/seed.ts
```

Expected output:
```
🌱 Dublin Route Seeding
=======================

Cleaning existing seed data...
Creating 10 seed users...
  ✓ Ciaran Murphy (South Dublin)
  ✓ Aoife Brennan (Rathfarnham)
  ... (8 more)

Parsing GPX files and inserting routes...
  ✓ Howth Head Loop — 37.2km, 260m gain, 1847 points
  ✓ Sally Gap from Roundwood — 42.1km, 680m gain, 2103 points
  ... (8 more)

Inserting 38 ratings...
  ✓ Done

Inserting 16 comments...
  ✓ Done

=======================
✅ Seeded 10 routes, 10 users, 38 ratings, 16 comments
```

If any route shows "no coordinates found", the GPX file may be malformed — re-download it.

- [ ] **Step 3: Verify in the app**

Open https://www.loops.ie (or local dev) and check:
- All 10 routes appear on the home page map
- Route cards show correct names, distances, and ratings
- Click into a route detail page — verify the route trace renders on the map
- Check that comments appear on route detail pages
- Check user profiles for seed users (click a route creator name)

- [ ] **Step 4: Commit GPX files**

```bash
git add scripts/seed-data/gpx/
git commit -m "feat: add 10 Dublin road cycling GPX files"
```

---

## Chunk 3: Verification & Cleanup

### Task 5: Human Verification

This is a manual step for the founder (Anthony) to verify route quality.

- [ ] **Step 1: Review each route on the map**

For each of the 10 routes, open its detail page and verify:
- Route trace follows real roads (no wild jumps or straight lines through mountains)
- Distance and elevation are reasonable for that route
- The route forms a loop (start and end are close together)
- The description matches what the route actually does

| # | Route | Expected ~Dist | Expected ~Elev | Looks Right? |
|---|-------|---------------|---------------|-------------|
| 1 | Howth Head Loop | ~37km | ~260m | |
| 2 | Sally Gap from Roundwood | ~42km | ~680m | |
| 3 | Glenmacnass & Glencree Loop | ~63km | ~870m | |
| 4 | Shay Elliott & Slieve Maan | ~59km | ~980m | |
| 5 | Roundwood & Rathdrum Figure of 8 | ~48km | ~520m | |
| 6 | Tinahely Loop | ~70km | ~600m | |
| 7 | Wicklow Gap, Sally Gap & Blessington | ~70km | ~1000m | |
| 8 | Meeting of the Waters | ~80km | ~900m | |
| 9 | Rathdrum-Wicklow Gap-Dublin | ~74km | ~1130m | |
| 10 | Blessington-Glendalough-Sally Gap | ~101km | ~911m | |

- [ ] **Step 2: Flag any routes that need replacement**

If a route's GPX is bad (wrong area, not a loop, wildly wrong stats), find a replacement GPX and re-run the seed for that route.

- [ ] **Step 3: Deploy**

```bash
npx vercel --prod
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Dublin route seeding complete — 10 routes, 10 users, ratings, comments"
```
