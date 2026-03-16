# Strava Activity Import & Difficulty Removal — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import Strava activities into LOOPS with one tap, and remove the subjective `difficulty` field platform-wide.

**Architecture:** Strava OAuth connect stores tokens on the existing `users` table. A new `strava-api.ts` module handles all Strava API interactions (token refresh, activity fetching, type mapping). The upload page gains a Strava activity browser component. Difficulty removal is a sweep across 25+ files — database constraint relaxed, field removed from all UI, API, SEO, and config.

**Tech Stack:** Next.js 16 App Router, Vercel Postgres, Strava OAuth 2.0, `@mapbox/polyline` (already installed)

**Spec:** `docs/superpowers/specs/2026-03-14-strava-import-design.md`

---

## Chunk 1: Database Migration & Legacy Cleanup

### Task 1: Database Migration — Strava Columns & Difficulty Relaxation

**Files:**
- Modify: `src/lib/db.ts` — `migrateDb()` function (line ~107), `Route` interface (line 195), `RouteFilters` interface (line 216), `User` interface (line 236)

- [ ] **Step 1: Add Strava token columns and strava_activity_id to migrateDb()**

Add these lines to the end of the `migrateDb()` function (before the closing `}`):

```typescript
// Strava OAuth tokens
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_access_token TEXT`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_token_expires_at BIGINT`;

// Strava activity reference on routes for deduplication
await sql`ALTER TABLE routes ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT`;

// Difficulty: relax NOT NULL constraint so new routes can omit it
await sql`ALTER TABLE routes ALTER COLUMN difficulty DROP NOT NULL`;
await sql`ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_difficulty_check`;
await sql`ALTER TABLE routes ALTER COLUMN difficulty SET DEFAULT NULL`;
```

- [ ] **Step 2: Update the Route interface**

Change line 199 from:
```typescript
difficulty: "easy" | "moderate" | "hard" | "expert";
```
to:
```typescript
difficulty: "easy" | "moderate" | "hard" | "expert" | null;
```

Add after line 213 (`created_at: string;`):
```typescript
strava_activity_id: number | null;
```

- [ ] **Step 3: Update the User interface**

Add after line 246 (`avg_speed_kmh: number;`):
```typescript
strava_id: string | null;
strava_access_token: string | null;
strava_refresh_token: string | null;
strava_token_expires_at: number | null;
```

> **Note:** The existing `SELECT *` queries in `db.ts` (e.g., `getUserById`, `getUserBySession`) will automatically include the new columns — no query changes needed for reads.

- [ ] **Step 4: Remove difficulty from RouteFilters**

In the `RouteFilters` interface (line 216), remove:
```typescript
difficulty?: string;
```

- [ ] **Step 5: Verify the app still builds**

Run: `npx next build 2>&1 | tail -30`
Expected: Build errors from difficulty references (expected at this stage — we'll fix them in Chunk 3)

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add Strava token columns, strava_activity_id, relax difficulty constraint"
```

---

### Task 2: Legacy Strava Cleanup & New DB Functions

**Files:**
- Modify: `src/lib/db.ts` — remove `upsertStravaUser` (line ~514), `getUserByStravaId` (line ~509), add new Strava token functions
- Delete: `src/lib/strava.ts`

- [ ] **Step 1: Remove legacy Strava functions from db.ts**

Delete the `getUserByStravaId` function (lines 509-512):
```typescript
export async function getUserByStravaId(stravaId: string): Promise<User | undefined> {
  const { rows } = await sql`SELECT * FROM users WHERE strava_id = ${stravaId}`;
  return rows[0] as User | undefined;
}
```

Delete the `upsertStravaUser` function (lines 514-538):
```typescript
export async function upsertStravaUser(
  id: string,
  stravaId: string,
  name: string,
  avatarUrl: string | null,
  sessionToken: string
): Promise<User> {
  // ... entire function
}
```

- [ ] **Step 2: Add new Strava token CRUD functions**

Add these functions to `db.ts` (near the user functions section):

```typescript
export async function saveStravaTokens(
  userId: string,
  stravaId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  await sql`
    UPDATE users
    SET strava_id = ${stravaId},
        strava_access_token = ${accessToken},
        strava_refresh_token = ${refreshToken},
        strava_token_expires_at = ${expiresAt}
    WHERE id = ${userId}
  `;
}

export async function updateStravaTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  await sql`
    UPDATE users
    SET strava_access_token = ${accessToken},
        strava_refresh_token = ${refreshToken},
        strava_token_expires_at = ${expiresAt}
    WHERE id = ${userId}
  `;
}

export async function clearStravaTokens(userId: string): Promise<void> {
  await sql`
    UPDATE users
    SET strava_id = NULL,
        strava_access_token = NULL,
        strava_refresh_token = NULL,
        strava_token_expires_at = NULL
    WHERE id = ${userId}
  `;
}

