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
] as const;

export function publicRoute<T extends Record<string, unknown>>(route: T): T {
  const out: Record<string, unknown> = { ...route };
  for (const k of PRIVATE_ROUTE_FIELDS) delete out[k];
  return out as T;
}
