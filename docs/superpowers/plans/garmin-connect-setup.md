# Garmin Connect API — Setup (owner action)

The code side of one-tap "Send to Garmin" is fully built (src/lib/garmin.ts,
/api/garmin/*, SendToGarmin component on generated candidates). It activates
itself when credentials exist — no deploy needed beyond setting env vars.

## Steps for Anthony

1. Apply at https://developer.garmin.com/gc-developer-program/ — request the
   **Training API** (includes the Courses API for pushing courses). Describe
   LOOPS as a route-planning web app pushing cycling courses with course
   points to riders' accounts. Approval typically takes days–weeks; free.
2. Once approved, create an app in the developer portal. Set the OAuth
   callback to `https://www.loops.ie/api/garmin/callback`.
3. In Vercel → Project → Settings → Environment Variables add:
   - `GARMIN_CONSUMER_KEY` = (consumer key from the portal)
   - `GARMIN_CONSUMER_SECRET` = (consumer secret)
4. Redeploy. The "Connect Garmin" / "Send to Garmin" buttons appear
   automatically on generated routes.

## Before launch (dev task, ~1 hour once keys exist)

The integration was written against Garmin's documented API shape but has
NOT been exercised against their sandbox (impossible without credentials).
With keys in hand: connect a test account, push one plain course and one
workout course, and confirm on an Edge that course-point alerts fire.
Adjust field names in src/lib/garmin.ts `pushCourse` if the partner docs
differ — everything else (OAuth flow, token storage, UI states) is stable.

## Wahoo / Hammerhead (later)

Wahoo's Cloud API (OAuth2, `/v1/routes`) is the next target — same
SendToGarmin component pattern, separate token table column.
