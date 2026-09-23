/**
 * Library loops carry a MEASURED road report (traced on first view —
 * road-trace.ts). When the generator serves one — as is, or as a ride from
 * home built on it — that report must travel with the served route: the
 * Trust Rule is "never silently serve a bad route", and a verified loop
 * with 11 km of main road is exactly the case it was written for.
 */

import type { RoadReport } from "./road-segments";
import { describeCompromise } from "./road-segments";

/** A stored report is JSONB from the DB: accept it only when it is shaped like one. */
export function validRoadReport(x: unknown): RoadReport | undefined {
  if (!x || typeof x !== "object") return undefined;
  const r = x as Record<string, unknown>;
  if (typeof r.standard_met !== "boolean" || typeof r.summary !== "string") return undefined;
  if (!Array.isArray(r.compromises)) return undefined;
  const surface = r.surface as Record<string, unknown> | undefined;
  if (!surface || typeof surface.paved_pct !== "number") return undefined;
  return r as unknown as RoadReport;
}

/**
 * Fold the verified loop's own report into the stitched ride's report.
 *
 * `legs` was built over the whole stitched track with the loop edges
 * untagged ("unknown"), so its shares already have the loop distance in
 * the denominator and zero in the numerator: the loop's shares add on top,
 * scaled by the loop distance actually ridden. The loop's compromises are
 * listed as "on the verified loop" — their indices do not map onto the
 * stitched track (rotated, possibly partial), so they are zeroed.
 */
export function mergeLoopReport(
  legs: RoadReport,
  loop: RoadReport | undefined,
  loopUsedKm: number,
  totalKm: number,
  built: string
): RoadReport {
  const legsOk = legs.standard_met;
  const legsLine = legs.compromises.slice(0, 2).map(describeCompromise).join("; ");
  if (!loop || totalKm <= 0) {
    return {
      ...legs,
      summary: legsOk
        ? `${built} Out and home meet the Loops road standard.`
        : `${built} Compromise: ${legsLine}.`,
    };
  }
  const share = Math.max(0, Math.min(1, loopUsedKm / totalKm));
  const add = (a: number, b: number) => Math.round(Math.min(100, a + b * share));
  const paved = add(legs.surface.paved_pct, loop.surface.paved_pct);
  const unpaved = add(legs.surface.unpaved_pct, loop.surface.unpaved_pct);
  const loopComps = loop.compromises.map((c) => ({ ...c, start: 0, end: 0, near_start: false }));
  const loopLine = loop.compromises.slice(0, 2).map(describeCompromise).join("; ");
  const loopOk = loop.standard_met;
  const summary = legsOk && loopOk
    ? `${built} The whole ride meets the Loops road standard.`
    : legsOk
      ? `${built} Out and home meet the standard; on the verified loop: ${loopLine}.`
      : loopOk
        ? `${built} Compromise: ${legsLine}. The verified loop itself meets the standard.`
        : `${built} Compromise: ${legsLine}; on the verified loop: ${loopLine}.`;
  return {
    known_pct: add(legs.known_pct, loop.known_pct),
    road_class_pct: legs.road_class_pct,
    surface: { paved_pct: paved, unpaved_pct: unpaved, unknown_pct: Math.max(0, 100 - paved - unpaved) },
    main_road_pct: add(legs.main_road_pct, loop.main_road_pct),
    fast_road_pct: add(legs.fast_road_pct, loop.fast_road_pct),
    compromises: [...legs.compromises, ...loopComps],
    standard_met: legsOk && loopOk,
    summary,
  };
}
