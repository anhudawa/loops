/**
 * Route Intent Parser
 *
 * Takes natural language cycling route requests and extracts a structured
 * RouteSpec using Claude. Geocodes place names via Nominatim, constrained
 * to Ireland by default for the v1 launch.
 */

import Anthropic from "@anthropic-ai/sdk";
import { lookupKnownPlace } from "./places-known";
import { findPlaceNear } from "./map-labels";
import type { IntensityZone } from "./intensity";
import { ZONES } from "./intensity";
import type { WindStrategy } from "./wind";

export type Discipline = "road" | "gravel" | "mtb";
export type ElevationPreference = "flat" | "rolling" | "hilly" | "mountainous" | "any";

export interface WorkoutInterval {
  count: number;
  duration_minutes: number;
  zone: IntensityZone;
  recovery_minutes?: number;
}

export interface WorkoutSpec {
  intervals: WorkoutInterval[];
  warmup_minutes: number;
  cooldown_minutes: number;
  /** Total session time estimate (warmup + all intervals & recoveries + cooldown). */
  total_minutes: number;
}

export interface RouteSpec {
  distance_km: number;
  distance_tolerance_km: number;
  duration_minutes?: number;         // set when user asked by time
  max_elevation_gain_m?: number;
  elevation_preference: ElevationPreference;
  discipline: Discipline;
  start_point: [number, number];     // [lat, lng]
  end_point: [number, number];       // [lat, lng]
  is_loop: boolean;
  road_preferences: string[];        // OSM highway types
  avoid: string[];
  vibes: string[];
  region?: string;
  country: string;                   // geocoding constraint
  workout?: WorkoutSpec;             // present when prompt described a workout
  wind_strategy: WindStrategy;       // "tailwind home" etc.; "none" by default
  cafe_stop?: boolean;               // rider asked for a café stop
  /** Which parser produced this spec (diagnostic; surfaced in the API). */
  parser?: "llm" | "basic";
  /** How the start point was found (diagnostic; surfaced in the API). */
  start_source?: "known_place" | "geocoded" | "origin";
  /**
   * A destination ride ("Pollença to Cap de Formentor and back"): ride out
   * to this place and home again. Out and back on the same road is allowed
   * here — when a cape or a summit has one road, that road is the ride.
   */
  destination?: { name: string; point: [number, number]; distance_asked: boolean };
  /**
   * Workouts: may every effort be repeated on one stretch ("repeat", the
   * default — hill repeats on Howth) or must they be spread along the ride?
   */
  effort_layout?: "repeat" | "spread";
}

/**
 * Expected cycling speeds (km/h) by discipline × terrain.
 * Used to convert duration → distance when the rider asks by time.
 * Calibrated to a baseline rider with avg_speed_kmh = BASELINE_SPEED_KMH.
 * Faster or slower riders scale proportionally via userSpeedKmh.
 */
const SPEED_LOOKUP: Record<Discipline, Record<ElevationPreference, number>> = {
  road:   { flat: 26, rolling: 23, hilly: 19, mountainous: 16, any: 23 },
  gravel: { flat: 20, rolling: 18, hilly: 15, mountainous: 13, any: 18 },
  mtb:    { flat: 15, rolling: 13, hilly: 11, mountainous: 10, any: 13 },
};

/** The avg_speed_kmh value the SPEED_LOOKUP table is calibrated against. */
const BASELINE_SPEED_KMH = 25;

export function durationToDistanceKm(
  durationMinutes: number,
  discipline: Discipline,
  elevation: ElevationPreference,
  userSpeedKmh: number = BASELINE_SPEED_KMH
): number {
  const base = SPEED_LOOKUP[discipline][elevation];
  // Scale the terrain-aware speed by the rider's pace relative to baseline.
  // A rider with avg_speed_kmh=30 gets ~20% more distance for the same time
  // than the 25 km/h baseline, across every terrain bucket.
  const scaled = base * (userSpeedKmh / BASELINE_SPEED_KMH);
  return Math.round((durationMinutes / 60) * scaled);
}

const DEFAULT_COUNTRY = "Ireland";
const DEFAULT_DISTANCE_KM = 50;
const MIN_DISTANCE_KM = 10;
const MAX_DISTANCE_KM = 300;

