import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { syncEngineProfiles, PROFILE_ENV } from "@/lib/engine-profiles";

/**
 * POST /api/engine/sync-profiles (admin) — upload the repo's routing
 * profiles to the live engine as stable custom profiles and route a test
 * leg with each. First sync creates ids (set them on Vercel as
 * BROUTER_ROAD_PROFILE / BROUTER_ROAD_RELAXED_PROFILE); later syncs update
 * those ids in place — profile changes ship with no server access.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const base = process.env.BROUTER_URL?.replace(/\/$/, "");
  if (!base || base.includes("brouter.de")) {
    return NextResponse.json({ error: "No own engine configured (BROUTER_URL)", code: "NO_ENGINE" }, { status: 400 });
  }
  const existing = Object.fromEntries(
    Object.entries(PROFILE_ENV).map(([name, env]) => [name, process.env[env]])
  );
  const results = await syncEngineProfiles(base, existing);
  const envLines = results
    .filter((r) => r.id)
    .map((r) => `${PROFILE_ENV[r.name]}=${r.id}`);
  return NextResponse.json({
    data: {
      engine: base,
      results,
      next: results.every((r) => r.verified)
        ? results.some((r) => r.created)
          ? `Profiles uploaded and verified. Set on Vercel and redeploy: ${envLines.join(" ")}`
          : "Profiles updated in place and verified — nothing else to do."
        : "At least one profile failed — the server likely still runs cloud-init v2 (absolute custom dir). Rebuild with v3.",
    },
  });
}
