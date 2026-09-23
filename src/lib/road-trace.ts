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

import { buildRoadReport, describeCompromise, measuredSuffix, type EdgeTags, type RoadReport } from "./road-segments";
import type { Discipline } from "./route-intent";
import { haversine } from "./climb-detection";

/** One engine call with a named profile: the traced path with the engine's per-edge tags. */
export type TraceEngine = (
  waypoints: [number, number][],
  profile: string,
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

/**
 * The profile chain tried per chunk, in order: the discipline's own profile
 * (follows its terrain), trekking, then — when the app could upload it —
 * the permissive `loops-trace` profile that follows anything, so a track
 * that rides a bicycle=no tunnel or an autovía is measured as ridden
 * (and the classifier names it) instead of staying "unknown".
 */
export function traceProfileChain(discipline: Discipline, permissiveId?: string | null): string[] {
  const chain = [traceProfileFor(discipline)];
  if (chain[0] !== TRACE_PROFILE) chain.push(TRACE_PROFILE);
  if (permissiveId) chain.push(permissiveId);
  return chain;
}
const VIA_SPACING_KM = 0.8;
const MAX_VIA = 150;          // ≤ 5 engine calls for any route
const CHUNK = 30;             // via points per engine call

/** Via points along the track: the start, one every `spacing` km, the end. */
export function sampleVia(coords: [number, number][], spacingKm = VIA_SPACING_KM, maxVia = MAX_VIA): [number, number][] {
  return sampleViaWithDistance(coords, spacingKm, maxVia).via;
}

/** Resolves road refs/names for compromises ("R755", "N125") — Overpass-backed in production. */
export type CompromiseNamer = (coords: [number, number][], compromises: RoadReport["compromises"]) => Promise<void>;

const MAX_CHUNK_DRIFT = 0.2;   // a chunk the engine could not follow (a detour) stays unknown
const MIN_KNOWN_PCT = 60;      // less measured than this → no report: unknown beats wrong

/** Via points plus the track distance (km) at each, so a chunk can be checked against its own stretch. */
export function sampleViaWithDistance(coords: [number, number][], spacingKm = VIA_SPACING_KM, maxVia = MAX_VIA): { via: [number, number][]; cumKm: number[] } {
  if (coords.length < 2) return { via: coords.slice(), cumKm: coords.map(() => 0) };
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  const spacing = Math.max(spacingKm, total / maxVia);
  const via: [number, number][] = [coords[0]];
  const cumKm: number[] = [0];
  let acc = 0, cum = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const d = haversine(coords[i - 1], coords[i]);
    acc += d; cum += d;
    if (acc >= spacing) { via.push(coords[i]); cumKm.push(cum); acc = 0; }
  }
  cum += haversine(coords[coords.length - 2], coords[coords.length - 1]);
  via.push(coords[coords.length - 1]); cumKm.push(cum);
  return { via, cumKm };
}

export async function traceRoadReport(
  coords: [number, number][],
  discipline: Discipline,
  engine: TraceEngine,
  budgetMs = 20_000,
  namer?: CompromiseNamer,
  profiles: string[] = traceProfileChain(discipline),
): Promise<RoadReport | null> {
  if (coords.length < 2) return null;
  const started = Date.now();
  const { via, cumKm } = sampleViaWithDistance(coords);
  const gpxKm = cumKm[cumKm.length - 1];
  if (gpxKm < 1) return null;

  const traced: [number, number][] = [];
  const tags: EdgeTags = [];
  let unknownKm = 0;
  // A chunk the engine could not follow is kept as straight, untagged legs:
  // its distance counts as "unknown" in the report, never as a road.
  const pushUnknown = (chunk: [number, number][]) => {
    for (const p of chunk) { if (traced.length) tags.push(null); traced.push(p); }
  };
  for (let s = 0; s < via.length - 1; s += CHUNK) {
    if (Date.now() - started > budgetMs) return null;
    const end = Math.min(s + CHUNK, via.length - 1);
    const chunk = via.slice(s, end + 1);
    const chunkKm = cumKm[end] - cumKm[s];
    const driftOf = (p: Awaited<ReturnType<TraceEngine>>) =>
      p && p.edgeTags && p.coords.length >= 2 ? Math.abs(p.distance_km - chunkKm) / Math.max(0.3, chunkKm) : Infinity;
    let path: Awaited<ReturnType<TraceEngine>> = null;
    for (const profile of profiles) {
      if (Date.now() - started > budgetMs) break;
      let p = await engine(chunk, profile);
      if ((!p || !p.edgeTags) && chunk.length > 4) {
        // A via point the engine cannot reach (an off-road GPS fix, a private
        // lane): thin the chunk and try once more with the same profile.
        p = await engine(chunk.filter((_, i) => i === 0 || i === chunk.length - 1 || i % 2 === 0), profile);
      }
      if (driftOf(p) <= MAX_CHUNK_DRIFT) { path = p; break; }
    }
    if (!path) {
      pushUnknown(chunk);
      unknownKm += chunkKm;
      continue;
    }
    if (traced.length) tags.push(null); // the join between chunks is not a road
    traced.push(...path.coords);
    tags.push(...(path.edgeTags ?? []));
  }
  if (traced.length < 2) return null;
  if ((1 - unknownKm / gpxKm) * 100 < MIN_KNOWN_PCT) return null;
  const report = buildRoadReport(traced, tags, discipline);
  // "5.0 km on the Ma-2200" beats "on a primary road": name what we can,
  // within the budget, and never fail the report over a name lookup.
  if (namer && !report.standard_met && Date.now() - started < budgetMs) {
    try {
      await namer(traced, report.compromises);
      report.summary = summariseReport(report);
    } catch { /* names are a nicety */ }
  }
  return report;
}

/** Rebuild the one-liner after names were resolved (same shape as the builder's). */
export function summariseReport(r: RoadReport): string {
  if (r.standard_met) return r.summary;
  const parts = r.compromises.slice(0, 2).map(describeCompromise);
  const more = r.compromises.length - parts.length;
  return `Compromise: ${parts.join("; ")}${more > 0 ? ` (+${more} more)` : ""}${measuredSuffix(r)}.`;
}