const SYSTEM_PROMPT = `You are a cycling route planning assistant with deep knowledge of OpenStreetMap (OSM) road classifications and cycling terrain.

When given a natural language route request, extract a structured JSON RouteSpec. Use your cycling domain knowledge:

## Distance vs duration:
Riders ask either by distance ("60km loop") OR by time ("2 hour ride", "90 minutes out"). Extract whichever is explicit.
- If distance is given → set distance_km, leave duration_minutes null
- If only duration is given → set duration_minutes (parse "2 hours" = 120, "90 mins" = 90), leave distance_km null (caller resolves)
- If both given → set both
- If neither → distance_km = 50, duration_minutes = null
- distance_tolerance_km = max(5, distance_km * 0.1) — only matters when distance_km is set

## Road preferences by terrain description:
- "country lanes" / "quiet roads" / "back roads" → road_preferences: ["tertiary", "unclassified", "residential"]
- "bike paths" / "cycle paths" → road_preferences: ["cycleway", "path"]
- "forest tracks" / "gravel" / "off-road" → road_preferences: ["track", "unclassified", "path"]
- "coastal" → road_preferences: ["tertiary", "unclassified"] + vibes: ["coastal"]
- "main roads" / "fast roads" → road_preferences: ["secondary", "primary"]

## Things to avoid:
- "avoid busy roads" → avoid: ["primary", "secondary", "trunk", "motorway"]
- "avoid motorways" → avoid: ["motorway", "trunk"]
- "avoid urban" → avoid: ["residential", "service"]
- Default: always include avoid: ["motorway", "trunk"] for cycling

## Elevation preferences:
- "flat" / "no climbing" / "easy" / "minimal climbing" / "as flat as possible" → elevation_preference: "flat", max_elevation_gain_m: distance_km * 5
- "rolling" / "some hills" → elevation_preference: "rolling", max_elevation_gain_m: distance_km * 12
- "hilly" / "challenging" → elevation_preference: "hilly", max_elevation_gain_m: distance_km * 18
- "mountainous" / "epic climbing" → elevation_preference: "mountainous"
- not specified → elevation_preference: "any"

## Discipline defaults:
- "road bike" / "road cycling" → "road"
- "gravel" / "gravel bike" → "gravel"
- "mountain bike" / "MTB" / "trail" → "mtb"
- not specified → "road"

## Loops:
- Most cycling route requests are loops (start = end), so is_loop: true by default
- Only false if explicitly "point to point" or "A to B"

## Destination rides:
- When the rider names a place to ride TO and come back from ("Pollença to Cap de Formentor and back", "ride out to Glendalough and back from Bray", "I'm in Calpe, route to Guadalest"), set destination to that place and region to where they start. Otherwise destination: null.
- "loop from X" / "finish in X" is NOT a destination. Keep is_loop: true (they come home).

## Region & country:
- Extract the region/town/city mentioned if any ("Wicklow", "Dublin", "from Blessington"). Set region to that.
- Set country to the country the named place is in, even when the prompt does not say it ("Girona" → "Spain", "Lucca" → "Italy", "Nice" → "France", "Algarve" → "Portugal"). Only when NO place is named default to "Ireland".
- If no region is mentioned, set region to null and the caller will use a sensible default.

## Vibes:
- "scenic" → ["scenic"]
- "coastal" → ["coastal"]
- "forest" / "woodland" → ["forest"]
- "quiet" / "peaceful" → ["quiet"]
- "village" → ["village"]

## Workouts (structured intervals):
When the rider describes a structured session ("2x20 min threshold", "5x5 vo2", "4x8 tempo with 3 min rest"), extract a workout object. Map intensity labels to Coggan zones:
- "threshold" / "ftp" / "lactate threshold" / "lt" → z4
- "tempo" / "sweet spot" → z3
- "vo2" / "vo2 max" / "vo2max" → z5
- "sprints" / "sprint" / "neuromuscular" → z7
- "anaerobic" → z6
- "endurance" / "zone 2" / "Z2" / "aerobic" / "base" → z2
- "recovery" / "easy spin" → z1

If the rider describes a workout:
- Default warmup_minutes: 15, cooldown_minutes: 10
- Default recovery_minutes per interval: half the interval duration (e.g. 10min recovery for a 20min interval) unless the rider specifies
- total_minutes = warmup + (count × duration + (count-1) × recovery) summed over all interval blocks + cooldown
- Set duration_minutes at the top level to the ride length the rider asked for ("4 hour ride" → 240) when they gave one; otherwise to total_minutes. The session sits inside the ride.
- Set elevation_preference to "flat" for threshold/tempo/sweet-spot workouts unless the rider asks for hills (these zones need steady terrain). VO2/hill-repeat workouts can use "rolling".

If no workout is described, omit the workout field (set it to null).

## Café stop:
- "with a café stop" / "coffee stop" / "stop for coffee halfway" → cafe_stop: true
- otherwise → cafe_stop: false

## Wind strategy:
Riders often plan loops around the wind. Extract:
- "tailwind home" / "wind at my back on the way back" / "tailwind on the return" / "headwind out" / "into the wind first" → wind_strategy: "tailwind_home" (headwind out and tailwind home are the same loop orientation; default to "tailwind_home" unless the rider's emphasis is clearly only the outbound leg)
- "tailwind out" / "wind behind me to start" → wind_strategy: "tailwind_out"
- explicitly only about riding out into the wind with no mention of the return → wind_strategy: "headwind_out"
- no wind mention → wind_strategy: "none"

Return ONLY valid JSON matching this TypeScript interface (no markdown, no explanation):
{
  "distance_km": number | null,
  "distance_tolerance_km": number | null,
  "duration_minutes": number | null,
  "max_elevation_gain_m": number | null,
  "elevation_preference": "flat" | "rolling" | "hilly" | "mountainous" | "any",
  "discipline": "road" | "gravel" | "mtb",
  "is_loop": boolean,
  "road_preferences": string[],
  "avoid": string[],
  "vibes": string[],
  "region": string | null,
  "destination": string | null,
  "country": string,
  "wind_strategy": "tailwind_home" | "tailwind_out" | "headwind_out" | "none",
  "cafe_stop": boolean,
  "workout": null | {
    "intervals": Array<{ "count": number, "duration_minutes": number, "zone": "z1"|"z2"|"z3"|"z4"|"z5"|"z6"|"z7", "recovery_minutes": number }>,
    "warmup_minutes": number,
    "cooldown_minutes": number,
    "total_minutes": number
  }
}`;

