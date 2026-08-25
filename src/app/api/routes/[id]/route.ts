import { NextRequest, NextResponse } from "next/server";
import { getRoute, getUserBySession, recordBetaProductEvent } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { hasActiveBetaAccess } from "@/lib/beta-intake";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const route = await getRoute(id);

    if (!route) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }

    const sessionToken = request.cookies.get("session")?.value;
    const viewer = sessionToken ? await getUserBySession(sessionToken) : null;

    if (route.is_verified !== 1) {
      const canReviewDraft = viewer && (viewer.role === "admin" || viewer.id === route.created_by);
      if (!canReviewDraft) {
        return apiError("Route not found", "NOT_FOUND", 404);
      }
    }

    if (
      route.is_verified === 1 &&
      viewer?.role === "user" &&
      route.current_version_id &&
      await hasActiveBetaAccess(viewer.id)
    ) {
      try {
        await recordBetaProductEvent(
          viewer.id,
          route.id,
          route.current_version_id,
          "route_view"
        );
      } catch {
        // Measurement must never prevent a rider from opening a route.
      }
    }

    return NextResponse.json(route);
  } catch (err) {
    return handleApiError(err);
  }
}
