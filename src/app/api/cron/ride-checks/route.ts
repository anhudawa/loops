import { NextRequest, NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-utils";
import { sendDueReminders } from "@/lib/ride-check-service";

/**
 * Daily (vercel.json crons): remind riders of due "did you ride it?"
 * check-ins — push where they allowed it, else email. Vercel sends
 * Authorization: Bearer $CRON_SECRET; without CRON_SECRET set this is off.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }
    const result = await sendDueReminders();
    console.log(JSON.stringify({ evt: "ride_check_reminders", ...result }));
    return NextResponse.json({ data: result });
  } catch (err) {
    return handleApiError(err);
  }
}