interface ParsedIntent {
  distance_km: number | null;
  distance_tolerance_km: number | null;
  duration_minutes: number | null;
  max_elevation_gain_m: number | null;
  elevation_preference: ElevationPreference;
  discipline: Discipline;
  is_loop: boolean;
  road_preferences: string[];
  avoid: string[];
  vibes: string[];
  region: string | null;
  destination?: string | null;
  country: string;
  wind_strategy?: string;
  cafe_stop?: boolean;
  workout: WorkoutSpec | null;
}

const WIND_STRATEGIES: ReadonlySet<string> = new Set([
  "tailwind_home",
  "tailwind_out",
  "headwind_out",
  "none",
]);

function sanitizeWindStrategy(value: string | undefined): WindStrategy {
  return value && WIND_STRATEGIES.has(value) ? (value as WindStrategy) : "none";
}

const DISCIPLINES: ReadonlySet<string> = new Set(["road", "gravel", "mtb"]);
const ELEVATION_PREFERENCES: ReadonlySet<string> = new Set([
  "flat",
  "rolling",
  "hilly",
  "mountainous",
  "any",
]);

/** LLM enum guard: anything outside road|gravel|mtb becomes "road". */
export function sanitizeDiscipline(value: unknown): Discipline {
  return typeof value === "string" && DISCIPLINES.has(value)
    ? (value as Discipline)
    : "road";
}

/** LLM enum guard: anything outside the five known bands becomes "any". */
export function sanitizeElevationPreference(value: unknown): ElevationPreference {
  return typeof value === "string" && ELEVATION_PREFERENCES.has(value)
    ? (value as ElevationPreference)
    : "any";
}

/** Drop malformed workout objects — we never want to route a garbage workout. */
function sanitizeWorkout(w: WorkoutSpec | null | undefined): WorkoutSpec | undefined {
  if (!w || !Array.isArray(w.intervals) || w.intervals.length === 0) return undefined;
  const validZones = new Set(Object.keys(ZONES));
  const intervals: WorkoutInterval[] = [];
  for (const iv of w.intervals) {
    if (
      !iv ||
      typeof iv.count !== "number" ||
      typeof iv.duration_minutes !== "number" ||
      !validZones.has(iv.zone)
    ) continue;
    if (iv.count < 1 || iv.duration_minutes < 1) continue;
    intervals.push({
      count: Math.floor(iv.count),
      duration_minutes: Math.round(iv.duration_minutes),
      zone: iv.zone,
      recovery_minutes:
        typeof iv.recovery_minutes === "number" && iv.recovery_minutes >= 0
          ? Math.round(iv.recovery_minutes)
          : Math.round(iv.duration_minutes / 2),
    });
  }
  if (intervals.length === 0) return undefined;
  const warmup = typeof w.warmup_minutes === "number" && w.warmup_minutes >= 0 ? w.warmup_minutes : 15;
  const cooldown =
    typeof w.cooldown_minutes === "number" && w.cooldown_minutes >= 0 ? w.cooldown_minutes : 10;
  const intervalsTotal = intervals.reduce((sum, iv) => {
    const recovery = iv.recovery_minutes ?? Math.round(iv.duration_minutes / 2);
    return sum + iv.count * iv.duration_minutes + Math.max(0, iv.count - 1) * recovery;
  }, 0);
  return {
    intervals,
    warmup_minutes: warmup,
    cooldown_minutes: cooldown,
    total_minutes: warmup + intervalsTotal + cooldown,
  };
}

export interface GeocodeHit {
  point: [number, number];
  /** Country of the hit as the geocoder reports it (may be undefined). */
  country?: string;
}

