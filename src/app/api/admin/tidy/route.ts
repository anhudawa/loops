import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { tidyLibraryData, hideTestUploads, getAllRoutesForRecommendCheck, renameRoute } from "@/lib/db";
import { withAutoTitle } from "@/lib/route-title";
import { applyBundleCorrections } from "@/lib/bundle-corrections";
import { measureUnmeasured } from "@/lib/measure-route";
import { checkRecommendable, needsRecommendCheck } from "@/lib/recommend-check";
import { handleApiError } from "@/lib/api-utils";

/**
 * Admin: library data hygiene, one tap each (idempotent).
 *   POST { action: "tidy" }       → trim/case/spelling fixes + featured collections
 *   POST { action: "hide-tests" } → hide the four known test uploads (reversible)
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json().catch(() => ({}));
    if (body?.action === "tidy") {
      const data: Record<string, number> = await tidyLibraryData();
      // Names that say nothing about the ride ("Sunday Social", "Flat long
      // route", "Planned road route — 116.9 km") → start – far point – end · km.
      let renamed = 0;
      for (const r of await getAllRoutesForRecommendCheck()) {
        const t = withAutoTitle(r);
        if (t.renamed && t.name !== r.name) { await renameRoute(r.id, t.name, r.name); renamed++; }
      }
      return NextResponse.json({ data: { ...data, names_renamed: renamed } });
    }
    if (body?.action === "hide-tests") return NextResponse.json({ data: { hidden: await hideTestUploads() } });
    if (body?.action === "measure") {
      // Unmeasured routes stay off every list: measure them now (time-boxed; press again to go on).
      const corrected = await applyBundleCorrections().catch(() => [] as string[]);
      return NextResponse.json({ data: { corrected, ...(await measureUnmeasured(40_000)) } });
    }
    if (body?.action === "recommend-check") {
      // Loops and one-road out-and-backs may be recommended; out-and-backs
      // with another road home never are. Time-boxed: press again to go on.
      const started = Date.now();
      const counts: Record<string, number> = {};
      let left = 0;
      for (const r of await getAllRoutesForRecommendCheck()) {
        if (!needsRecommendCheck(r)) continue;
        if (Date.now() - started > 45_000) { left++; continue; }
        const status = await checkRecommendable(r).catch(() => null);
        counts[status ?? "error"] = (counts[status ?? "error"] ?? 0) + 1;
      }
      return NextResponse.json({ data: { ...counts, still_to_check: left } });
    }
    return NextResponse.json({ error: "Unknown action", code: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
