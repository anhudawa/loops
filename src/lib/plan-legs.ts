/**
 * Pure per-leg math for the map planner (src/components/MapPlanner.tsx).
 *
 * The planner keeps the route as an ordered list of legs — one snapped
 * routing call per leg (previous anchor → new anchor). Everything here is
 * pure and unit-tested: totals, geometry concatenation (junction dedupe),
 * the live-elevation chart track, the mid-leg insertion index math, and the
 * client-side GPX serializer used for export.
 */

export type LatLng = [number, number];

export type LegStatus =
  | "pending" // snap request in flight — straight placeholder shown
  | "snapped" // genuine road geometry from /api/reroute
  | "failed" // snap failed (422/network) — straight placeholder, retryable
  | "straight"; // anonymous user — snapping unavailable, straight line

export interface PlanLeg {
  /** Stable identity across re-snaps (indices shift on insert/remove). */
  id: number;
  /** Monotonic per-leg request sequence — stale responses are dropped. */
  seq: number;
  from: LatLng;
  to: LatLng;
  /** Snapped geometry when status === "snapped"; otherwise [from, to]. */
  coords: LatLng[];
  /** Per-point elevations (may be empty / contain NaN when unsnapped). */
  elevations: number[];
  /** Snapped distance, or straight-line distance when unsnapped. */
  distance_km: number;
  gain_m: number;
  /** Snapped descent; 0 for unsnapped legs (straight lines have no profile). */
  loss_m: number;
  status: LegStatus;
  error?: string;
}

export interface LegTotals {
  distance_km: number;
  gain_m: number;
  loss_m: number;
  /** True when any leg is unsnapped — display the total as approximate. */
  approx: boolean;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km between two [lat, lng] points. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Total distance, climbing and descent across all legs. Unsnapped legs
 * contribute their straight-line distance and zero gain/loss, and flip
 * `approx` on — the UI prefixes the total with "~" so we never present a
 * guess as fact.
 */
export function legTotals(legs: PlanLeg[]): LegTotals {
  let distance = 0;
  let gain = 0;
  let loss = 0;
  let approx = false;
  for (const leg of legs) {
    distance += leg.distance_km;
    gain += leg.gain_m;
    loss += leg.loss_m ?? 0;
    if (leg.status !== "snapped") approx = true;
  }
  return {
    distance_km: Math.round(distance * 10) / 10,
    gain_m: Math.round(gain),
    loss_m: Math.round(loss),
    approx,
  };
}

/** "24.3 km · +310 m", prefixed with "~" while any leg is unsnapped. */
export function formatTotals(t: LegTotals): string {
  return `${t.approx ? "~" : ""}${t.distance_km.toFixed(1)} km · +${t.gain_m} m`;
}

/** Two coords within ~1 m of each other count as the same junction point. */
function samePoint(a: LatLng, b: LatLng): boolean {
  return Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5;
}

/**
 * Concatenate the legs' geometry into one continuous track, dropping the
 * duplicated junction point where one leg ends and the next begins.
 * Elevation arrays shorter than their coords are padded with NaN so the
 * two stay index-aligned (the GPX serializer omits <ele> for NaN).
 */
export function concatLegGeometry(legs: PlanLeg[]): {
  coords: LatLng[];
  elevations: number[];
} {
  const coords: LatLng[] = [];
  const elevations: number[] = [];
  for (const leg of legs) {
    for (let i = 0; i < leg.coords.length; i++) {
      const pt = leg.coords[i];
      if (coords.length > 0 && i === 0 && samePoint(coords[coords.length - 1], pt)) {
        continue; // junction shared with the previous leg
      }
      coords.push(pt);
      const ele = leg.elevations[i];
      elevations.push(typeof ele === "number" ? ele : NaN);
    }
  }
  return { coords, elevations };
}

/**
 * Concatenate the legs into the `[lat, lng, ele][]` triples the
 * ElevationProfile chart consumes. Junction dedupe matches concatLegGeometry;
 * points whose elevation is missing/NaN become 0 so the chart's hasRealData
 * check (which treats an all-zero series as "no data") stays honest — a route
 * with no real elevation renders the empty state instead of a flat fake line.
 */
export function legGeometryForChart(legs: PlanLeg[]): [number, number, number][] {
  const { coords, elevations } = concatLegGeometry(legs);
  return coords.map((c, i) => {
    const e = elevations[i];
    return [c[0], c[1], typeof e === "number" && !Number.isNaN(e) ? e : 0];
  });
}

/**
 * Insert a via-anchor into the ordered anchor list at a leg boundary.
 *
 * `legIndex` identifies the leg connecting anchors[legIndex] → anchors[legIndex+1];
 * the new point is inserted between them, so the via lands at position
 * legIndex+1 and the returned array is one longer. Pure index math — the
 * caller re-snaps the two resulting legs. Returns the array unchanged when
 * legIndex is out of range (defensive; the caller validates first).
 */
export function insertAnchorAtLeg(
  anchors: LatLng[],
  legIndex: number,
  via: LatLng
): LatLng[] {
  if (legIndex < 0 || legIndex >= anchors.length - 1) return anchors;
  return [...anchors.slice(0, legIndex + 1), via, ...anchors.slice(legIndex + 1)];
}

/**
 * The point a mid-leg drag handle sits on: the central VERTEX of the leg's
 * snapped geometry, so the handle hugs the real road rather than floating on
 * the straight chord. Falls back to the leg's from/to for a degenerate
 * (empty) coords array.
 */
export function legHandlePoint(leg: PlanLeg): LatLng {
  const pts = leg.coords.length >= 2 ? leg.coords : [leg.from, leg.to];
  return pts[Math.floor(pts.length / 2)];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Minimal client-side GPX 1.1 serializer (same shape as the server's
 * buildGpx in route-generator.ts): one trk/trkseg, <ele> on every point
 * that has a real elevation.
 */
export function buildPlanGpx(
  coords: LatLng[],
  elevations: number[],
  name: string,
  discipline: string
): string {
  const now = new Date().toISOString();
  const trkpts = coords
    .map(([lat, lng], i) => {
      const ele =
        elevations[i] != null && !Number.isNaN(elevations[i])
          ? `<ele>${elevations[i].toFixed(1)}</ele>`
          : "";
      return `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${ele}</trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="loops.ie"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <author><name>loops.ie</name></author>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>${escapeXml(discipline)}</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}
