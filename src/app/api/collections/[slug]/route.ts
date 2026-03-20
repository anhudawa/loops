import { NextRequest, NextResponse } from "next/server";
import { getCollectionBySlug } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const collection = await getCollectionBySlug(slug);
    if (!collection) {
      return apiError("Collection not found", "NOT_FOUND", 404);
    }
    return NextResponse.json({ data: collection });
  } catch (err) {
    return handleApiError(err);
  }
}
