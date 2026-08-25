import { NextRequest, NextResponse } from "next/server";
import {
  getUserBySession,
  getRoute,
  addFavourite,
  removeFavourite,
  isFavourited,
  getFavouriteCount,
  recordBetaProductEvent,
} from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { hasActiveBetaAccess } from "@/lib/beta-intake";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routeId } = await params;
    const route = await getRoute(routeId);
    if (!route || route.is_verified !== 1) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }
    const sessionToken = request.cookies.get("session")?.value;
    let favourited = false;

    if (sessionToken) {
      const user = await getUserBySession(sessionToken);
      if (user) {
        favourited = await isFavourited(routeId, user.id);
      }
    }

    const count = await getFavouriteCount(routeId);
    return NextResponse.json({ favourited, count });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routeId } = await params;

    const sessionToken = request.cookies.get("session")?.value;
    if (!sessionToken) {
      return apiError("Sign in required", "UNAUTHORIZED", 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return apiError("Invalid session", "UNAUTHORIZED", 401);
    }
    if (user.role !== "admin" && !(await hasActiveBetaAccess(user.id))) {
      return apiError("Ireland beta access is required to save routes", "BETA_ACCESS_REQUIRED", 403);
    }

    const route = await getRoute(routeId);
    if (!route || route.is_verified !== 1 || !route.current_version_id) {
      return apiError("Route not found", "NOT_FOUND", 404);
    }

    // Toggle: if already favourited, remove; otherwise add
    const alreadyFav = await isFavourited(routeId, user.id);
    if (alreadyFav) {
      await removeFavourite(routeId, user.id);
    } else {
      await addFavourite(uuidv4(), routeId, user.id);
      try {
        await recordBetaProductEvent(
          user.id,
          routeId,
          route.current_version_id,
          "route_saved"
        );
      } catch {
        // Measurement must never prevent a rider from saving a route.
      }
    }

    const favourited = !alreadyFav;
    const count = await getFavouriteCount(routeId);

    return NextResponse.json({ favourited, count });
  } catch (err) {
    return handleApiError(err);
  }
}
