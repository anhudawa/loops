/**
 * Route Intent Parser
 *
 * Takes natural language cycling route requests and extracts a structured
 * RouteSpec using Claude. Geocodes place names via Nominatim, constrained
 * to Ireland by default for the v1 launch.
 */

import Anthropic from "@anthropic-ai/sdk";
import { lookupKnownPlace, findKnownPlaceIn, nearestKnownPlace, displayPlaceName } from "./places-known";
import { findPlaceNear } from "./map-labels";
import type { IntensityZone } from "./intensity";
import { ZONES } from "./intensity";
import type { WindStrategy } from "./wind";

export type Discipline = "road" | "gravel" | "mtb";
export type ElevationPreference = "flat" | "rolling" | "hilly" | "mountainous" | "any";

export interface WorkoutInterval {
  count: number;
  /** Whole minutes (at least 1) — what the planner sizes a stretch for. */
  duration_minutes: number;
  /** The effort as the rider asked it when that is not whole minutes ("10 × 30 s sprints"). */
  duration_seconds?: number;
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
  /** Basic parser: no length was asked, so the default was planned (and the rider is told). */
  distance_defaulted?: boolean;
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
    if (iv.count < 1 || !(iv.duration_minutes > 0)) continue;
    // A 30 s sprint (0.5 min) stays 30 s for the rider; its stretch is sized as a minute.
    const seconds =
      typeof iv.duration_seconds === "number" && iv.duration_seconds > 0 ? Math.round(iv.duration_seconds)
      : !Number.isInteger(iv.duration_minutes) && iv.duration_minutes < 5 ? Math.round(iv.duration_minutes * 60)
      : undefined;
    intervals.push({
      count: Math.floor(iv.count),
      duration_minutes: Math.max(1, Math.round(iv.duration_minutes)),
      ...(seconds !== undefined && seconds % 60 !== 0 ? { duration_seconds: seconds } : {}),
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

/**
 * Geocoder signature — injectable so start-point resolution is testable.
 * `near` bounds the search to a box around a point; `prefer` only ranks the
 * hits by distance from it (the Laragh in Wicklow, not the one in Cavan).
 */
export type Geocoder = (
  place: string,
  countryCode?: string,
  near?: [number, number],
  prefer?: [number, number],
) => Promise<GeocodeHit | null>;

const NOT_A_PLACE_CLASS = new Set(["building", "shop", "office", "craft", "healthcare", "emergency", "club", "company"]);

async function geocodePlace(
  place: string,
  countryCode?: string,
  near?: [number, number],
  prefer?: [number, number],
): Promise<GeocodeHit | null> {
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
    type Hit = { class?: string; lat: string; lon: string; address?: { country?: unknown } };
    const places = (data as Hit[]).filter((h) => !NOT_A_PLACE_CLASS.has(h.class ?? ""));
    if (prefer) {
      const d = (h: Hit) => kmBetween(prefer, [parseFloat(h.lat), parseFloat(h.lon)]);
      places.sort((a, b) => d(a) - d(b));
    }
    const hit = places[0];
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
 * Words for where the rider already is — "here", "my hotel", "the villa" —
 * which are not place names: the start is their location.
 */
const SELF_PLACE = /^(?:(?:right |just )?(?:here|there)|(?:my |our |the )?(?:current |own )?location|where (?:i am|i'm|im|we are|we're)|(?:my |our |the )?(?:home|house|place|hotel|apartment|apt|flat|villa|airbnb|accommodation|b ?& ?b|campsite|front door|door))$/i;
/** "my hotel in Playa del Inglés" → "Playa del Inglés". */
const SELF_PLACE_IN = /\b(?:my|our|the)\s+(?:hotel|house|place|apartment|apt|flat|villa|airbnb|accommodation)\s+(?:in|at|near|on)\s+/gi;

/** The place a rider named, minus the words for where they already are (null when nothing is left). */
export function namedPlace(region: string | null | undefined): string | null {
  if (!region) return null;
  const r = region.replace(SELF_PLACE_IN, "").trim();
  return r && !SELF_PLACE.test(r) ? r : null;
}

/**
 * A geocoder hit further than this from the rider's phone is somebody
 * else's place ("Deia" in Romania for a rider in Mallorca) — unless they
 * said which one ("Figueres, Spain") or it is a place we know.
 */
export const MAX_START_FROM_ORIGIN_KM = 300;

/**
 * Where does the ride start? Trust rule: a place the rider NAMED must
 * resolve to that place or the request is declined — it is never quietly
 * replaced by the rider's location or a country centre. (That fallback once
 * planned "Girona" loops from the middle of Tipperary, and the rider was
 * told nothing.)
 *
 *   1. Known places (launch destinations, home-turf towns, typos of them).
 *   2. With the rider's location: bundled towns near them, then the
 *      geocoder around them; a hit more than MAX_START_FROM_ORIGIN_KM away
 *      is refused unless the rider said which one ("Figueres, Spain").
 *   3. Geocoder, restricted to the parsed country, then unrestricted — the
 *      parsed country is a guess when the prompt did not name one.
 *   4. No place named ("from here", "from my hotel") → the rider's location.
 */
export async function resolveStartPoint(
  region: string | undefined,
  country: string,
  origin: [number, number] | undefined,
  geocode: Geocoder = geocodePlace
): Promise<{ point: [number, number]; country: string; source: RouteSpec["start_source"] }> {
  const named = namedPlace(region);
  if (named) {
    const known = lookupKnownPlace(named);
    if (known) return { point: known.point, country: known.country, source: "known_place" };
    // "Laragh, Co. Wicklow" / "Figueres, Spain": the rider said which one.
    const qualified = named.includes(",");
    if (origin && !qualified) {
      const town = findPlaceNear(named, origin, MAX_START_FROM_ORIGIN_KM);
      if (town) return { point: [town.lat, town.lng], country, source: "geocoded" };
    }
    const attempts: Array<{ cc?: string; near?: [number, number] }> = [
      ...(origin ? [{ near: origin }] : []),
      { cc: countryToCode(country) },
      {},
    ];
    let far: GeocodeHit | null = null;
    for (const { cc, near } of attempts) {
      const hit = await geocode(named, cc, near, origin);
      if (!hit) continue;
      if (origin && !qualified && kmBetween(origin, hit.point) > MAX_START_FROM_ORIGIN_KM) {
        far ??= hit;
        continue;
      }
      return { point: hit.point, country: hit.country ?? country, source: "geocoded" };
    }
    if (far && origin) {
      throw new Error(
        `Couldn't find the location "${named}" near you — the only one we found is ${Math.round(kmBetween(origin, far.point))} km away. If that's the one you mean, add the country (e.g. "from ${named}, Spain").`
      );
    }
    throw new Error(
      `Couldn't find the location "${named}". Check the spelling or add the country (e.g. "from ${named}, Spain").`
    );
  }
  if (origin) return { point: origin, country, source: "origin" };
  throw new Error(
    "We don't know where to start — turn on your location or name a town (e.g. \"from Dublin\" or \"near Blessington\")."
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
  startName?: string,
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
  // Never dropped silently: the rider asked for this place, so say we could not find it.
  throw new Error(`We couldn't find ${name} near ${startName ?? "your start"}. Check the spelling, or name a nearby town.`);
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

/**
 * First words that make a phrase a description, not a place: "Hilly loop
 * from Girona", "Easy spin from Bray", "Sunday ride from Howth".
 */
const NOT_A_PLACE_WORD = new Set([
  ...NOT_A_DESTINATION,
  "loop", "route", "hilly", "flat", "flattish", "rolling", "easy", "hard", "quick", "fast", "slow", "long", "short",
  "big", "small", "little", "good", "nice", "lovely", "great", "scenic", "quiet", "coastal", "gentle", "steady",
  "some", "any", "all", "lots", "plenty", "few", "one", "two", "three", "four", "five", "six", "for", "to",
  "up", "down", "over", "under", "about", "around", "near", "at", "in", "on", "by", "of", "with", "without",
  "no", "not", "nothing", "please", "just", "out", "i", "i'm", "im", "we", "our", "your", "their", "there", "here",
  // Contractions, both apostrophes (iPhones type ’): "I’ve 20 mins threshold…" is not a place.
  "i've", "i’ve", "ive", "i’m", "i'd", "i’d", "id", "i'll", "i’ll", "we've", "we’ve", "we're", "we’re", "let's", "let’s",
  "me", "my", "can", "could", "would", "what", "how", "got", "have", "has",
  "hill", "climbs", "climbing", "roads", "road", "lanes", "lane", "gravel", "tarmac", "quiet", "back",
  "today", "tomorrow", "tonight", "morning", "afternoon", "evening", "weekend", "monday", "tuesday",
  "wednesday", "thursday", "friday", "saturday", "sunday", "threshold", "tempo", "sweet", "zone", "vo2",
  "sprint", "sprints", "intervals", "interval", "efforts", "effort", "repeats", "session", "workout",
  "endurance", "recovery", "max", "least", "most", "least", "pace", "speed", "wind", "tailwind", "headwind",
  "give", "want", "need", "looking", "find", "show", "plan", "build", "create", "generate", "hour", "hours",
  "mile", "miles", "km", "kms", "club", "group", "training", "coffee", "cafe", "café", "lunch", "cake", "from",
]);
/** Words that never belong inside a place name we would ride to. */
const DESCRIPTION_WORD = /\b(?:ride|loop|route|spin|hours?|hrs?|mins?|minutes?|km|kms|miles?|one|something|anything|workout|session|intervals?|efforts?|repeats?|roads?|lanes?|hills|climbs|climbing|please|today|tomorrow)\b/i;

const PLACE = "[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’. -]{1,50}?";
const DEST_END = "(?=\\s+(?:and|&|then|via|with|on|in|for|from|returning|return)\\b|\\s+\\d|[,.;!?]|$)";
const START_END = "(?=\\s+(?:and|with|on|for|i|i'm|we|to|via|then|tailwind|headwind)\\b|\\s+\\d|[,.;!?]|$)";

function normPlace(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Same place, however it is spelt ("Clontarf to Clontarf" is a loop). */
function samePlace(a: string, b: string): boolean {
  if (normPlace(a) === normPlace(b)) return true;
  const ka = lookupKnownPlace(a), kb = lookupKnownPlace(b);
  return !!ka && ka === kb;
}

/**
 * Is this phrase a place the rider named (not a description)? A place we
 * know, or a capitalised name that no description word starts or sits in.
 */
function looksLikePlace(s: string): boolean {
  if (!s || s.length < 3) return false;
  if (namedPlace(s) === null) return false;
  if (lookupKnownPlace(s)) return true;
  const first = s.toLowerCase().split(/\s+/)[0];
  return /^[A-ZÀ-Ý]/.test(s) && !NOT_A_PLACE_WORD.has(first) && !DESCRIPTION_WORD.test(s);
}

/**
 * "Pollença to Cap de Formentor and back", "ride from Bray to Glendalough",
 * "I'm in Calpe, want a route to Guadalest and back", "Rocacorba from Girona
 * and back", "Sally Gap loop from Rathfarnham", "from Calpe up Coll de Rates
 * and back", "coffee in Banyoles and back from Girona" → where the ride goes
 * and (when named) where it starts. Null when the prompt names no place to
 * ride TO — "finish in Kinsale", "loop from Dublin" and "from Clontarf to
 * Clontarf" are not destinations.
 */
export function parseDestination(prompt: string): { start: string | null; destination: string } | null {
  const text = prompt.replace(/\s+/g, " ").trim();
  const clean = (s: string) => s.trim().replace(/^the\s+/i, "").replace(/[\s'’.-]+$/, "");
  const firstWord = (s: string) => s.toLowerCase().split(/\s+/)[0];
  const ok = (s: string | undefined) => !!s && s.length >= 3 && !NOT_A_DESTINATION.has(firstWord(s));
  const result = (start: string | null, destination: string) =>
    start && samePlace(start, destination) ? null : { start, destination };
  /** The start named elsewhere in the prompt: "from X" / "in X" / "at X". */
  const startIn = (rest: string) => {
    const m = rest.match(new RegExp(`\\b(?:from|in|at)\\s+(${PLACE})${START_END}`, "i"));
    return m && ok(clean(m[1])) && namedPlace(clean(m[1])) ? clean(m[1]) : null;
  };

  // "[from] X to Y" — X at the start of the prompt (after an optional verb
  // phrase), or after "from".
  const fromTo = text.match(new RegExp(`\\bfrom\\s+(${PLACE})\\s+to\\s+(?:the\\s+)?(${PLACE})${DEST_END}`, "i"))
    ?? text.match(new RegExp(`^(?:(?:a\\s+)?(?:ride|route|spin|cycle)\\s+)?(${PLACE})\\s+to\\s+(?:the\\s+)?(${PLACE})${DEST_END}`, "i"));
  if (fromTo && ok(clean(fromTo[2])) && !/\b(?:ride|route|loop|spin|want|need|hour|km|out|back|there)\b/i.test(fromTo[1])) {
    return result(clean(fromTo[1]), clean(fromTo[2]));
  }

  // "... (ride|route|spin|out and back|there and back) [out] to Y ..." with
  // the start (if any) named by "from X" / "in X" / "at X".
  const toOnly = text.match(new RegExp(`\\b(?:ride|route|spin|cycle|loop|trip|back|head|go|going|out)\\s+(?:out\\s+)?to\\s+(?:the\\s+)?(${PLACE})${DEST_END}`, "i"));
  if (toOnly && ok(clean(toOnly[1]))) {
    return result(startIn(text.replace(toOnly[0], " ")), clean(toOnly[1]));
  }

  // "Rocacorba from Girona and back", "Sally Gap loop from Rathfarnham",
  // "Howth and back from Clontarf" — a place first, then where it starts.
  const placeFrom = text.match(new RegExp(`^(?:(?:a|an|the)\\s+)?(${PLACE})\\s+(?:(?:and|&)\\s+back\\s+|loop\\s+|ride\\s+|spin\\s+)?from\\s+(${PLACE})${START_END}`, "i"));
  if (placeFrom && looksLikePlace(clean(placeFrom[1])) && namedPlace(clean(placeFrom[2]))) {
    return result(clean(placeFrom[2]), clean(placeFrom[1]));
  }

  // "up Coll de Rates", "over the Sally Gap", "via Glendalough", "climb Rocacorba".
  const climb = text.match(new RegExp(`\\b(?:up|over|via|climb|climbing|summit)\\s+(?:the\\s+)?(${PLACE})${DEST_END}`, "i"));
  if (climb && looksLikePlace(clean(climb[1]))) {
    return result(startIn(text.replace(climb[0], " ")), clean(climb[1]));
  }

  // "coffee in Banyoles", "café stop at Roundwood", "lunch in Deià".
  const cafe = text.match(new RegExp(`\\b(?:coffee|caf[eé]|cake|lunch|brunch|tea)\\s+(?:stop\\s+)?(?:in|at)\\s+(${PLACE})${DEST_END}`, "i"));
  if (cafe && looksLikePlace(clean(cafe[1]))) {
    return result(startIn(text.replace(cafe[0], " ")), clean(cafe[1]));
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

/**
 * Efforts written with no intensity word ("6x3 min", "hill repeats 6x3"):
 * hill repeats and short reps are VO2 work, over-unders and longer reps
 * threshold.
 */
function inferZone(text: string, minutes: number): IntensityZone {
  if (/\bhill\s*(?:repeats?|reps?|efforts?|sprints?)\b/.test(text)) return "z5";
  if (/\bover[\s-]?unders?\b/.test(text)) return "z4";
  return minutes <= 5 ? "z5" : "z4";
}

const ZONE_LABEL: Record<IntensityZone, string> = {
  z1: "recovery", z2: "endurance", z3: "tempo", z4: "threshold", z5: "vo2max", z6: "anaerobic", z7: "sprint",
};

/** "2 × 20 min threshold", "10 × 30 s sprint" — the session as the rider asked it. */
export function workoutSummary(w: WorkoutSpec): string {
  return w.intervals
    .map((iv) => `${iv.count} × ${iv.duration_seconds ? `${iv.duration_seconds} s` : `${iv.duration_minutes} min`} ${ZONE_LABEL[iv.zone]}`)
    .join(", then ");
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
  // "10 x 30s sprints" stays 30 s for the rider (the stretch is sized in whole minutes).
  const secs = (n: number, unit: string | undefined) =>
    /^s/.test(unit ?? "") && n % 60 !== 0 ? { duration_seconds: Math.round(n) } : {};

  // "4x4 mins vo2 max", "2 x 20 min threshold" (zone right after, or anywhere in the
  // prompt, or read from the session: "hill repeats 6x3 min"). Never "2x2 hours".
  const reps = new RegExp(String.raw`(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)(?![\d.]|\s*(?:h|hrs?|hours?|km|k|mi|miles?)\b)\s*(${UNIT})\s*(?:(?:min(?:ute)?s?\s+)?(?:of|at|@)\s*)?(?:hard\s+|max\s+)?(?:${ZONE_RE.source})?`, "g");
  for (const m of text.matchAll(reps)) {
    const minutes = toMin(parseFloat(m[2]), m[3]);
    const zone = zoneOf(m[4] ?? "") ?? zoneOf(text) ?? inferZone(text, minutes);
    intervals.push({ count: parseInt(m[1], 10), duration_minutes: minutes, ...secs(parseFloat(m[2]), m[3]), zone });
    stripped = stripped.replace(m[0], " ");
  }
  // "20 mins threshold", "a 20 minute ftp effort", "30 min of tempo".
  if (intervals.length === 0) {
    const single = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(${UNIT})\s*(?:of\s+|at\s+|@\s*)?${ZONE_RE.source}`, "g");
    for (const m of text.matchAll(single)) {
      const zone = zoneOf(m[3]);
      if (!zone) continue;
      intervals.push({ count: 1, duration_minutes: toMin(parseFloat(m[1]), m[2]), ...secs(parseFloat(m[1]), m[2]), zone });
      stripped = stripped.replace(m[0], " ");
    }
  }
  // Zone first: "tempo 40 min", "threshold for 20 mins" (a unit is required:
  // "tempo 3 hours" is a ride, not an effort).
  if (intervals.length === 0) {
    const zoneFirst = new RegExp(String.raw`${ZONE_RE.source}\s*(?:efforts?\s+|intervals?\s+|block\s+)?(?:for\s+|of\s+)?(\d+(?:\.\d+)?)\s*(secs?|seconds?|s|mins?|minutes?|m)(?![a-z])`, "g");
    for (const m of text.matchAll(zoneFirst)) {
      const zone = zoneOf(m[1]);
      if (!zone) continue;
      intervals.push({ count: 1, duration_minutes: toMin(parseFloat(m[2]), m[3]), ...secs(parseFloat(m[2]), m[3]), zone });
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
      ...(iv.duration_seconds ? { duration_seconds: iv.duration_seconds } : {}),
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

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90, hundred: 100,
};
const NUMBER_WORD = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|fou?rty|fifty|sixty|seventy|eighty|ninety|hundred)";
const LENGTH_UNIT = "(?:hours?|hrs?|minutes?|mins?|km|kms|kilometres?|kilometers?|k|miles?)";

/**
 * Lengths said the way riders say them, as digits: "sixty km" → "60 km",
 * "an hour and a half" → "1.5 hours", "half day" → "4 hours", "couple of
 * hours" → "2 hours", "2h30" → "2.5 hours". Only number words right before a
 * unit are converted ("Two Rock" stays a mountain).
 */
export function normaliseLengths(text: string): string {
  let t = text.toLowerCase().replace(/[–—]/g, "-");
  t = t.replace(/\b(?:an?|one)\s+hour\s+and\s+a\s+half\b|\bhour\s+and\s+a\s+half\b|\bone\s+and\s+a\s+half\s+hours?\b/g, "1.5 hours");
  t = t.replace(/\bhalf\s+an\s+hour\b/g, "30 min");
  t = t.replace(/\ban?\s+hour\b/g, "1 hour");
  t = t.replace(/\bhalf[\s-]+(?:a\s+)?day\b/g, "4 hours");
  t = t.replace(/\b(?:a\s+)?couple\s+(?:of\s+)?hours\b/g, "2 hours");
  t = t.replace(/\b(?:a\s+)?few\s+hours\b/g, "3 hours");
  // Number words before a unit: "seventy five km", "one hundred and twenty k", "two and a half hours".
  t = t.replace(new RegExp(`\\b(${NUMBER_WORD}(?:(?:\\s+|-)(?:and\\s+)?${NUMBER_WORD})*)(\\s+and\\s+a\\s+half)?(?=\\s*${LENGTH_UNIT}\\b)`, "g"), (_m, words: string, half?: string) => {
    let n = 0;
    for (const w of words.split(/[\s-]+/)) {
      if (w === "and") continue;
      const v = NUMBER_WORDS[w];
      if (v === undefined) continue;
      n = v === 100 ? Math.max(1, n) * 100 : n + v;
    }
    return String(half ? n + 0.5 : n);
  });
  t = t.replace(/\b(\d+)\s+and\s+a\s+half\s+(hours?|hrs?)\b/g, (_m, n: string) => `${parseInt(n, 10) + 0.5} hours`);
  t = t.replace(/\b(\d+)\s*(?:hours?|hrs?)\s+and\s+a\s+half\b/g, (_m, n: string) => `${parseInt(n, 10) + 0.5} hours`);
  t = t.replace(/\b(\d+)\s*h\s*(\d{1,2})\b(?!\s*(?:km|k|min))/g, (_m, h: string, m: string) => `${parseInt(h, 10) + parseInt(m, 10) / 60} hours`);
  return t;
}

/** Where a place name stops: a description, a length or the next clause ("Lagos nothing too hilly", "Calpe for"). */
const PLACE_STOP = /\s+(?:to|for|nothing|not|no|avoid(?:ing)?|without|flat|flattish|hilly|rolling|hills|climbs?|climbing|mountainous|loop|ride|route|spin|please|today|tomorrow|tonight|this|next|at|around|near|via|up|over|through|towards?|then|but|or|with|on|in|and|&|tailwind|headwind|into|about|max|easy|hard|steady|quiet|scenic|coastal|gravel|road|mtb|km|kms|hours?|hrs?|mins?|minutes?|miles?|return(?:ing)?|finish(?:ing)?|ending|back|that|which|where|if|i|i'm|we)\b.*$/i;

/** Trim a captured place at the first description or filler word. */
export function trimPlace(s: string): string {
  return s.replace(PLACE_STOP, "").replace(/[\s'’.,-]+$/, "").trim();
}

/** ", Co. Wicklow" / ", Spain" after a place: which one the rider means (kept for the geocoder). */
const QUALIFIER = /^\s*,\s*((?:co\.?|county)\s+[A-Za-zÀ-ÿ]+|northern ireland|ireland|spain|españa|portugal|italy|france|uk|england|wales|scotland|mallorca|majorca|gran canaria|tenerife|lanzarote|catalonia|catalunya|andalucia|andalucía|algarve|tuscany|toscana)\b/i;
/** A place ends at punctuation (not the dot of "St." / "Co."), a number or the end. */
const PLACE_END = String.raw`(?=[,;!?()]|(?<!\b(?:[Ss]t|[Cc]o|[Mm]t|[Ss]te))\.(?:\s|$)|\s+\d|$)`;
const PLACE_TEXT = String.raw`([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’. -]{1,60}?)`;

/**
 * Where does the ride start, in words? (No lookups beyond our own place
 * list — the start is resolved later.) "self" when the rider said where
 * they already are ("from here", "from my hotel").
 *   1. "from X" (with its ", Co. Wicklow" qualifier).
 *   2. A leading "X and back".
 *   3. "in / at / near / around / starting at / desde X".
 *   4. A known place anywhere in the prompt ("malaga hills 70 km").
 *   5. A capitalised name before a number ("Kinsale 60km").
 */
function findStartPlace(text: string): string | "self" | null {
  const from = text.match(new RegExp(String.raw`\bfrom\s+${PLACE_TEXT}${PLACE_END}`, "i"));
  if (from) {
    const place = trimPlace(from[1]);
    if (place && namedPlace(place) === null) return "self";
    if (place && looksLikePlaceOrKnown(place)) {
      const qualifier = text.slice((from.index ?? 0) + from[0].length).match(QUALIFIER);
      return qualifier ? `${place}, ${qualifier[1]}` : place;
    }
  }
  const andBack = text.match(new RegExp(String.raw`^(?:(?:a|an|the)\s+)?${PLACE_TEXT}\s+(?:and|&)\s+back\b`, "i"));
  if (andBack && looksLikePlace(trimPlace(andBack[1]))) return trimPlace(andBack[1]);
  const at = new RegExp(String.raw`\b(?:starting\s+(?:at|in|from)|start\s+(?:at|in)|based\s+(?:in|at)|staying\s+(?:in|at)|desde|in|at|near|around)\s+${PLACE_TEXT}${PLACE_END}`, "gi");
  for (const m of text.matchAll(at)) {
    const place = trimPlace(m[1]);
    if (place && looksLikePlace(place)) return place;
  }
  const known = findKnownPlaceIn(text);
  if (known) return known.place.name;
  const lead = text.match(/^([A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]*(?:\s+(?:de|del|la|las|los|el|di|da|do|of|[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]*)){0,3})\s*,?\s+\d/);
  if (lead && looksLikePlace(lead[1])) return lead[1];
  if (/\b(?:from|at|near|around)\s+(?:here|my (?:current )?location|where i am)\b/i.test(text)) return "self";
  return null;
}

/** "from X": the rider said it is a place — only descriptions ("from scratch") are refused. */
function looksLikePlaceOrKnown(s: string): boolean {
  if (lookupKnownPlace(s)) return true;
  const first = s.toLowerCase().split(/\s+/)[0];
  return !NOT_A_PLACE_WORD.has(first) && !DESCRIPTION_WORD.test(s);
}

/**
 * Deterministic fallback parser — no LLM. Handles the structured-form
 * prompt format and free text the way riders type it (and say it: number
 * words, "an hour and a half", places without "from") so that a model
 * outage degrades to "plain requests still work" instead of "the product
 * is down".
 */
export function parseBasicIntent(prompt: string): ParsedIntent | null {
  const p = normaliseLengths(prompt);

  // Structured efforts ("20 mins threshold", "4x4 min VO2 max") are parsed
  // here too, so a rider's session never depends on the model being up. An
  // intensity word we cannot turn into a session is declined (never served
  // as a plain ride that silently drops the efforts).
  const session = parseBasicWorkout(p);
  const mentionsEfforts = /\d\s*[x×]\s*\d|\binterval|\bthreshold\b|\bftp\b|\btempo\b|\bvo2|sweet\s*spot|\banaerobic\b|\bsprints?\b|\bzone\s*[3-7]\b|\bz[3-7]\b|\brepeats\b|\bover[\s-]?unders?\b/.test(p);
  if (mentionsEfforts && !session) return null;
  // The session's own minutes are not the ride's length: "20 mins
  // threshold … 4 hour ride" is a 4-hour ride.
  const pNoSession = session ? session.stripped.toLowerCase() : p;

  // Duration: "2 hour", "1.5 hours", "90 min"
  let duration: number | null = null;
  const hourMatch = pNoSession.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  const minMatch = pNoSession.match(/(\d+)\s*(?:minutes?|mins?)\b/);
  if (hourMatch) duration = Math.round(parseFloat(hourMatch[1]) * 60);
  if (minMatch) duration = (duration ?? 0) + parseInt(minMatch[1], 10);

  // Distance: "60km", "80k", "70kms", "40 mile"
  let distance: number | null = null;
  // Negative lookahead: "30km/h" is a pace, not a distance.
  const kmMatch = pNoSession.match(/(\d+(?:\.\d+)?)\s*(?:km|kms|k|kilometres?|kilometers?)\b(?!\s*\/?\s*h\b)/);
  const miMatch = pNoSession.match(/(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/);
  if (kmMatch) distance = Math.round(parseFloat(kmMatch[1]));
  else if (miMatch) distance = Math.round(parseFloat(miMatch[1]) * 1.609);

  // Where it starts and (maybe) where it goes. "from my hotel in Playa del
  // Inglés" is Playa del Inglés; "from here" / "from my hotel" is the
  // rider's own location. A place named makes a distance-less prompt
  // specific enough to default (spec: neither distance nor duration →
  // default 50 km).
  const text = prompt.replace(/\s+/g, " ").replace(SELF_PLACE_IN, "").trim();
  const dest = parseDestination(text);
  const found = dest?.start ?? findStartPlace(dest ? text.replace(dest.destination, " ") : text);
  const region = found === "self" ? null : found;

  // "Clontarf 60" — a bare 20–200 next to a named place is kilometres.
  if (duration === null && distance === null && !session && region) {
    const bare = pNoSession.match(/(?<![\d.x×:/-])\b(\d{2,3})\b(?![\d.]|\s*(?:[x×%:]|am\b|pm\b|th\b|st\b|nd\b|rd\b|w\b|watts|bpm|kg|m\b|metres?|meters?|s\b|secs?))/);
    const n = bare ? parseInt(bare[1], 10) : NaN;
    if (n >= 20 && n <= 200) distance = n;
  }

  // A destination ride's length is the road there and back.
  let distanceDefaulted = false;
  if (duration === null && distance === null && !dest && !session) {
    // Truly vague ("give me a ride") — no distance, no time, no place.
    if (!region && found !== "self") return null;
    // A place is named ("gravel loop from Dublin") — default the distance
    // rather than declining a perfectly reasonable ask, and say so.
    distance = DEFAULT_DISTANCE_KM;
    distanceDefaulted = true;
  }

  const discipline: Discipline =
    /\bgravel\b/.test(p) ? "gravel" : /\bmtb|mountain bike\b/.test(p) ? "mtb" : "road";

  // Strip "mountain bike" before terrain matching so the discipline
  // phrase doesn't read as mountainous terrain. Negations first: "nothing
  // too hilly" is not a hilly ask.
  const pTerrain = p.replace(/mountain\s*bike/g, "");
  const elevation_preference: ElevationPreference =
    /\bnot\s+(?:bothered|fussed|worried)\s+(?:about|by|with)\s+(?:the\s+)?(?:climbs?|climbing|hills)|\bdon'?t\s+mind\s+(?:the\s+|some\s+)?(?:climbs?|climbing|hills)|\bany\s+terrain\b/.test(pTerrain) ? "any"
    : /\b(?:nothing|not)\s+too\s+(?:hilly|steep|lumpy|hard|mad|crazy)\b|\bnot\s+(?:very|that|so)\s+hilly\b/.test(pTerrain) ? "rolling"
    : /\bflat(?:tish|-ish|\s+ish)?\b|\bno\s+(?:big\s+|major\s+|real\s+|steep\s+|serious\s+)?(?:climb|climbs|climbing|hills)\b|\bavoid(?:ing)?\s+(?:the\s+|any\s+)?(?:hills|climbs|climbing)\b|\bwithout\s+(?:any\s+|big\s+)?(?:hills|climbs|climbing)\b|\bnot\s+hilly\b/.test(pTerrain) ? "flat"
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

  const cafe_stop = /\bcaf[eé]\b|\bcoffee\b|stop\s+for\s+coffee/.test(p);

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
    // The country of the place named, not a guess (Girona is in Spain).
    country: (region ? lookupKnownPlace(region)?.country : undefined) ?? DEFAULT_COUNTRY,
    wind_strategy: wind,
    cafe_stop,
    workout: session?.workout ?? null,
    ...(distanceDefaulted ? { distance_defaulted: true } : {}),
  };
}

/**
 * "No distance given — planned 50 km": said when the rider named no
 * length (and no session or destination set one) so the 50 km is never
 * passed off as their ask.
 */
export function defaultLengthNotice(prompt: string, distanceKm: number): string | null {
  const basic = parseBasicIntent(prompt);
  return basic?.distance_defaulted && distanceKm === DEFAULT_DISTANCE_KM
    ? `No distance given — planned ${DEFAULT_DISTANCE_KM} km`
    : null;
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
  // From the phone's location, the country is where the phone is (not the default).
  const country = resolved.source === "origin"
    ? nearestKnownPlace(startPoint, 150)?.country ?? resolved.country
    : resolved.country;
  // "calpe" shows as Calpe, "soler" as Sóller; "my hotel" shows as the town the phone is in.
  const named = namedPlace(region);
  const shownRegion = named ? displayPlaceName(named) : undefined;

  // Destination ride: where it goes must resolve near the start (trust rule).
  // "From Clontarf to Clontarf" is a loop: a destination at the start is none.
  let destinationName = typeof parsed.destination === "string" && parsed.destination.trim().length >= 3 ? parsed.destination.trim() : null;
  if (destinationName && region && samePlace(destinationName, region)) destinationName = null;
  const destinationPoint = destinationName
    ? await resolveDestination(destinationName, startPoint, country, undefined, shownRegion)
    : null;
  const destination = destinationName && destinationPoint && kmBetween(startPoint, destinationPoint) >= 1
    ? {
        name: displayPlaceName(destinationName),
        point: destinationPoint,
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
    region: shownRegion,
    country,
    workout,
    wind_strategy: sanitizeWindStrategy(parsed.wind_strategy),
    cafe_stop: parsed.cafe_stop === true,
    parser,
    start_source: resolved.source,
    ...(destination ? { destination } : {}),
  };
}
