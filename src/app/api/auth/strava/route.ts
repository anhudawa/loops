import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { sql } from "@vercel/postgres";

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Strava not configured" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const state = uuidv4();
  const redirectUri = `${baseUrl}/api/auth/strava/callback`;

  // Store state in DB so it survives cross-browser/app redirects
  await sql`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`INSERT INTO oauth_states (state) VALUES (${state})`;
  // Clean up old states (older than 10 minutes)
  await sql`DELETE FROM oauth_states WHERE created_at < NOW() - INTERVAL '10 minutes'`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read",
    approval_prompt: "auto",
    state,
  });

  const authorizeUrl = `https://www.strava.com/oauth/authorize?${params}`;

  return NextResponse.json({ url: authorizeUrl });
}
