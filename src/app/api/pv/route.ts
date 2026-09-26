import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, recordPageView } from "@/lib/db";
import { isBot, deviceOf, sourceOf, cleanPath, visitorCode } from "@/lib/traffic";

/**
 * POST /api/pv { p: path, r?: referrer, s?: utm_source, e?: 1 when this is
 * the first page of the visit } — one page view. Cookie-free: the visitor
 * code is a monthly hash of IP + browser (src/lib/traffic.ts); the IP itself
 * is never stored. Always 204 — analytics never fails the page.
 */
const SALT = process.env.ANALYTICS_SALT || process.env.POSTGRES_URL || "loops";

export async function POST(request: NextRequest) {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    if (isBot(ua)) return new NextResponse(null, { status: 204 });
    const body = await request.json().catch(() => null);
    const path = cleanPath(body?.p);
    if (!path) return new NextResponse(null, { status: 204 });

    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "0.0.0.0";
    const token = request.cookies.get("session")?.value;
    const user = token ? await getUserBySession(token).catch(() => null) : null;
    const city = request.headers.get("x-vercel-ip-city");
    await recordPageView({
      path,
      visitor: visitorCode(SALT, ip, ua),
      userId: user?.id ?? null,
      // Only the first page of a visit says where the visit came from.
      source: body?.e ? sourceOf({ ref: typeof body?.r === "string" ? body.r : null, utm: typeof body?.s === "string" ? body.s : null, ua }) : null,
      device: deviceOf(ua),
      country: request.headers.get("x-vercel-ip-country")?.slice(0, 2) ?? null,
      city: city ? decodeURIComponent(city).slice(0, 60) : null,
    });
  } catch {
    /* never fail the page */
  }
  return new NextResponse(null, { status: 204 });
}
