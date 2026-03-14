"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import {
  haversine,
  interpolateNaN,
  smoothElevations,
  computeGradients,
  gradientColor,
  tooltipGradient,
  downsampleIndices,
} from "@/lib/climb-detection";

interface ElevationProfileProps {
  coordinates: [number, number, number][];
  distanceKm: number;
  onPositionChange?: (index: number | null) => void;
  highlightIndex?: number | null;
}

const GRADIENT_LEGEND = [
  { label: "0-3%", color: "#00ff88" },
  { label: "3-5%", color: "#bbff00" },
  { label: "5-7%", color: "#ffbb00" },
  { label: "7-10%", color: "#ff5533" },
  { label: "10%+", color: "#cc33ff" },
  { label: "Descent", color: "#6688aa" },
];

export default function ElevationProfile({
  coordinates,
  distanceKm,
  onPositionChange,
  highlightIndex,
}: ElevationProfileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    elevation: number;
    distance: number;
    gradient: number;
  } | null>(null);

  const rawElevations = useMemo(() => interpolateNaN(coordinates.map((c) => c[2])), [coordinates]);
  const hasRealData = rawElevations.length > 0 && rawElevations.some((e) => e !== 0);

  // Smooth, downsample, compute distances and gradients
  const chartData = useMemo(() => {
    if (!hasRealData || coordinates.length < 2) {
      return null;
    }

    const smoothed = smoothElevations(rawElevations);

    // Build cumulative distances from original coordinates
    const cumDist: number[] = [0];
    for (let i = 1; i < coordinates.length; i++) {
      cumDist.push(
        cumDist[i - 1] +
          haversine([coordinates[i - 1][0], coordinates[i - 1][1]], [coordinates[i][0], coordinates[i][1]])
      );
    }

    // Downsample using indices to keep elevation/distance arrays in sync
    const indices = downsampleIndices(smoothed, 600);
    const sampled = indices.map((idx) => smoothed[idx]);
    const sampledCumDist = indices.map((idx) => cumDist[idx]);
    const gradients = computeGradients(sampled, sampledCumDist);

    return { elevations: sampled, cumDist: sampledCumDist, gradients, indices };
  }, [coordinates, rawElevations, hasRealData]);

  // Draw the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { elevations, gradients } = chartData;
    if (elevations.length < 2) return;

    if (typeof window === "undefined") return;
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

    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    const elevPadding = (maxElev - minElev) * 0.05 || 10;
    const rangeMin = Math.max(0, minElev - elevPadding);
    const rangeMax = maxElev + elevPadding;
    const elevRange = rangeMax - rangeMin || 1;

    ctx.clearRect(0, 0, width, height);

    const toX = (i: number) => padding.left + (i / (elevations.length - 1)) * plotWidth;
    const toY = (elev: number) => padding.top + plotHeight - ((elev - rangeMin) / elevRange) * plotHeight;

    // Grid lines
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

    // X-axis labels
    ctx.textAlign = "center";
    const distStep = niceDistanceStep(distanceKm);
    for (let d = 0; d <= distanceKm; d += distStep) {
      const x = padding.left + (d / distanceKm) * plotWidth;
      if (x < padding.left || x > width - padding.right) continue;
      ctx.fillText(`${Math.round(d)}`, x, height - padding.bottom + 14);
    }
    ctx.fillText("km", width - padding.right, height - padding.bottom + 14);

    // Draw gradient-coloured fill + line segments
    for (let i = 0; i < elevations.length - 1; i++) {
      const x1 = toX(i);
      const x2 = toX(i + 1);
      const y1 = toY(elevations[i]);
      const y2 = toY(elevations[i + 1]);
      const color = gradientColor(gradients[i] ?? 0);

      // Fill beneath this segment
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2, height - padding.bottom);
      ctx.lineTo(x1, height - padding.bottom);
      ctx.closePath();
      const fillGrad = ctx.createLinearGradient(0, Math.min(y1, y2), 0, height - padding.bottom);
      fillGrad.addColorStop(0, color + "26"); // 15% opacity
      fillGrad.addColorStop(1, color + "03"); // ~1% opacity
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Line segment
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // Highlight crosshair from map sync
    if (highlightIndex != null && highlightIndex >= 0 && highlightIndex < coordinates.length) {
      // Map highlightIndex from original coordinates space to sampled space
      const ratio = highlightIndex / (coordinates.length - 1);
      const sampledIdx = Math.round(ratio * (elevations.length - 1));
      const hx = toX(sampledIdx);

      ctx.beginPath();
      ctx.moveTo(hx, padding.top);
      ctx.lineTo(hx, height - padding.bottom);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot on the line
      const hy = toY(elevations[sampledIdx]);
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
  }, [chartData, distanceKm, highlightIndex, coordinates.length]);

  // Hover/touch handler
  const handleInteraction = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !chartData) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const pad = { left: 44, right: 12 };
      const plotWidth = rect.width - pad.left - pad.right;
      const ratio = Math.max(0, Math.min(1, (mouseX - pad.left) / plotWidth));
      const idx = Math.round(ratio * (chartData.elevations.length - 1));

      const elevation = chartData.elevations[idx];
      const distance = ratio * distanceKm;
      const gradient = tooltipGradient(chartData.gradients, idx);

      setTooltip({ x: mouseX, y: clientY - rect.top, elevation, distance, gradient });

      // Map the sampled index back to original coordinates index
      if (onPositionChange) {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const originalIdx = Math.round(ratio * (coordinates.length - 1));
          onPositionChange(originalIdx);
        });
      }
    },
    [chartData, distanceKm, onPositionChange, coordinates.length]
  );

  const handleMouseMove = (e: React.MouseEvent) => handleInteraction(e.clientX, e.clientY);

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault(); // prevent scroll while scrubbing
    const touch = e.touches[0];
    handleInteraction(touch.clientX, touch.clientY);
  };

  const handleLeave = () => {
    setTooltip(null);
    onPositionChange?.(null);
  };

  if (!hasRealData) {
    return (
      <div
        className="text-sm text-center py-8 rounded-lg"
        style={{ color: "var(--text-muted)", background: "var(--bg-raised)" }}
      >
        No elevation data available
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: "200px", cursor: "crosshair", touchAction: "none" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleLeave}
          onTouchStart={(e) => handleTouchMove(e)}
          onTouchMove={(e) => handleTouchMove(e)}
          onTouchEnd={handleLeave}
        />
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
            style={{
              left: Math.min(tooltip.x, (containerRef.current?.offsetWidth ?? 300) - 140),
              top: Math.max(0, tooltip.y - 48),
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(200,255,0,0.3)",
              color: "var(--text)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span style={{ color: "#c8ff00" }}>{Math.round(tooltip.elevation)}m</span>
            <span style={{ color: "var(--text-muted)" }}> · {tooltip.distance.toFixed(1)} km</span>
            <span style={{ color: gradientColor(tooltip.gradient) }}>
              {" "}
              · {tooltip.gradient >= 0 ? "+" : ""}
              {tooltip.gradient.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Gradient Legend */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {GRADIENT_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className="w-3 h-2 rounded-sm" style={{ background: item.color }} />
            <span className="text-[9px] font-medium" style={{ color: "var(--text-muted)" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Axis helpers (kept local, not worth extracting) ---

function niceElevationStep(range: number): number {
  const rawStep = range / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function niceDistanceStep(totalKm: number): number {
  if (totalKm <= 20) return 5;
  if (totalKm <= 50) return 10;
  if (totalKm <= 100) return 20;
  if (totalKm <= 200) return 50;
  if (totalKm <= 500) return 100;
  return 200;
}
