/**
 * What the Draw planner tells a rider about the ride as a whole — pure, so
 * it can be unit-tested away from the map. Each leg is snapped (and its
 * Road Standard measured) on its own, so anything that depends on the
 * whole ride is worked out here from the legs.
 */

import { EXIT_ZONE_KM, type Compromise } from "@/lib/road-segments";
import { haversineKm, type LatLng } from "@/lib/plan-legs";

/** 0 = worst: fast roads first (a signed 80 km/h+ road with no cycle track), then main roads. */
function severity(c: Compromise): number {
  const speed = parseInt(c.maxspeed ?? "", 10);
  if (c.kind === "fast_road" || (Number.isFinite(speed) && speed >= 80)) return 0;
  if (c.kind === "main_road") return 1;
  if (c.kind === "unsuitable") return 2;
  return 3;
}

/**
 * The drawn ride's compromises, worst first (347 m of the N81 at 100 km/h
 * outranks 2 km of a quiet primary), longest first within a kind. Each
 * leg judged "near the start" against its own ends; the ride's start is
 * anchors[0] (and the finish is the last pin when it does not loop back).
 */
export function planCompromises(
  legs: { coords: LatLng[]; compromises?: Compromise[] }[],
  anchors: LatLng[],
  loopBack: boolean
): Compromise[] {
  const start = anchors[0];
  const finish = loopBack ? start : anchors[anchors.length - 1];
  const out: Compromise[] = [];
  for (const l of legs) {
    for (const c of l.compromises ?? []) {
      const at = c.at ?? l.coords[Math.min(l.coords.length - 1, Math.floor((c.start + c.end) / 2))];
      const { near_start: _old, ...rest } = c;
      void _old;
      const near = !!start && !!at &&
        (haversineKm(at, start) <= EXIT_ZONE_KM || (!!finish && haversineKm(at, finish) <= EXIT_ZONE_KM));
      out.push(near ? { ...rest, near_start: true } : rest);
    }
  }
  return out.sort((a, b) => severity(a) - severity(b) || b.meters - a.meters);
}

/** A leg this much longer than the straight line between its pins has gone the long way round. */
export const DETOUR_NOTICE_RATIO = 1.6;

/**
 * The legs whose road route is a long way round (reroute's detour_ratio,
 * when the server sends it — absent means nothing to say).
 */
export function detourLegs(legs: { detour_ratio?: number | null }[]): number[] {
  const out: number[] = [];
  legs.forEach((l, i) => {
    if (typeof l.detour_ratio === "number" && Number.isFinite(l.detour_ratio) && l.detour_ratio > DETOUR_NOTICE_RATIO) out.push(i);
  });
  return out;
}
