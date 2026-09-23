import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireAdmin } from "@/lib/admin";
import { insertCuratedRoute } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import dublin from "@/data/hub-bundles/dublin.json";

/**
 * Admin: import a bundled LOOPS-curated route set — no laptop or database
 * password needed. Bundles are pre-built from scripts/hub-data manifests and
 * carry the road report measured on our engine; only routes that meet the
 * Road Standard are in a bundle.
 *   GET  → { data: [{ key, label, routes: [names] }] }
 *   POST { bundle: "dublin" } → { data: { results: [{ name, status }] } }
 */
type BundleRoute = Parameters<typeof insertCuratedRoute>[0];
const BUNDLES: Record<string, { label: string; routes: Omit<BundleRoute, "id">[] }> = {
  dublin: { label: "Dublin", routes: dublin as Omit<BundleRoute, "id">[] },
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({
    data: Object.entries(BUNDLES).map(([key, b]) => ({ key, label: b.label, routes: b.routes.map((r) => r.name) })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json().catch(() => ({}));
    const bundle = BUNDLES[String(body?.bundle ?? "")];
    if (!bundle) return NextResponse.json({ error: "Unknown bundle", code: "UNKNOWN_BUNDLE" }, { status: 400 });
    const results: { name: string; status: "inserted" | "exists" }[] = [];
    for (const r of bundle.routes) {
      results.push({ name: r.name, status: await insertCuratedRoute({ ...r, id: uuidv4() }) });
    }
    return NextResponse.json({ data: { results } });
  } catch (err) {
    return handleApiError(err);
  }
}
