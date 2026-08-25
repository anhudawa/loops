import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession, clearStravaTokens } from "@/lib/db";
import { getValidAccessToken, deauthorize } from "@/lib/strava-api";
import { v4 as uuidv4 } from "uuid";
import { sql } from "@vercel/postgres";
import { ALLOW_STRAVA_ROUTE_IMPORT } from "@/config/route-policy";

export async function GET(request: NextRequest) {
  if (!ALLOW_STRAVA_ROUTE_IMPORT) {
    return NextResponse.json(
      {
        error: "Strava connection is disabled for the commercial relaunch. Upload your own ride file instead.",
        code: "STRAVA_DISABLED",
      },
      { status: 410 }
    );
  }

  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  // Store the page the user came from so we can redirect back
  // Only allow relative paths to prevent open redirect
  const rawReturnTo = request.nextUrl.searchParams.get("returnTo") || "/upload";
  const returnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "/upload";

  // Generate CSRF state token and store with returnTo
  const state = uuidv4();
  await sql`INSERT INTO oauth_states (state, return_to) VALUES (${state}, ${returnTo})`;
  await sql`DELETE FROM oauth_states WHERE created_at < NOW() - INTERVAL '10 minutes'`;

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: process.env.STRAVA_REDIRECT_URI!,
    response_type: "code",
    scope: "read,activity:read_all",
    state,
  });

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`);
}

export async function DELETE() {
  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  // Revoke on Strava's side (best-effort)
  const accessToken = await getValidAccessToken(user.id);
  if (accessToken) {
    await deauthorize(accessToken);
  }

  // Clear tokens locally
  await clearStravaTokens(user.id);

  return NextResponse.json({ data: { disconnected: true } });
}
