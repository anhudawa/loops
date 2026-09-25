import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, getUserById, upsertGroupRide, findGroupRide, setRideRsvp, getRollCall, type RsvpStatus } from "@/lib/db";
import { parseRideTime, cleanMeet } from "@/lib/ride-invite";
import { apiError, handleApiError } from "@/lib/api-utils";

/**
 * Group rides (owner 2026-09-25): a ride is a route + day/time + meeting
 * point — exactly what a /ride link carries, so links shared before rides
 * were stored still reach their roll call.
 *
 *   GET  /api/rides?route=<id>&t=<YYYY-MM-DDTHH:MM>&m=<meet>
 *        → { data: { saved, counts: {yes,maybe,no}, names?: {yes,maybe,no}, organiser?, mine } }
 *        Names (first names, incl. who shared it) only for signed-in riders;
 *        everyone sees counts.
 *   POST /api/rides { route_id, t, m, status? }  (signed in)
 *        Saves the ride to the rider's rides (they become its creator if it
 *        has none); with status "yes" | "maybe" | "no" also answers the roll call.
 */
const STATUSES: RsvpStatus[] = ["yes", "maybe", "no"];

function rideKey(route: unknown, t: unknown, m: unknown): { routeId: string; startsAt: string; meet: string } | null {
  if (typeof route !== "string" || !/^[0-9a-f-]{36}$/i.test(route)) return null;
  if (typeof t !== "string" || !parseRideTime(t)) return null;
  return { routeId: route, startsAt: t, meet: cleanMeet(typeof m === "string" ? m : null) ?? "" };
}

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "A rider";

async function rollCall(ride: { id: string; creator_id: string | null } | null, viewerId: string | null) {
  const counts = { yes: 0, maybe: 0, no: 0 };
  const names: Record<RsvpStatus, string[]> = { yes: [], maybe: [], no: [] };
  let mine: RsvpStatus | null = null;
  if (ride) {
    for (const r of await getRollCall(ride.id)) {
      counts[r.status]++;
      names[r.status].push(r.user_id === viewerId ? "You" : firstName(r.name));
      if (r.user_id === viewerId) mine = r.status;
    }
  }
  let organiser: string | null = null;
  if (viewerId && ride?.creator_id) {
    organiser = ride.creator_id === viewerId ? "You" : firstName((await getUserById(ride.creator_id).catch(() => undefined))?.name);
  }
  return { saved: !!ride, counts, ...(viewerId ? { names, organiser } : {}), mine };
}

async function viewer(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  return token ? await getUserBySession(token).catch(() => null) : null;
}

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const key = rideKey(sp.get("route"), sp.get("t"), sp.get("m"));
    if (!key) return apiError("Unknown ride", "INVALID_RIDE", 400);
    const user = await viewer(request);
    const ride = await findGroupRide(key.routeId, key.startsAt, key.meet);
    return NextResponse.json({ data: await rollCall(ride, user?.id ?? null) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await viewer(request);
    if (!user) return apiError("Sign in to save rides and answer the roll call", "UNAUTHORIZED", 401);
    const body = await request.json().catch(() => ({}));
    const key = rideKey(body?.route_id, body?.t, body?.m);
    if (!key) return apiError("Unknown ride", "INVALID_RIDE", 400);
    const status = STATUSES.includes(body?.status) ? (body.status as RsvpStatus) : null;
    // Answering the roll call saves the ride too, but never makes the
    // answerer its creator; sharing it (no status) does, when it has none.
    const ride = await upsertGroupRide(key.routeId, key.startsAt, key.meet, status ? null : user.id);
    if (status) await setRideRsvp(ride.id, user.id, status);
    return NextResponse.json({ data: await rollCall(ride, user.id) });
  } catch (err) {
    return handleApiError(err);
  }
}
