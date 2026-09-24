/**
 * Small pure helpers for the Plan a ride page (kept out of page.tsx so they
 * can be unit-tested).
 */

/** Shortest prompt the generate API accepts (src/app/api/generate-route). */
export const MIN_PROMPT_CHARS = 10;

/** "40km loop", "2h", "90 min spin" — a length is enough to plan from. */
const HAS_LENGTH = /\d+(?:[.,]\d+)?\s*(?:km|k|h|hrs?|hours?|mins?|minutes?)\b/i;

/**
 * Enough to plan from: the usual minimum, or any shorter ask that says how
 * long ("40km loop" with the location on is a complete request).
 */
export function promptLongEnough(prompt: string): boolean {
  const q = prompt.trim();
  return q.length >= MIN_PROMPT_CHARS || HAS_LENGTH.test(q);
}

/**
 * Plain-English message for a response that carried no JSON error (a proxy
 * or platform error page). Riders never see a parser message.
 */
export function friendlyHttpError(status: number): { message: string; code: string } {
  if (status === 401) return { message: "Your sign-in has expired — log in again to plan a ride.", code: "UNAUTHORIZED" };
  if (status === 429) return { message: "That's a lot of asks in a row.", code: "RATE_LIMITED" };
  if (status === 504 || status === 408) return { message: "This one took longer than a minute — busy roads can do that.", code: "TIMEOUT" };
  return { message: "Our route engine hiccuped — give it another go.", code: "SERVER" };
}

/** Section heading that matches the cards under it. */
export function resultsHeading(sources: Array<"library" | "generated">): string {
  const lib = sources.filter((s) => s === "library").length;
  const fresh = sources.length - lib;
  if (lib === 0) return "Freshly built for you";
  if (fresh === 0) return "Matched from our verified library";
  return fresh === 1
    ? "From our verified library, plus one built for you"
    : "From our verified library, plus loops built for you";
}

// ── Last results, kept for this tab ─────────────────────────────────────────
// Back from a route page (or a sign-in / Garmin round-trip) restores what the
// rider was looking at instead of an empty page or a whole new generation.

export const RESULTS_KEY = "loops:generate:last";
export const RESULTS_TTL_MS = 60 * 60 * 1000;

export interface CachedResults<I, C> {
  prompt: string;
  interpreted: I | null;
  candidates: C[];
  at: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readResults<I, C>(s: StorageLike | null = store(), now = Date.now()): CachedResults<I, C> | null {
  try {
    const raw = s?.getItem(RESULTS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as CachedResults<I, C>;
    if (typeof v?.prompt !== "string" || !Array.isArray(v.candidates) || typeof v.at !== "number") return null;
    if (now - v.at > RESULTS_TTL_MS) return null;
    return v;
  } catch {
    return null;
  }
}

export function writeResults<I, C>(r: Omit<CachedResults<I, C>, "at">, s: StorageLike | null = store(), now = Date.now()): void {
  try {
    s?.setItem(RESULTS_KEY, JSON.stringify({ ...r, at: now }));
  } catch {
    /* quota / private mode — Back simply re-asks */
  }
}

export function clearResults(s: StorageLike | null = store()): void {
  try {
    s?.removeItem(RESULTS_KEY);
  } catch {
    /* ignore */
  }
}
