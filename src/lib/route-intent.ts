/**
 * Route Intent Parser
 *
 * Takes natural language cycling route requests and extracts a structured
 * RouteSpec using Claude. Geocodes place names via Nominatim, constrained
 * to Ireland by default for the v1 launch.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { IntensityZone } from "./intensity";
import { ZONES } from "./intensity";

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

## Region & country:
- Extract the region/town/city mentioned if any ("Wicklow", "Dublin", "from Blessington"). Set region to that.
- Always set country to "Ireland" unless another country is explicitly named. This is Ireland-first.
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
- ALSO set duration_minutes at the top level to total_minutes so the route length honours the session length
- Set elevation_preference to "flat" for threshold/tempo/sweet-spot workouts unless the rider asks for hills (these zones need steady terrain). VO2/hill-repeat workouts can use "rolling".

If no workout is described, omit the workout field (set it to null).

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
  "country": string,
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
  country: string;
  workout: WorkoutSpec | null;
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

async function geocodePlace(
  place: string,
  country: string
): Promise<[number, number] | null> {
  const params = new URLSearchParams({
    q: place,
    format: "json",
    limit: "1",
    countrycodes: countryToCode(country),
  });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "loops.ie route generator (https://www.loops.ie)" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
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

export async function parseRouteIntent(
  prompt: string,
  options: ParseRouteIntentOptions = {}
): Promise<RouteSpec> {
  const userSpeedKmh = options.userSpeedKmh ?? BASELINE_SPEED_KMH;
  const origin = options.origin;
  const client = new Anthropic();

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

  let parsed: ParsedIntent;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 200)}`);
    }
    parsed = JSON.parse(match[0]);
  }

  // ── Resolve distance from duration if needed ────────────────────────────────
  const discipline = parsed.discipline;
  const elevationPref = parsed.elevation_preference;
  const workout = sanitizeWorkout(parsed.workout);

  let distanceKm = parsed.distance_km ?? null;
  // A workout fully defines the session length — prefer its total_minutes
  // over a free-text duration if both exist.
  const durationMin = workout
    ? workout.total_minutes
    : parsed.duration_minutes ?? null;

  if (distanceKm === null && durationMin !== null) {
    distanceKm = durationToDistanceKm(durationMin, discipline, elevationPref, userSpeedKmh);
  }
  if (distanceKm === null) {
    distanceKm = DEFAULT_DISTANCE_KM;
  }

  // Clamp to sane bounds — the LLM occasionally emits nonsense for ambiguous prompts
  distanceKm = Math.max(MIN_DISTANCE_KM, Math.min(MAX_DISTANCE_KM, distanceKm));

  const distanceToleranceKm =
    parsed.distance_tolerance_km ?? Math.max(5, Math.round(distanceKm * 0.1));

  // ── Resolve country + region → start point ──────────────────────────────────
  const country = parsed.country || DEFAULT_COUNTRY;
  const region = parsed.region ?? undefined;

  let startPoint: [number, number] | null = null;

  // A place named in the prompt always wins ("ride in Girona" while sitting
  // in Dublin should plan Girona).
  if (region) {
    startPoint = await geocodePlace(region, country);
  }

  // No place named (or it failed to geocode) → use the rider's current
  // location. This is the core "I'm here now, give me a ride" path.
  if (!startPoint && origin) {
    startPoint = origin;
  }

  // Last resort: country centre. Better than failing, but a poor start.
  if (!startPoint) {
    startPoint = await geocodePlace(country, country);
  }

  if (!startPoint) {
    throw new Error(
      `Could not work out where to start. Allow location access, or name a starting point (e.g. "from Dublin" or "near Blessington").`
    );
  }

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
  };
}
