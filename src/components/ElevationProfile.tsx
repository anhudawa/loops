"use client";

import { useRef, useEffect } from "react";

export default function ElevationProfile({
  coordinates,
  elevationGain,
  elevationLoss,
}: {
  coordinates: [number, number][];
  elevationGain: number;
  elevationLoss: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || coordinates.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const elevations: number[] = [];
    let currentElevation = 100;
    const totalGain = elevationGain;
    const avgChange = totalGain / coordinates.length;

    for (let i = 0; i < coordinates.length; i++) {
      const noise = Math.sin(i * 0.8) * avgChange + Math.cos(i * 1.3) * avgChange * 0.5;
      currentElevation += noise;
      currentElevation = Math.max(0, currentElevation);
      elevations.push(currentElevation);
    }

    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };

    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    const elevRange = maxElev - minElev || 1;

    ctx.clearRect(0, 0, width, height);

    // Draw gradient fill - neon green
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, "rgba(200, 255, 0, 0.25)");
    gradient.addColorStop(1, "rgba(200, 255, 0, 0.02)");

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);

    elevations.forEach((elev, i) => {
      const x = padding.left + (i / (elevations.length - 1)) * plotWidth;
      const y = height - padding.bottom - ((elev - minElev) / elevRange) * plotHeight;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.lineTo(padding.left + plotWidth, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line - neon accent
    ctx.beginPath();
    elevations.forEach((elev, i) => {
      const x = padding.left + (i / (elevations.length - 1)) * plotWidth;
      const y = height - padding.bottom - ((elev - minElev) / elevRange) * plotHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#c8ff00";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw axes - dark theme
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = "#666";
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const elev = minElev + (elevRange * i) / steps;
      const y = height - padding.bottom - (i / steps) * plotHeight;
      ctx.fillText(`${Math.round(elev)}m`, padding.left - 8, y + 4);

      if (i > 0) {
        ctx.strokeStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }
    }
  }, [coordinates, elevationGain, elevationLoss]);

  if (coordinates.length < 2) {
    return <div className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>No elevation data available</div>;
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full h-auto"
        style={{ maxHeight: "200px" }}
      />
      <div className="flex gap-6 mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4" style={{ color: "#00ff88" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          {elevationGain}m gain
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4" style={{ color: "#ff3355" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          {elevationLoss}m loss
        </span>
      </div>
    </div>
  );
}
