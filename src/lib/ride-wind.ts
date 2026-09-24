/**
 * The ride verdict: what the wind (and rain) will do to THIS loop at THIS
 * time — "into it on the way out, at your back coming home".
 *
 * Time-aware: each stretch of the route is judged against the forecast
 * for the hour the rider actually reaches it (start + distance / speed),
 * not the wind at the start. Pure — used by the weather card in the
 * browser and by tests.
 *
 * Honesty (launch spec): below MIN_WIND_KMH the wind is not worth
 * planning around and we say exactly that.
 */

import { bearing, compassPoint, MIN_WIND_KMH } from "./wind";
import { haversine } from "./climb-detection";

export interface ForecastHour {
  /** Wall-clock local hour, "2026-09-26T09:00". */
  time: string;
  temperature: number;
  precipitation: number;               // mm in the hour
  precipitationProbability?: number | null; // %
  windSpeed: number;                   // km/h
  windDirection: number;               // degrees, FROM
  windGusts?: number | null;           // km/h
  weatherCode: number;
}

export interface RideVerdict {
  /** One or two plain sentences, rider-facing. */
  headline: string;
  /** Optional second line: rain/gusts. */
  detail: string | null;
  headwind_km: number;
  tailwind_km: number;
  crosswind_km: number;
  /** -1..1, distance-weighted, first half / second half. */
  out_alignment: number;
  home_alignment: number;
  /** Wind is under MIN_WIND_KMH for the whole ride. */
  light: boolean;
}

interface Seg { b: number; len: number; at: number }

function segments(coords: [number, number][]): { segs: Seg[]; total: number } {
  const segs: Seg[] = [];
  let at = 0;
  for (let i = 1; i < coords.length; i++) {
    const len = haversine(coords[i - 1], coords[i]);
    if (len <= 0) continue;
    segs.push({ b: bearing(coords[i - 1], coords[i]), len, at });
    at += len;
  }
  return { segs, total: at };
}

/** Hour index the rider is in at `km` into the ride. */
function hourAt(km: number, speedKmh: number, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor(km / speedKmh)));
}

function score(segs: Seg[], total: number, hours: ForecastHour[], speedKmh: number) {
  let head = 0, tail = 0, cross = 0, outW = 0, outL = 0, homeW = 0, homeL = 0;
  for (const s of segs) {
    const b = s.b;
    const mid = s.at + s.len / 2;
    const h = hours[hourAt(mid, speedKmh, hours.length)];
    const windTo = (h.windDirection + 180) % 360;
    // Weight by strength: a 30 km/h headwind matters more than a 9 km/h one.
    const strength = Math.min(1, h.windSpeed / 25);
    const c = Math.cos(((b - windTo) * Math.PI) / 180);
    if (h.windSpeed >= MIN_WIND_KMH) {
      if (c > 0.34) tail += s.len; else if (c < -0.34) head += s.len; else cross += s.len;
    }
    if (mid <= total / 2) { outW += c * strength * s.len; outL += s.len; }
    else { homeW += c * strength * s.len; homeL += s.len; }
  }
  return {
    head, tail, cross,
    out: outL ? outW / outL : 0,
    home: homeL ? homeW / homeL : 0,
  };
}

const hhmm = (t: string) => t.slice(11, 16).replace(/^0/, "");

