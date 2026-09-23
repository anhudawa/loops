"use client";

import { useState, useEffect, useMemo } from "react";
import { rideVerdict, type ForecastHour } from "@/lib/ride-wind";

interface WeatherData {
  temperature: number;
  humidity: number;
  precipitation: number;
  precipitationProbability?: number | null;
  weatherCode: number;
  windSpeed: number;
  windGusts?: number | null;
  /** Set when this is the forecast for a ride time, not current conditions. */
  forecastFor?: string | null;
  windDirection: number;
  /** Hour-by-hour for the ride window (start hour first). */
  hours?: ForecastHour[];
}

interface WeatherCardProps {
  routeId: string;
  windOverlayEnabled: boolean;
  onWindToggle: (enabled: boolean) => void;
  travelOverlayEnabled: boolean;
  onTravelToggle: (enabled: boolean) => void;
  onWeatherLoaded: (wind: { direction: number; speed: number }) => void;
  coordinates?: [number, number][];
  /** Group-ride start (wall clock "2026-09-26T09:00"): show the forecast for then. */
  rideTime?: string | null;
  rideWhen?: string | null;
}

function weatherIcon(code: number): string {
  if (code === 0) return "\u2600\uFE0F"; // clear
  if (code <= 3) return "\u26C5"; // partly cloudy
  if (code <= 48) return "\uD83C\uDF2B\uFE0F"; // fog
  if (code <= 67) return "\uD83C\uDF27\uFE0F"; // rain
  if (code <= 77) return "\u2744\uFE0F"; // snow
  if (code <= 82) return "\uD83C\uDF26\uFE0F"; // showers
  return "\u26C8\uFE0F"; // thunderstorm
}

function windLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function calcWindBreakdown(coords: [number, number][], windDir: number): { headwind: number; tailwind: number; crosswind: number } {
  if (coords.length < 2) return { headwind: 0, tailwind: 0, crosswind: 0 };
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  let head = 0, tail = 0, cross = 0;
  const windBlowingTo = (windDir + 180) % 360;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    const dLng = toRad(b[1] - a[1]);
    const y = Math.sin(dLng) * Math.cos(toRad(b[0]));
    const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(dLng);
    const travelBearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
    // Angle between wind direction (blowing to) and travel direction
    let diff = Math.abs(windBlowingTo - travelBearing);
    if (diff > 180) diff = 360 - diff;
    // headwind: wind blowing toward you (diff close to 180 between wind-from and travel)
    // Actually: if windBlowingTo is close to travelBearing, it's a tailwind
    if (diff <= 45) tail++;
    else if (diff >= 135) head++;
    else cross++;
  }

  const total = head + tail + cross || 1;
  return {
    headwind: Math.round((head / total) * 100),
    tailwind: Math.round((tail / total) * 100),
    crosswind: Math.round((cross / total) * 100),
  };
}

