/**
 * Road report for a route we did not generate — an upload, an import, a
 * library loop. The Trust Rule says every served route names its
 * compromises; generated routes get that from the engine's per-edge tags,
 * so here we TRACE the existing track through the engine: via points every
 * ~0.8 km, a neutral profile that follows the roads as ridden (not the
 * Road Standard profile, which would dodge exactly what we want to find),
 * then the same buildRoadReport() the generator uses.
 *
 * Honest by construction: when the trace does not match the track (length
 * off by more than 8 %, a chunk that fails, over budget) we return null —
 * "unknown" — never a report about a different road.
 */

import { buildRoadReport, describeCompromise, type EdgeTags, type RoadReport } from "./road-segments";
import type { Discipline } from "./route-intent";
import { haversine } from "./climb-detection";

/** One engine call: the traced path with the engine's per-edge tags. */
export type TraceEngine = (
  waypoints: [number, number][],
) => Promise<{ coords: [number, number][]; edgeTags: EdgeTags | null; distance_km: number } | null>;

export const TRACE_PROFILE = "trekking";
/**
 * Tracing profile per discipline — each follows its own terrain faithfully:
 * trekking detours around rough tracks and trips the drift check on gravel
 * and MTB routes, which then stay "unknown". All three ship with BRouter.
 */
export function traceProfileFor(discipline: Discipline): string {
  return discipline === "gravel" ? "gravel" : discipline === "mtb" ? "mtb" : TRACE_PROFILE;
}
const VIA_SPACING_KM = 0.8;
const MAX_VIA = 150;          // ≤ 5 engine calls for any route
const CHUNK = 30;             // via points per engine call
const MAX_LENGTH_DRIFT = 0.08;

/** Via points along the track: the start, one every `spacing` km, the end. */
export function sampleVia(coords: [number, number][], spacingKm = VIA_SPACING_KM, maxVia = MAX_VIA): [number, number][] {
  if (coords.length < 2) return coords.slice();
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  const spacing = Math.max(spacingKm, total / maxVia);
  const via: [number, number][] = [coords[0]];
  let acc = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    acc += haversine(coords[i - 1], coords[i]);
    if (acc >= spacing) { via.push(coords[i]); acc = 0; }
  }
  via.push(coords[coords.length - 1]);
  return via;
}

/** Resolves road refs/names for compromises ("R755", "N125") — Overpass-backed in production. */
export type CompromiseNamer = (coords: [number, number][], compromises: RoadReport["compromises"]) => Promise<void>;

export async function traceRoadReport(
  coords: [number, number][],
  discipline: Discipline,
  engine: TraceEngine,
  budgetMs = 20_000,
  namer?: CompromiseNamer,
): Promise<RoadReport | null> {
  if (coords.length < 2) return null;
  const started = Date.now();
  const via = sampleVia(coords);
  let gpxKm = 0;
  for (let i = 1; i < coords.length; i++) gpxKm += haversine(coords[i - 1], coords[i]);
  if (gpxKm < 1) return null;

  const traced: [number, number][] = [];
  const tags: EdgeTags = [];
  let tracedKm = 0;
  for (let s = 0; s < via.length - 1; s += CHUNK) {
    if (Date.now() - started > budgetMs) return null;
    const chunk = via.slice(s, Math.min(s + CHUNK + 1, via.length)); // overlap one point
    const path = await engine(chunk);
    if (!path || path.coords.length < 2 || !path.edgeTags) return null;
    if (traced.length) tags.push(null); // the join between chunks is not a road
    traced.push(...path.coords);
    tags.push(...path.edgeTags);
    tracedKm += path.distance_km;
  }
  if (traced.length < 2) return null;
  // The trace must be the same ride, not a detour the engine preferred.
  if (Math.abs(tracedKm - gpxKm) / gpxKm > MAX_LENGTH_DRIFT) return null;
  const report = buildRoadReport(traced, tags, discipline);
  // "5.0 km on the Ma-2200" beats "on a primary road": name what we can,
  // within the budget, and never fail the report over a name lookup.
  if (namer && !report.standard_met && Date.now() - started < budgetMs) {
    try {
      await namer(traced, report.compromises);
      report.summary = summariseNamed(report);
    } catch { /* names are a nicety */ }
  }
  return report;
}

/** Rebuild the one-liner after names were resolved (same shape as the builder's). */
function summariseNamed(r: RoadReport): string {
  if (r.standard_met) return r.summary;
  const parts = r.compromises.slice(0, 2).map(describeCompromise);
  const more = r.compromises.length - parts.length;
  return `Compromise: ${parts.join("; ")}${more > 0 ? ` (+${more} more)` : ""}.`;
}
