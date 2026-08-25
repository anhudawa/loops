import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getRoadIntelligenceCoverage } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json(await getRoadIntelligenceCoverage());
  } catch (error) {
    return handleApiError(error);
  }
}
