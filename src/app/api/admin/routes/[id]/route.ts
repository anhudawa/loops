import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { deleteRoute, rejectRouteSubmission, setRoutePublicationStatus } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

const REVIEW_ACTIONS = ["published", "rejected", "stale", "quarantined", "retired"] as const;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    await deleteRoute(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const status = body?.status as (typeof REVIEW_ACTIONS)[number] | undefined;
    if (!status || !REVIEW_ACTIONS.includes(status)) {
      return apiError("Invalid publication status", "VALIDATION_ERROR", 400);
    }

    const checklist = body?.checklist && typeof body.checklist === "object"
      ? {
          evidence_checked: body.checklist.evidence_checked === true,
          rights_checked: body.checklist.rights_checked === true,
          geometry_checked: body.checklist.geometry_checked === true,
          start_finish_checked: body.checklist.start_finish_checked === true,
          road_suitability_checked: body.checklist.road_suitability_checked === true,
          description_checked: body.checklist.description_checked === true,
        }
      : undefined;
    const reviewNotes = typeof body?.review_notes === "string" ? body.review_notes : null;
    const route = status === "rejected"
      ? checklist && reviewNotes
        ? await rejectRouteSubmission(id, auth.user.id, reviewNotes, checklist)
        : undefined
      : await setRoutePublicationStatus(
          id,
          status,
          auth.user.id,
          reviewNotes,
          checklist
        );
    if (!route) {
      return apiError(
        status === "rejected"
          ? "The submission can only be rejected by an independent reviewer with a pending attestation and explanatory notes of at least 20 characters."
          : "Route cannot be published until the current version has a pending ride attestation, rights grant, independent reviewer, completed review checklist, and review notes of at least 20 characters.",
        "PROVENANCE_REQUIRED",
        409
      );
    }

    return NextResponse.json({ data: route });
  } catch (err) {
    return handleApiError(err);
  }
}
