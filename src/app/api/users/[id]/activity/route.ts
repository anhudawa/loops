import { NextRequest, NextResponse } from "next/server";
import { getUserActivityFeed } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const page = Number(request.nextUrl.searchParams.get("page") || "1");
    const activity = await getUserActivityFeed(id, page, 20);
    return NextResponse.json({ activity });
  } catch (err) {
    return handleApiError(err);
  }
}
