/**
 * Ride time — the ONE model every surface uses.
 *
 * Riding time at a steady club pace; stops, wind, weather and group size are
 * not included (wind stays in wind.ts / ride-wind.ts).
 *
 *   cruise_kmh = CRUISE_SPEED_KMH[discipline] * (riderSpeed ?? DEFAULT) / DEFAULT
 *   minutes    = 60 * (distance_km + elevation_gain_m * CLIMB_KM_PER_100M / 100) / cruise_kmh
 *
 * On road the rider's own avg_speed_kmh is a straight replacement of the
 * default; on gravel/mtb the discipline default scales by the same ratio, so
 * a 30 km/h roadie is never timed at 30 km/h on an MTB loop.
 *
 * Exact minutes are kept internally (tier filters, sort, weather windows) and
 * never shown: an estimate is good to about ±15 %, so display rounds to
 * 5 min under an hour, a quarter hour up to 3 hours and a half hour above.
 * From 5 hours the prose form widens to a range.
 *
 * db.ts getRoutes computes the same arithmetic in SQL via rideMinutesSql(),
 * built from the same constants, so one route can never show two times.
 */
import {
  CLIMB_KM_PER_100M,
  CRUISE_SPEED_KMH,
  DEFAULT_SPEED_KMH,
  MAX_SPEED_KMH,
  MIN_SPEED_KMH,
} from "@/config/constants";

export type RideDiscipline = keyof typeof CRUISE_SPEED_KMH;

export interface RideTimeInput {
  distance_km: number;
  elevation_gain_m: number;
  /** road | gravel | mtb | mixed; anything else is treated as mixed. */
  discipline?: string | null;
  /** The rider's own avg_speed_kmh (profile); omit for the club default. */
  avgSpeedKmh?: number | null;
}

/** Normalise a stored discipline to one the model knows. */
export function rideDiscipline(discipline?: string | null): RideDiscipline {
  const d = (discipline ?? "").toLowerCase();
  return d in CRUISE_SPEED_KMH ? (d as RideDiscipline) : "mixed";
}

/** A rider's speed within the profile bounds; the default when absent/invalid. */
export function clampSpeedKmh(avgSpeedKmh?: number | null): number {
  const n = Number(avgSpeedKmh);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SPEED_KMH;
  return Math.min(MAX_SPEED_KMH, Math.max(MIN_SPEED_KMH, n));
}

/** Cruising speed on the flat for this discipline and rider. */
export function cruiseSpeedKmh(discipline?: string | null, avgSpeedKmh?: number | null): number {
  return (CRUISE_SPEED_KMH[rideDiscipline(discipline)] * clampSpeedKmh(avgSpeedKmh)) / DEFAULT_SPEED_KMH;
}

/** Riding minutes (rounded to the minute). Never display this directly. */
export function estimateRideMinutes(input: RideTimeInput): number {
  const distance = Math.max(0, Number(input.distance_km) || 0);
  const climb = Math.max(0, Number(input.elevation_gain_m) || 0);
  const effectiveKm = distance + (climb * CLIMB_KM_PER_100M) / 100;
  const cruise = cruiseSpeedKmh(input.discipline, input.avgSpeedKmh);
  return Math.round((60 * effectiveKm) / cruise);
}

/**
 * The SQL twin of estimateRideMinutes for a `routes r` row, built from the
 * same constants. `speedParam` is the bound rider speed (e.g. "$3"), already
 * clamped with clampSpeedKmh in JS.
 */
export function rideMinutesSql(speedParam: string): string {
  const cases = (Object.keys(CRUISE_SPEED_KMH) as RideDiscipline[])
    .filter((d) => d !== "road")
    .map((d) => `WHEN '${d}' THEN ${CRUISE_SPEED_KMH[d]}`)
    .join(" ");
  const cruise = `((CASE r.discipline ${cases} ELSE ${CRUISE_SPEED_KMH.road} END) * ${speedParam}::numeric / ${DEFAULT_SPEED_KMH}.0)`;
  return `((r.distance_km + r.elevation_gain_m * ${CLIMB_KM_PER_100M} / 100.0) / ${cruise} * 60)`;
}

