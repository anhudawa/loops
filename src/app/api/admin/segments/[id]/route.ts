import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { reviewRouteSegmentAssessment } from "@/lib/db";
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
    const decision = body?.decision;
    const notes = typeof body?.review_notes === "string" ? body.review_notes.trim() : "";

    if (decision !== "approved" && decision !== "rejected") {
      return apiError("Invalid review decision", "VALIDATION_ERROR", 400);
    }
    if (notes.length < 20) {
      return apiError("Review notes must be at least 20 characters", "VALIDATION_ERROR", 400);
    }

    const assessment = await reviewRouteSegmentAssessment(id, decision, auth.user.id, notes);
    if (!assessment) {
      return apiError(
        "Assessment is not pending, is stale, lacks an independent reviewer, or fails the Ireland beta safety gate",
        "ASSESSMENT_NOT_APPROVABLE",
        409
      );
    }
    return NextResponse.json({ data: assessment });
  } catch (err) {
    return handleApiError(err);
  }
}
