import { NextRequest, NextResponse } from "next/server";
import { MAX_ROUTE_DESCRIPTION_LENGTH } from "@/config/constants";
import { apiError, handleApiError, stripHtml } from "@/lib/api-utils";
import { hasActiveBetaAccess } from "@/lib/beta-intake";
import { createRiddenRouteRevision, getRoute, getUserBySession } from "@/lib/db";
import { prepareRideSubmission, RouteSubmissionError } from "@/lib/route-submission";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) return apiError("Sign in required", "UNAUTHORIZED", 401);
    const user = await getUserBySession(sessionToken);
    if (!user) return apiError("Sign in required", "UNAUTHORIZED", 401);
    if (user.role !== "admin" && !(await hasActiveBetaAccess(user.id, "contributor"))) {
      return apiError("Founding contributor access is required", "CONTRIBUTOR_ACCESS_REQUIRED", 403);
    }
    if (!user.name?.trim()) {
      return apiError("Add your real name before supplying ride evidence", "RIDER_NAME_REQUIRED", 400);
    }

    const { id } = await params;
    const route = await getRoute(id);
    if (!route || route.created_by !== user.id) {
      return apiError("Submission not found", "NOT_FOUND", 404);
    }
    if (route.publication_status === "in_review") {
      return apiError("This version is already awaiting review", "ALREADY_IN_REVIEW", 409);
    }
    if (route.publication_status === "published") {
      return apiError(
        "A published route must be made stale or quarantined before replacement evidence can take it offline for review",
        "PUBLICATION_TRANSITION_REQUIRED",
        409
      );
    }

    const formData = await request.formData();
    const descriptionValue = formData.get("description");
    const description = typeof descriptionValue === "string"
      ? stripHtml(descriptionValue).trim() || null
      : route.description;
    if (description && description.length > MAX_ROUTE_DESCRIPTION_LENGTH) {
      return apiError(
        `Description must be ${MAX_ROUTE_DESCRIPTION_LENGTH} characters or less`,
        "VALIDATION_ERROR",
        400
      );
    }

    let prepared;
    try {
      prepared = await prepareRideSubmission(formData);
    } catch (error) {
      if (error instanceof RouteSubmissionError) {
        return apiError(error.message, error.code, error.status);
      }
      throw error;
    }

    const revised = await createRiddenRouteRevision({
      routeId: route.id,
      userId: user.id,
      riderName: user.name.trim(),
      description,
      riddenAt: prepared.riddenAt,
      evidenceType: prepared.evidenceType,
      evidenceReference: prepared.routeFileName,
      sourcePlatform: prepared.sourcePlatform,
      sourceReference: prepared.sourceReference,
      evidenceFileHash: prepared.evidenceFileHash,
      evidenceStartedAt: prepared.evidenceStartedAt,
      evidenceEndedAt: prepared.evidenceEndedAt,
      evidencePointCount: prepared.evidencePointCount,
      evidenceTimestampedPointCount: prepared.evidenceTimestampedPointCount,
      coordinates: prepared.coordinates,
      distanceKm: prepared.distanceKm,
      elevationGainM: prepared.elevationGainM,
      elevationLossM: prepared.elevationLossM,
      startLat: prepared.coordinatePairs[0][0],
      startLng: prepared.coordinatePairs[0][1],
    });
    if (!revised) {
      return apiError(
        "This submission is not eligible for a new ridden version",
        "REVISION_NOT_ALLOWED",
        409
      );
    }
    return NextResponse.json({ route: revised }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
