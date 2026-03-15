import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession, saveStravaTokens } from "@/lib/db";
import { exchangeCode } from "@/lib/strava-api";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") || "/upload";
  const error = request.nextUrl.searchParams.get("error");

  // User cancelled OAuth on Strava
  if (error || !code) {
    return NextResponse.redirect(new URL(state, request.url));
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
    const returnUrl = new URL(state, request.url);
    returnUrl.searchParams.set("strava_error", "connection_failed");
    return NextResponse.redirect(returnUrl);
  }

  const returnUrl = new URL(state, request.url);
  returnUrl.searchParams.set("strava_connected", "true");
  return NextResponse.redirect(returnUrl);
}
