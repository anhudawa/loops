import { NextRequest, NextResponse } from "next/server";
import { getRouteComments, insertComment, deleteOwnComment, getUserBySession } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comments = await getRouteComments(id);
    return NextResponse.json(comments);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionToken = request.cookies.get("session")?.value;

    if (!sessionToken) {
      return apiError("Sign in to comment", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Invalid session", "UNAUTHORIZED", 401);
    }

    const { body } = await request.json();
    if (!body || typeof body !== "string" || body.trim().length === 0) {
      return apiError("Comment cannot be empty", "VALIDATION_ERROR", 400);
    }

    if (body.length > 2000) {
      return apiError("Comment too long (max 2000 characters)", "VALIDATION_ERROR", 400);
    }

    await insertComment(uuidv4(), id, user.id, body.trim());
    const comments = await getRouteComments(id);
    return NextResponse.json(comments);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionToken = request.cookies.get("session")?.value;

    if (!sessionToken) {
      return apiError("Sign in required", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Invalid session", "UNAUTHORIZED", 401);
    }

    const { commentId } = await request.json();
    if (!commentId) {
      return apiError("Missing commentId", "VALIDATION_ERROR", 400);
    }

    const deleted = await deleteOwnComment(commentId, user.id);
    if (!deleted) {
      return apiError("Comment not found or not yours", "FORBIDDEN", 403);
    }

    const comments = await getRouteComments(id);
    return NextResponse.json(comments);
  } catch (err) {
    return handleApiError(err);
  }
}
