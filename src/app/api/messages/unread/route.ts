import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, getUnreadCount, migrateDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ count: 0 });
  }

  const user = await getUserBySession(sessionToken);
  if (!user) {
    return NextResponse.json({ count: 0 });
  }

  await migrateDb();
  const count = await getUnreadCount(user.id);
  return NextResponse.json({ count });
}
