import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { sql } from "@vercel/postgres";
import { upsertGoogleUser, getUserByGoogleId, migrateDb, recordEvent, markNewsletterOptIn, ANALYTICS_EVENTS } from "@/lib/db";
import { ATTRIBUTION_COOKIE, decodeAttribution } from "@/lib/attribution";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { subscribeToNewsletter } from "@/lib/beehiiv";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!state || !code) {
    return NextResponse.redirect(new URL("/login?error=google_failed", baseUrl));
  }

  try {
    // CSRF check
    const { rows } = await sql`SELECT state FROM oauth_states WHERE state = ${state}`;
    if (rows.length === 0) {
      return NextResponse.redirect(new URL("/login?error=google_failed", baseUrl));
    }
    await sql`DELETE FROM oauth_states WHERE state = ${state}`;
    await migrateDb();

    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Exchange code for tokens (10s timeout)
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL("/login?error=google_failed", baseUrl));
    }

    const tokenData = await tokenRes.json();

    // Fetch user info (10s timeout)
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!userRes.ok) {
      return NextResponse.redirect(new URL("/login?error=google_failed", baseUrl));
    }

    const googleUser = await userRes.json();

    if (!googleUser?.id) {
      return NextResponse.redirect(new URL("/login?error=google_failed", baseUrl));
    }

    const googleId = String(googleUser.id);
    const email = googleUser.email || `google_${googleId}@google.user`;
    const name = googleUser.name || "Google User";
    const avatarUrl = googleUser.picture || null;

    // Check if user is banned
    const existingUser = await getUserByGoogleId(googleId);
    if (existingUser?.role === "banned") {
      return NextResponse.redirect(new URL("/login?error=account_suspended", baseUrl));
    }

    // First-touch signup attribution (set by middleware on landing).
    const attribution = decodeAttribution(request.cookies.get(ATTRIBUTION_COOKIE)?.value);
    const isNewUser = !existingUser;

    const sessionToken = uuidv4();
    const authedUser = await upsertGoogleUser(
      uuidv4(), googleId, email, name, avatarUrl, sessionToken,
      isNewUser ? attribution : null
    );

    // Newsletter (Saturday Spin) opt-in — captured at signup for new riders.
    const wantsNewsletter =
      isNewUser && request.cookies.get("newsletter_optin")?.value === "1";
    if (wantsNewsletter) {
      await markNewsletterOptIn(authedUser.id).catch(() => {});
      // Beehiiv sync is dormant until keys are set; safe no-op otherwise.
      void subscribeToNewsletter(email, { source: attribution?.source ?? null });
    }

    // Funnel: login/signup success (fire-and-forget, no PII — no email).
    void recordEvent(ANALYTICS_EVENTS.AUTH_SUCCEEDED, {
      userId: authedUser.id,
      properties: {
        method: "google",
        new_user: isNewUser,
        // Attribution only meaningful on a new signup; null for returning.
        source: isNewUser ? attribution?.source ?? "direct" : null,
        raw_source: isNewUser ? attribution?.raw_source ?? null : null,
        medium: isNewUser ? attribution?.medium ?? null : null,
        campaign: isNewUser ? attribution?.campaign ?? null : null,
        newsletter_opt_in: isNewUser ? Boolean(wantsNewsletter) : null,
      },
    });

    // Check for post-login redirect (set by login page)
    const loginRedirect = request.cookies.get("login_redirect")?.value;
    let redirectTo = "/";
    if (loginRedirect) {
      // Same-site paths only: "/\evil.example" and "/\t/evil.example" resolve
      // off-site in a URL, so the shared guard rejects them too.
      let decoded: string | null = null;
      try { decoded = decodeURIComponent(loginRedirect); } catch { decoded = null; }
      redirectTo = safeRedirectPath(decoded) ?? "/";
    }

    const response = NextResponse.redirect(new URL(redirectTo, baseUrl));

    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Clear the redirect cookie
    response.cookies.set("login_redirect", "", { path: "/", maxAge: 0 });
    // Clear the attribution cookie — it's been recorded at signup.
    response.cookies.set(ATTRIBUTION_COOKIE, "", { path: "/", maxAge: 0 });
    // Clear the newsletter opt-in cookie.
    response.cookies.set("newsletter_optin", "", { path: "/", maxAge: 0 });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=google_failed", baseUrl));
  }
}
