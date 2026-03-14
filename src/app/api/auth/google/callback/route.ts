import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { sql } from "@vercel/postgres";
import { upsertGoogleUser, getUserByGoogleId, migrateDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!state || !code) {
    return NextResponse.redirect(new URL("/login?error=google_failed", baseUrl));
  }

  // CSRF check
  const { rows } = await sql`SELECT state FROM oauth_states WHERE state = ${state}`;
  if (rows.length === 0) {
    return NextResponse.redirect(new URL("/login?error=google_failed", baseUrl));
  }
  await sql`DELETE FROM oauth_states WHERE state = ${state}`;

  try {
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

    const sessionToken = uuidv4();
    await upsertGoogleUser(uuidv4(), googleId, email, name, avatarUrl, sessionToken);

    // Check for post-login redirect (set by login page)
    const loginRedirect = request.cookies.get("login_redirect")?.value;
    let redirectTo = "/";
    if (loginRedirect) {
      const decoded = decodeURIComponent(loginRedirect);
      // Only allow relative paths to prevent open redirect
      if (decoded.startsWith("/") && !decoded.startsWith("//")) {
        redirectTo = decoded;
      }
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

    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=google_failed", baseUrl));
  }
}
