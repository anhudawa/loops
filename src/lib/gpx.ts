import { calculateStats } from "./geo-utils";

export interface GpxData {
  name: string | null;
  coordinates: [number, number][]; // [lat, lng]
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
}

/**
 * One height per point, in step with the coordinates. Points without a
 * height take the nearest known one (never 0 m, never a shifted array);
 * a file with no heights at all gives [] (backfilled from the DEM later).
 */
export function alignElevations(raw: (number | null)[]): number[] {
  const firstKnown = raw.find((v): v is number => v != null && Number.isFinite(v));
  if (firstKnown === undefined) return [];
  let last = firstKnown;
  return raw.map((v) => (v != null && Number.isFinite(v) ? (last = v) : last));
}

export function parseGpx(xml: string): GpxData {
  const coordinates: [number, number][] = [];
  const rawEle: (number | null)[] = [];

  // Extract track name
  const nameMatch = xml.match(/<name>([^<]*)<\/name>/);
  const name = nameMatch ? nameMatch[1] : null;

  // Extract track points
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let match;
  while ((match = trkptRegex.exec(xml)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    coordinates.push([lat, lng]);

    const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
    rawEle.push(eleMatch ? parseFloat(eleMatch[1]) : null);
  }

  // Also try route points if no track points found
  if (coordinates.length === 0) {
    const rteptRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/rtept>/g;
    while ((match = rteptRegex.exec(xml)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      coordinates.push([lat, lng]);

      const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
      rawEle.push(eleMatch ? parseFloat(eleMatch[1]) : null);
    }
  }

  const elevations = alignElevations(rawEle);
  const stats = calculateStats(coordinates, elevations);

  return {
    name,
    coordinates,
    elevations,
    ...stats,
  };
}

export function suggestDifficulty(distance_km: number, elevation_gain_m: number): string {
  const gradientFactor = elevation_gain_m / Math.max(distance_km, 1);
  const score = gradientFactor + distance_km / 50;

  if (score < 5) return "easy";
  if (score < 15) return "moderate";
  if (score < 30) return "hard";
  return "expert";
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A typed meeting point (from a ride link's `?m=`) made safe for a GPX
 *  waypoint name: control characters stripped, whitespace collapsed,
 *  capped at 80 chars. Empty → null. XML escaping happens at render. */
export function sanitizeMeetingPoint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return clean || null;
}

/**
 * GPX 1.1 for a stored route (coordinates [lat,lng] or [lat,lng,ele]).
 * Carries a <wpt> at the first point so head units show a named start:
 * "Start", or "Start: <meeting point>" when a ride link passed one.
 */
export function buildRouteGpx(
  name: string,
  description: string | null,
  coordinates: number[][],
  opts: { meetingPoint?: string | null; warnings?: Array<{ at: [number, number]; label: string }> } = {},
): string {
  const trkpts = coordinates
    .map((coord) => {
      const [lat, lng, ele] = coord;
      const eleTag = ele != null ? `<ele>${ele}</ele>` : "";
      return `      <trkpt lat="${lat}" lon="${lng}">${eleTag}</trkpt>`;
    })
    .join("\n");

  const meet = sanitizeMeetingPoint(opts.meetingPoint);
  const first = coordinates[0];
  const startWpt =
    first && Number.isFinite(first[0]) && Number.isFinite(first[1])
      ? `  <wpt lat="${first[0]}" lon="${first[1]}">${first[2] != null ? `<ele>${first[2]}</ele>` : ""}<name>${escapeXml(meet ? `Start: ${meet}` : "Start")}</name>${meet ? `<desc>${escapeXml(`Meeting point: ${meet}`)}</desc>` : ""}<sym>Flag, Green</sym></wpt>\n`
      : "";

  // Road Standard compromises as waypoints: a head unit shows them as POIs
  // on approach — "Road note: 1.6 km on the Ma-11 (main road)".
  const warnWpts = (opts.warnings ?? [])
    .filter((w) => Array.isArray(w.at) && Number.isFinite(w.at[0]) && Number.isFinite(w.at[1]))
    .map((w) => `  <wpt lat="${w.at[0]}" lon="${w.at[1]}"><name>${escapeXml(`Road note: ${w.label}`)}</name><sym>Danger Area</sym></wpt>\n`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LOOPS"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
${description ? `    <desc>${escapeXml(description)}</desc>\n` : ""}    <link href="https://www.loops.ie">
      <text>LOOPS</text>
    </link>
  </metadata>
${startWpt}${warnWpts}  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}
