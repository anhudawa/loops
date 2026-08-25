import { NextRequest, NextResponse } from "next/server";
import { getRequestToken, isGarminEnabled } from "@/lib/garmin";
import { getUserBySession } from "@/lib/db";
import { sealToken } from "@/lib/token-crypto";

/** Begin the Garmin OAuth flow: fetch a request token and redirect to
 * Garmin's consent page. The request-token secret rides in a short-lived
 * httpOnly cookie for the callback to use. */
export async function GET(request: NextRequest) {
  if (!isGarminEnabled()) {
    return NextResponse.json(
      { error: "Garmin sync is not configured yet.", code: "FEATURE_DISABLED" },
      { status: 503 }
    );
  }
  const sessionToken = request.cookies.get("session")?.value;
  const user = sessionToken ? await getUserBySession(sessionToken).catch(() => null) : null;
  if (!user) {
    return NextResponse.redirect(new URL("/login?redirect=/generate", request.url));
  }

  try {
    const origin = new URL(request.url).origin;
    const callback = `${origin}/api/garmin/callback`;
    const { token, secret, authorizeUrl } = await getRequestToken(callback);
    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set("garmin_oauth", sealToken(JSON.stringify([token, secret])), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/api/garmin",
    });
    return res;
  } catch (err) {
    console.error("[garmin] connect failed:", err);
    return NextResponse.redirect(new URL("/generate?garmin=error", request.url));
  }
}
