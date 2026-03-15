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