export async function getRoutesByStravaActivityIds(activityIds: number[]): Promise<{ strava_activity_id: number }[]> {
  if (activityIds.length === 0) return [];
  const { rows } = await sql.query(
    `SELECT strava_activity_id FROM routes WHERE strava_activity_id = ANY($1::bigint[])`,
    [activityIds]
  );
  return rows as { strava_activity_id: number }[];
}
```

- [ ] **Step 3: Update insertRoute to include strava_activity_id**

> **Dependency:** This step requires the `Route` interface update from Task 1 Step 2 (adding `strava_activity_id: number | null`).

In the `insertRoute` function (line ~475), update the SQL to include `strava_activity_id`:

Change the INSERT columns from:
```sql
INSERT INTO routes (id, name, description, difficulty, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates, created_by)
```
to:
```sql
INSERT INTO routes (id, name, description, difficulty, distance_km, elevation_gain_m, elevation_loss_m, surface_type, county, country, region, discipline, start_lat, start_lng, gpx_filename, coordinates, created_by, strava_activity_id)
```

And add `${route.strava_activity_id ?? null}` to the VALUES.

- [ ] **Step 4: Delete the legacy strava.ts file**

```bash
rm src/lib/strava.ts
```

- [ ] **Step 5: Remove any imports of strava.ts**

Search for `from "@/lib/strava"` or `from "../lib/strava"` and remove those imports. Check `src/app/upload/page.tsx` — it likely imports `validateStravaUrl` or `getStravaExportError`. Remove those imports and any usage.

Run: `grep -rn "lib/strava" src/` to find all references.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: replace legacy Strava auth with token CRUD, add strava_activity_id support"
```

---

## Chunk 2: Strava OAuth & API Client

### Task 3: Strava API Client Library

**Files:**
- Create: `src/lib/strava-api.ts`

- [ ] **Step 1: Create the Strava API client module**

Create `src/lib/strava-api.ts`:

```typescript
import { getUserById, updateStravaTokens, clearStravaTokens } from "./db";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: { id: number };
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number; // meters
  total_elevation_gain: number; // meters
  map: {
    summary_polyline: string | null;
  };
  start_latlng: [number, number] | null;
  trainer: boolean;
}

export interface StravaStream {
  latlng?: { data: [number, number][] };
  altitude?: { data: number[] };
}

/**
 * Map Strava activity type → LOOPS discipline
 */
export function mapStravaDiscipline(type: string): "road" | "gravel" | "mtb" {
  switch (type) {
    case "GravelRide":
      return "gravel";
    case "MountainBikeRide":
      return "mtb";
    case "Ride":
    case "EBikeRide":
    case "VirtualRide":
    default:
      return "road";
  }
}

/**
 * Check if a Strava activity is a cycling activity with GPS data
 */
export function isCyclingWithGps(activity: StravaActivity): boolean {
  const cyclingTypes = ["Ride", "GravelRide", "MountainBikeRide", "EBikeRide"];
  return (
    cyclingTypes.includes(activity.type) &&
    !activity.trainer &&
    activity.map?.summary_polyline !== null &&
    activity.map?.summary_polyline !== "" &&
    activity.start_latlng !== null
  );
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCode(code: string): Promise<StravaTokens> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Refresh an expired access token.
 * Returns fresh tokens or null if the refresh token was revoked.
 */
async function refreshAccessToken(
  userId: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    // Token was revoked on Strava's side — clear our stored tokens
    await clearStravaTokens(userId);
    return null;
  }

  const data = await res.json();
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };

  await updateStravaTokens(userId, tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
  return tokens;
}

/**
 * Get a valid access token for the user, refreshing if needed.
 * Returns null if user has no Strava connection or token refresh failed.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const user = await getUserById(userId);
  if (!user?.strava_access_token || !user?.strava_refresh_token || !user?.strava_token_expires_at) {
    return null;
  }

  // Check if token is still valid (with 5-minute buffer)
  const now = Math.floor(Date.now() / 1000);
  if (user.strava_token_expires_at > now + 300) {
    return user.strava_access_token;
  }

  // Token expired — refresh it
  const refreshed = await refreshAccessToken(userId, user.strava_refresh_token);
  return refreshed?.accessToken ?? null;
}

/**
 * Fetch user's recent activities from Strava
 */
export async function fetchActivities(
  accessToken: string,
  page: number = 1,
  perPage: number = 30
): Promise<StravaActivity[]> {
  const res = await fetch(
    `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=${perPage}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 429) {
    throw new Error("RATE_LIMITED");
  }
  if (!res.ok) {
    throw new Error(`Strava API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch a single activity's detail
 */
export async function fetchActivity(
  accessToken: string,
  activityId: number
): Promise<StravaActivity> {
  const res = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);

  return res.json();
}

/**
 * Fetch GPS streams (latlng + altitude) for an activity
 */
export async function fetchActivityStreams(
  accessToken: string,
  activityId: number
): Promise<StravaStream> {
  const res = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=latlng,altitude&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);

  return res.json();
}

/**
 * Revoke access on Strava's side (deauthorize)
 */
export async function deauthorize(accessToken: string): Promise<void> {
  await fetch("https://www.strava.com/oauth/deauthorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
  });
  // Don't throw on failure — we clear tokens locally regardless
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/strava-api.ts
git commit -m "feat: add Strava API client with token refresh, activity fetching, type mapping"
```

---

### Task 4: Strava OAuth API Routes

**Files:**
- Create: `src/app/api/strava/connect/route.ts`
- Create: `src/app/api/strava/callback/route.ts`
- Modify: `middleware.ts` — add `/api/strava/callback` to public paths

- [ ] **Step 1: Create the connect/disconnect route**

Create `src/app/api/strava/connect/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession } from "@/lib/db";
import { clearStravaTokens } from "@/lib/db";
import { getValidAccessToken, deauthorize } from "@/lib/strava-api";

export async function GET(request: NextRequest) {
  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  // Store the page the user came from so we can redirect back
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/upload";

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: process.env.STRAVA_REDIRECT_URI!,
    response_type: "code",
    scope: "read,activity:read_all",
    state: returnTo,
  });

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`);
}

