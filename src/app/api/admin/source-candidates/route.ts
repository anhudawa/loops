import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getRouteSourceCandidates } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const page = Number(request.nextUrl.searchParams.get("page") || "1");
    return NextResponse.json(await getRouteSourceCandidates(page, 500));
  } catch (error) {
    return handleApiError(error);
  }
}
