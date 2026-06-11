/**
 * Garmin Connect Integration — Courses API push (Komoot-rival roadmap #1)
 *
 * One-tap "Send to Garmin": pushes a route as a course into the rider's
 * Garmin Connect account, where it syncs to their Edge automatically.
 * Course points (workout effort markers, climbs) are included so the
 * head unit alerts on course.
 *
 * The Garmin Connect Developer Program uses OAuth 1.0a (HMAC-SHA1).
 * Set GARMIN_CONSUMER_KEY + GARMIN_CONSUMER_SECRET once the application
 * is approved (see docs/superpowers/plans/garmin-connect-setup.md) — the
 * feature switches on with no code changes. Until then isGarminEnabled()
 * is false and the UI shows nothing.
 *
 * NOTE: built against the documented API shape but NOT yet exercised
 * against Garmin's sandbox (needs approved credentials). Run one manual
 * push against the partner sandbox before launch.
 */

import crypto from "crypto";

const REQUEST_TOKEN_URL = "https://connectapi.garmin.com/oauth-service/oauth/request_token";
const AUTHORIZE_URL = "https://connect.garmin.com/oauthConfirm";
const ACCESS_TOKEN_URL = "https://connectapi.garmin.com/oauth-service/oauth/access_token";
const COURSES_URL = "https://apis.garmin.com/training-api/courses/v1/course";

export function isGarminEnabled(): boolean {
  return Boolean(process.env.GARMIN_CONSUMER_KEY && process.env.GARMIN_CONSUMER_SECRET);
}

// ── OAuth 1.0a signing ───────────────────────────────────────────────────────

function pctEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

interface OAuthParams {
  [key: string]: string;
}

function signRequest(
  method: string,
  url: string,
  extraParams: OAuthParams,
  tokenSecret = ""
): string {
  const consumerKey = process.env.GARMIN_CONSUMER_KEY ?? "";
  const consumerSecret = process.env.GARMIN_CONSUMER_SECRET ?? "";

  const oauth: OAuthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    ...extraParams,
  };

  const baseParams = Object.keys(oauth)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(oauth[k])}`)
    .join("&");
  const baseString = [method.toUpperCase(), pctEncode(url), pctEncode(baseParams)].join("&");
  const signingKey = `${pctEncode(consumerSecret)}&${pctEncode(tokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  const header: OAuthParams = { ...oauth, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(header)
      .sort()
      .map((k) => `${pctEncode(k)}="${pctEncode(header[k])}"`)
      .join(", ")
  );
}

function parseFormBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of body.split("&")) {
    const [k, v] = pair.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return out;
}

// ── OAuth flow ───────────────────────────────────────────────────────────────

export async function getRequestToken(
  callbackUrl: string
): Promise<{ token: string; secret: string; authorizeUrl: string }> {
  const auth = signRequest("POST", REQUEST_TOKEN_URL, { oauth_callback: callbackUrl });
  const res = await fetch(REQUEST_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Garmin request token failed: HTTP ${res.status}`);
  const parsed = parseFormBody(await res.text());
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error("Garmin request token response malformed");
  }
  return {
    token: parsed.oauth_token,
    secret: parsed.oauth_token_secret,
    authorizeUrl: `${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(parsed.oauth_token)}`,
  };
}

export async function exchangeAccessToken(
  requestToken: string,
  requestSecret: string,
  verifier: string
): Promise<{ accessToken: string; accessSecret: string }> {
  const auth = signRequest(
    "POST",
    ACCESS_TOKEN_URL,
    { oauth_token: requestToken, oauth_verifier: verifier },
    requestSecret
  );
  const res = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Garmin access token failed: HTTP ${res.status}`);
  const parsed = parseFormBody(await res.text());
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error("Garmin access token response malformed");
  }
  return { accessToken: parsed.oauth_token, accessSecret: parsed.oauth_token_secret };
}

// ── Courses push ─────────────────────────────────────────────────────────────

export interface GarminCoursePoint {
  lat: number;
  lng: number;
  name: string;
  /** Garmin course point types: GENERIC, SUMMIT, VALLEY, WATER, FOOD, DANGER, LEFT, RIGHT, STRAIGHT, FIRST_AID, SEGMENT_START, SEGMENT_END */
  type: string;
}

export interface GarminCourse {
  name: string;
  coordinates: [number, number][]; // [lat, lng]
  elevations?: number[];
  distanceMeters: number;
  elevationGainMeters: number;
  /** road_cycling | gravel_cycling | mountain_biking */
  activityType: string;
  coursePoints?: GarminCoursePoint[];
}

export async function pushCourse(
  accessToken: string,
  accessSecret: string,
  course: GarminCourse
): Promise<{ ok: true; courseId?: string } | { ok: false; status: number; message: string }> {
  const geoPoints = course.coordinates.map(([lat, lng], i) => ({
    latitude: lat,
    longitude: lng,
    ...(course.elevations && !Number.isNaN(course.elevations[i])
      ? { elevation: Math.round(course.elevations[i] * 10) / 10 }
      : {}),
  }));

  const payload = {
    courseName: course.name.slice(0, 80),
    distance: Math.round(course.distanceMeters),
    elevationGain: Math.round(course.elevationGainMeters),
    activityType: course.activityType,
    coordinateSystem: "WGS84",
    geoPoints,
    ...(course.coursePoints && course.coursePoints.length > 0
      ? {
          coursePoints: course.coursePoints.map((p) => ({
            latitude: p.lat,
            longitude: p.lng,
            name: p.name.slice(0, 16),
            coursePointType: p.type,
          })),
        }
      : {}),
  };

  const auth = signRequest("POST", COURSES_URL, { oauth_token: accessToken }, accessSecret);
  const res = await fetch(COURSES_URL, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { courseId?: string };
    return { ok: true, courseId: body?.courseId };
  }
  const message = await res.text().catch(() => "");
  return { ok: false, status: res.status, message: message.slice(0, 300) };
}

export function disciplineToGarminActivity(discipline: string): string {
  if (discipline === "gravel") return "gravel_cycling";
  if (discipline === "mtb") return "mountain_biking";
  return "road_cycling";
}
