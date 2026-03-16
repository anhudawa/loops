import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession, saveStravaTokens } from "@/lib/db";
import { exchangeCode } from "@/lib/strava-api";
import { sql } from "@vercel/postgres";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  // Validate CSRF state token
  let returnTo = "/upload";
  if (stateParam) {
    const { rows } = await sql`SELECT state, return_to FROM oauth_states WHERE state = ${stateParam}`;
    if (rows.length === 0) {
      return NextResponse.redirect(new URL("/upload?strava_error=invalid_state", request.url));
    }
    await sql`DELETE FROM oauth_states WHERE state = ${stateParam}`;
    const rawReturnTo = rows[0].return_to || "/upload";
    // Defense in depth: validate returnTo again to prevent open redirect
    returnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "/upload";
  } else {
    return NextResponse.redirect(new URL("/upload?strava_error=invalid_state", request.url));
  }

  // User cancelled OAuth on Strava
  if (error || !code) {
    return NextResponse.redirect(new URL(returnTo, request.url));
  }

  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const tokens = await exchangeCode(code);
    await saveStravaTokens(
      user.id,
      String(tokens.athlete.id),
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_at
    );
  } catch {
    // Token exchange failed — redirect back with error indicator
    const returnUrl = new URL(returnTo, request.url);
    returnUrl.searchParams.set("strava_error", "connection_failed");
    return NextResponse.redirect(returnUrl);
  }

  const returnUrl = new URL(returnTo, request.url);
  returnUrl.searchParams.set("strava_connected", "true");
  return NextResponse.redirect(returnUrl);
}
