import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { sql } from "@vercel/postgres";
import { savePushToken } from "@/lib/db";

async function getUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const result = await sql`SELECT id FROM users WHERE session_token = ${token}`;
  return result.rows[0] || null;
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token, platform } = await request.json();

  if (!token || !platform || !["ios", "android"].includes(platform)) {
    return NextResponse.json({ error: "Invalid token or platform" }, { status: 400 });
  }

  await savePushToken(uuidv4(), user.id, token, platform);

  return NextResponse.json({ ok: true });
}
