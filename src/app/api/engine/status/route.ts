import { NextResponse } from "next/server";

/**
 * GET /api/engine/status — which routing engine THIS deployment is wired to.
 *
 * Exists because production silently kept calling the public brouter.de demo
 * while we believed BROUTER_URL was set (the var wasn't applied to the
 * Production environment). This makes the wiring visible in one request —
 * no generation needed. Reveals only the engine host (a public IP) and the
 * road profile; never secrets.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.BROUTER_URL?.replace(/\/$/, "") ?? null;
  let host: string | null = null;
  try { host = raw ? new URL(raw).host : null; } catch { host = "invalid-url"; }
  const ownEngine = !!raw && !!host && host !== "invalid-url" && !host.includes("brouter.de");
  return NextResponse.json({
    data: {
      engine: host ?? "brouter.de (public demo — BROUTER_URL not set)",
      own_engine: ownEngine,
      road_profile: ownEngine ? "loops-road" : "fastbike-lowtraffic",
      brouter_url_set: !!raw,
      brouter_url_valid: raw ? host !== "invalid-url" : false,
      expected: "http://2.28.33.245:17777/brouter",
    },
  });
}
