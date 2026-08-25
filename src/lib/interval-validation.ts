/**
 * Interval Segment Validation — OSM-based refinements
 *
 * Runs targeted Overpass queries to check detected segments for features
 * that disqualify them from hosting sustained intervals:
 *   - traffic signals (rider must stop mid-effort)
 *   - bicycle access restrictions (private, no-bicycle roads)
 *
 * Separated from the pure interval-segments.ts module so segment
 * detection stays network-free and fast. Call validateSegments as a
 * post-processing step after detectIntervalSegments.
 */

import type { IntervalSegment } from "./interval-segments";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT_MS = 10000;

export interface SegmentIssue {
  /** "unverified" = Overpass was unreachable; junctions could not be
   * checked. Non-blocking for display, but never counts as clean. */
  type: "traffic_signal" | "access_restricted" | "unverified";
  lat: number;
  lng: number;
  detail: string;
}

export interface ValidatedSegment extends IntervalSegment {
  issues: SegmentIssue[];
  /** A segment with issues is still returned but flagged. Callers decide
   * whether to drop it or warn the rider. */
  has_blocking_issues: boolean;
}

/**
 * Build a small bounding box around a segment's coordinates.
 */
function segmentBbox(
  coords: [number, number][],
  startIdx: number,
  endIdx: number,
  padDeg = 0.002 // ~200m
): { s: number; w: number; n: number; e: number } {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (let i = startIdx; i <= endIdx && i < coords.length; i++) {
    const [lat, lng] = coords[i];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return {
    s: minLat - padDeg,
    w: minLng - padDeg,
    n: maxLat + padDeg,
    e: maxLng + padDeg,
  };
}

async function queryOverpassForSegment(
  bbox: { s: number; w: number; n: number; e: number }
): Promise<{
  signalNodes: Array<{ lat: number; lon: number }>;
  restrictedWays: Array<{ tags: Record<string, string> }>;
}> {
  const { s, w, n, e } = bbox;
  const query = `
[out:json][timeout:10];
(
  node["highway"="traffic_signals"](${s},${w},${n},${e});
  way["access"~"^(private|no)$"](${s},${w},${n},${e});
  way["bicycle"="no"](${s},${w},${n},${e});
);
out body;
`.trim();

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "User-Agent": "loops.ie route generator (https://www.loops.ie)", "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Surface the failure — the caller marks the segment "unverified"
    // instead of pretending it was checked and found clean.
    throw new Error(`Overpass returned HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    elements: Array<{
      type: string;
      lat?: number;
      lon?: number;
      tags?: Record<string, string>;
    }>;
  };

  const signalNodes: Array<{ lat: number; lon: number }> = [];
  const restrictedWays: Array<{ tags: Record<string, string> }> = [];

  for (const el of json.elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      signalNodes.push({ lat: el.lat, lon: el.lon });
    }
    if (el.type === "way" && el.tags) {
      restrictedWays.push({ tags: el.tags });
    }
  }

  return { signalNodes, restrictedWays };
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check each segment for traffic signals and access restrictions via OSM.
 * Queries are run in parallel — one small bbox per segment.
 *
 * Returns all segments with issues attached. Segments with blocking issues
 * (traffic signals within 50m of the route, or bicycle-restricted roads)
 * are flagged with `has_blocking_issues = true`. Callers can choose to
 * drop them or demote their suitability.
 */
export async function validateSegments(
  segments: IntervalSegment[],
  coords: [number, number][]
): Promise<ValidatedSegment[]> {
  if (segments.length === 0) return [];

  const results = await Promise.all(
    segments.map(async (seg): Promise<ValidatedSegment> => {
      const bbox = segmentBbox(coords, seg.start_index, seg.end_index);
      const issues: SegmentIssue[] = [];

      try {
        const { signalNodes, restrictedWays } = await queryOverpassForSegment(bbox);

        // Check traffic signals — only flag those within 50m of the actual
        // route path (the bbox might extend a bit beyond).
        for (const signal of signalNodes) {
          let minDist = Infinity;
          for (let i = seg.start_index; i <= seg.end_index && i < coords.length; i++) {
            const d = haversineM(coords[i][0], coords[i][1], signal.lat, signal.lon);
            if (d < minDist) minDist = d;
          }
          if (minDist < 50) {
            issues.push({
              type: "traffic_signal",
              lat: signal.lat,
              lng: signal.lon,
              detail: `Traffic signal ${Math.round(minDist)}m from route`,
            });
          }
        }

        // Check access restrictions — if any restricted way exists in the
        // segment bbox, flag it (conservative; could refine with way-node
        // matching later).
        for (const way of restrictedWays) {
          const accessTag = way.tags.access;
          const bicycleTag = way.tags.bicycle;
          issues.push({
            type: "access_restricted",
            lat: (bbox.s + bbox.n) / 2,
            lng: (bbox.w + bbox.e) / 2,
            detail: bicycleTag === "no"
              ? "Road marked bicycle=no in OSM"
              : `Road marked access=${accessTag} in OSM`,
          });
        }
      } catch {
        // Overpass failure is not fatal to the flow, but honesty demands
        // we never report an unchecked segment as clean. Mark it
        // unverified (non-blocking for display; filterCleanSegments
        // refuses to treat it as clean).
        issues.push({
          type: "unverified",
          lat: (bbox.s + bbox.n) / 2,
          lng: (bbox.w + bbox.e) / 2,
          detail:
            "Road data unavailable — junctions on this segment could not be verified",
        });
      }

      return {
        ...seg,
        issues,
        has_blocking_issues: issues.some(
          (i) => i.type === "traffic_signal" || i.type === "access_restricted"
        ),
      };
    })
  );

  return results;
}

/**
 * Remove segments with blocking issues and return only clean ones.
 * Convenience wrapper used by the workout matcher to drop unsuitable
 * segments before running workout assignment.
 *
 * Unverified segments (Overpass down) are NOT clean: "we couldn't check
 * for junctions" must never be served as "no junctions". The honest
 * outcome is a decline with alternatives, per the launch spec.
 */
export function filterCleanSegments(
  validated: ValidatedSegment[]
): ValidatedSegment[] {
  return validated.filter(
    (s) =>
      !s.has_blocking_issues &&
      !s.issues.some((i) => i.type === "unverified")
  );
}
