import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin";
import {
  cancelRidePlan,
  completeRidePlan,
  createRidePlan,
  getLatestRidePlan,
  getRoute,
} from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { hasActiveBetaAccess } from "@/lib/beta-intake";

async function getPublicRoute(id: string) {
  const route = await getRoute(id);
  return route?.is_verified === 1 && route.current_version_id ? route : null;
}

async function betaAccessError(user: { id: string; role: string }) {
  if (user.role === "admin" || await hasActiveBetaAccess(user.id)) return null;
  return apiError("Ireland beta access is required to plan routes", "BETA_ACCESS_REQUIRED", 403);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const accessError = await betaAccessError(auth.user);
    if (accessError) return accessError;

    const { id } = await params;
    if (!(await getPublicRoute(id))) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }

    const plan = await getLatestRidePlan(auth.user.id, id);
    return NextResponse.json({ plan: plan ?? null });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const accessError = await betaAccessError(auth.user);
    if (accessError) return accessError;

    const { id } = await params;
    if (!(await getPublicRoute(id))) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }

    const body = await request.json().catch(() => null) as {
      action?: unknown;
      confirm_exact_route?: unknown;
    } | null;

    if (body?.action === "plan") {
      const plan = await createRidePlan(auth.user.id, id);
      if (!plan) return apiError("Could not plan this route", "PLAN_NOT_CREATED", 409);
      return NextResponse.json({ plan }, { status: 201 });
    }

    if (body?.action === "complete") {
      if (body.confirm_exact_route !== true) {
        return apiError(
          "Confirm that you rode this exact loop",
          "CONFIRMATION_REQUIRED",
          400
        );
      }
      const plan = await completeRidePlan(auth.user.id, id);
      if (!plan) {
        return apiError(
          "No current plan exists for this exact route version",
          "PLAN_NOT_FOUND",
          409
        );
      }
      return NextResponse.json({ plan });
    }

    return apiError("Invalid ride-plan action", "INVALID_ACTION", 400);
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
    const accessError = await betaAccessError(auth.user);
    if (accessError) return accessError;

    const { id } = await params;
    const cancelled = await cancelRidePlan(auth.user.id, id);
    if (!cancelled) {
      return apiError("No planned ride found", "PLAN_NOT_FOUND", 404);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
