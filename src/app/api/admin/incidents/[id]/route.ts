import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { resolveRouteIncident } from "@/lib/db";
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
    const notes = typeof body?.resolution_notes === "string" ? body.resolution_notes.trim() : "";

    if (status !== "resolved" && status !== "dismissed") {
      return apiError("Invalid incident status", "VALIDATION_ERROR", 400);
    }
    if (notes.length < 10) {
      return apiError("Resolution notes must be at least 10 characters", "VALIDATION_ERROR", 400);
    }

    const incident = await resolveRouteIncident(id, status, auth.user.id, notes);
    if (!incident) {
      return apiError("Open incident not found", "NOT_FOUND", 404);
    }

    return NextResponse.json({ data: incident });
  } catch (err) {
    return handleApiError(err);
  }
}
