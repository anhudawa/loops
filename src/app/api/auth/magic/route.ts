import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createMagicLink, migrateDb } from "@/lib/db";
import { sendMagicLink } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Email sign-in (magic link) — for riders without a Google account.
 *   GET  → { data: { enabled } }  (the login page shows the email option only when sending works)
 *   POST { email, redirect? } → sends a one-time link valid for 15 minutes.
 *   The return path is stored WITH the token, so the link lands on the ride
 *   even when tapped in the Gmail/Outlook in-app browser or another device.
 * Works only when RESEND_API_KEY is configured.
 */
const enabled = () => !!process.env.RESEND_API_KEY;

export async function GET() {
  return NextResponse.json({ data: { enabled: enabled() } });
}

export async function POST(request: NextRequest) {
  if (!enabled()) {
    return NextResponse.json({ error: "Email sign-in isn't available yet — please use Google.", code: "EMAIL_UNAVAILABLE" }, { status: 503 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`magic:${ip}`, 5, 10 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests — try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429 });
  }
  let email = "";
  let redirect: string | null = null;
  try {
    const body = await request.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    redirect = safeRedirectPath(body?.redirect);
  } catch {
    return NextResponse.json({ error: "Invalid request", code: "INVALID_BODY" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: "That doesn't look like an email address.", code: "INVALID_EMAIL" }, { status: 400 });
  }
  if (!checkRateLimit(`magic-email:${email}`, 3, 10 * 60_000).allowed) {
    return NextResponse.json({ error: "We've just sent you a link — check your inbox (and spam).", code: "RATE_LIMITED" }, { status: 429 });
  }
  try {
    await migrateDb();
    const token = uuidv4() + uuidv4().replace(/-/g, "");
    await createMagicLink(uuidv4(), email, token, new Date(Date.now() + 15 * 60_000), redirect);
    await sendMagicLink(email, token);
    return NextResponse.json({ data: { sent: true } });
  } catch (err) {
    console.error("[auth/magic] send failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't send the email — please try again or use Google.", code: "SEND_FAILED" }, { status: 502 });
  }
}
