/**
 * Wind-Aware Route Analysis
 *
 * Implements the "tailwind home" promise: pull the forecast for the time
 * the rider will actually be on each leg (not the wind right now), score
 * how well a candidate loop's bearing distribution aligns with the
 * rider's wind strategy, and explain what we did in plain language.
 *
 * Honesty rules (from the launch spec):
 *   - Below MIN_WIND_KMH the optimisation is meaningless — say so and
 *     don't pretend it matters.
 *   - If the forecast is unavailable, generate without wind and say so.
 *
 * Conventions: wind direction is meteorological (the direction the wind
 * comes FROM, in degrees). A segment has a tailwind when its travel
 * bearing points the way the wind blows TO (direction + 180).
 */

import { haversine } from "./climb-detection";

export type WindStrategy =
  | "tailwind_home"
  | "tailwind_out"
  | "headwind_out"
  | "none";

export interface WindForecast {
  /** Direction the wind comes FROM, degrees (0 = from north). */
  direction_deg: number;
  speed_kmh: number;
  /** ISO timestamp of the forecast hour used. */
  forecast_time: string;
}

export interface WindAnalysis {
  /** 0–100: how well the route fits the requested strategy. */
  alignment_score: number;
  /** Rider-facing one-liner describing wind over this route. */
  note: string;
  headwind_km: number;
  tailwind_km: number;
  crosswind_km: number;
}

