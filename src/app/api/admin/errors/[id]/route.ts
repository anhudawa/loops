import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { resolveOperationalError } from "@/lib/error-monitoring";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const status = body?.status;
    const notes = typeof body?.resolution_notes === "string"
      ? body.resolution_notes.trim()
      : "";
    if (status !== "resolved" && status !== "ignored") {
      return apiError("Invalid error status", "VALIDATION_ERROR", 400);
    }
    if (notes.length < 10) {
      return apiError("Resolution notes must be at least 10 characters", "VALIDATION_ERROR", 400);
    }
    const error = await resolveOperationalError(id, status, auth.user.id, notes);
    if (!error) return apiError("Open error not found", "NOT_FOUND", 404);
    return NextResponse.json({ data: error });
  } catch (error) {
    return handleApiError(error);
  }
}
