/**
 * Stored climbing totals from imports summed every up-tick of noisy heights
 * (the Rupit Loop read 6,191 m for ~2,700 m of climbing). The honest figure
 * is recomputed from the track (climbStats) and shown — and stored once by
 * the route API — whenever the stored one is well off.
 */
import { climbStats } from "./geo-utils";

/** Off by more than this share (and CLIMB_FIX_MIN_M) → corrected. */
const CLIMB_FIX_SHARE = 0.15;
const CLIMB_FIX_MIN_M = 30;

type WithClimb = { coordinates: string; elevation_gain_m: number; elevation_loss_m: number };

/** The corrected totals, or null when the stored ones stand (or the track has no heights). */
export function trueClimb(route: WithClimb): { gain: number; loss: number } | null {
  try {
    const raw = JSON.parse(route.coordinates) as number[][];
    if (raw.length < 2 || !raw.every((c) => typeof c[2] === "number")) return null;
    const { gain_m, loss_m } = climbStats(raw.map((c) => [c[0], c[1]] as [number, number]), raw.map((c) => c[2]));
    const gain = Math.round(gain_m), loss = Math.round(loss_m);
    const stored = Number(route.elevation_gain_m);
    if (Math.abs(stored - gain) <= Math.max(CLIMB_FIX_MIN_M, gain * CLIMB_FIX_SHARE)) return null;
    return { gain, loss };
  } catch {
    return null;
  }
}

/** The route with honest climbing totals (display; the API also stores them). */
export function withTrueClimb<T extends WithClimb>(route: T): T {
  const t = trueClimb(route);
  return t ? { ...route, elevation_gain_m: t.gain, elevation_loss_m: t.loss } : route;
}
