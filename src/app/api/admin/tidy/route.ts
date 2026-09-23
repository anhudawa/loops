import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { tidyLibraryData, hideTestUploads } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";

/**
 * Admin: library data hygiene, one tap each (idempotent).
 *   POST { action: "tidy" }       → trim/case/spelling fixes + featured collections
 *   POST { action: "hide-tests" } → hide the four known test uploads (reversible)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json().catch(() => ({}));
    if (body?.action === "tidy") return NextResponse.json({ data: await tidyLibraryData() });
    if (body?.action === "hide-tests") return NextResponse.json({ data: { hidden: await hideTestUploads() } });
    return NextResponse.json({ error: "Unknown action", code: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