/** Geocoder signature — injectable so start-point resolution is testable. */
export type Geocoder = (place: string, countryCode?: string, near?: [number, number]) => Promise<GeocodeHit | null>;

const NOT_A_PLACE_CLASS = new Set(["building", "shop", "office", "craft", "healthcare", "emergency", "club", "company"]);

async function geocodePlace(place: string, countryCode?: string, near?: [number, number]): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({
    q: place,
    format: "json",
    limit: "5",
    addressdetails: "1",
    "accept-language": "en", // country names in English ("Spain", not "España")
  });
  if (countryCode) params.set("countrycodes", countryCode);
  if (near) {
    // Bounded to ~1° around the start: the Formentor near Pollença, not another.
    const [lat, lng] = near;
    params.set("viewbox", `${lng - 1.2},${lat + 1},${lng + 1.2},${lat - 1}`);
    params.set("bounded", "1");
  }
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "loops.ie route generator (https://www.loops.ie)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    // A house or a shop that happens to be called "Narnia" is not a place
    // to ride to (or from): only places, roads, landmarks and nature count.
    const hit = data.find((h: { class?: string }) => !NOT_A_PLACE_CLASS.has(h.class ?? ""));
    if (!hit) return null;
    return {
      point: [parseFloat(hit.lat), parseFloat(hit.lon)],
      country: typeof hit.address?.country === "string" ? hit.address.country : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Where does the ride start? Trust rule: a place the rider NAMED must
 * resolve to that place or the request is declined — it is never quietly
 * replaced by the rider's location or a country centre. (That fallback once
 * planned "Girona" loops from the middle of Tipperary, and the rider was
 * told nothing.)
 *
 *   1. Known places (launch destinations, home-turf towns): local, exact.
 *   2. Geocoder, restricted to the parsed country, then unrestricted — the
 *      parsed country is a guess when the prompt did not name one.
 *   3. No place named → the rider's current location.
 */
export async function resolveStartPoint(
  region: string | undefined,
  country: string,
  origin: [number, number] | undefined,
  geocode: Geocoder = geocodePlace
): Promise<{ point: [number, number]; country: string; source: RouteSpec["start_source"] }> {
  if (region) {
    const known = lookupKnownPlace(region);
    if (known) return { point: known.point, country: known.country, source: "known_place" };
    const restricted = await geocode(region, countryToCode(country));
    if (restricted) return { point: restricted.point, country: restricted.country ?? country, source: "geocoded" };
    const anywhere = await geocode(region);
    if (anywhere) return { point: anywhere.point, country: anywhere.country ?? country, source: "geocoded" };
    throw new Error(
      `Couldn't find the location "${region}". Check the spelling or add the country (e.g. "from ${region}, Spain").`
    );
  }
  if (origin) return { point: origin, country, source: "origin" };
  throw new Error(
    "Could not work out where to start. Allow location access, or name a starting point (e.g. \"from Dublin\" or \"near Blessington\")."
  );
}

/** A destination further than this (straight line) is not a day ride out and back. */
export const MAX_DESTINATION_KM = 90;

/** Trailing words a rider adds that a map does not ("Formentor lighthouse"). */
const GENERIC_SUFFIX = /\s+(?:lighthouse|light house|summit|top|village|town|beach|harbour|harbor|port|climb|and back)$/i;

