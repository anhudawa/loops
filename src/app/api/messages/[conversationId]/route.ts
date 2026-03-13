import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, getMessages, sendMessage, isConversationParticipant, migrateDb } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    await migrateDb();

    const isParticipant = await isConversationParticipant(conversationId, user.id);
    if (!isParticipant) {
      return apiError("Not authorized", "FORBIDDEN", 403);
    }

    const page = Number(new URL(request.url).searchParams.get("page")) || 1;
    const messages = await getMessages(conversationId, user.id, page);

    return NextResponse.json({ messages });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Not authenticated", "UNAUTHORIZED", 401);
    }

    await migrateDb();

    const isParticipant = await isConversationParticipant(conversationId, user.id);
    if (!isParticipant) {
      return apiError("Not authorized", "FORBIDDEN", 403);
    }

    const { body } = await request.json();
    if (!body?.trim()) {
      return apiError("Message body required", "VALIDATION_ERROR", 400);
    }

    if (body.length > 2000) {
      return apiError("Message too long (max 2000 characters)", "VALIDATION_ERROR", 400);
    }

    const message = await sendMessage(uuidv4(), conversationId, user.id, body.trim());
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
