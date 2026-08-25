import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError, handleApiError, stripHtml } from "@/lib/api-utils";
import { setBetaMembershipStatus } from "@/lib/beta-intake";

const STATUSES = new Set(["active", "paused", "removed"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = await params;
    const body = await request.json().catch(() => null) as {
      status?: unknown;
      reason?: unknown;
    } | null;
    if (typeof body?.status !== "string" || !STATUSES.has(body.status)) {
      return apiError("Choose active, paused or removed", "INVALID_STATUS", 400);
    }
    const reason = typeof body.reason === "string" ? stripHtml(body.reason).trim() : "";
    if (reason.length < 10 || reason.length > 1000) {
      return apiError("Add a reason of 10–1,000 characters", "REASON_REQUIRED", 400);
    }
    const membership = await setBetaMembershipStatus({
      userId,
      actorId: auth.user.id,
      status: body.status as "active" | "paused" | "removed",
      reason,
    });
    if (!membership) {
      return apiError("Membership was not found or already has that status", "NO_STATUS_CHANGE", 409);
    }
    return NextResponse.json({ membership });
  } catch (error) {
    return handleApiError(error);
  }
}