export async function DELETE() {
  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  // Revoke on Strava's side (best-effort)
  const accessToken = await getValidAccessToken(user.id);
  if (accessToken) {
    await deauthorize(accessToken);
  }

  // Clear tokens locally
  await clearStravaTokens(user.id);

  return NextResponse.json({ data: { disconnected: true } });
}
```

- [ ] **Step 2: Create the callback route**

Create `src/app/api/strava/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession, saveStravaTokens } from "@/lib/db";
import { exchangeCode } from "@/lib/strava-api";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") || "/upload";
  const error = request.nextUrl.searchParams.get("error");

  // User cancelled OAuth on Strava
  if (error || !code) {
    return NextResponse.redirect(new URL(state, request.url));
  }

  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const tokens = await exchangeCode(code);
    await saveStravaTokens(
      user.id,
      String(tokens.athlete.id),
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_at
    );
  } catch {
    // Token exchange failed — redirect back with error indicator
    const returnUrl = new URL(state, request.url);
    returnUrl.searchParams.set("strava_error", "connection_failed");
    return NextResponse.redirect(returnUrl);
  }

  const returnUrl = new URL(state, request.url);
  returnUrl.searchParams.set("strava_connected", "true");
  return NextResponse.redirect(returnUrl);
}
```

- [ ] **Step 3: Add /api/strava/callback to middleware public paths**

In `middleware.ts`, the API rate limiting section (line ~42) already handles `/api/` routes. The callback needs to work even when the session cookie check happens during the redirect flow. Add `/api/strava/callback` to the public paths.

After the SEO files check (line ~70) and before the public pages check, the callback is already under `/api/` so it goes through rate limiting, which is fine. But the session check at line 90-93 would block it since OAuth redirects may not have the session cookie in all browser scenarios.

Actually, since the callback is under `/api/`, it goes through the API rate limiting path (line 42) and returns with `NextResponse.next()` — it does NOT hit the session check at line 90. So no middleware change is needed for the callback.

However, for safety, ensure the callback route is listed. No change needed — the middleware already handles it correctly because all `/api/` routes return early at line 67.

> **Testing note:** After implementing, verify the OAuth callback works correctly by testing the full flow. The session cookie uses `SameSite=Lax`, which should allow it to be sent on the redirect from Strava (top-level navigation). If the callback can't read the session cookie in any browser, consider adding `/api/strava/callback` to middleware's public paths and looking up the user via a `state` parameter instead.

- [ ] **Step 4: Verify directory structure exists**

```bash
mkdir -p src/app/api/strava/connect
mkdir -p src/app/api/strava/callback
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/strava/connect/route.ts src/app/api/strava/callback/route.ts
git commit -m "feat: add Strava OAuth connect/disconnect and callback API routes"
```

---

### Task 5: Strava Activities API Routes

**Files:**
- Create: `src/app/api/strava/activities/route.ts`
- Create: `src/app/api/strava/activities/[id]/route.ts`

- [ ] **Step 1: Create the activities list endpoint**

Create `src/app/api/strava/activities/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession, getRoutesByStravaActivityIds } from "@/lib/db";
import { getValidAccessToken, fetchActivities, isCyclingWithGps } from "@/lib/strava-api";

