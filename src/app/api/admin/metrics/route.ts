import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getUsageMetrics } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";

/**
 * Admin usage metrics — this week vs last week (rolling 7-day windows).
 * Guarded exactly like the other admin routes (requireAdmin). Fail-soft:
 * if the DB is unreachable or the events table doesn't exist yet,
 * getUsageMetrics returns null and we report availability: false so the
 * dashboard renders "metrics unavailable" instead of erroring.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const result = await getUsageMetrics();
    if (!result) {
      return NextResponse.json({ data: { available: false, metrics: null, since: null } });
    }
    return NextResponse.json({
      data: { available: true, metrics: result.metrics, since: result.since },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
