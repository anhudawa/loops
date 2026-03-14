# Strava Activity Import & Difficulty Removal — Design Spec

## Goal

Reduce friction for getting rides into LOOPS by letting users import activities directly from Strava. Remove the subjective `difficulty` field platform-wide. Strava is a data source, not an identity provider — users still log in via Google OAuth or magic links.

## Scope

1. Strava OAuth connect/disconnect (data access only)
2. Activity browser with one-tap import
3. Difficulty removal across the entire platform
4. Strava API compliance (branding, rate limits, token lifecycle)

## Out of Scope

- Strava as a login method (we want email capture for marketing)
- Automatic/background sync of new activities
- Webhook-based activity push from Strava
- Bulk import of all past activities
- Surface type or country auto-detection from Strava data

## Legacy Strava Login Cleanup

The codebase has remnants of a Strava-as-login-provider flow (`upsertStravaUser()`, `getUserByStravaId()` in `db.ts`). This was never fully shipped. As part of this work:

- **Remove** `upsertStravaUser()` and `getUserByStravaId()` from `db.ts`
- **Remove** the existing `src/lib/strava.ts` (URL validation stub)
- **Reuse** the existing `strava_id` column on `users` as the athlete ID for the data connection (no rename needed — just repurpose it)
- **No user migration needed** — there are no production users who authenticated via Strava

---

## 1. Strava OAuth Flow

### Overview

Users connect their Strava account to enable activity import. This is a data connection, not authentication. Users must already be logged in to LOOPS.

### Authorization

- **Scopes requested:** `read,activity:read_all` — read-only access to all activities (including private ones)
- **OAuth flow:** Authorization Code Grant (standard Strava OAuth 2.0)
- **Connection points:** Profile settings page AND the upload page (`/upload`)

### Flow

1. User clicks "Connect Strava" → redirect to `https://www.strava.com/oauth/authorize`
2. User approves on Strava → redirects to `/api/strava/callback`
3. Callback exchanges auth code for access + refresh tokens
4. Tokens stored in `users` table → redirect user back to originating page

### Database Changes

