// ──── File size limits ────
export const MAX_ROUTE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

// ──── Character limits ────
export const MAX_COMMENT_LENGTH = 2000;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_CONDITION_NOTE_LENGTH = 500;
export const MAX_BIO_LENGTH = 500;
export const MAX_ROUTE_NAME_LENGTH = 200;
export const MAX_LOCATION_LENGTH = 200;
export const MAX_USER_NAME_LENGTH = 100;
export const MAX_ROUTE_DESCRIPTION_LENGTH = 5000;

// ──── Pagination ────
export const ROUTES_PER_PAGE = 20;
export const COMMENTS_PER_PAGE = 10;
export const CONDITIONS_PER_PAGE = 10;

// ──── Valid enums ────
export const DISCIPLINES = ["road", "gravel", "mtb"] as const;

/**
 * v1 is road only (owner, 2026-09-23): the Road Standard, quality scoring,
 * ride verdict and every test are road; gravel/MTB planning is not validated
 * (no trail-quality, difficulty or access checks). Add "gravel"/"mtb" back
 * here when they are — the pickers, lists and generator follow this list
 * (the country/region/sitemap SQL gates in db.ts spell out 'road' — update
 * them together).
 */
export const ENABLED_DISCIPLINES: readonly (typeof DISCIPLINES)[number][] = ["road"];
export const disciplineEnabled = (d: string | null | undefined): boolean =>
  ENABLED_DISCIPLINES.includes((d ?? "road") as (typeof DISCIPLINES)[number]);
/** Said when a rider asks for a discipline v1 does not plan. */
export const DISCIPLINE_NOTICE = "LOOPS plans road rides for now — gravel and MTB are coming. Here are road loops instead.";
export const CONDITION_STATUSES = ["good", "fair", "poor", "closed"] as const;
export const VALID_ROUTE_EXTENSIONS = [".gpx", ".fit", ".tcx"] as const;

// ──── Rate limits (per minute) ────
export const RATE_LIMIT_AUTH = 5;
export const RATE_LIMIT_UPLOAD = 3;
export const RATE_LIMIT_WRITE = 10;
export const RATE_LIMIT_READ = 60;

// ──── Route generation quality thresholds ────
// Routes below QUALITY_FLOOR are never shown. Between FLOOR and
// WORLD_CLASS they get a "good" label. At or above WORLD_CLASS they
// get "excellent." This powers the "good-not-great" fallback: if no
// candidate hits WORLD_CLASS, we offer the best "good" ones with an
// honest framing rather than pretending they're world-class.
export const QUALITY_FLOOR = 50;
export const QUALITY_WORLD_CLASS = 72;
export const DEFAULT_COUNTRY = "Ireland";

// ──── Ride time (one model — src/lib/ride-time.ts) ────
// DEFAULT_SPEED_KMH is the road default and the baseline a rider's own
// avg_speed_kmh is measured against. CRUISE_SPEED_KMH is the steady club
// pace per discipline at that baseline; CLIMB_KM_PER_100M is the climbing
// cost (every 100 m climbed counts as one extra flat kilometre). The SQL in
// db.ts getRoutes is built from these same numbers (rideMinutesSql).
export const DEFAULT_SPEED_KMH = 25;
export const MIN_SPEED_KMH = 15;
export const MAX_SPEED_KMH = 45;
export const CRUISE_SPEED_KMH = {
  road: DEFAULT_SPEED_KMH,
  gravel: 19,
  mtb: 13,
  mixed: 22,
} as const;
export const CLIMB_KM_PER_100M = 1;

export const DURATION_TIERS = {
  "1h": { label: "1h", maxMinutes: 90 },
  "2h": { label: "2h", minMinutes: 90, maxMinutes: 150 },
  "3h": { label: "3h", minMinutes: 150, maxMinutes: 240 },
  "4h+": { label: "4h+", minMinutes: 240 },
} as const;

export const PROXIMITY_ZONES = {
  nearby: { max: 25, label: "Nearby" },
  regional: { min: 25, max: 75, label: "Regional" },
  further: { min: 75, label: "Further" },
} as const;

export const SURFACE_LABELS: Record<string, string> = {
  "Road": "road",
  "Gravel": "gravel",
  "Trail": "trail",
  "Mixed": "mixed",
};

/**
 * Launch scope: public comments, ratings and condition reports are out of
 * scope for the consumer launch (launch build spec §7). Flip to true to
 * restore them post-launch — all components are kept intact.
 */
export const SOCIAL_FEATURES_ENABLED = false;

/**
 * Who can download a route's GPX (owner decision; one-line switch).
 *  - "signed-in"  : only signed-in riders (current — "GPX stays behind signup")
 *  - "ride-links" : also anyone arriving on a group-ride link (/ride/<id>)
 *  - "everyone"   : public, like Komoot's shared tours
 */
export const GPX_ACCESS: "signed-in" | "ride-links" | "everyone" = "signed-in";
/**
 * What Generate does with a library loop whose MEASURED road report fails
 * the serving policy (owner switch, 2026-09-23):
 *   "name"    — serve it with the compromise named, ranked below clean loops
 *   "enforce" — drop it from Generate (it stays browsable in the library,
 *               with its Road Standard card)
 */
export const LIBRARY_ROAD_POLICY: "name" | "enforce" = "name";
