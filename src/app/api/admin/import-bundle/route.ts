import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireAdmin } from "@/lib/admin";
import { insertCuratedRoute, replaceRouteTrack } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import dublin from "@/data/hub-bundles/dublin.json";
import gironaRebuild from "@/data/hub-bundles/girona-rebuild.json";
import dublinDesigned from "@/data/hub-bundles/dublin-designed.json";

/**
 * Admin: import a bundled LOOPS-curated route set — no laptop or database
 * password needed. Bundles are pre-built from scripts/hub-data manifests and
 * carry the road report measured on our engine; only routes that meet the
 * Road Standard are in a bundle.
 *   GET  → { data: [{ key, label, routes: [names] }] }
 *   POST { bundle: "dublin" } → { data: { results: [{ name, status }] } }
 */
type BundleRoute = Parameters<typeof insertCuratedRoute>[0];
type ReplaceRoute = Omit<Parameters<typeof replaceRouteTrack>[0], "country">;
type Bundle =
  | { mode: "insert"; label: string; routes: Omit<BundleRoute, "id">[] }
  | { mode: "replace"; label: string; country: string; routes: ReplaceRoute[] };
const BUNDLES: Record<string, Bundle> = {
  dublin: { mode: "insert", label: "Import Dublin routes", routes: dublin as Omit<BundleRoute, "id">[] },
  // Designed 2026-09-24 on our engine from local knowledge (Clontarf, Howth,
  // Malahide, Skerries, the Naul, Rathfarnham, Enniskerry, Bray, Greystones,
  // Lucan, Kilcullen): all 16 meet the Road Standard, reports included.
  "dublin-designed": { mode: "insert", label: "Import Dublin & Wicklow loops", routes: dublinDesigned as Omit<BundleRoute, "id">[] },
  // The Girona collection was built with a car router (OSRM demo) and rides
  // autovías; these are the same rides rebuilt on our engine with the Road
  // Standard profile (relaxed for the three long ones), reports included.
  // Redesigned 2026-09-23 (the old tracks were car-routed and never rides):
  // real landmarks reached, true loops, routed on our engine. Empordà Plain
  // starts at Flaçà station: no Road-Standard way across the Ter from Girona.
  "girona-rebuild": { mode: "replace", label: "Rebuild Girona tracks", country: "Spain", routes: gironaRebuild as ReplaceRoute[] },
};

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({
    data: Object.entries(BUNDLES).map(([key, b]) => ({ key, label: b.label, mode: b.mode, routes: b.routes.map((r) => r.name) })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json().catch(() => ({}));
    const bundle = BUNDLES[String(body?.bundle ?? "")];
    if (!bundle) return NextResponse.json({ error: "Unknown bundle", code: "UNKNOWN_BUNDLE" }, { status: 400 });
    const results: { name: string; status: "inserted" | "exists" | "replaced" | "not_found" }[] = [];
    if (bundle.mode === "replace") {
      for (const r of bundle.routes) {
        const n = await replaceRouteTrack({ ...r, country: bundle.country });
        results.push({ name: r.name, status: n > 0 ? "replaced" : "not_found" });
      }
    } else {
      for (const r of bundle.routes) {
        results.push({ name: r.name, status: await insertCuratedRoute({ ...r, id: uuidv4() }) });
      }
    }
    return NextResponse.json({ data: { results } });
  } catch (err) {
    return handleApiError(err);
  }
}
