import { NextRequest, NextResponse } from "next/server";
import { getRoute } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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
    // for that hour, in the start's own timezone. Open-Meteo forecasts 16
    // days; beyond that (or for a bad t) we fall back to current weather.
    const t = request.nextUrl.searchParams.get("t");
    const rideHour = t && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t) ? `${t.slice(0, 13)}:00` : null;
    const cacheKey = rideHour ? `${id}@${rideHour}` : id;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    if (rideHour) {
      const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${route.start_lat}&longitude=${route.start_lng}&hourly=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=auto&forecast_days=16`;
      const fRes = await fetch(fUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (fRes && fRes.ok) {
        const f = await fRes.json();
        const i = (f.hourly?.time ?? []).indexOf(rideHour);
        if (i >= 0) {
          const data = {
            temperature: f.hourly.temperature_2m[i],
            humidity: f.hourly.relative_humidity_2m[i],
            precipitation: f.hourly.precipitation[i],
            weatherCode: f.hourly.weather_code[i],
            windSpeed: f.hourly.wind_speed_10m[i],
            windDirection: f.hourly.wind_direction_10m[i],
            forecastFor: rideHour,
          };
          cache.set(cacheKey, { data, timestamp: Date.now() });
          return NextResponse.json(data);
        }
      }
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${route.start_lat}&longitude=${route.start_lng}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      return apiError("Weather service unavailable", "SERVICE_UNAVAILABLE", 502);
    }

    const raw = await res.json();
    const current = raw.current;

    const data = {
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      precipitation: current.precipitation,
      weatherCode: current.weather_code,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
    };

    cache.set(id, { data, timestamp: Date.now() });
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
