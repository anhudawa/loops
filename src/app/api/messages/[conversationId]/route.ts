import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, getMessages, sendMessage, isConversationParticipant, migrateDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await migrateDb();

  const isParticipant = await isConversationParticipant(conversationId, user.id);
  if (!isParticipant) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const page = Number(new URL(request.url).searchParams.get("page")) || 1;
  const messages = await getMessages(conversationId, user.id, page);

  return NextResponse.json({ messages });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await migrateDb();

  const isParticipant = await isConversationParticipant(conversationId, user.id);
  if (!isParticipant) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { body } = await request.json();
  if (!body?.trim()) {
    return NextResponse.json({ error: "Message body required" }, { status: 400 });
  }

  const message = await sendMessage(uuidv4(), conversationId, user.id, body.trim());
  return NextResponse.json({ message }, { status: 201 });
}
