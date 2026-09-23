import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

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

/** Tiny Dublin leg used to probe whether a profile exists on the engine. */
const PROBE_LONLATS = "-6.17,53.3625|-6.25,53.40";

async function probeProfile(base: string, profile: string): Promise<{ ok: boolean; ms: number; detail: string }> {
  const t = Date.now();
  try {
    const res = await fetch(`${base}?lonlats=${PROBE_LONLATS}&profile=${encodeURIComponent(profile)}&alternativeidx=0&format=geojson`, {
      signal: AbortSignal.timeout(12_000),
    });
    const body = await res.text();
    const ok = res.ok && body.includes("FeatureCollection");
    return { ok, ms: Date.now() - t, detail: ok ? "routes" : `http ${res.status}: ${body.slice(0, 80).replace(/\s+/g, " ")}` };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, detail: `error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function GET(request: NextRequest) {
  // Infrastructure detail (engine host/IP, key presence) is for admins only;
  // anonymous callers get a health summary.
  const isAdmin = await requireAdmin(request).then((r) => !(r instanceof NextResponse)).catch(() => false);
  const raw = process.env.BROUTER_URL?.replace(/\/$/, "") ?? null;
  let host: string | null = null;
  try { host = raw ? new URL(raw).host : null; } catch { host = "invalid-url"; }
  const ownEngine = !!raw && !!host && host !== "invalid-url" && !host.includes("brouter.de");
  const roadProfile = process.env.BROUTER_ROAD_PROFILE || (ownEngine ? "loops-road" : "fastbike-lowtraffic");
  const relaxedProfile = process.env.BROUTER_ROAD_RELAXED_PROFILE || "loops-road-relaxed";

  // ?probe=1 — route a test leg on each profile so the owner can verify a
  // server rebuild from the browser (relaxed profile present = v3 live).
  let probe: Record<string, { ok: boolean; ms: number; detail: string }> | undefined;
  if (request.nextUrl.searchParams.get("probe") === "1" && raw && ownEngine) {
    probe = {
      [roadProfile]: await probeProfile(raw, roadProfile),
      [relaxedProfile]: await probeProfile(raw, relaxedProfile),
    };
  }

  if (!isAdmin) {
    return NextResponse.json({
      data: {
        own_engine: ownEngine,
        ...(probe ? { healthy: Object.values(probe).every((p) => p.ok), server_version: probe[relaxedProfile]?.ok ? "v3" : "v2" } : {}),
      },
    });
  }
  return NextResponse.json({
    data: {
      engine: host ?? "brouter.de (public demo — BROUTER_URL not set)",
      own_engine: ownEngine,
      road_profile: roadProfile,
      relaxed_profile: relaxedProfile,
      brouter_url_set: !!raw,
      brouter_url_valid: raw ? host !== "invalid-url" : false,
      expected: "http://2.28.33.245:17777/brouter",
      // Trust diagnostics: without the model key the basic parser runs
      // (plain rides only, no workouts) — surfaced here so it is never a guess.
      anthropic_key_set: !!process.env.ANTHROPIC_API_KEY,
      email_signin_enabled: !!process.env.RESEND_API_KEY,
      ...(probe ? { probe, server_version: probe[relaxedProfile]?.ok ? "v3 (relaxed profile present)" : "v2 (relaxed profile missing — rebuild pending)" } : {}),
    },
  });
}
