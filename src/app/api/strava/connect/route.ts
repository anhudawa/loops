import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySession, clearStravaTokens } from "@/lib/db";
import { getValidAccessToken, deauthorize } from "@/lib/strava-api";

export async function GET(request: NextRequest) {
  const session = (await cookies()).get("session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const user = await getUserBySession(session);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  // Store the page the user came from so we can redirect back
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/upload";

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: process.env.STRAVA_REDIRECT_URI!,
    response_type: "code",
    scope: "read,activity:read_all",
    state: returnTo,
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
