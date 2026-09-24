import { NextRequest, NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-utils";
import { measureUnmeasured } from "@/lib/measure-route";

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
    const result = await measureUnmeasured(50_000);
    console.log(JSON.stringify({ evt: "routes_measured", ...result }));
    return NextResponse.json({ data: result });
  } catch (err) {
    return handleApiError(err);
  }
}
