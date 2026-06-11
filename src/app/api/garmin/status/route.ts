import { NextRequest, NextResponse } from "next/server";
import { isGarminEnabled } from "@/lib/garmin";
import { getUserBySession, getGarminTokens } from "@/lib/db";

/** Feature + connection status for the "Send to Garmin" button. */
export async function GET(request: NextRequest) {
  if (!isGarminEnabled()) {
    return NextResponse.json({ data: { enabled: false, connected: false } });
  }
  const sessionToken = request.cookies.get("session")?.value;
  const user = sessionToken ? await getUserBySession(sessionToken).catch(() => null) : null;
  if (!user) return NextResponse.json({ data: { enabled: true, connected: false } });
  const tokens = await getGarminTokens(user.id).catch(() => null);
  return NextResponse.json({ data: { enabled: true, connected: Boolean(tokens) } });
}