export default function WeatherCard({ routeId, windOverlayEnabled, onWindToggle, travelOverlayEnabled, onTravelToggle, onWeatherLoaded, coordinates, rideTime, rideWhen }: WeatherCardProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // The ride verdict: this loop against the wind for the hours you'll be out.
  const verdict = useMemo(
    () => (weather?.hours?.length && coordinates && coordinates.length > 1 ? rideVerdict(coordinates, weather.hours) : null),
    [weather, coordinates]
  );

  useEffect(() => {
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(false);  
    fetch(`/api/routes/${routeId}/weather${rideTime ? `?t=${encodeURIComponent(rideTime)}` : ""}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: WeatherData) => {
        setWeather(data);
        setLoading(false);
        onWeatherLoaded({ direction: data.windDirection, speed: data.windSpeed });
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [routeId, rideTime]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="rounded-2xl p-5 md:p-6 animate-pulse" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="h-3 rounded w-32 mb-4" style={{ background: "var(--border)" }} />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="text-center">
              <div className="h-5 rounded w-12 mx-auto mb-1" style={{ background: "var(--border)" }} />
              <div className="h-2 rounded w-16 mx-auto" style={{ background: "var(--border)" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>Weather unavailable</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5 md:p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          {weather.forecastFor && rideWhen ? `Forecast · ${rideWhen}` : "Weather now"}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onTravelToggle(!travelOverlayEnabled)}
            title="Show the direction of travel on the map"
            aria-label="Show the direction of travel on the map"
            className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-full text-xs font-bold transition-all"
            style={{
              color: travelOverlayEnabled ? "#c8ff00" : "var(--text-muted)",
              background: travelOverlayEnabled ? "rgba(200, 255, 0, 0.15)" : "var(--bg)",
              border: travelOverlayEnabled ? "1px solid rgba(200, 255, 0, 0.4)" : "1px solid var(--border)",
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            Direction
          </button>
          <button
            onClick={() => onWindToggle(!windOverlayEnabled)}
            title="Show wind arrows on the map"
            aria-label="Show wind arrows on the map"
            className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-full text-xs font-bold transition-all"
            style={{
              color: windOverlayEnabled ? "var(--danger)" : "var(--text-muted)",
              background: windOverlayEnabled ? "rgba(255, 51, 85, 0.15)" : "var(--bg)",
              border: windOverlayEnabled ? "1px solid rgba(255, 51, 85, 0.4)" : "1px solid var(--border)",
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            Wind
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="text-center">
          <p className="text-lg md:text-xl font-extrabold" style={{ color: "var(--accent)" }}>
            <span className="mr-1">{weatherIcon(weather.weatherCode)}</span>
            {Math.round(weather.temperature)}&deg;
          </p>
          <p className="text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>Temp</p>
        </div>
        <div className="text-center">
          <p className="text-lg md:text-xl font-extrabold flex items-center justify-center gap-1" style={{ color: "var(--accent)" }}>
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: `rotate(${(weather.windDirection + 180) % 360}deg)` }}
            >
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            {Math.round(weather.windSpeed)}
            <span className="text-xs font-bold ml-0.5" style={{ color: "var(--text-muted)" }}>km/h</span>
          </p>
          <p className="text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>
            Wind ({windLabel(weather.windDirection)})
          </p>
        </div>
        <div className="text-center">
          <p className="text-lg md:text-xl font-extrabold" style={{ color: "var(--accent)" }}>
            {weather.precipitation}
          </p>
          <p className="text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>Rain (mm)</p>
        </div>
        <div className="text-center">
          <p className="text-lg md:text-xl font-extrabold" style={{ color: "var(--accent)" }}>
            {weather.humidity}%
          </p>
          <p className="text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>Humidity</p>
        </div>
      </div>

      {verdict && (
        <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }} data-testid="ride-verdict">
          <p className="text-sm font-bold leading-snug" style={{ color: "var(--text)" }}>{verdict.headline}</p>
          {verdict.detail && (
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{verdict.detail}</p>
          )}
        </div>
      )}

      {weather.hours && weather.hours.length > 1 && (
        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto pb-1" data-testid="hour-strip">
          {weather.hours.map((h) => {
            const rainy = (h.precipitationProbability ?? 0) >= 20 || h.precipitation >= 0.2;
            return (
              <div
                key={h.time}
                className="shrink-0 rounded-lg px-2 py-1.5 text-center min-w-[58px]"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                <p className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>{h.time.slice(11, 16).replace(/^0/, "")}</p>
                <p className="text-sm leading-tight" aria-hidden>{weatherIcon(h.weatherCode)}</p>
                <p className="text-xs font-bold" style={{ color: "var(--text)" }}>{Math.round(h.temperature)}&deg;</p>
                <p className="text-[10px] font-bold flex items-center justify-center gap-0.5" style={{ color: "var(--text-secondary)" }}>
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" style={{ transform: `rotate(${(h.windDirection + 180) % 360}deg)` }}>
                    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                  </svg>
                  {Math.round(h.windSpeed)}
                </p>
                <p className="text-[10px]" style={{ color: rainy ? "#4fa3ff" : "var(--text-muted)" }}>
                  {rainy ? `${Math.round(h.precipitationProbability ?? 0)}%` : "dry"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {windOverlayEnabled && coordinates && coordinates.length > 1 && (() => {
        const breakdown = calcWindBreakdown(coordinates, weather.windDirection);
        return (
          <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: "var(--text-muted)" }}>Wind impact</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--danger)" }} />
                <span className="text-sm font-bold" style={{ color: "var(--danger)" }}>{breakdown.headwind}%</span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>head</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--success)" }} />
                <span className="text-sm font-bold" style={{ color: "var(--success)" }}>{breakdown.tailwind}%</span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>tail</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--warning)" }} />
                <span className="text-sm font-bold" style={{ color: "var(--warning)" }}>{breakdown.crosswind}%</span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>cross</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
