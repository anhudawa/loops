"use client";

/**
 * Lightweight SVG renderer for a route's shape — no Leaflet, no tiles,
 * no network. Purpose-built for inline previews on cards.
 *
 * Can optionally overlay highlighted segments (used to show where the
 * user's interval reps will sit on a workout route).
 */

interface HighlightRange {
  start_index: number;
  end_index: number;
  label?: string;
}

interface RoutePreviewSvgProps {
  coordinates: [number, number][];
  highlights?: HighlightRange[];
  width?: number;
  height?: number;
  className?: string;
}

export default function RoutePreviewSvg({
  coordinates,
  highlights = [],
  width = 320,
  height = 200,
  className,
}: RoutePreviewSvgProps) {
  if (!coordinates || coordinates.length < 2) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          color: "var(--text-muted)",
          fontSize: 12,
        }}
      >
        No preview
      </div>
    );
  }

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of coordinates) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  // Small padding so the line doesn't touch the edge
  const pad = 8;
  const latRange = Math.max(maxLat - minLat, 1e-6);
  const lngRange = Math.max(maxLng - minLng, 1e-6);

  // Maintain aspect ratio — use the larger range to set scale
  const scaleX = (width - 2 * pad) / lngRange;
  const scaleY = (height - 2 * pad) / latRange;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = pad + ((width - 2 * pad) - lngRange * scale) / 2;
  const offsetY = pad + ((height - 2 * pad) - latRange * scale) / 2;

  const project = ([lat, lng]: [number, number]) => [
    offsetX + (lng - minLng) * scale,
    // Flip lat so north is up
    offsetY + (maxLat - lat) * scale,
  ];

  const projected = coordinates.map(project);
  const pathD = projected
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  // Start and end markers
  const [startX, startY] = projected[0];
  const [endX, endY] = projected[projected.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{
        background: "var(--bg-card)",
        borderRadius: 12,
        border: "1px solid var(--border)",
      }}
    >
      {/* Base route line */}
      <path
        d={pathD}
        fill="none"
        stroke="var(--text-muted)"
        strokeOpacity={0.5}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Highlighted segments (interval reps) on top */}
      {highlights.map((h, i) => {
        const slice = projected.slice(h.start_index, h.end_index + 1);
        if (slice.length < 2) return null;
        const d = slice
          .map(([x, y], j) => `${j === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
          .join(" ");
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={3.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}

      {/* Start / end dots */}
      <circle cx={startX} cy={startY} r={4} fill="var(--accent)" />
      <circle
        cx={endX}
        cy={endY}
        r={3.5}
        fill="var(--bg-card)"
        stroke="var(--accent)"
        strokeWidth={2}
      />
    </svg>
  );
}
