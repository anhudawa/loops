import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin";
import { getRouteSubmissionsByContributor } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const submissions = await getRouteSubmissionsByContributor(auth.user.id);
    return NextResponse.json({ submissions });
  } catch (error) {
    return handleApiError(error);
  }
}
