/**
 * Ride check-ins, server side: book them, apply answers, open/close routes
 * to other riders (rules in ride-check.ts), send reminders (push, else email).
 */
import {
  bookRideCheck, answerRideCheck, snoozeRideCheck, getCommunityInputs, setCommunityStatus,
  getRideChecksToRemind, markRideCheckReminded, getWebPushSubscriptions, deleteWebPushSubscription,
  type RideCheck,
} from "./db";
import { FIRST_ASK_HOURS, communityDecision, isTrainingLoop, nextAskAt } from "./ride-check";
import { compromiseAcceptable, type RoadReport } from "./road-segments";
import { isWebPushEnabled, sendWebPush } from "./web-push";
import { sendRideCheckEmail } from "./email";

export function publicBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_ENV === "production" ? "https://www.loops.ie"
      : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
}

/** A rider saved a route (or took its GPX): ask them the day after. Never throws. */
export async function bookCheckIn(routeId: string, userId: string, isCreator: boolean): Promise<void> {
  try {
    await bookRideCheck(routeId, userId, isCreator, new Date(Date.now() + FIRST_ASK_HOURS * 3600_000));
    if (isCreator) await setCommunityStatus(routeId, "held");
  } catch (e) {
    console.error("[ride-check] booking failed:", e instanceof Error ? e.message : e);
  }
}

export type Answer = { rode: true; score: number } | { rode: false } | { notYet: true };

export async function applyAnswer(check: RideCheck, answer: Answer): Promise<void> {
  if ("notYet" in answer) {
    await snoozeRideCheck(check.id, nextAskAt(new Date(), check.asks + 1));
    return;
  }
  await answerRideCheck(check, answer.rode, answer.rode ? answer.score : null);
  await reevaluate(check.route_id);
}

/** Offer, hold or drop a rider-saved route after an answer. */
export async function reevaluate(routeId: string): Promise<"offer" | "hold" | "drop" | null> {
  const inp = await getCommunityInputs(routeId);
  const route = inp.route;
  if (!route || !route.created_by) return null; // curated library routes are not ours to change
  let coords: [number, number][] = [];
  try {
    coords = (JSON.parse(route.coordinates) as number[][]).map((p) => [p[0], p[1]] as [number, number]);
  } catch { /* no track → not a loop */ }
  const report = (route as unknown as { road_report?: RoadReport | null }).road_report ?? null;
  const decision = communityDecision({
    creatorRode: inp.creatorRode,
    creatorScore: inp.creatorScore,
    ratings: inp.ratings,
    trainingLoop: isTrainingLoop(coords, Number(route.distance_km)),
    // Unknown roads are not offered: the route page traces them, and the
    // next answer re-decides.
    roadsOk: !!report && compromiseAcceptable(report, Number(route.distance_km)),
  });
  // Only rider-saved routes that entered this path can be opened or closed.
  const status = (route as unknown as { community_status?: string | null }).community_status;
  if (decision === "offer") await setCommunityStatus(routeId, "proven");
  else if (decision === "drop" && status) await setCommunityStatus(routeId, "dropped");
  return decision;
}

/** Daily: push (when the rider allowed it) or email every due check-in. */
export async function sendDueReminders(): Promise<{ push: number; email: number; failed: number }> {
  const due = await getRideChecksToRemind();
  let push = 0, email = 0, failed = 0;
  const base = publicBaseUrl();
  for (const c of due) {
    const url = `${base}/check/${c.token}`;
    const name = c.route_name ?? "your ride";
    let pushed = false;
    if (isWebPushEnabled()) {
      for (const sub of await getWebPushSubscriptions(c.user_id)) {
        const r = await sendWebPush(sub, { title: "Did you ride it?", body: `${name} — tap to tell us how it was.`, url, tag: `check-${c.id}` });
        if (r === "sent") pushed = true;
        if (r === "gone") await deleteWebPushSubscription(sub.endpoint);
      }
    }
    if (pushed) push++;
    else {
      try {
        await sendRideCheckEmail(c.email, name, url);
        email++;
      } catch (e) {
        failed++;
        console.error("[ride-check] email failed:", e instanceof Error ? e.message : e);
        continue;
      }
    }
    await markRideCheckReminded(c.id);
  }
  return { push, email, failed };
}
