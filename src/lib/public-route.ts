import { SOCIAL_FEATURES_ENABLED } from "@/config/constants";

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
  // The uploader's user id: attribution, and a user identifier.
  "created_by",
  "creator_name",
  "creator_avatar",
  "creator_rating",
  "creator_rating_count",
  "strava_activity_id",
  // Ratings are a social feature, hidden for launch.
  "avg_rating",
  "avg_score",
  "rating_count",
  "comment_count",
  "is_favourited",
  "favourite_count",
] as const;

export function publicRoute<T extends Record<string, unknown>>(route: T): T {
  const out: Record<string, unknown> = withPublicDescription({ ...route });
  for (const k of PRIVATE_ROUTE_FIELDS) delete out[k];
  return out as T;
}

/**
 * Operators whose public routes seeded the library (scripts/hub-data/*.json
 * `operator_name`, scripts/add-eat-sleep-cycle-routes.mjs). A route's own
 * operator_name is always checked too; this list catches rows where the
 * column is empty or a description names a different operator.
 * Keep it to businesses: event names ("La Traka") are route facts.
 */
export const KNOWN_OPERATOR_NAMES = ["Eat Sleep Cycle", "Epic Road Rides"] as const;

/** Our own brand is never "attribution". */
const NEVER_STRIP = new Set(["loops", "roadman", "roadman cycling"]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove every sentence that names a route operator ("Curated by Eat Sleep
 * Cycle.", "A signature Eat Sleep Cycle route…") and tidy what is left.
 * Owner decision: no public route attribution. Pure; safe on null.
 *
 * `routeName` guards event routes: when the operator IS the route's subject
 * (operator "La Traka", route "La Traka 100") the sentence is a fact, not a
 * credit, so that operator is not stripped for that route.
 */
export function stripOperatorAttribution(
  description: string | null | undefined,
  operatorName?: string | null,
  routeName?: string | null,
): string | null {
  if (description == null) return null;
  const names = new Set<string>();
  for (const n of [operatorName, ...KNOWN_OPERATOR_NAMES]) {
    const t = typeof n === "string" ? n.trim() : "";
    if (t.length < 3 || NEVER_STRIP.has(t.toLowerCase())) continue;
    if (routeName && routeName.toLowerCase().includes(t.toLowerCase())) continue;
    names.add(t);
  }
  if (names.size === 0) return description;
  const pattern = new RegExp(
    [...names].map((n) => escapeRegExp(n).replace(/\s+/g, "\\s+")).join("|"),
    "i",
  );
  if (!pattern.test(description)) return description;

  // Sentences end at terminal punctuation (plus closing quotes/brackets)
  // followed by whitespace — so "2.5 km" and "St. Feliu" stay intact.
  const sentences = description.split(/(?<=[.!?]["'’”)\]]*)\s+/);
  const kept = sentences.filter((s) => s.trim() && !pattern.test(s));
  const out = kept
    .map((s) => s.trim())
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out.length > 0 ? out : null;
}

/** Apply stripOperatorAttribution to a route row's description in place-safe copy. */
export function withPublicDescription<T extends Record<string, unknown>>(route: T): T {
  if (!route || typeof route.description !== "string") return route;
  const cleaned = stripOperatorAttribution(
    route.description,
    typeof route.operator_name === "string" ? route.operator_name : null,
    typeof route.name === "string" ? route.name : null,
  );
  if (cleaned === route.description) return route;
  return { ...route, description: cleaned };
}

/** Ratings are a social feature: cards carry them only when it is on. */
const CARD_SOCIAL_FIELDS = ["avg_score", "avg_rating", "rating_count"] as const;

/** The fields a route card renders — nothing else crosses to the browser. */
const CARD_FIELDS = [
  "id", "slug", "name", "description", "distance_km", "elevation_gain_m", "elevation_loss_m",
  "discipline", "surface_type", "difficulty", "county", "region", "country", "start_lat", "start_lng",
  "is_verified", "verified", "estimated_minutes",
  "distance_km_away", "haversine_distance", "cover_photo", "created_at",
] as const;

export function routeCard<T extends Record<string, unknown>>(route: T): Record<string, unknown> {
  const clean = withPublicDescription(route);
  const out: Record<string, unknown> = {};
  for (const k of CARD_FIELDS) if (k in clean) out[k] = clean[k];
  if (SOCIAL_FEATURES_ENABLED) for (const k of CARD_SOCIAL_FIELDS) if (k in clean) out[k] = clean[k];
  const rs = roadStandardStatus(clean.road_report);
  if (rs) out.road_standard = rs;
  return out;
}

/** The card-sized verdict of a road report: "met", "notes" (named compromises), or null when unknown. */
export function roadStandardStatus(report: unknown): "met" | "notes" | null {
  if (!report || typeof report !== "object") return null;
  const sm = (report as { standard_met?: unknown }).standard_met;
  return sm === true ? "met" : sm === false ? "notes" : null;
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
