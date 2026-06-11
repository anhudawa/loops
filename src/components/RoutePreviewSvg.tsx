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
  /** Forecast wind: paints the line head/tail/crosswind and draws an arrow. */
  wind?: { direction_deg: number; speed_kmh: number };
  width?: number;
  height?: number;
  className?: string;
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const p1 = (a[0] * Math.PI) / 180;
  const p2 = (b[0] * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const WIND_COLORS = {
  tail: "#4ade80",  // green — wind at your back
  head: "#f87171",  // red — into it
  cross: "#94a3b8", // grey — crosswind
};

export default function RoutePreviewSvg({
  coordinates,
  highlights = [],
  wind,
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
        maxWidth: "100%",
        height: "auto",
      }}
    >
      {/* Base route line — wind-painted when forecast is meaningful */}
      {wind && wind.speed_kmh >= 8 ? (
        <WindPaintedLine coordinates={coordinates} projected={projected} windDeg={wind.direction_deg} />
      ) : (
        <path
          d={pathD}
          fill="none"
          stroke="var(--text-muted)"
          strokeOpacity={0.5}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Wind arrow + speed, top-right (points where the wind blows TO) */}
      {wind && wind.speed_kmh >= 8 && (
        <g transform={`translate(${width - 24}, 20)`} aria-label={`Wind ${Math.round(wind.speed_kmh)} km/h`}>
          <g transform={`rotate(${(wind.direction_deg + 180) % 360})`}>
            <path d="M0,-9 L4,3 L0,0.5 L-4,3 Z" fill="var(--text-secondary)" />
          </g>
          <text y={18} textAnchor="middle" fontSize={8} fill="var(--text-muted)">
            {Math.round(wind.speed_kmh)}km/h
          </text>
        </g>
      )}

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


/**
 * Paints the route in chunks coloured by wind alignment: green tailwind,
 * red headwind, grey crosswind. Chunked every ~12 points to keep the DOM
 * small on long routes.
 */
function WindPaintedLine({
  coordinates,
  projected,
  windDeg,
}: {
  coordinates: [number, number][];
  projected: number[][];
  windDeg: number;
}) {
  const windTo = (windDeg + 180) % 360;
  const CHUNK = 12;
  const chunks: Array<{ d: string; color: string }> = [];

  for (let s = 0; s + 1 < coordinates.length; s += CHUNK) {
    const e = Math.min(s + CHUNK, coordinates.length - 1);
    const brg = bearingDeg(coordinates[s], coordinates[e]);
    let delta = Math.abs(brg - windTo);
    if (delta > 180) delta = 360 - delta;
    const cos = Math.cos((delta * Math.PI) / 180);
    const color = cos > 0.34 ? WIND_COLORS.tail : cos < -0.34 ? WIND_COLORS.head : WIND_COLORS.cross;
    const d = projected
      .slice(s, e + 1)
      .map(([x, y], j) => `${j === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    chunks.push({ d, color });
  }

  return (
    <g>
      {chunks.map((c, i) => (
        <path
          key={i}
          d={c.d}
          fill="none"
          stroke={c.color}
          strokeOpacity={0.85}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}
