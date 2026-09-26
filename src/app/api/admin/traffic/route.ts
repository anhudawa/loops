import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getTrafficReport } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";

/** GET /api/admin/traffic?days=7|30|90 — visitor report for /admin (admins only). */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
    const report = await getTrafficReport([1, 7, 30, 90].includes(days) ? days : 30);
    return NextResponse.json({ data: report }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleApiError(err);
  }
}
