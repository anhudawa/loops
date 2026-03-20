import { NextRequest, NextResponse } from "next/server";
import { getCollectionBySlug, addRouteToCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { slug } = await params;
    const collection = await getCollectionBySlug(slug);
    if (!collection) {
      return apiError("Collection not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const { route_id, display_order } = body;

    if (!route_id || typeof route_id !== "string") {
      return apiError("route_id is required", "VALIDATION_ERROR", 400);
    }

    await addRouteToCollection(collection.id, route_id, display_order ?? 0);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