export function rideVerdict(
  coords: [number, number][],
  hours: ForecastHour[],
  speedKmh = 25
): RideVerdict | null {
  if (coords.length < 2 || hours.length === 0) return null;
  const { segs, total } = segments(coords);
  if (total < 1) return null;
  const rideHours = hours.slice(0, Math.max(1, Math.ceil(total / speedKmh) + 1));

  const fwd = score(segs, total, rideHours, speedKmh);
  const maxWind = Math.max(...rideHours.map((h) => h.windSpeed));
  const light = maxWind < MIN_WIND_KMH;

  // Representative wind: the strongest hour's direction and the range over
  // the ride ("SW 18–20 km/h"), so it agrees with the start-hour figure
  // shown above it on the card.
  const strongest = rideHours.reduce((a, h) => (h.windSpeed > a.windSpeed ? h : a), rideHours[0]);
  const lo = Math.round(Math.min(...rideHours.map((h) => h.windSpeed)));
  const hi = Math.round(maxWind);
  const wind = `${compassPoint(strongest.windDirection)} ${lo === hi ? lo : `${lo}–${hi}`} km/h`;

  // Note: riding the loop the other way round does NOT change the out/home
  // balance under a steady wind (the start point decides it), so we never
  // suggest that — we just say what will happen.
  let headline: string;
  if (light) {
    headline = `Light winds (${Math.round(maxWind)} km/h at most) — not worth planning around.`;
  } else if (fwd.out < -0.12 && fwd.home > 0.12) {
    headline = `${wind}: into it on the way out, at your back coming home. The right way round.`;
  } else if (fwd.out > 0.12 && fwd.home < -0.12) {
    headline = `${wind}: a push on the way out, into it coming home — save something for the finish.`;
  } else if (fwd.cross > fwd.head + fwd.tail) {
    headline = `${wind}: mostly a crosswind on this loop.`;
  } else {
    // Every km accounted for: the rest of the loop is crosswind.
    const cross = Math.round(fwd.cross);
    headline = `${wind}: about ${Math.round(fwd.head)} km into it and ${Math.round(fwd.tail)} km with it at your back${cross >= 5 ? `; the other ${cross} km a crosswind` : ""}.`;
  }

  // Rain and gusts across the ride window.
  const notes: string[] = [];
  const wet = rideHours.find((h) => (h.precipitationProbability ?? 0) >= 50 || h.precipitation >= 0.5);
  if (wet) notes.push(`Rain likely around ${hhmm(wet.time)}${wet.precipitationProbability != null ? ` (${Math.round(wet.precipitationProbability)}%)` : ""}.`);
  else if (rideHours.every((h) => (h.precipitationProbability ?? 0) < 20 && h.precipitation < 0.1)) notes.push("Dry for the ride.");
  const gust = Math.max(...rideHours.map((h) => h.windGusts ?? 0));
  if (gust >= 45) notes.push(`Gusts to ${Math.round(gust)} km/h — take care on exposed roads.`);

  return {
    headline,
    detail: notes.length ? notes.join(" ") : null,
    headwind_km: Math.round(fwd.head),
    tailwind_km: Math.round(fwd.tail),
    crosswind_km: Math.round(fwd.cross),
    out_alignment: Math.round(fwd.out * 100) / 100,
    home_alignment: Math.round(fwd.home * 100) / 100,
    light,
  };
}

/** Local hours treated as night for "if you left now": before 6:00, or from 20:00. */
export const NIGHT_FROM_HOUR = 20;
export const NIGHT_UNTIL_HOUR = 6;
/** The start hour a night-time view plans for instead. */
export const MORNING_START_HOUR = 8;

/**
 * The hour the weather card plans for when nobody picked a time. Daytime:
 * null (the ride starts now). At night nobody heads out at 2 am, so plan
 * the next morning at 8:00, local to the route's start. `localNow` is the
 * start's wall clock, "2026-09-25T02:15".
 */
export function nextRidingHour(localNow: string | null | undefined): { hour: string; label: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):\d{2}/.exec(localNow ?? "");
  if (!m) return null;
  const h = Number(m[4]);
  if (h >= NIGHT_UNTIL_HOUR && h < NIGHT_FROM_HOUR) return null;
  const tomorrow = h >= NIGHT_FROM_HOUR;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (tomorrow ? 1 : 0)));
  const pad = (n: number) => String(n).padStart(2, "0");
  const hour = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}T${pad(MORNING_START_HOUR)}:00`;
  return { hour, label: `${tomorrow ? "Tomorrow" : "This morning"} · ${MORNING_START_HOUR}:00` };
}