Add columns to `users` table:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_token_expires_at BIGINT;
-- strava_id column already exists, reuse it for athlete ID
```

The existing `strava_id` column is reused to store the Strava athlete ID for the data connection.

### Token Refresh

Strava access tokens expire every 6 hours. Before any Strava API call:

1. Check `strava_token_expires_at` against current time
2. If expired, call `POST https://www.strava.com/oauth/token` with the refresh token
3. Update `strava_access_token`, `strava_refresh_token`, and `strava_token_expires_at` in the database
4. If refresh fails (user revoked on Strava's side), clear all Strava columns and surface "Strava disconnected" to the user

### Disconnect

User clicks "Disconnect Strava" → `DELETE /api/strava/connect`:

1. Call Strava's deauthorize endpoint: `POST https://www.strava.com/oauth/deauthorize`
2. Clear `strava_access_token`, `strava_refresh_token`, `strava_token_expires_at`, `strava_id` from the user record
3. Return success

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/strava/connect` | Initiate OAuth, redirect to Strava |
| GET | `/api/strava/callback` | Handle OAuth callback, store tokens |
| DELETE | `/api/strava/connect` | Disconnect, revoke token |

### Environment Variables

```
STRAVA_CLIENT_ID=<from Strava API settings>
STRAVA_CLIENT_SECRET=<from Strava API settings>
STRAVA_REDIRECT_URI=<e.g., https://www.loops.ie/api/strava/callback>
```

---

## 2. Activity Browser & Import

### Upload Page Integration

The upload page (`/upload`) gets a new section above or alongside the existing file upload:

- **If Strava is connected:** Show "Import from Strava" section with activity browser
- **If Strava is NOT connected:** Show "Connect Strava" button with brief explanation ("Import your rides directly from Strava")

### Activity Browser

Fetches the user's recent Strava activities via `GET https://www.strava.com/api/v3/athlete/activities`.

**Display per activity card:**
- Activity name
- Date
- Distance (km) and elevation gain (m)
- Mini route preview (decoded from Strava's summary polyline)
- Activity type badge (Ride / GravelRide / MountainBikeRide)
- "Already on LOOPS" badge if `strava_activity_id` exists in routes table

**Filtering:**
- Only show cycling activities (filter out runs, swims, hikes, etc.)
- Only show activities with GPS data (exclude indoor/virtual rides)

**Pagination:**
- Load 30 activities at a time (Strava's default page size)
- "Load more" button for older activities

### Import Flow

1. User taps an activity card
2. Frontend calls `GET /api/strava/activities/[id]` to fetch full activity detail + GPS stream
3. Auto-fill route creation data:
   - **Name** → Strava activity name
   - **Discipline** → mapped from Strava activity type:
     - `Ride` → `road`
     - `GravelRide` → `gravel`
     - `MountainBikeRide` → `mtb`
     - Other cycling types → default to `road`
   - **Distance** → from Strava `distance` (convert meters to km)
   - **Elevation gain/loss** → from Strava `total_elevation_gain`
   - **Coordinates** → from Strava activity stream (latlng stream)
   - **Country/county/region** → from existing reverse geocoding in `geo-utils.ts` using start coordinates
   - **Start lat/lng** → from first coordinate
4. Show pre-filled review screen — user can edit name if desired
5. User taps "Share Loop" → creates the route via existing `POST /api/routes` with `strava_activity_id` attached

### Deduplication

- Store `strava_activity_id` (BIGINT) on the `routes` table
- On the activity browser, check which activity IDs already exist in routes
- Show "Already on LOOPS" badge on those cards
- Do NOT block re-import — different riders on a group ride should both be able to share

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/strava/activities` | List user's recent Strava activities |
| GET | `/api/strava/activities/[id]` | Fetch full activity detail + GPS stream |

---

## 3. Difficulty Removal

Remove the `difficulty` field from the entire platform. Route quality is communicated through objective data: distance, elevation, surface type.

### Database Migration

The `difficulty` column has a `NOT NULL CHECK(difficulty IN ('easy','moderate','hard','expert'))` constraint. This blocks route creation if we stop sending difficulty. Migration:

```sql
ALTER TABLE routes ALTER COLUMN difficulty DROP NOT NULL;
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_difficulty_check;
ALTER TABLE routes ALTER COLUMN difficulty SET DEFAULT NULL;
```

This preserves existing data while allowing new routes without difficulty.

### Changes Required — Complete File List

**Database & API:**
| File | Change |
|------|--------|
| `src/lib/db.ts` | Remove difficulty from INSERT/SELECT queries, update `migrateDb()` with ALTER statements |
| `src/app/api/routes/route.ts` | Stop accepting/returning `difficulty` |
| `src/app/api/stats/route.ts` | Remove difficulty from stats responses |
| `src/app/api/og/[id]/route.tsx` | Remove difficulty badge from OG images |

**Pages:**
| File | Change |
|------|--------|
| `src/app/upload/page.tsx` | Remove difficulty selector from upload form |
| `src/app/routes/[id]/page.tsx` | Remove difficulty display |
| `src/app/routes/[id]/layout.tsx` | Remove difficulty from SEO title/description |
| `src/app/login/page.tsx` | Remove difficulty badges from route cards on login hero |
| `src/app/admin/page.tsx` | Remove difficulty column from admin route table |
| `src/app/profile/[id]/page.tsx` | Remove difficulty badges from profile route cards |
| `src/app/routes/country/[country]/page.tsx` | Remove difficulty from stats, FAQ |
| `src/app/routes/country/[country]/[region]/page.tsx` | Remove difficulty from stats, FAQ |
| `src/app/_components/HomeClient.tsx` | Remove `difficulty` from Route interface |

**Components:**
| File | Change |
|------|--------|
| `src/components/RouteCard.tsx` | Remove difficulty from interface (not visually rendered) |
| `src/components/ShareRide.tsx` | Remove difficulty from share text |
| `src/components/RouteFaq.tsx` | Remove "What difficulty is..." FAQ |
| `src/components/RelatedRoutes.tsx` | Remove difficulty badge from related route cards |
| `src/components/MapView.tsx` | Remove difficulty from route color coding and popup labels |
| `src/components/FilterSidebar.tsx` | Remove difficulty filter dropdown |

**SEO & Config:**
| File | Change |
|------|--------|
| `src/lib/seo.ts` | Remove difficulty from JSON-LD generators |
| `src/config/constants.ts` | Remove `DIFFICULTIES` constant |
| `src/app/globals.css` | Remove `.difficulty-stripe-*` classes |
| `public/llms.txt` | Remove difficulty from route description |

**Dev/Seed Scripts (non-blocking but should be updated):**
| File | Change |
|------|--------|
| `scripts/seed.ts` | Remove hardcoded difficulty values |
| `scripts/add-*.mjs` | Remove difficulty from seed data |

---

## 4. Strava API Compliance

### Branding

- Display "Powered by Strava" logo/text on the activity browser (Strava API Agreement requirement)
- Use Strava's brand assets per their guidelines (orange connect button, attribution)

### Rate Limits

- 100 requests per 15 minutes per application
- 1,000 requests per day per application
- For beta (<50 users), this is sufficient
- If rate limited, show: "Too many imports right now. Try again in a few minutes."

### Data Handling

- Don't cache or store the activity list — fetch fresh each time the user opens the browser
- GPS coordinates from imported activities become LOOPS route data (this is fine per Strava's terms)
- Store only `strava_activity_id` as a reference, not the full Strava activity payload

### Error Handling

| Scenario | User-Facing Message |
|----------|-------------------|
| Strava API down | "Strava is temporarily unavailable. Try again or upload a file instead." |
| Token revoked externally | Clear tokens, show "Strava disconnected — reconnect to import." |
| Activity has no GPS | Don't show in activity list (filter client-side) |
| Rate limited | "Too many imports. Try again in a few minutes." |
| Network error during import | "Import failed. Try again." |
| OAuth cancelled by user | Redirect back to upload page, no error |

---

## File Impact Summary

### New Files
- `src/app/api/strava/connect/route.ts` — OAuth initiation + disconnect
- `src/app/api/strava/callback/route.ts` — OAuth callback
- `src/app/api/strava/activities/route.ts` — List activities
- `src/app/api/strava/activities/[id]/route.ts` — Activity detail + GPS
- `src/lib/strava-api.ts` — Strava API client (token refresh, activity fetching, type mapping)
- `src/components/StravaActivityBrowser.tsx` — Activity browser UI
- `src/components/StravaConnectButton.tsx` — Connect/disconnect button

### Modified Files — Strava Import
- `src/lib/db.ts` — Add Strava token CRUD, add `strava_activity_id` to route queries, remove `upsertStravaUser()`/`getUserByStravaId()`, update `migrateDb()`
- `src/app/upload/page.tsx` — Add Strava import section + connect button
- `src/app/profile/edit/page.tsx` — Add Strava connect/disconnect in settings
- `src/app/api/routes/route.ts` — Accept `strava_activity_id` on route creation
- `middleware.ts` — Add `/api/strava/callback` to public paths (OAuth redirect arrives without session context). All other `/api/strava/*` routes require auth (handled by existing API rate limiting)

### Removed Files
- `src/lib/strava.ts` — Legacy URL validation stub, replaced by `strava-api.ts`

### Modified Files — Difficulty Removal
See Section 3 for the complete file list (25+ files).

### Database Migration

```sql
-- Strava: add token columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_token_expires_at BIGINT;

-- Strava: add activity reference to routes
ALTER TABLE routes ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT;

-- Difficulty: relax NOT NULL constraint
ALTER TABLE routes ALTER COLUMN difficulty DROP NOT NULL;
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_difficulty_check;
ALTER TABLE routes ALTER COLUMN difficulty SET DEFAULT NULL;
```
