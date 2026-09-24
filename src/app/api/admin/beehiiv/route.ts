import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getNewsletterOptInEmails } from "@/lib/db";
import { beehiivStatus, subscribeToNewsletter } from "@/lib/beehiiv";
import { handleApiError } from "@/lib/api-utils";

/**
 * Admin: Beehiiv.
 *   POST { action: "status" }   → are the keys right? (publication name)
 *   POST { action: "backfill" } → send every opted-in rider to Beehiiv
 *                                 (existing subscribers are left as they are)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json().catch(() => ({}));
    if (body?.action === "status") return NextResponse.json({ data: await beehiivStatus() });
    if (body?.action === "backfill") {
      const status = await beehiivStatus();
      if (!status.ok) return NextResponse.json({ data: status });
      let sent = 0, failed = 0;
      for (const email of await getNewsletterOptInEmails()) {
        const r = await subscribeToNewsletter(email, { source: "backfill", medium: "backfill" });
        if (r.ok) sent++; else failed++;
      }
      return NextResponse.json({ data: { publication: status.publication, sent, failed } });
    }
    return NextResponse.json({ error: "Unknown action", code: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