// ── Display ────────────────────────────────────────────────────────────────

/** The display step for a raw estimate: 5 min, a quarter hour, a half hour. */
export function rideTimeStepMinutes(rawMinutes: number): number {
  if (rawMinutes < 60) return 5;
  if (rawMinutes < 180) return 15;
  return 30;
}

/** Raw minutes rounded to the display step (display only). */
export function roundRideMinutes(rawMinutes: number): number {
  const step = rideTimeStepMinutes(rawMinutes);
  return Math.max(step, Math.round(rawMinutes / step) * step);
}

const FRACTIONS: Record<number, string> = { 0: "", 15: "¼", 30: "½", 45: "¾" };

/** "1", "1¼", "3½" — rounded minutes as hours with a vulgar fraction. */
function hoursLabel(roundedMinutes: number): string {
  const h = Math.floor(roundedMinutes / 60);
  const frac = FRACTIONS[roundedMinutes % 60] ?? "";
  return `${h}${frac}`;
}

/** Raw estimates from 5 h up are shown as a range in prose. */
export const RIDE_TIME_RANGE_FROM_MINUTES = 300;

export interface FormatRideTimeOptions {
  /** "card": "~3½h"; "prose": "around 3½ hours" / "4½–5½ hours". */
  style: "card" | "prose";
  /** Prose only: widen to a range from 5 h (default true). */
  range?: boolean;
  /** Card only: prefix with "~" (default true). */
  approx?: boolean;
}

/**
 * The rounded display form of a raw riding-time estimate. Minutes past the
 * hour are never printed once the ride is over an hour.
 */
export function formatRideTime(rawMinutes: number, options: FormatRideTimeOptions): string {
  const rounded = roundRideMinutes(rawMinutes);
  if (options.style === "card") {
    const tilde = options.approx === false ? "" : "~";
    return rounded < 60 ? `${tilde}${rounded} min` : `${tilde}${hoursLabel(rounded)}h`;
  }
  if (rounded < 60) return `around ${rounded} minutes`;
  if ((options.range ?? true) && rawMinutes >= RIDE_TIME_RANGE_FROM_MINUTES) {
    return `${hoursLabel(rounded - 30)}–${hoursLabel(rounded + 30)} hours`;
  }
  return `around ${hoursLabel(rounded)} hour${rounded === 60 ? "" : "s"}`;
}

/** "steady club pace (about 25 km/h on the flat)" etc. — the one stated assumption. */
function paceClause(discipline: RideDiscipline, cruise: number): string {
  const kmh = `about ${Math.round(cruise)} km/h`;
  switch (discipline) {
    case "gravel":
      return `at a steady gravel pace (${kmh})`;
    case "mtb":
      return `at a steady trail pace (${kmh})`;
    default:
      return `at a steady club pace (${kmh} on the flat)`;
  }
}

/**
 * The FAQ / route-detail sentence(s): "Allow around 3½ hours of riding at a
 * steady club pace (about 25 km/h on the flat). Coffee stops and a headwind
 * go on top." Pass the rider's own speed only where it was actually used.
 */
export function rideTimeSentence(input: RideTimeInput): string {
  const minutes = estimateRideMinutes(input);
  const time = formatRideTime(minutes, { style: "prose" });
  const isRange = minutes >= RIDE_TIME_RANGE_FROM_MINUTES && roundRideMinutes(minutes) >= 60;

  if (input.avgSpeedKmh != null) {
    return `Allow ${time} of riding at your ${Math.round(clampSpeedKmh(input.avgSpeedKmh))} km/h.`;
  }

  const discipline = rideDiscipline(input.discipline);
  const pace = paceClause(discipline, cruiseSpeedKmh(discipline));
  if (isRange) {
    const why = minutes >= 360
      ? "a long day; the climbs and how you fuel decide where you land"
      : "the climbs decide where you land";
    return `Allow ${time} of riding ${pace} — ${why}. Stops go on top.`;
  }
  const tail = discipline === "road" || discipline === "mixed"
    ? "Coffee stops and a headwind go on top."
    : "Stops go on top.";
  return `Allow ${time} of riding ${pace}. ${tail}`;
}
