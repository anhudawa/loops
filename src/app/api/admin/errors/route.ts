import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getOpenOperationalErrors } from "@/lib/error-monitoring";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json({ errors: await getOpenOperationalErrors() });
  } catch (error) {
    return handleApiError(error);
  }
}
