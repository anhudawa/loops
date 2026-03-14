"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";

interface Climb {
  startKm: number;
  endKm: number;
  startElev: number;
  endElev: number;
  gain: number;
  distanceKm: number;
  avgGradient: number;
  maxElev: number;
}

interface ElevationProfileProps {
  elevations: number[];
  coordinates: [number, number][];
  distanceKm: number;
  elevationGain: number;
  elevationLoss: number;
}

export default function ElevationProfile({
  elevations,
  coordinates,
  distanceKm,
  elevationGain,
  elevationLoss,
}: ElevationProfileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    elevation: number;
    distance: number;
  } | null>(null);
  const [climbsOpen, setClimbsOpen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setIsTouchDevice("ontouchstart" in window);
  }, []);

  // Downsample elevations for rendering — max 600 points for smooth canvas
  const sampledElevations = downsample(elevations, 600);
  const hasRealData = elevations.length > 0 && elevations.some((e) => e !== 0);

  // Calculate per-point cumulative distances and detect climbs
  const { cumulativeDistances, climbs } = useMemo(() => {
    if (!hasRealData || coordinates.length < 2) {
      return { cumulativeDistances: [], climbs: [] };
    }

    // Build cumulative distance array
    const cumDist: number[] = [0];
    for (let i = 1; i < coordinates.length; i++) {
      cumDist.push(cumDist[i - 1] + haversine(coordinates[i - 1], coordinates[i]));
    }

    const detectedClimbs = detectClimbs(elevations, cumDist);
    return { cumulativeDistances: cumDist, climbs: detectedClimbs };
  }, [elevations, coordinates, hasRealData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sampledElevations.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High DPI support
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 16, right: 12, bottom: 28, left: 44 };

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const minElev = Math.min(...sampledElevations);
    const maxElev = Math.max(...sampledElevations);
    // Add 5% padding to elevation range so peaks don't touch the top
    const elevPadding = (maxElev - minElev) * 0.05 || 10;
    const rangeMin = Math.max(0, minElev - elevPadding);
    const rangeMax = maxElev + elevPadding;
    const elevRange = rangeMax - rangeMin || 1;

    ctx.clearRect(0, 0, width, height);

    // Helper: data point to canvas coordinates
    const toX = (i: number) => padding.left + (i / (sampledElevations.length - 1)) * plotWidth;
    const toY = (elev: number) => padding.top + plotHeight - ((elev - rangeMin) / elevRange) * plotHeight;

    // Draw horizontal grid lines
    const niceStep = niceElevationStep(elevRange);
    const gridStart = Math.ceil(rangeMin / niceStep) * niceStep;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "10px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";

    for (let elev = gridStart; elev <= rangeMax; elev += niceStep) {
      const y = toY(elev);
      if (y < padding.top || y > height - padding.bottom) continue;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(`${Math.round(elev)}m`, padding.left - 6, y + 3);
    }

    // Draw X-axis distance labels
    ctx.textAlign = "center";
    const distStep = niceDistanceStep(distanceKm);
    for (let d = 0; d <= distanceKm; d += distStep) {
      const x = padding.left + (d / distanceKm) * plotWidth;
      if (x < padding.left || x > width - padding.right) continue;
      ctx.fillText(`${Math.round(d)}`, x, height - padding.bottom + 14);
    }
    // "km" label at the end
    ctx.fillText("km", width - padding.right, height - padding.bottom + 14);

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, "rgba(200, 255, 0, 0.3)");
    gradient.addColorStop(0.5, "rgba(200, 255, 0, 0.1)");
    gradient.addColorStop(1, "rgba(200, 255, 0, 0.01)");

    ctx.beginPath();
    ctx.moveTo(toX(0), height - padding.bottom);
    for (let i = 0; i < sampledElevations.length; i++) {
      ctx.lineTo(toX(i), toY(sampledElevations[i]));
    }
    ctx.lineTo(toX(sampledElevations.length - 1), height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw the elevation line
    ctx.beginPath();
    for (let i = 0; i < sampledElevations.length; i++) {
      const x = toX(i);
      const y = toY(sampledElevations[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#c8ff00";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }, [sampledElevations, distanceKm]);

  // Shared tooltip calculation from a client X/Y position
  const updateTooltip = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || sampledElevations.length < 2) return;

    const rect = canvas.getBoundingClientRect();
    const posX = clientX - rect.left;
    const padding = { left: 44, right: 12 };
    const plotWidth = rect.width - padding.left - padding.right;
    const ratio = Math.max(0, Math.min(1, (posX - padding.left) / plotWidth));
    const idx = Math.round(ratio * (sampledElevations.length - 1));
    const elevation = sampledElevations[idx];
    const distance = ratio * distanceKm;

    setTooltip({ x: posX, y: clientY - rect.top, elevation, distance });
  }, [sampledElevations, distanceKm]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    updateTooltip(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (touch) {
      e.preventDefault();
      updateTooltip(touch.clientX, touch.clientY);
    }
  };

  if (!hasRealData) {
    return (
      <div>
        <div
          className="text-sm text-center py-8 rounded-lg"
          style={{ color: "var(--text-muted)", background: "var(--bg-raised)" }}
        >
          No elevation data available
        </div>
        <div className="flex gap-6 mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" style={{ color: "var(--success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            {elevationGain}m gain
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" style={{ color: "var(--danger)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            {elevationLoss}m loss
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: "180px", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => setTooltip(null)}
        />
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
            style={{
              left: Math.min(tooltip.x, (containerRef.current?.offsetWidth ?? 300) - 120),
              top: Math.max(0, tooltip.y - 44),
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(200,255,0,0.3)",
              color: "var(--text)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span style={{ color: "#c8ff00" }}>{Math.round(tooltip.elevation)}m</span>
            <span style={{ color: "var(--text-muted)" }}> · {tooltip.distance.toFixed(1)} km</span>
          </div>
        )}
      </div>
      <div className="flex gap-6 mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4" style={{ color: "var(--success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          {elevationGain.toLocaleString()}m gain
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4" style={{ color: "var(--danger)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          {elevationLoss.toLocaleString()}m loss
        </span>
        <span className="flex items-center gap-1 ml-auto" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <span className="text-[11px]">{isTouchDevice ? "tap for details" : "hover for details"}</span>
        </span>
      </div>

      {/* Key Climbs */}
      {climbs.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setClimbsOpen(!climbsOpen)}
            className="flex items-center gap-2 w-full text-left group"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-4 h-4" style={{ color: "var(--warning)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Key Climbs ({climbs.length})
            </span>
            <svg
              className="w-3.5 h-3.5 ml-auto transition-transform"
              style={{ transform: climbsOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {climbsOpen && (
            <div className="mt-3 space-y-0 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {/* Table header */}
              <div
                className="grid grid-cols-12 gap-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: "var(--bg-raised)", color: "var(--text-muted)" }}
              >
                <div className="col-span-4">Climb</div>
                <div className="col-span-2 text-right">Gain</div>
                <div className="col-span-2 text-right">Length</div>
                <div className="col-span-2 text-right">Avg %</div>
                <div className="col-span-2 text-right">Peak</div>
              </div>

              {climbs.map((climb, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-1 px-3 py-2.5 text-xs items-center"
                  style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  {/* Climb name & position */}
                  <div className="col-span-4 flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{
                        background: gradientColor(climb.avgGradient),
                        color: climb.avgGradient >= 8 ? "#fff" : "#000",
                      }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold truncate" style={{ color: "var(--text)" }}>
                        km {Math.round(climb.startKm)}–{Math.round(climb.endKm)}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {Math.round(climb.startElev)}m → {Math.round(climb.endElev)}m
                      </div>
                    </div>
                  </div>

                  {/* Elevation gain */}
                  <div className="col-span-2 text-right font-bold" style={{ color: "var(--success)" }}>
                    +{Math.round(climb.gain)}m
                  </div>

                  {/* Distance */}
                  <div className="col-span-2 text-right" style={{ color: "var(--text)" }}>
                    {climb.distanceKm.toFixed(1)} km
                  </div>

                  {/* Avg gradient */}
                  <div className="col-span-2 text-right font-bold" style={{ color: gradientColor(climb.avgGradient) }}>
                    {climb.avgGradient.toFixed(1)}%
                  </div>

                  {/* Peak elevation */}
                  <div className="col-span-2 text-right" style={{ color: "var(--text-muted)" }}>
                    {Math.round(climb.maxElev)}m
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Detect significant climbs from elevation data.
 * A climb is a sustained uphill section with meaningful gain.
 *
 * Algorithm:
 * 1. Smooth the elevation data to remove GPS noise
 * 2. Walk through points, tracking uphill segments
 * 3. Allow small dips (< threshold) within a climb without breaking it
 * 4. Filter: keep only climbs with gain > minGain AND distance > minDistance
 */
function detectClimbs(elevations: number[], cumDistances: number[]): Climb[] {
  if (elevations.length < 10 || cumDistances.length !== elevations.length) return [];

  // Smooth elevations with a moving average to remove GPS jitter
  const smoothed = smoothElevations(elevations, cumDistances);
  const n = smoothed.length;

  const totalDistance = cumDistances[n - 1];
  // Scale thresholds based on route size
  const minGain = totalDistance > 100 ? 80 : totalDistance > 30 ? 40 : 20;
  const maxDip = 15; // allow up to 15m dip within a climb

  const climbs: Climb[] = [];
  let i = 0;

  while (i < n - 1) {
    // Find start of uphill
    while (i < n - 1 && smoothed[i + 1] <= smoothed[i]) i++;
    if (i >= n - 1) break;

    const climbStart = i;
    let climbPeak = i;
    let peakElev = smoothed[i];
    let totalGain = 0;
    let localLow = smoothed[i];

    // Walk uphill, allowing small dips
    while (i < n - 1) {
      i++;
      if (smoothed[i] > peakElev) {
        peakElev = smoothed[i];
        climbPeak = i;
        totalGain += smoothed[i] - localLow;
        localLow = smoothed[i];
      } else {
        // Descending — check if dip is too large
        const dip = peakElev - smoothed[i];
        if (dip > maxDip) break;
        if (smoothed[i] < localLow) localLow = smoothed[i];
      }
    }

    // Calculate climb stats
    const gain = smoothed[climbPeak] - smoothed[climbStart];
    const startKm = cumDistances[climbStart];
    const endKm = cumDistances[climbPeak];
    const climbDistKm = endKm - startKm;

    // Filter: significant climbs only
    if (gain >= minGain && climbDistKm >= 0.5) {
      const avgGrad = (gain / (climbDistKm * 1000)) * 100;
      climbs.push({
        startKm,
        endKm,
        startElev: smoothed[climbStart],
        endElev: smoothed[climbPeak],
        gain,
        distanceKm: climbDistKm,
        avgGradient: avgGrad,
        maxElev: smoothed[climbPeak],
      });
    }
  }

  // Sort by gain descending, cap at 15 biggest climbs
  climbs.sort((a, b) => b.gain - a.gain);
  return climbs.slice(0, 15);
}

/** Smooth elevation data using a distance-weighted moving average */
function smoothElevations(elevations: number[], cumDistances: number[]): number[] {
  const n = elevations.length;
  if (n < 5) return [...elevations];

  // Window size: ~200m radius smoothing
  const windowRadius = 0.2; // km
  const smoothed: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const centerDist = cumDistances[i];
    let sum = 0;
    let count = 0;

    // Look backward
    for (let j = i; j >= 0 && centerDist - cumDistances[j] <= windowRadius; j--) {
      sum += elevations[j];
      count++;
    }
    // Look forward
    for (let j = i + 1; j < n && cumDistances[j] - centerDist <= windowRadius; j++) {
      sum += elevations[j];
      count++;
    }

    smoothed[i] = sum / count;
  }

  return smoothed;
}

/** Haversine distance in km between two [lat, lng] points */
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Color based on gradient severity */
function gradientColor(pct: number): string {
  if (pct < 3) return "#00ff88"; // easy green
  if (pct < 5) return "#bbff00"; // moderate yellow-green
  if (pct < 7) return "#ffbb00"; // hard orange
  if (pct < 10) return "#ff5533"; // steep red
  return "#cc33ff"; // brutal purple
}

/** Downsample an array to at most `maxPoints` using largest-triangle-three-buckets */
function downsample(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;

  const sampled: number[] = [data[0]];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  let prevIndex = 0;
  for (let i = 1; i < maxPoints - 1; i++) {
    const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);

    let maxArea = -1;
    let bestIdx = rangeStart;
    const nextBucketStart = Math.floor(i * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);

    let avgNext = 0;
    for (let j = nextBucketStart; j <= nextBucketEnd; j++) avgNext += data[j];
    avgNext /= nextBucketEnd - nextBucketStart + 1;

    for (let j = rangeStart; j <= rangeEnd; j++) {
      const area = Math.abs(
        (prevIndex - (nextBucketStart + nextBucketEnd) / 2) * (data[j] - data[prevIndex]) -
        (prevIndex - j) * (avgNext - data[prevIndex])
      );
      if (area > maxArea) {
        maxArea = area;
        bestIdx = j;
      }
    }

    sampled.push(data[bestIdx]);
    prevIndex = bestIdx;
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

/** Pick a nice step for Y-axis grid lines */
function niceElevationStep(range: number): number {
  const rawStep = range / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/** Pick a nice step for X-axis distance labels */
function niceDistanceStep(totalKm: number): number {
  if (totalKm <= 20) return 5;
  if (totalKm <= 50) return 10;
  if (totalKm <= 100) return 20;
  if (totalKm <= 200) return 50;
  if (totalKm <= 500) return 100;
  return 200;
}
