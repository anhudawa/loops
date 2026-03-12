import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, getConversations, getOrCreateConversation, sendMessage, getUnreadCount, migrateDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await migrateDb();
  const [conversations, unreadCount] = await Promise.all([
    getConversations(user.id),
    getUnreadCount(user.id),
  ]);

  return NextResponse.json({ conversations, unreadCount });
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { to, body } = await request.json();
  if (!to || !body?.trim()) {
    return NextResponse.json({ error: "Missing recipient or message body" }, { status: 400 });
  }

  if (to === user.id) {
    return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
  }

  await migrateDb();
  const conversationId = await getOrCreateConversation(user.id, to);
  const message = await sendMessage(uuidv4(), conversationId, user.id, body.trim());

  return NextResponse.json({ conversationId, message }, { status: 201 });
}
