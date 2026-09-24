import { NextRequest, NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-utils";
import { measureUnmeasured } from "@/lib/measure-route";
import { applyBundleCorrections } from "@/lib/bundle-corrections";
import { ensureDesignedLoops } from "@/lib/designed-loops";
import { recommendCheckPending } from "@/lib/recommend-check";

export const maxDuration = 60;

/**
 * Daily (vercel.json crons): measure the roads of library routes that have
 * no Road Standard report yet — they stay off every list until measured.
 * Vercel sends Authorization: Bearer $CRON_SECRET; without it this is off.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }
    const corrected = await applyBundleCorrections().catch(() => [] as string[]);
    await ensureDesignedLoops().catch(() => null);
    const result = { corrected, ...(await measureUnmeasured(30_000)), recommend: await recommendCheckPending(15_000).catch(() => ({})) };
    console.log(JSON.stringify({ evt: "routes_measured", ...result }));
    return NextResponse.json({ data: result });
  } catch (err) {
    return handleApiError(err);
  }
}
