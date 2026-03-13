import { NextRequest, NextResponse } from "next/server";
import { getRoute } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

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

    return NextResponse.json(route);
  } catch (err) {
    return handleApiError(err);
  }
}
