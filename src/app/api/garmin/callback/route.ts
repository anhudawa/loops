import { NextRequest, NextResponse } from "next/server";
import { exchangeAccessToken, isGarminEnabled } from "@/lib/garmin";
import { getUserBySession, saveGarminTokens } from "@/lib/db";
import { openToken } from "@/lib/token-crypto";

/** OAuth callback: exchange the verifier for access tokens and store them. */
export async function GET(request: NextRequest) {
  if (!isGarminEnabled()) {
    return NextResponse.redirect(new URL("/generate", request.url));
  }
  const sessionToken = request.cookies.get("session")?.value;
  const user = sessionToken ? await getUserBySession(sessionToken).catch(() => null) : null;
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const oauthToken = url.searchParams.get("oauth_token");
  const verifier = url.searchParams.get("oauth_verifier");
  const stored = request.cookies.get("garmin_oauth")?.value ?? "";
  let reqToken = "";
  let reqSecret = "";
  try {
    const parsed = JSON.parse(openToken(stored));
    if (Array.isArray(parsed) && parsed.length === 2) {
      reqToken = String(parsed[0]);
      reqSecret = String(parsed[1]);
    }
  } catch {
    // Missing, legacy plaintext, expired-key or tampered cookie.
  }

  if (!oauthToken || !verifier || !reqToken || !reqSecret || oauthToken !== reqToken) {
    return NextResponse.redirect(new URL("/generate?garmin=error", request.url));
  }

  try {
    const { accessToken, accessSecret } = await exchangeAccessToken(reqToken, reqSecret, verifier);
    await saveGarminTokens(user.id, accessToken, accessSecret);
    const res = NextResponse.redirect(new URL("/generate?garmin=connected", request.url));
    res.cookies.delete("garmin_oauth");
    return res;
  } catch (err) {
    console.error("[garmin] callback failed:", err);
    return NextResponse.redirect(new URL("/generate?garmin=error", request.url));
  }
}
