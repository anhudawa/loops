import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { sql } from "@vercel/postgres";
import { upsertStravaUser, getUserByStravaId, migrateDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!state || !code) {
    return NextResponse.redirect(new URL("/login?error=strava_failed", baseUrl));
  }

  // CSRF check against DB (works even when callback opens in a different browser/app)
  const { rows } = await sql`SELECT state FROM oauth_states WHERE state = ${state}`;
  if (rows.length === 0) {
    return NextResponse.redirect(new URL("/login?error=strava_failed", baseUrl));
  }
  // Delete used state (single-use)
  await sql`DELETE FROM oauth_states WHERE state = ${state}`;

  try {
    // Ensure strava_id column exists
    await migrateDb();

    // Exchange code for token
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL("/login?error=strava_failed", baseUrl));
    }

    const tokenData = await tokenRes.json();
    const athlete = tokenData.athlete;

    if (!athlete?.id) {
      return NextResponse.redirect(new URL("/login?error=strava_failed", baseUrl));
    }

    const stravaId = String(athlete.id);
    const name = [athlete.firstname, athlete.lastname].filter(Boolean).join(" ") || null;
    const avatarUrl = athlete.profile !== "avatar/athlete/large.png" ? athlete.profile : null;

    // Check if user is banned
    const existingUser = await getUserByStravaId(stravaId);
    if (existingUser?.role === "banned") {
      return NextResponse.redirect(new URL("/login?error=account_suspended", baseUrl));
    }

    const sessionToken = uuidv4();
    await upsertStravaUser(uuidv4(), stravaId, name || "Strava Athlete", avatarUrl, sessionToken);

    const response = NextResponse.redirect(new URL("/", baseUrl));

    // Set session cookie
    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=strava_failed", baseUrl));
  }
}
