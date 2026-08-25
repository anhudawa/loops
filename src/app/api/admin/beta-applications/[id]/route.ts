import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { reviewBetaApplication } from "@/lib/beta-intake";
import { apiError, handleApiError, stripHtml } from "@/lib/api-utils";

const REVIEW_STATUSES = new Set(["approved", "waitlisted", "declined"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await request.json().catch(() => null) as {
      status?: unknown;
      adminNotes?: unknown;
    } | null;
    if (typeof body?.status !== "string" || !REVIEW_STATUSES.has(body.status)) {
      return apiError("Choose approved, waitlisted or declined", "INVALID_STATUS", 400);
    }
    const adminNotes = typeof body.adminNotes === "string"
      ? stripHtml(body.adminNotes).trim()
      : "";
    if (adminNotes.length < 10 || adminNotes.length > 1000) {
      return apiError("Add a short review note (10–1,000 characters)", "REVIEW_NOTE_REQUIRED", 400);
    }

    const application = await reviewBetaApplication({
      applicationId: id,
      reviewerId: auth.user.id,
      status: body.status as "approved" | "waitlisted" | "declined",
      adminNotes,
    });
    if (!application) {
      return apiError("Application is no longer awaiting review", "APPLICATION_NOT_REVIEWABLE", 409);
    }
    return NextResponse.json({ application });
  } catch (error) {
    return handleApiError(error);
  }
}
