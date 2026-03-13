import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "@/lib/admin";
import { followUser, unfollowUser, isFollowing } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    if (id === auth.user.id) {
      return apiError("Cannot follow yourself", "VALIDATION_ERROR", 400);
    }

    await followUser(uuidv4(), auth.user.id, id);
    return NextResponse.json({ ok: true, following: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    await unfollowUser(auth.user.id, id);
    return NextResponse.json({ ok: true, following: false });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const following = await isFollowing(auth.user.id, id);
    return NextResponse.json({ following });
  } catch (err) {
    return handleApiError(err);
  }
}
