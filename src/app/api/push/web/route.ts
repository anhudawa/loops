import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, saveWebPushSubscription } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

/** POST a browser PushSubscription (JSON) for the signed-in rider. */
export async function POST(request: NextRequest) {
  try {
    const session = request.cookies.get("session")?.value;
    const user = session ? await getUserBySession(session) : undefined;
    if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);
    const sub = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
    const endpoint = sub?.endpoint, p256dh = sub?.keys?.p256dh, auth = sub?.keys?.auth;
    if (!endpoint || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
      return apiError("Invalid subscription", "VALIDATION_ERROR", 400);
    }
    await saveWebPushSubscription(user.id, { endpoint, p256dh, auth });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