/** Below this, wind optimisation is noise — we say so instead of pretending. */
export const MIN_WIND_KMH = 8;

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const FETCH_TIMEOUT_MS = 5000;

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Bearing of travel between two [lat, lng] points, degrees 0..360. */
export function bearing(a: [number, number], b: [number, number]): number {
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

/** 16-point compass label for a wind direction in degrees. */
export function compassPoint(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_POINTS[idx];
}

interface SegmentSample {
  bearing_deg: number;
  length_km: number;
  /** Cumulative distance at segment start, km. */
  at_km: number;
}

function segmentSamples(coords: [number, number][]): SegmentSample[] {
  const out: SegmentSample[] = [];
  let cum = 0;
  for (let i = 1; i < coords.length; i++) {
    const len = haversine(coords[i - 1], coords[i]);
    if (len <= 0) continue;
    out.push({ bearing_deg: bearing(coords[i - 1], coords[i]), length_km: len, at_km: cum });
    cum += len;
  }
  return out;
}

/**
 * Distance-weighted mean alignment of a stretch of route with the wind,
 * in -1..1. +1 = pure tailwind the whole way, -1 = pure headwind.
 *
 * `half` selects the leg: "out" = first half by distance, "home" = second
 * half, "all" = whole route.
 */
export function windAlignment(
  coords: [number, number][],
  windDirectionDeg: number,
  half: "out" | "home" | "all" = "all"
): number {
  const segs = segmentSamples(coords);
  if (segs.length === 0) return 0;
  const total = segs.reduce((s, x) => s + x.length_km, 0);
  const windTo = (windDirectionDeg + 180) % 360;

  let weighted = 0;
  let weight = 0;
  for (const seg of segs) {
    const mid = seg.at_km + seg.length_km / 2;
    if (half === "out" && mid > total / 2) continue;
    if (half === "home" && mid <= total / 2) continue;
    const delta = ((seg.bearing_deg - windTo) * Math.PI) / 180;
    weighted += Math.cos(delta) * seg.length_km;
    weight += seg.length_km;
  }
  return weight === 0 ? 0 : weighted / weight;
}

/**
 * Score 0–100 for how well a loop serves the rider's wind strategy.
 * 50 = neutral (no meaningful alignment either way).
 */
export function alignmentScore(
  coords: [number, number][],
  forecast: WindForecast,
  strategy: WindStrategy
): number {
  if (strategy === "none" || forecast.speed_kmh < MIN_WIND_KMH) return 50;

  let raw: number;
  switch (strategy) {
    case "tailwind_home":
      raw = windAlignment(coords, forecast.direction_deg, "home");
      break;
    case "tailwind_out":
      raw = windAlignment(coords, forecast.direction_deg, "out");
      break;
    case "headwind_out":
      // Riding INTO the wind on the way out = negative alignment out.
      raw = -windAlignment(coords, forecast.direction_deg, "out");
      break;
  }
  return Math.round(((raw + 1) / 2) * 100);
}

/** Per-leg headwind/tailwind/crosswind distance split. */
function windSplit(
  coords: [number, number][],
  windDirectionDeg: number
): { headwind_km: number; tailwind_km: number; crosswind_km: number } {
  const windTo = (windDirectionDeg + 180) % 360;
  let head = 0, tail = 0, cross = 0;
  for (const seg of segmentSamples(coords)) {
    const delta = ((seg.bearing_deg - windTo) * Math.PI) / 180;
    const c = Math.cos(delta);
    if (c > 0.34) tail += seg.length_km;
    else if (c < -0.34) head += seg.length_km;
    else cross += seg.length_km;
  }
  return {
    headwind_km: Math.round(head),
    tailwind_km: Math.round(tail),
    crosswind_km: Math.round(cross),
  };
}

/**
 * Full analysis of one route against the forecast + strategy, including
 * the rider-facing note. Pure — safe to call per candidate.
 */
export function analyzeWind(
  coords: [number, number][],
  forecast: WindForecast,
  strategy: WindStrategy
): WindAnalysis {
  const split = windSplit(coords, forecast.direction_deg);
  const score = alignmentScore(coords, forecast, strategy);
  const compass = compassPoint(forecast.direction_deg);
  const speed = Math.round(forecast.speed_kmh);

  if (forecast.speed_kmh < MIN_WIND_KMH) {
    return {
      alignment_score: 50,
      note: `Wind is light (${speed} km/h) — not worth planning around today.`,
      ...split,
    };
  }

  let note =
    split.crosswind_km > split.headwind_km + split.tailwind_km
      ? `Wind ${compass} ${speed} km/h — mostly a crosswind on this loop.`
      : `Wind ${compass} ${speed} km/h — roughly ${split.headwind_km} km into it and ${split.tailwind_km} km with it at your back.`;

  if (strategy === "tailwind_home") {
    const home = windAlignment(coords, forecast.direction_deg, "home");
    if (home > 0.15) {
      note = `Wind ${compass} ${speed} km/h — you'll ride into it early and have it at your back for the run home.`;
    } else if (home < -0.15) {
      note = `Wind ${compass} ${speed} km/h — heads up: this loop couldn't be fully oriented for a tailwind home (${split.headwind_km} km into the wind overall).`;
    }
  } else if (strategy === "tailwind_out") {
    const out = windAlignment(coords, forecast.direction_deg, "out");
    if (out > 0.15) {
      note = `Wind ${compass} ${speed} km/h — tailwind to start, so expect to earn it on the way back.`;
    }
  } else if (strategy === "headwind_out") {
    const out = windAlignment(coords, forecast.direction_deg, "out");
    if (out < -0.15) {
      note = `Wind ${compass} ${speed} km/h — into the wind on the way out as asked, with help on the return.`;
    }
  }

  return { alignment_score: score, note, ...split };
}

// ── Forecast fetch ───────────────────────────────────────────────────────────

/**
 * Fetch the forecast wind for the time the rider will be on the leg the
 * strategy cares about (NOT the wind right now): the midpoint of the
 * return leg for tailwind_home (departure + 75% of duration), the
 * midpoint of the outbound leg for out-strategies (departure + 25%).
 *
 * Returns null on any failure — callers must degrade honestly, never block
 * generation on the weather service.
 */
export async function fetchWindForecast(
  point: [number, number],
  departure: Date,
  durationMinutes: number,
  strategy: WindStrategy
): Promise<WindForecast | null> {
  try {
    const offsetMin =
      strategy === "tailwind_home" ? durationMinutes * 0.75 : durationMinutes * 0.25;
    const target = new Date(departure.getTime() + offsetMin * 60_000);

    const params = new URLSearchParams({
      latitude: String(point[0]),
      longitude: String(point[1]),
      hourly: "wind_speed_10m,wind_direction_10m",
      wind_speed_unit: "kmh",
      forecast_days: "2",
      timezone: "UTC",
    });
    const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const times: string[] = data?.hourly?.time ?? [];
    const speeds: number[] = data?.hourly?.wind_speed_10m ?? [];
    const dirs: number[] = data?.hourly?.wind_direction_10m ?? [];
    if (times.length === 0 || speeds.length !== times.length) return null;

    // Closest hourly slot to the target time.
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(new Date(times[i] + "Z").getTime() - target.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    if (typeof speeds[best] !== "number" || typeof dirs[best] !== "number") return null;

    return {
      direction_deg: dirs[best],
      speed_kmh: speeds[best],
      forecast_time: times[best],
    };
  } catch {
    return null;
  }
}