export async function GET(request: NextRequest) {
  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Strava not connected", code: "STRAVA_NOT_CONNECTED" }, { status: 400 });
  }

  const page = Number(request.nextUrl.searchParams.get("page")) || 1;

  try {
    const activities = await fetchActivities(accessToken, page, 30);
    const cyclingActivities = activities.filter(isCyclingWithGps);

    // Check which activities are already on LOOPS
    const activityIds = cyclingActivities.map((a) => a.id);
    const existing = await getRoutesByStravaActivityIds(activityIds);
    const existingIds = new Set(existing.map((r) => r.strava_activity_id));

    const data = cyclingActivities.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      date: a.start_date,
      distance_km: Math.round((a.distance / 1000) * 10) / 10,
      elevation_gain_m: Math.round(a.total_elevation_gain),
      polyline: a.map.summary_polyline,
      already_on_loops: existingIds.has(a.id),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "RATE_LIMITED") {
      return NextResponse.json(
        { error: "Too many imports. Try again in a few minutes.", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Strava is temporarily unavailable. Try again or upload a file instead.", code: "STRAVA_ERROR" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: Create the activity detail + GPS endpoint**

Create `src/app/api/strava/activities/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession } from "@/lib/db";
import { getValidAccessToken, fetchActivity, fetchActivityStreams, mapStravaDiscipline } from "@/lib/strava-api";
import { calculateStats } from "@/lib/geo-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Strava not connected", code: "STRAVA_NOT_CONNECTED" }, { status: 400 });
  }

  const { id } = await params;
  const activityId = Number(id);

  try {
    const [activity, streams] = await Promise.all([
      fetchActivity(accessToken, activityId),
      fetchActivityStreams(accessToken, activityId),
    ]);

    const coordinates: [number, number][] = streams.latlng?.data ?? [];
    const elevations: number[] = streams.altitude?.data ?? [];

    if (coordinates.length === 0) {
      return NextResponse.json(
        { error: "This activity has no GPS data.", code: "NO_GPS" },
        { status: 400 }
      );
    }

    const stats = calculateStats(coordinates, elevations);

    const data = {
      strava_activity_id: activity.id,
      name: activity.name,
      discipline: mapStravaDiscipline(activity.type),
      distance_km: Math.round(stats.distance_km * 10) / 10,
      elevation_gain_m: Math.round(stats.elevation_gain_m),
      elevation_loss_m: Math.round(stats.elevation_loss_m),
      coordinates,
      start_lat: coordinates[0][0],
      start_lng: coordinates[0][1],
    };

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "RATE_LIMITED") {
      return NextResponse.json(
        { error: "Too many imports. Try again in a few minutes.", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch activity from Strava.", code: "STRAVA_ERROR" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 3: Verify calculateStats return properties**

Before committing, check `src/lib/geo-utils.ts` to confirm `calculateStats()` returns `{ distance_km, elevation_gain_m, elevation_loss_m }`. The activity detail endpoint uses these exact property names. Run:
```bash
grep -A5 "function calculateStats" src/lib/geo-utils.ts
```
If the property names differ (e.g., `distanceKm` vs `distance_km`), update the activity detail endpoint to match.

- [ ] **Step 4: Create directories**

```bash
mkdir -p src/app/api/strava/activities/\[id\]
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/strava/activities/
git commit -m "feat: add Strava activities list and detail API endpoints"
```

---

## Chunk 3: Difficulty Removal (Platform Sweep)

### Task 6: Difficulty Removal — Database & API Layer

**Files:**
- Modify: `src/lib/db.ts` — remove difficulty from queries, filters, stats functions
- Modify: `src/app/api/routes/route.ts` — remove difficulty validation and filter
- Modify: `src/app/api/stats/route.ts` — remove difficulty from stats
- Modify: `src/app/api/og/[id]/route.tsx` — remove difficulty badge from OG images
- Modify: `src/config/constants.ts` — remove DIFFICULTIES constant

- [ ] **Step 1: Remove difficulty from getRoutes filtering in db.ts**

In the `getRoutes` function, remove the difficulty filter block (~lines 309-312):
```typescript
if (filters.difficulty) {
  conditions.push(`r.difficulty = $${idx++}`);
  params.push(filters.difficulty);
}
```

- [ ] **Step 2: Remove difficulty from getCountryStats and getRegionStats in db.ts**

In `getCountryStats` (~line 954), remove `difficulties` from the return type and the `difficultyRows` query:
- Remove `difficulties: string[];` from the return type
- Remove the `difficultyRows` query (~lines 981-984)
- Remove `difficulties: difficultyRows.map((r) => r.difficulty),` from the return object (~line 1000)

Do the same for `getRegionStats` (~line 1006):
- Remove `difficulties: string[];` from the return type
- Remove the `difficultyRows` query (~lines 1035-1038)
- Remove `difficulties: difficultyRows.map((r) => r.difficulty),` from the return object (~line 1045)

- [ ] **Step 3: Remove difficulty index from migrateDb**

Remove this line from `migrateDb()`:
```typescript
await sql`CREATE INDEX IF NOT EXISTS idx_routes_difficulty ON routes(difficulty)`;
```

- [ ] **Step 4: Remove DIFFICULTIES from constants.ts**

In `src/config/constants.ts`, remove:
```typescript
export const DIFFICULTIES = ["easy", "moderate", "hard", "expert"] as const;
```

- [ ] **Step 5: Remove difficulty from API routes**

In `src/app/api/routes/route.ts`:
- **GET handler**: Remove the `difficulty` query parameter extraction and filter (where `filters.difficulty` is set)
- **POST handler**: Remove the difficulty validation check (~line 103):
  ```typescript
  if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) { ... }
  ```
  Remove `difficulty` from the FormData extraction. Set `difficulty: null` in the `insertRoute` call.
  Remove the `DIFFICULTIES` import from constants.

In `src/app/api/stats/route.ts`:
- Remove `difficulty` from the featured routes SELECT query if present

In `src/app/api/og/[id]/route.tsx`:
- Remove the `DIFF_COLORS` object (~lines 6-11)
- Remove the difficulty badge rendering (~lines 143-156) from the OG image JSX

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/app/api/routes/route.ts src/app/api/stats/route.ts src/app/api/og/[id]/route.tsx src/config/constants.ts
git commit -m "feat: remove difficulty from database queries, API routes, and config"
```

---

### Task 7: Difficulty Removal — Components

**Files:**
- Modify: `src/components/FilterSidebar.tsx` — remove difficulty filter
- Modify: `src/components/RouteCard.tsx` — remove difficulty from interface
- Modify: `src/components/ShareRide.tsx` — remove difficulty from share text
- Modify: `src/components/RouteFaq.tsx` — remove difficulty FAQ
- Modify: `src/components/RelatedRoutes.tsx` — remove difficulty badge
- Modify: `src/components/MapView.tsx` — remove difficulty color coding

- [ ] **Step 1: Remove difficulty filter from FilterSidebar.tsx**

Remove the entire difficulty filter `<div>` block (~lines 127-136):
```jsx
<div>
  <label ...>Difficulty</label>
  <select value={filters.difficulty} onChange={(e) => onChange("difficulty", e.target.value)} ...>
    <option value="">All difficulties</option>
    ...
  </select>
</div>
```

Also remove difficulty from the legend section (~lines 176-193) showing Easy/Moderate/Hard/Expert color descriptions.

Remove `difficulty` from the filters interface/type if defined in this component.

- [ ] **Step 2: Remove difficulty from RouteCard.tsx**

Remove `difficulty: string;` from the Route interface (~line 11).

- [ ] **Step 3: Remove difficulty from ShareRide.tsx**

Remove difficulty from the share text construction (~lines 53, 66, 175). Replace any string like `${difficulty} · ${surface}` with just `${surface}` or remove the difficulty part.

Remove `difficulty` from the component's props/interface if it's a prop.

- [ ] **Step 4: Remove difficulty FAQ from RouteFaq.tsx**

Remove the "What difficulty is..." FAQ question (~lines 47-49) and the `DIFFICULTY_CONTEXT` map with easy/moderate/hard/expert descriptions.

- [ ] **Step 5: Remove difficulty from RelatedRoutes.tsx**

Remove the `DIFF_COLORS` object (~lines 20-25) and the difficulty badge rendering (~lines 55-60).

- [ ] **Step 6: Remove difficulty from MapView.tsx**

Remove the `DIFFICULTY_COLORS` object (~lines 20-25).

Change the color assignment from:
```typescript
const color = DIFFICULTY_COLORS[route.difficulty] || "#666";
```
to use discipline-based colors instead:
```typescript
const DISCIPLINE_COLORS: Record<string, string> = {
  road: "#ffbb00",
  gravel: "#ff6633",
  mtb: "#bb44ff",
};
const color = DISCIPLINE_COLORS[route.discipline] || "#666";
```

Remove `difficulty` from the Route interface in this file (~line in the interface).

- [ ] **Step 7: Commit**

```bash
git add src/components/FilterSidebar.tsx src/components/RouteCard.tsx src/components/ShareRide.tsx src/components/RouteFaq.tsx src/components/RelatedRoutes.tsx src/components/MapView.tsx
git commit -m "feat: remove difficulty from all components"
```

---

### Task 8: Difficulty Removal — Pages

**Files:**
- Modify: `src/app/routes/[id]/page.tsx` — remove difficulty display
- Modify: `src/app/routes/[id]/layout.tsx` — remove difficulty from SEO
- Modify: `src/app/login/page.tsx` — remove difficulty badges
- Modify: `src/app/admin/page.tsx` — remove difficulty column
- Modify: `src/app/profile/[id]/page.tsx` — remove difficulty badges
- Modify: `src/app/routes/country/[country]/page.tsx` — remove difficulty from stats/FAQ
- Modify: `src/app/routes/country/[country]/[region]/page.tsx` — remove difficulty from display
- Modify: `src/app/_components/HomeClient.tsx` — remove difficulty from Route interface
- Modify: `src/app/upload/page.tsx` — remove difficulty selector

- [ ] **Step 1: Remove difficulty from route detail page (routes/[id]/page.tsx)**

- Remove the `DIFF` color map (~lines 51-56)
- Remove `difficulty` from the Route interface in this file (~line in interface)
- Remove the difficulty badge rendering (~lines 357-362)
- Remove any `diff` variable assignment like `const diff = DIFF[route.difficulty]`

- [ ] **Step 2: Remove difficulty from route layout SEO (routes/[id]/layout.tsx)**

In `generateMetadata()`, remove `${route.difficulty}` from the title string (~line 19):
```typescript
// Change from:
const title = `${route.name} — ${route.distance_km}km ${route.difficulty} ${route.discipline} route in ${location}, ${route.country} | LOOPS`;
// To:
const title = `${route.name} — ${route.distance_km}km ${route.discipline} route in ${location}, ${route.country} | LOOPS`;
```

Do the same for the description string (~line 21-22) — remove `${route.difficulty}`.

- [ ] **Step 3: Remove difficulty from login page (login/page.tsx)**

- Remove the `DIFF_COLORS` object (~lines 82-87)
- Remove difficulty badge rendering from featured route cards (~lines 366-371)

- [ ] **Step 4: Remove difficulty from admin page (admin/page.tsx)**

- Remove `difficulty: string;` from the RouteRow interface (~line 31)
- Remove the difficulty column from the admin table (~line 384)

- [ ] **Step 5: Remove difficulty from profile page (profile/[id]/page.tsx)**

- Remove difficulty styles (~lines 60-65)
- Remove difficulty badge from route cards (~lines 549-554)

- [ ] **Step 6: Remove difficulty from country page (routes/country/[country]/page.tsx)**

- Remove `stats.difficulties` reference from the FAQ answer (~line 70)
- Remove difficulty badges from route cards (~lines 171-176)
- Update the FAQ answer to remove "across X difficulty levels" text

- [ ] **Step 7: Remove difficulty from region page (routes/country/[country]/[region]/page.tsx)**

- Remove difficulty display from route cards (~lines 156-161)

- [ ] **Step 8: Remove difficulty from HomeClient.tsx**

- Remove `difficulty: string;` from the Route interface (~line 18)

- [ ] **Step 9: Remove difficulty selector from upload page (upload/page.tsx)**

- Remove the difficulty `<select>` element (~lines 381-396)
- Remove `difficulty: "moderate"` from the initial form state (~line 39)
- Remove difficulty from the FormData append when submitting

- [ ] **Step 10: Commit**

```bash
git add src/app/
git commit -m "feat: remove difficulty from all pages — route detail, login, admin, profile, country, upload"
```

---

### Task 9: Difficulty Removal — SEO, CSS & Static Files

**Files:**
- Modify: `src/lib/seo.ts` — remove difficulty from JSON-LD
- Modify: `src/app/globals.css` — remove difficulty stripe classes
- Modify: `public/llms.txt` — remove difficulty from description
- Modify: `scripts/seed.ts` — remove difficulty from seed data
- Modify: `scripts/add-mallorca-routes.mjs` — remove difficulty
- Modify: `scripts/add-girona-routes.mjs` — remove difficulty

- [ ] **Step 1: Remove difficulty from seo.ts**

In `generateRouteJsonLd()`:
- Remove `difficulty` from the `RouteJsonLdInput` interface
- Remove the difficulty `additionalProperty` entry (~line 60):
  ```typescript
  { name: "Difficulty", value: route.difficulty.charAt(0).toUpperCase() + route.difficulty.slice(1) }
  ```

- [ ] **Step 2: Remove difficulty stripe CSS classes from globals.css**

Remove these lines (~256-260):
```css
/* ── Difficulty stripe colors using variables ── */
.difficulty-stripe-easy { border-left: 3px solid var(--success); }
.difficulty-stripe-moderate { border-left: 3px solid var(--warning); }
.difficulty-stripe-hard { border-left: 3px solid var(--danger); }
.difficulty-stripe-expert { border-left: 3px solid var(--purple); }
```

- [ ] **Step 3: Update llms.txt**

In `public/llms.txt`, change the "Route Data Available" line from:
```
Each route includes: name, description, difficulty (easy/moderate/hard/expert), distance (km), ...
```
to:
```
Each route includes: name, description, distance (km), elevation gain (m), surface type (gravel/mixed/trail/road), discipline (road/gravel/mtb), county, country, region, GPS coordinates, community ratings, user comments, condition reports, and free GPX file download.
```

- [ ] **Step 4: Update seed scripts (non-blocking but clean)**

In `scripts/seed.ts`, `scripts/add-mallorca-routes.mjs`, `scripts/add-girona-routes.mjs`:
- Remove `difficulty` from the route objects/manifests
- Remove `difficulty` from the INSERT statements (or set to NULL)

These scripts are only run manually so this is low priority but keeps the codebase clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo.ts src/app/globals.css public/llms.txt scripts/
git commit -m "feat: remove difficulty from SEO, CSS, static files, and seed scripts"
```

---

### Task 10: Build Verification After Difficulty Removal

**Files:** None (verification only)

- [ ] **Step 1: Run the build to verify all difficulty references are resolved**

```bash
npx next build 2>&1 | tail -50
```

Expected: Build succeeds with no TypeScript errors about `difficulty`.

- [ ] **Step 2: Fix any remaining references**

Search for any lingering difficulty references:
```bash
grep -rn "difficulty" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

The only remaining references should be in `db.ts` (the column exists in the schema but is nullable) and possibly the migration ALTER statements. Fix any other references found.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve remaining difficulty references after removal"
```

---

## Chunk 4: Strava UI Components & Upload Integration

### Task 11: StravaConnectButton Component

**Files:**
- Create: `src/components/StravaConnectButton.tsx`

- [ ] **Step 1: Create the Strava connect/disconnect button component**

Create `src/components/StravaConnectButton.tsx`:

```typescript
"use client";

import { useState } from "react";

interface StravaConnectButtonProps {
  isConnected: boolean;
  returnTo?: string;
  onDisconnected?: () => void;
}

export default function StravaConnectButton({ isConnected, returnTo = "/upload", onDisconnected }: StravaConnectButtonProps) {
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/strava/connect", { method: "DELETE" });
      if (res.ok) {
        onDisconnected?.();
      }
    } catch {
      // Silently fail — user can try again
    } finally {
      setDisconnecting(false);
    }
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          ✓ Strava connected
        </span>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          style={{
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            opacity: disconnecting ? 0.5 : 1,
          }}
        >
          {disconnecting ? "Disconnecting..." : "Disconnect"}
        </button>
      </div>
    );
  }

  return (
    <a
      href={`/api/strava/connect?returnTo=${encodeURIComponent(returnTo)}`}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white transition-colors"
      style={{ background: "#FC4C02" }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
        <path d="M6.8 12.8L8.4 9.2H6L9.6 2H11.2L9.2 6.8H11.6L6.8 12.8Z" />
      </svg>
      Connect with Strava
    </a>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StravaConnectButton.tsx
git commit -m "feat: add StravaConnectButton component with connect/disconnect"
```

---

### Task 12: StravaActivityBrowser Component

**Files:**
- Create: `src/components/StravaActivityBrowser.tsx`

- [ ] **Step 1: Create the activity browser component**

Create `src/components/StravaActivityBrowser.tsx`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

interface StravaActivityItem {
  id: number;
  name: string;
  type: string;
  date: string;
  distance_km: number;
  elevation_gain_m: number;
  polyline: string | null;
  already_on_loops: boolean;
}

interface StravaActivityBrowserProps {
  onImport: (activityId: number) => void;
  importing: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  Ride: "Road",
  GravelRide: "Gravel",
  MountainBikeRide: "MTB",
  EBikeRide: "E-Bike",
};

const TYPE_COLORS: Record<string, string> = {
  Ride: "var(--warning)",
  GravelRide: "var(--accent)",
  MountainBikeRide: "var(--purple)",
  EBikeRide: "var(--success)",
};

export default function StravaActivityBrowser({ onImport, importing }: StravaActivityBrowserProps) {
  const [activities, setActivities] = useState<StravaActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (pageNum: number) => {
    try {
      const res = await fetch(`/api/strava/activities?page=${pageNum}`);
      const json = await res.json();

      if (!res.ok) {
        if (json.code === "STRAVA_NOT_CONNECTED") {
          setError("Strava disconnected — reconnect to import.");
        } else if (json.code === "RATE_LIMITED") {
          setError("Too many imports. Try again in a few minutes.");
        } else {
          setError(json.error || "Failed to load activities.");
        }
        return;
      }

      const newActivities = json.data as StravaActivityItem[];
      if (newActivities.length < 30) setHasMore(false);

      setActivities((prev) => pageNum === 1 ? newActivities : [...prev, ...newActivities]);
    } catch {
      setError("Strava is temporarily unavailable. Try again or upload a file instead.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage);
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Loading Strava activities...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 px-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 px-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No cycling activities found on Strava.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-2">
        {activities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => onImport(activity.id)}
            disabled={importing !== null}
            className="w-full text-left px-4 py-3 rounded-xl transition-colors flex items-center justify-between gap-3"
            style={{
              background: importing === activity.id ? "var(--surface-hover)" : "var(--surface)",
              border: `1px solid ${importing === activity.id ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold truncate">{activity.name}</span>
                <span
                  className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                  style={{ color: TYPE_COLORS[activity.type] || "var(--text-muted)", background: "var(--bg)" }}
                >
                  {TYPE_LABELS[activity.type] || activity.type}
                </span>
                {activity.already_on_loops && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: "var(--success)", background: "rgba(0,255,136,0.1)" }}>
                    On LOOPS
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>{new Date(activity.date).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span>{activity.distance_km} km</span>
                <span>{activity.elevation_gain_m}m ↑</span>
              </div>
            </div>
            {importing === activity.id && (
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            )}
          </button>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
        >
          Load more activities
        </button>
      )}

      <p className="text-center text-[10px] mt-3" style={{ color: "var(--text-muted)" }}>
        Powered by Strava
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StravaActivityBrowser.tsx
git commit -m "feat: add StravaActivityBrowser component with activity cards and load more"
```

---

### Task 13: Upload Page — Strava Integration

**Files:**
- Modify: `src/app/upload/page.tsx` — add Strava import section with connect button and activity browser

- [ ] **Step 1: Add Strava imports to upload page**

Add these imports at the top of `src/app/upload/page.tsx`:
```typescript
import StravaConnectButton from "@/components/StravaConnectButton";
import StravaActivityBrowser from "@/components/StravaActivityBrowser";
```

- [ ] **Step 2: Add Strava state to the upload page**

Add state variables for Strava (near the other useState declarations):
```typescript
const [stravaConnected, setStravaConnected] = useState(false);
const [importingActivity, setImportingActivity] = useState<number | null>(null);
const [showStravaImport, setShowStravaImport] = useState(false);
```

- [ ] **Step 3: Check Strava connection status on load**

Instead of making an API call to check Strava status, pass `strava_id` as a server prop or read it from the auth context. The upload page already fetches the user's session — check `user.strava_id` to determine connection status.

If the upload page is a server component that passes user data to a client child, pass `hasStrava: !!user.strava_id` as a prop. If it's fully client-side using auth context, read from there.

Add a useEffect for URL param handling only:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("strava_connected") === "true") {
    setStravaConnected(true);
    setShowStravaImport(true);
    window.history.replaceState({}, "", "/upload");
  }
  if (params.get("strava_error")) {
    window.history.replaceState({}, "", "/upload");
  }
}, []);
```

Initialize `stravaConnected` from the user prop/context instead of defaulting to `false`:
```typescript
const [stravaConnected, setStravaConnected] = useState(!!user?.strava_id);
```

- [ ] **Step 4: Add Strava import handler**

Add an async handler for importing a Strava activity:

```typescript
async function handleStravaImport(activityId: number) {
  setImportingActivity(activityId);
  try {
    const res = await fetch(`/api/strava/activities/${activityId}`);
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Import failed. Try again.");
      return;
    }
    const d = json.data;
    // Pre-fill the form with Strava data
    setForm((prev) => ({
      ...prev,
      name: d.name,
      discipline: d.discipline,
      surface_type: d.discipline === "mtb" ? "trail" : d.discipline === "gravel" ? "gravel" : "road",
      country: "",   // Will be set from geo lookup or user
      region: "",
    }));
    // Store the parsed route data for submission
    setParsedRoute({
      coordinates: d.coordinates,
      distance_km: d.distance_km,
      elevation_gain_m: d.elevation_gain_m,
      elevation_loss_m: d.elevation_loss_m,
      start_lat: d.start_lat,
      start_lng: d.start_lng,
      strava_activity_id: d.strava_activity_id,
    });
    setShowStravaImport(false);
    setStep("details"); // or whatever the form step is called
  } catch {
    alert("Import failed. Try again.");
  } finally {
    setImportingActivity(null);
  }
}
```

- [ ] **Step 5: Add Strava section to the upload page UI**

Add a section before or above the file upload area. The exact placement depends on the current layout, but add something like:

```tsx
{/* Strava Import Section */}
<div className="mb-6 p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-bold">Import from Strava</h3>
    <StravaConnectButton
      isConnected={stravaConnected}
      returnTo="/upload"
      onDisconnected={() => {
        setStravaConnected(false);
        setShowStravaImport(false);
      }}
    />
  </div>

  {stravaConnected ? (
    showStravaImport ? (
      <StravaActivityBrowser
        onImport={handleStravaImport}
        importing={importingActivity}
      />
    ) : (
      <button
        onClick={() => setShowStravaImport(true)}
        className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
        style={{ color: "var(--accent)", border: "1px dashed var(--border)" }}
      >
        Browse Strava activities
      </button>
    )
  ) : (
    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
      Import your rides directly from Strava — no file download needed.
    </p>
  )}
</div>
```

- [ ] **Step 6: Update form submission to include strava_activity_id**

In the form submission handler, when building the FormData, add:
```typescript
if (parsedRoute?.strava_activity_id) {
  formData.append("strava_activity_id", String(parsedRoute.strava_activity_id));
}
```

- [ ] **Step 7: Update the API route to accept strava_activity_id**

In `src/app/api/routes/route.ts` POST handler, extract `strava_activity_id` from FormData:
```typescript
const stravaActivityId = formData.get("strava_activity_id") as string | null;
```

And pass it to `insertRoute`:
```typescript
strava_activity_id: stravaActivityId ? Number(stravaActivityId) : null,
```

- [ ] **Step 8: Commit**

```bash
git add src/app/upload/page.tsx src/app/api/routes/route.ts
git commit -m "feat: integrate Strava import into upload page with activity browser"
```

---

### Task 14: Profile Settings — Strava Connect/Disconnect

**Files:**
- Modify: `src/app/profile/edit/page.tsx` — add Strava connection section

- [ ] **Step 1: Add Strava section to profile edit page**

Import StravaConnectButton:
```typescript
import StravaConnectButton from "@/components/StravaConnectButton";
```

Add a "Connected Accounts" section to the settings form (after the avatar or speed settings):

```tsx
{/* Connected Accounts */}
<div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--border)" }}>
  <h3 className="text-sm font-bold mb-3">Connected Accounts</h3>
  <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
    <div>
      <p className="text-sm font-medium">Strava</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Import rides directly from Strava</p>
    </div>
    <StravaConnectButton
      isConnected={!!user?.strava_id}
      returnTo="/profile/edit"
      onDisconnected={() => window.location.reload()}
    />
  </div>
</div>
```

The exact integration depends on how the profile edit page accesses the user object. Check if `user` is available from the auth context or fetched separately.

- [ ] **Step 2: Commit**

```bash
git add src/app/profile/edit/page.tsx
git commit -m "feat: add Strava connect/disconnect to profile settings"
```

---

## Chunk 5: Final Verification & CLAUDE.md Update

### Task 15: Build & Deploy Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full build**

```bash
npx next build 2>&1 | tail -50
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run the test suite**

```bash
npm test 2>&1 | tail -30
```

Expected: Tests pass (some may need updating if they reference difficulty).

- [ ] **Step 3: Verify Strava env vars are documented**

Ensure `.env.example` or `.env.local.example` includes:
```
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=https://www.loops.ie/api/strava/callback
```

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: final build verification and env var documentation"
```

---

### Task 16: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md to reflect changes**

Update the following sections:

**Live URL**: Change from `https://gravel-ireland.vercel.app/` to `https://www.loops.ie/`

**Auth section**: Add "Strava (data import only, not auth)"

**Project Structure**: Add under `lib/`:
```
strava-api.ts        # Strava OAuth & API client
```

Add under `api/`:
```
strava/        # Strava OAuth connect/callback + activity endpoints
```

**Database Schema**: Update routes description — remove "difficulty (easy/moderate/hard/expert)" from the list. Add "strava_activity_id (optional, for Strava imports)".

Add to **Known Technical Debt**:
```
- Strava rate limits not tracked globally (100/15min, 1000/day)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Strava import, difficulty removal, live URL"
```
