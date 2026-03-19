import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { banUser, unbanUser } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    // Don't allow banning yourself
    if (id === auth.user.id) {
      return apiError("Cannot ban yourself", "VALIDATION_ERROR", 400);
    }

    await banUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    await unbanUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
