/**
 * What the public may see of a route. Owner decisions:
 *  - "No public route attribution — routes are facts; operator_name/url in
 *    the DB are private provenance only, never displayed."
 *  - Social features hidden for launch: no creator names/avatars/ratings.
 * Every public API response carrying a route row goes through this, so a
 * new DB column never leaks by default through `SELECT r.*`.
 */
const PRIVATE_ROUTE_FIELDS = [
  "operator_name",
  "operator_url",
  "creator_name",
  "creator_avatar",
  "creator_rating",
  "creator_rating_count",
  "strava_activity_id",
  // Ratings are a social feature, hidden for launch.
  "avg_rating",
  "avg_score",
  "rating_count",
] as const;

export function publicRoute<T extends Record<string, unknown>>(route: T): T {
  const out: Record<string, unknown> = { ...route };
  for (const k of PRIVATE_ROUTE_FIELDS) delete out[k];
  return out as T;
}

/** The fields a route card renders — nothing else crosses to the browser. */
const CARD_FIELDS = [
  "id", "slug", "name", "description", "distance_km", "elevation_gain_m", "elevation_loss_m",
  "discipline", "surface_type", "difficulty", "county", "region", "country", "start_lat", "start_lng",
  "is_verified", "verified", "avg_score", "avg_rating", "rating_count", "estimated_minutes",
  "distance_km_away", "haversine_distance", "cover_photo", "created_at",
] as const;

export function routeCard<T extends Record<string, unknown>>(route: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CARD_FIELDS) if (k in route) out[k] = route[k];
  return out;
}

/**
 * Thin a stored track (JSON string of [lat,lng(,ele)]) to at most `max`
 * points for list maps — a full 8,000-point track per card made the home
 * feed 826 KB and a country page 3 MB.
 */
export function thinCoordinates(coordinates: unknown, max = 150): string | unknown {
  try {
    const raw = typeof coordinates === "string" ? JSON.parse(coordinates) : coordinates;
    if (!Array.isArray(raw) || raw.length <= max) return typeof coordinates === "string" ? coordinates : JSON.stringify(raw);
    const step = Math.ceil(raw.length / max);
    const out = raw.filter((_: unknown, i: number) => i % step === 0 || i === raw.length - 1).map((c: number[]) => [c[0], c[1]]);
    return JSON.stringify(out);
  } catch {
    return coordinates;
  }
}
