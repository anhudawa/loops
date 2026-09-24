import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, getDueRideChecks, getRideCheck, getRideCheckByToken } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { applyAnswer, type Answer } from "@/lib/ride-check-service";

/** GET: the signed-in rider's due "did you ride it?" check-ins. */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const user = token ? await getUserBySession(token) : undefined;
    if (!user) return NextResponse.json({ data: [] });
    const due = await getDueRideChecks(user.id);
    return NextResponse.json({
      data: due.map((c) => ({ id: c.id, route_id: c.route_id, route_name: c.route_name, distance_km: c.distance_km })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST { id | token, rode: true, score: 1–5 } | { id | token, rode: false } | { id | token, notYet: true }
 * A signed-in rider answers their own check-in by id; the email/push link
 * carries the check-in's own token (no sign-in needed, one check-in only).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { id?: string; token?: string; rode?: boolean; score?: number; notYet?: boolean }
      | null;
    if (!body) return apiError("Invalid JSON body", "INVALID_BODY", 400);

    let check = typeof body.token === "string" && body.token.length >= 32 ? await getRideCheckByToken(body.token) : undefined;
    if (!check && typeof body.id === "string") {
      const session = request.cookies.get("session")?.value;
      const user = session ? await getUserBySession(session) : undefined;
      if (!user) return apiError("Sign in to answer", "UNAUTHORIZED", 401);
      const c = await getRideCheck(body.id);
      if (c && c.user_id === user.id) check = c;
    }
    if (!check) return apiError("Check-in not found", "NOT_FOUND", 404);
    if (check.answered_at) return NextResponse.json({ data: { already: true } });

    let answer: Answer;
    if (body.notYet) answer = { notYet: true };
    else if (body.rode === false) answer = { rode: false };
    else if (body.rode === true && Number.isInteger(body.score) && body.score! >= 1 && body.score! <= 5) answer = { rode: true, score: body.score! };
    else return apiError("Say whether you rode it, and a score from 1 to 5", "VALIDATION_ERROR", 400);

    await applyAnswer(check, answer);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
