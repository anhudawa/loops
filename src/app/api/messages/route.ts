import { NextRequest } from "next/server";
import { getUserBySession, getConversations, getOrCreateConversation, sendMessage, getUnreadCount, migrateDb } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    await migrateDb();
    const [conversations, unreadCount] = await Promise.all([
      getConversations(user.id),
      getUnreadCount(user.id),
    ]);

    return NextResponse.json({ conversations, unreadCount });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    const { to, body } = await request.json();
    if (!to || !body?.trim()) {
      return apiError("Missing recipient or message body", "VALIDATION_ERROR", 400);
    }

    if (body.length > 2000) {
      return apiError("Message too long (max 2000 characters)", "VALIDATION_ERROR", 400);
    }

    if (to === user.id) {
      return apiError("Cannot message yourself", "VALIDATION_ERROR", 400);
    }

    await migrateDb();
    const conversationId = await getOrCreateConversation(user.id, to);
    const message = await sendMessage(uuidv4(), conversationId, user.id, body.trim());

    return NextResponse.json({ conversationId, message }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
