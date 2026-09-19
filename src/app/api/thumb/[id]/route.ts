import { NextRequest, NextResponse } from "next/server";
import { getRoute } from "@/lib/db";

/**
 * Lightweight route-SHAPE thumbnail for feed/route cards. Unlike /api/og
 * (a text-heavy 1200×630 social card that crops badly inside a card), this
 * renders only the route's silhouette on the brand background — crisp at any
 * size, tiny, and cacheable. No text baked in; the card supplies the copy.
 */

const W = 640;
const H = 274; // ~21:9, crops cleanly to 3:1 on mobile via object-cover
const PAD = 26;
const MAX_PTS = 160;

// Brand colours (SVG can't read CSS vars).
const BG = "#0e100c";
const LINE = "#c8ff00"; // accent lime
const START = "#c8ff00";
const END = "#8a8f80";

function fallbackSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
      font-family="system-ui,sans-serif" font-weight="800" font-size="34"
      fill="${LINE}" opacity="0.35" letter-spacing="2">LOOPS</text>
  </svg>`;
}

function shapeSvg(coords: [number, number][]): string {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const latRange = Math.max(maxLat - minLat, 1e-6);
  const lngRange = Math.max(maxLng - minLng, 1e-6);
  const scale = Math.min((W - 2 * PAD) / lngRange, (H - 2 * PAD) / latRange);
  const offsetX = PAD + ((W - 2 * PAD) - lngRange * scale) / 2;
  const offsetY = PAD + ((H - 2 * PAD) - latRange * scale) / 2;

  const pts = coords.map(([lat, lng]) => [
    offsetX + (lng - minLng) * scale,
    offsetY + (maxLat - lat) * scale, // flip lat so north is up
  ] as [number, number]);

  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [sx, sy] = pts[0];
  const [ex, ey] = pts[pts.length - 1];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="g" cx="50%" cy="32%" r="75%">
        <stop offset="0%" stop-color="#1a1d14"/>
        <stop offset="100%" stop-color="${BG}"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <path d="${d}" fill="none" stroke="${LINE}" stroke-opacity="0.18" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6" fill="${START}"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="5" fill="${BG}" stroke="${END}" stroke-width="2.5"/>
  </svg>`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const headers = {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  };
  try {
    const { id } = await params;
    const route = await getRoute(id);
    let coords: [number, number][] | null = null;
    if (route?.coordinates) {
      try {
        const raw = JSON.parse(route.coordinates);
        if (Array.isArray(raw) && raw.length >= 2) {
          const step = Math.max(1, Math.floor(raw.length / MAX_PTS));
          coords = raw
            .filter((_: unknown, i: number) => i % step === 0)
            .map((c: number[]) => [Number(c[0]), Number(c[1])] as [number, number])
            .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
        }
      } catch { /* fall through to fallback */ }
    }
    const svg = coords && coords.length >= 2 ? shapeSvg(coords) : fallbackSvg();
    return new NextResponse(svg, { headers });
  } catch {
    return new NextResponse(fallbackSvg(), { headers });
  }
}
