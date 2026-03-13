import { NextRequest, NextResponse } from "next/server";
import { getRoute } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const route = await getRoute(id);

    if (!route) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }

    const cached = cache.get(id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${route.start_lat}&longitude=${route.start_lng}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`;
    const res = await fetch(url);

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
