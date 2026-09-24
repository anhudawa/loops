/**
 * Rider-proven routes (owner, 2026-09-23): "If someone plans a route and
 * saves it — Clontarf to Clontarf, 3 hours — person B looking for a route
 * should be shown person A's route as an option, but we need to ask later:
 * did you ride the route, and how was it (1–5 stars). Without the rating
 * system we would just be suggesting slop. Commutes etc. need to be filtered
 * out as they aren't loops (not a training ride)."
 *
 * The rules live here, pure and tested; db.ts stores, the API asks.
 *
 *   - Saving a route (or downloading its GPX) books a check-in for the day
 *     after: "Did you ride it?" then "How was it?" (1–5).
 *   - A saved route is offered to other riders only once its creator has
 *     ridden it and rated it 4 or 5, AND it is a training loop: back where
 *     it started, long enough, a sound track, not mostly ridden twice.
 *   - Every rider who is offered it and rides it is asked too; a route whose
 *     riders average under 3.5 (3+ ratings) stops being offered.
 */

import { checkTrack } from "./track-shape";

/** Ask the day after saving; a rider who says "not yet" is asked again later. */
export const FIRST_ASK_HOURS = 20;
export const SNOOZE_HOURS = 48;
export const MAX_ASKS = 3;

/** The creator's own rating that lets a route be offered to others. */
export const PROMOTE_MIN_SCORE = 4;
/** With this many ratings, an average under DEMOTE_BELOW takes it down. */
export const DEMOTE_MIN_RATINGS = 3;
export const DEMOTE_BELOW = 3.5;

/** A training loop: back within this of the start… */
const LOOP_ENDS_KM = 1;
/** …long enough to be a ride, not an errand… */
const MIN_TRAINING_KM = 20;
/** …and not mostly the same road twice (a commute there and back, repeats). */
const MAX_RETRACE_PCT = 40;

export interface TrainingLoopVerdict {
  ok: boolean;
  /** Why not, in words (admin/diagnostics). */
  why?: string;
}

/** Is this track a training loop another rider could be offered? */
export function isTrainingLoop(coords: [number, number][], distanceKm: number): TrainingLoopVerdict {
  if (distanceKm < MIN_TRAINING_KM) return { ok: false, why: `${Math.round(distanceKm)} km — shorter than a training ride` };
  const track = checkTrack(coords);
  if (!track) return { ok: false, why: "no track" };
  if (track.broken) return { ok: false, why: track.broken };
  if (track.endsApartKm > LOOP_ENDS_KM) return { ok: false, why: `ends ${track.endsApartKm.toFixed(1)} km from the start — A to B, not a loop` };
  if (track.retracePct > MAX_RETRACE_PCT) return { ok: false, why: `${Math.round(track.retracePct)} % ridden twice` };
  return { ok: true };
}

export interface CommunityState {
  /** Creator's own check-in. */
  creatorRode: boolean | null;
  creatorScore: number | null;
  /** All riders' ratings (creator included). */
  ratings: number[];
  trainingLoop: TrainingLoopVerdict;
  /** The Road Standard served with it passed the usual serving policy. */
  roadsOk: boolean;
}

export type CommunityDecision = "offer" | "hold" | "drop";

/**
 * Offer it to others, keep holding it back (not proven yet), or drop it
 * (proven bad). Only the creator riding it and rating it 4+ can open the
 * door; the crowd can close it.
 */
export function communityDecision(s: CommunityState): CommunityDecision {
  if (s.ratings.length >= DEMOTE_MIN_RATINGS) {
    const avg = s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length;
    if (avg < DEMOTE_BELOW) return "drop";
  }
  if (!s.trainingLoop.ok || !s.roadsOk) return "hold";
  if (s.creatorRode !== true || (s.creatorScore ?? 0) < PROMOTE_MIN_SCORE) return "hold";
  return "offer";
}

/** "Ridden and rated ★ 4.6 by 5 LOOPS riders" — never a name (no attribution). */
export function provenLabel(rides: number, avg: number | null): string | null {
  if (!rides || avg == null) return null;
  const stars = `★ ${avg.toFixed(1)}`;
  return rides === 1 ? `Ridden and rated ${stars} by a LOOPS rider` : `Ridden and rated ${stars} by ${rides} LOOPS riders`;
}

/** When to ask next after an answer of "not yet". */
export function nextAskAt(now: Date, asks: number): Date | null {
  if (asks >= MAX_ASKS) return null;
  return new Date(now.getTime() + SNOOZE_HOURS * 3600_000);
}
