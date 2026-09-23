import { NextRequest, NextResponse } from "next/server";
import { getRoute } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { estimateRideMinutes } from "@/lib/ride-time";
import type { ForecastHour } from "@/lib/ride-wind";

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_RIDE_HOURS = 8;

const HOURLY = "temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m";

/** The hour-by-hour strip for the ride window starting at hourly index i. */
function rideHours(h: Record<string, (number | null)[] | string[]>, i: number, n: number): ForecastHour[] {
  const out: ForecastHour[] = [];
  const times = h.time as string[];
  for (let k = i; k < Math.min(times.length, i + n); k++) {
    const num = (key: string) => (h[key]?.[k] as number | null | undefined);
    const speed = num("wind_speed_10m"), dir = num("wind_direction_10m"), temp = num("temperature_2m");
    if (speed == null || dir == null || temp == null) break;
    out.push({
      time: times[k],
      temperature: temp,
      precipitation: num("precipitation") ?? 0,
      precipitationProbability: num("precipitation_probability") ?? null,
      windSpeed: speed,
      windDirection: dir,
      windGusts: num("wind_gusts_10m") ?? null,
      weatherCode: num("weather_code") ?? 0,
    });
  }
  return out;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const route = await getRoute(id);

    if (!route) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }

    // ?t=2026-09-26T09:00 (wall clock at the start) → the hourly forecast
    // for that hour, in the start's own timezone, plus the hours the ride
    // will take (so the card can say "rain around 11:00"). Open-Meteo
    // forecasts 16 days; beyond that (or for a bad t) we fall back to
    // current weather — and still return the next few hours from now.
    const t = request.nextUrl.searchParams.get("t");
    const rideHour = t && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t) ? `${t.slice(0, 13)}:00` : null;
    const cacheKey = rideHour ? `${id}@${rideHour}` : id;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    // Hours of forecast to return: the riding time (one model, ride-time.ts)
    // plus an hour, at least 2 and at most MAX_RIDE_HOURS.
    const rideMinutes = estimateRideMinutes({
      distance_km: Number(route.distance_km || 0),
      elevation_gain_m: Number(route.elevation_gain_m || 0),
      discipline: route.discipline,
    });
    const windowHours = Math.min(MAX_RIDE_HOURS, Math.max(2, Math.ceil(rideMinutes / 60) + 1));
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${route.start_lat}&longitude=${route.start_lng}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
      `&hourly=${HOURLY}&wind_speed_unit=kmh&timezone=auto&forecast_days=16`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res || !res.ok) {
      return apiError("Weather service unavailable", "SERVICE_UNAVAILABLE", 502);
    }
    const raw = await res.json();
    const hourly = raw.hourly ?? {};
    const times: string[] = hourly.time ?? [];

    if (rideHour) {
      const i = times.indexOf(rideHour);
      if (i >= 0) {
        const hours = rideHours(hourly, i, windowHours);
        const data = {
          temperature: hourly.temperature_2m[i],
          humidity: hourly.relative_humidity_2m[i],
          precipitation: hourly.precipitation[i],
          precipitationProbability: hourly.precipitation_probability?.[i] ?? null,
          weatherCode: hourly.weather_code[i],
          windSpeed: hourly.wind_speed_10m[i],
          windDirection: hourly.wind_direction_10m[i],
          windGusts: hourly.wind_gusts_10m?.[i] ?? null,
          forecastFor: rideHour,
          hours,
        };
        cache.set(cacheKey, { data, timestamp: Date.now() });
        return NextResponse.json(data);
      }
    }

    const current = raw.current;
    // "If you left now": the strip starts at the current local hour.
    const nowHour = typeof current?.time === "string" ? `${current.time.slice(0, 13)}:00` : null;
    const ni = nowHour ? times.indexOf(nowHour) : -1;
    const data = {
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      precipitation: current.precipitation,
      weatherCode: current.weather_code,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      windGusts: current.wind_gusts_10m ?? null,
      hours: ni >= 0 ? rideHours(hourly, ni, windowHours) : [],
    };

    cache.set(id, { data, timestamp: Date.now() });
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