function kmBetween(a: [number, number], b: [number, number]): number {
  const dy = (b[0] - a[0]) * 111.32, dx = (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * Where a destination ride goes. Trust rule, as for the start: the place
 * the rider named resolves near where they start, or we decline and say so
 * — "Cap de Formentor" must never become a Formentor somewhere else.
 *   1. Known places (launch towns, iconic capes and climbs).
 *   2. Bundled GeoNames towns and villages near the start.
 *   3. The geocoder, bounded to a box around the start; then the same
 *      without a generic trailing word ("… lighthouse").
 */
export async function resolveDestination(
  name: string,
  start: [number, number],
  country: string,
  geocode: Geocoder = geocodePlace,
): Promise<[number, number]> {
  const near = (p: [number, number] | null | undefined) => (p && kmBetween(start, p) <= MAX_DESTINATION_KM ? p : null);
  const names = [name];
  const stripped = name.replace(GENERIC_SUFFIX, "").trim();
  if (stripped && stripped !== name) names.push(stripped);
  let farHit: [number, number] | null = null;
  for (const n of names) {
    const known = lookupKnownPlace(n)?.point;
    if (near(known)) return known!;
    if (known) { farHit = known; break; } // a known place far away is the one they mean
    const town = findPlaceNear(n, start, MAX_DESTINATION_KM);
    if (town) return [town.lat, town.lng];
  }
  for (const n of farHit ? [] : names) {
    const hit = await geocode(n, countryToCode(country), start);
    if (near(hit?.point)) return hit!.point;
    if (hit) farHit = hit.point;
  }
  if (farHit) {
    throw new Error(
      `"${name}" is about ${Math.round(kmBetween(start, farHit))} km away in a straight line — too far to ride out and back in a day. Try a place closer to your start.`
    );
  }
  throw new Error(`Couldn't find the location "${name}" near your start. Check the spelling, or name a nearby town.`);
}

function countryToCode(country: string): string {
  const normalized = country.trim().toLowerCase();
  const map: Record<string, string> = {
    ireland: "ie",
    "united kingdom": "gb",
    uk: "gb",
    france: "fr",
    spain: "es",
    italy: "it",
    portugal: "pt",
    germany: "de",
    netherlands: "nl",
    belgium: "be",
  };
  return map[normalized] ?? "ie";
}

export interface ParseRouteIntentOptions {
  /** The rider's average cycling speed in km/h. Falls back to 25 (baseline). */
  userSpeedKmh?: number;
  /**
   * The rider's current location [lat, lng] from the browser. Used as the
   * start point when the prompt does not name a place — the "I'm here now,
   * give me a ride" case. A place named in the prompt always wins over this.
   */
  origin?: [number, number];
}

// Words after "to" that are not a place: "want to ride", "close to home".
const NOT_A_DESTINATION = new Set([
  "ride", "go", "do", "get", "be", "have", "plan", "include", "finish", "make", "start", "take", "see",
  "climb", "keep", "avoid", "stay", "end", "come", "head", "use", "try", "train", "work", "spin", "cycle",
  "home", "me", "you", "us", "the", "a", "an", "my", "it", "this", "that", "sea", "coast", "hills",
  "mountains", "somewhere", "anywhere", "work",
]);

const PLACE = "[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’. -]{1,50}?";
const DEST_END = "(?=\\s+(?:and|&|then|via|with|on|in|for|from|returning|return)\\b|\\s+\\d|[,.;!?]|$)";

/**
 * "Pollença to Cap de Formentor and back", "ride from Bray to Glendalough",
 * "I'm in Calpe, want a route to Guadalest and back" → where the ride goes
 * and (when named) where it starts. Null when the prompt names no place to
 * ride TO — "finish in Kinsale" or "loop from Dublin" are not destinations.
 */
export function parseDestination(prompt: string): { start: string | null; destination: string } | null {
  const text = prompt.replace(/\s+/g, " ").trim();
  const clean = (s: string) => s.trim().replace(/^the\s+/i, "").replace(/[\s'’.-]+$/, "");
  const firstWord = (s: string) => s.toLowerCase().split(/\s+/)[0];
  const ok = (s: string | undefined) => !!s && s.length >= 3 && !NOT_A_DESTINATION.has(firstWord(s));

  // "[from] X to Y" — X at the start of the prompt (after an optional verb
  // phrase), or after "from".
  const fromTo = text.match(new RegExp(`\\bfrom\\s+(${PLACE})\\s+to\\s+(?:the\\s+)?(${PLACE})${DEST_END}`, "i"))
    ?? text.match(new RegExp(`^(?:(?:a\\s+)?(?:ride|route|spin|cycle)\\s+)?(${PLACE})\\s+to\\s+(?:the\\s+)?(${PLACE})${DEST_END}`, "i"));
  if (fromTo && ok(clean(fromTo[2])) && !/\b(?:ride|route|loop|spin|want|need|hour|km|out|back|there)\b/i.test(fromTo[1])) {
    return { start: clean(fromTo[1]), destination: clean(fromTo[2]) };
  }

  // "... (ride|route|spin|out and back|there and back) [out] to Y ..." with
  // the start (if any) named by "from X" / "in X" / "at X".
  const toOnly = text.match(new RegExp(`\\b(?:ride|route|spin|cycle|loop|trip|back|head|go|going|out)\\s+(?:out\\s+)?to\\s+(?:the\\s+)?(${PLACE})${DEST_END}`, "i"));
  if (toOnly && ok(clean(toOnly[1]))) {
    const destination = clean(toOnly[1]);
    const rest = text.replace(toOnly[0], " ");
    const start = rest.match(new RegExp(`\\b(?:from|in|at)\\s+(${PLACE})(?=\\s+(?:and|with|on|for|i|i'm|we|to)\\b|\\s+\\d|[,.;!?]|$)`, "i"));
    return { start: start && ok(clean(start[1])) ? clean(start[1]) : null, destination };
  }
  return null;
}

// Intensity words → zone (longest first so "vo2 max" wins over "vo2").
const ZONE_WORDS: Array<[RegExp, IntensityZone]> = [
  [/\bsweet\s*spot\b/, "z3"],
  [/\bvo2\s*max\b|\bvo2\b|\bv02\b/, "z5"],
  [/\blactate threshold\b|\bthreshold\b|\bftp\b/, "z4"],
  [/\btempo\b/, "z3"],
  [/\banaerobic\b/, "z6"],
  [/\bsprints?\b/, "z7"],
  [/\bzone\s*([1-7])\b|\bz([1-7])\b/, "z1"], // zone from the digit
];
const ZONE_RE = /(sweet\s*spot|vo2\s*max|vo2|v02|lactate threshold|threshold|ftp|tempo|anaerobic|sprints?|zone\s*[1-7]|z[1-7])\b/;

function zoneOf(text: string): IntensityZone | null {
  for (const [re, zone] of ZONE_WORDS) {
    const m = text.match(re);
    if (!m) continue;
    const digit = m[1] ?? m[2];
    return digit ? (`z${digit}` as IntensityZone) : zone;
  }
  return null;
}

// A unit must end its word: the "s" of "sweet spot" is not seconds.
const UNIT = String.raw`(?:(?:secs?|seconds?|s|mins?|minutes?|m)(?![a-z])|'|’)?`;

/**
 * Efforts written the way riders write them, without the model:
 * "20 mins threshold", "4x4 mins vo2 max", "2 x 20 min threshold with 5 min
 * rest", "5 x 5 min VO2 max efforts", "10 x 30s sprints", "3x10 sweet spot".
 * Zone 1–2 alone ("90 min zone 2") is a steady ride, not intervals: null.
 * Returns the session and the prompt with the session text removed, so its
 * minutes are never read as the ride's length.
 */
export function parseBasicWorkout(prompt: string): { workout: WorkoutSpec; stripped: string } | null {
  const text = prompt.toLowerCase().replace(/[–—]/g, "-");
  const intervals: WorkoutInterval[] = [];
  let stripped = text;
  const toMin = (n: number, unit: string | undefined) => (/^s/.test(unit ?? "") ? n / 60 : n);

  // "4x4 mins vo2 max", "2 x 20 min threshold" (zone right after, or anywhere in the prompt).
  const reps = new RegExp(String.raw`(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(${UNIT})\s*(?:(?:min(?:ute)?s?\s+)?(?:of|at|@)\s*)?(?:hard\s+|max\s+)?(?:${ZONE_RE.source})?`, "g");
  for (const m of text.matchAll(reps)) {
    const zone = zoneOf(m[4] ?? "") ?? zoneOf(text);
    if (!zone) continue;
    intervals.push({ count: parseInt(m[1], 10), duration_minutes: toMin(parseFloat(m[2]), m[3]), zone });
    stripped = stripped.replace(m[0], " ");
  }
  // "20 mins threshold", "a 20 minute ftp effort", "30 min of tempo".
  if (intervals.length === 0) {
    const single = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(${UNIT})\s*(?:of\s+|at\s+|@\s*)?${ZONE_RE.source}`, "g");
    for (const m of text.matchAll(single)) {
      const zone = zoneOf(m[3]);
      if (!zone) continue;
      intervals.push({ count: 1, duration_minutes: toMin(parseFloat(m[1]), m[2]), zone });
      stripped = stripped.replace(m[0], " ");
    }
  }
  // Zone 1–2 is not an interval session.
  const hard = intervals.filter((iv) => iv.zone !== "z1" && iv.zone !== "z2");
  if (hard.length === 0) return null;

  // "with 5 min rest", "3 min recovery", "2 mins easy between".
  const rec = text.match(/(\d+(?:\.\d+)?)\s*(?:m|mins?|minutes?)\s*(?:of\s+)?(?:rest|recovery|recover|easy|off)\b/);
  if (rec) stripped = stripped.replace(rec[0], " ");
  const workout: WorkoutSpec = {
    intervals: hard.map((iv) => ({
      count: Math.max(1, Math.min(20, iv.count)),
      // Sessions are planned in whole minutes: a 30 s sprint needs a 1-minute stretch.
      duration_minutes: Math.max(1, Math.round(iv.duration_minutes)),
      zone: iv.zone,
      recovery_minutes: rec ? Math.round(parseFloat(rec[1])) : Math.max(1, Math.round(iv.duration_minutes / 2)),
    })),
    warmup_minutes: 15,
    cooldown_minutes: 10,
    total_minutes: 0,
  };
  workout.total_minutes = workout.warmup_minutes + workout.cooldown_minutes + workout.intervals.reduce(
    (s, iv) => s + iv.count * iv.duration_minutes + Math.max(0, iv.count - 1) * (iv.recovery_minutes ?? 0), 0);
  return { workout, stripped };
}

/**
 * Deterministic fallback parser — no LLM. Handles the structured-form
 * prompt format and simple free text so that a total LLM outage degrades
 * to "plain requests still work" instead of "the product is down".
 * Workouts are NOT parsed here (they need the LLM); plain rides only.
 */
export function parseBasicIntent(prompt: string): ParsedIntent | null {
  const p = prompt.toLowerCase();

  // Structured efforts ("20 mins threshold", "4x4 min VO2 max") are parsed
  // here too, so a rider's session never depends on the model being up. An
  // intensity word we cannot turn into a session is declined (never served
  // as a plain ride that silently drops the efforts).
  const session = parseBasicWorkout(prompt);
  const mentionsEfforts = /\d\s*[x×]\s*\d|\binterval|\bthreshold\b|\bftp\b|\btempo\b|\bvo2|sweet\s*spot|\banaerobic\b|\bsprints?\b|\bzone\s*[3-7]\b|\bz[3-7]\b/.test(p);
  if (mentionsEfforts && !session) return null;
  // The session's own minutes are not the ride's length: "20 mins
  // threshold … 4 hour ride" is a 4-hour ride.
  const p0 = p;
  const pNoSession = session ? session.stripped.toLowerCase() : p0;

  // Duration: "2 hour", "1.5 hours", "90 min"
  let duration: number | null = null;
  const hourMatch = pNoSession.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  const minMatch = pNoSession.match(/(\d+)\s*(?:minutes?|mins?)\b/);
  if (hourMatch) duration = Math.round(parseFloat(hourMatch[1]) * 60);
  if (minMatch) duration = (duration ?? 0) + parseInt(minMatch[1], 10);

  // Distance: "60km", "40 mile"
  let distance: number | null = null;
  // Negative lookahead: "30km/h" is a pace, not a distance.
  const kmMatch = pNoSession.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometres?|kilometers?)\b(?!\s*\/?\s*h\b)/);
  const miMatch = pNoSession.match(/(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/);
  if (kmMatch) distance = Math.round(parseFloat(kmMatch[1]));
  else if (miMatch) distance = Math.round(parseFloat(miMatch[1]) * 1.609);

  // "from <place>" — parsed early because a named place makes a distance-less
  // prompt specific enough to default (spec: neither distance nor duration →
  // default 50 km). Stops at punctuation or terrain/wind keywords.
  let region: string | null = null;
  const dest = parseDestination(prompt);
  const fromMatch = prompt.match(/\bfrom\s+([A-Za-zÀ-ÿ''. -]{3,40}?)(?:[,.;]|\s+(?:with|on|in|and|tailwind|headwind)\b|\s+\d|$)/i);
  if (fromMatch) region = fromMatch[1].trim();
  if (dest) region = dest.start;

  // A destination ride's length is the road there and back.
  if (duration === null && distance === null && !dest && !session) {
    // Truly vague ("give me a ride") — no distance, no time, no place.
    if (!region) return null;
    // A place is named ("gravel loop from Dublin") — default the distance
    // rather than declining a perfectly reasonable ask.
    distance = 50;
  }

  const discipline: Discipline =
    /\bgravel\b/.test(p) ? "gravel" : /\bmtb|mountain bike\b/.test(p) ? "mtb" : "road";

  // Strip "mountain bike" before terrain matching so the discipline
  // phrase doesn't read as mountainous terrain.
  const pTerrain = p.replace(/mountain\s*bike/g, "");
  const elevation_preference: ElevationPreference =
    /\bflat\b|no (?:big )?climb/.test(pTerrain) ? "flat"
    : /\brolling\b/.test(pTerrain) ? "rolling"
    : /\bhilly\b|\bhills\b|climbing\b/.test(pTerrain) ? "hilly"
    : /mountain(?:ous)?\b/.test(pTerrain) ? "mountainous"
    : "any";

  let wind: string = "none";
  if (/tailwind (?:on the way |coming |)home|tailwind back|wind at my back .*(home|back)|headwind (?:out|first)/.test(p)) {
    wind = "tailwind_home";
  } else if (/tailwind (?:out|to start|first)/.test(p)) {
    wind = "tailwind_out";
  }

  const cafe_stop = /\bcaf[eé]\b|coffee\s+stop|stop\s+for\s+coffee/.test(p);

  return {
    distance_km: distance,
    distance_tolerance_km: null,
    duration_minutes: duration,
    max_elevation_gain_m:
      elevation_preference === "flat" && distance ? distance * 5 : null,
    elevation_preference,
    discipline,
    is_loop: !/point to point|a to b/.test(p),
    road_preferences: ["tertiary", "unclassified", "residential"],
    avoid: ["motorway", "trunk"],
    vibes: [],
    region,
    destination: dest?.destination ?? null,
    country: DEFAULT_COUNTRY,
    wind_strategy: wind,
    cafe_stop,
    workout: session?.workout ?? null,
  };
}

export async function parseRouteIntent(
  prompt: string,
  options: ParseRouteIntentOptions = {}
): Promise<RouteSpec> {
  const userSpeedKmh = options.userSpeedKmh ?? BASELINE_SPEED_KMH;
  const origin = options.origin;

  let parsed: ParsedIntent;
  let parser: RouteSpec["parser"] = "llm";
  try {
    // Constructed inside the try: with no API key the SDK throws at
    // construction, and that must hit the basic-parser fallback too.
    // Hard timeout (12s) well under the 55s pipeline budget so a slow model
    // falls through to the deterministic parser instead of burning the
    // whole request. Set on the client, the supported SDK surface.
    const client = new Anthropic({ timeout: 12000, maxRetries: 1 });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 200)}`);
      }
      parsed = JSON.parse(match[0]);
    }
  } catch (err) {
    // LLM unavailable or returned garbage: try the deterministic parser
    // for simple requests (and the structured form's format) so a model
    // outage never takes the whole product down.
    const basic = parseBasicIntent(prompt);
    if (!basic) {
      throw err instanceof Error && err.message.startsWith("Failed to parse LLM response")
        ? err
        : new Error("Failed to parse LLM response: model unavailable");
    }
    console.error("[route-intent] LLM unavailable — using basic parser");
    parsed = basic;
    parser = "basic";
  }

  // ── Resolve distance from duration if needed ────────────────────────────────
  // Sanitize LLM enums first: an out-of-vocabulary discipline or elevation
  // band would miss the SPEED_LOOKUP table and turn distance into NaN.
  const discipline = sanitizeDiscipline(parsed.discipline);
  const elevationPref = sanitizeElevationPreference(parsed.elevation_preference);
  const workout = sanitizeWorkout(parsed.workout);

  let distanceKm =
    typeof parsed.distance_km === "number" && Number.isFinite(parsed.distance_km)
      ? parsed.distance_km
      : null;
  // A workout sets the MINIMUM ride length; the rider's own ride length
  // wins when it is longer ("20 mins threshold … 4 hour ride" = 4 hours).
  const askedMin = typeof parsed.duration_minutes === "number" && parsed.duration_minutes > 0 ? parsed.duration_minutes : null;
  // With no ride length asked, a session gets room to reach roads that can
  // hold it (a 75-minute 2×20 from a city start is otherwise all suburbs).
  const durationMin = workout
    ? Math.max(askedMin ? workout.total_minutes : Math.round(workout.total_minutes * 1.25), askedMin ?? 0)
    : askedMin;

  if (distanceKm === null && durationMin !== null) {
    distanceKm = durationToDistanceKm(durationMin, discipline, elevationPref, userSpeedKmh);
  }
  if (distanceKm === null || Number.isNaN(distanceKm)) {
    distanceKm = DEFAULT_DISTANCE_KM;
  }

  // Clamp to sane bounds — the LLM occasionally emits nonsense for ambiguous prompts
  distanceKm = Math.max(MIN_DISTANCE_KM, Math.min(MAX_DISTANCE_KM, distanceKm));

  const distanceToleranceKm =
    parsed.distance_tolerance_km ?? Math.max(5, Math.round(distanceKm * 0.1));

  // ── Resolve country + region → start point ──────────────────────────────────
  // A place named in the prompt always wins ("ride in Girona" while sitting
  // in Dublin plans Girona) — and must resolve, or we decline honestly.
  const region = parsed.region ?? undefined;
  const resolved = await resolveStartPoint(region, parsed.country || DEFAULT_COUNTRY, origin);
  const startPoint = resolved.point;
  const country = resolved.country;

  // Destination ride: where it goes must resolve near the start (trust rule).
  const destinationName = typeof parsed.destination === "string" && parsed.destination.trim().length >= 3 ? parsed.destination.trim() : null;
  const destination = destinationName
    ? {
        name: destinationName,
        point: await resolveDestination(destinationName, startPoint, country),
        distance_asked: typeof parsed.distance_km === "number" || parsed.duration_minutes != null,
      }
    : undefined;

  return {
    distance_km: distanceKm,
    distance_tolerance_km: distanceToleranceKm,
    duration_minutes: durationMin ?? undefined,
    max_elevation_gain_m: parsed.max_elevation_gain_m ?? undefined,
    elevation_preference: elevationPref,
    discipline,
    start_point: startPoint,
    end_point: startPoint, // loops return to start
    is_loop: parsed.is_loop,
    road_preferences: parsed.road_preferences,
    avoid: parsed.avoid,
    vibes: parsed.vibes,
    region,
    country,
    workout,
    wind_strategy: sanitizeWindStrategy(parsed.wind_strategy),
    cafe_stop: parsed.cafe_stop === true,
    parser,
    start_source: resolved.source,
    ...(destination ? { destination } : {}),
  };
}
