import { NextRequest, NextResponse, after } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { validateMagicLink, upsertEmailUser, migrateDb, recordEvent, markNewsletterOptIn, ANALYTICS_EVENTS } from "@/lib/db";
import { ATTRIBUTION_COOKIE, decodeAttribution } from "@/lib/attribution";
import { subscribeToNewsletter } from "@/lib/beehiiv";
import { safeRedirectPath } from "@/lib/safe-redirect";

/** Magic-link landing: one-time token → session → back where the rider was. */
export async function GET(request: NextRequest) {
  const base = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    await migrateDb();
    const link = token ? await validateMagicLink(token) : null;
    if (!link) return NextResponse.redirect(new URL("/login?error=link_expired", base));

    const attribution = decodeAttribution(request.cookies.get(ATTRIBUTION_COOKIE)?.value);
    const sessionToken = uuidv4();
    const { user, isNew } = await upsertEmailUser(uuidv4(), link.email, sessionToken, attribution);
    if (user.role === "banned") return NextResponse.redirect(new URL("/login?error=account_suspended", base));

    if (isNew && request.cookies.get("newsletter_optin")?.value === "1") {
      await markNewsletterOptIn(user.id).catch(() => {});
      after(() => subscribeToNewsletter(link.email, { source: attribution?.source ?? null }));
    }
    void recordEvent(ANALYTICS_EVENTS.AUTH_SUCCEEDED, {
      userId: user.id,
      properties: { method: "email", new_user: isNew, source: isNew ? attribution?.source ?? "direct" : null },
    });

    // The link's own return path first (works in any browser), then the
    // cookie from the browser that asked for it.
    let cookieRedirect: string | null = null;
    try {
      cookieRedirect = safeRedirectPath(decodeURIComponent(request.cookies.get("login_redirect")?.value ?? ""));
    } catch { /* malformed cookie */ }
    const to = safeRedirectPath(link.redirect) ?? cookieRedirect ?? "/";
    const res = NextResponse.redirect(new URL(to, base));
    res.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.set("login_redirect", "", { path: "/", maxAge: 0 });
    res.cookies.set(ATTRIBUTION_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set("newsletter_optin", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[auth/verify] failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL("/login?error=link_expired", base));
  }
}
