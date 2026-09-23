import { ENABLED_DISCIPLINES, disciplineEnabled } from "@/config/constants";
import { hasBrokenTrack, roadStandardStatus } from "@/lib/public-route";
import { slugify } from "@/lib/seo";

/**
 * Shared helpers for the public library pages (country, region, collection,
 * destination guide). The rule they enforce: every number a rider reads —
 * the button, the stat, the heading, the FAQ, the JSON-LD — counts the SAME
 * cards the rider can open. The SQL stats count stored tracks that the card
 * hides (track_broken), so the pages count from the visible list instead.
 */

const DISCIPLINE_WORD: Record<string, string> = { road: "road", gravel: "gravel", mtb: "MTB" };

/** "road, gravel and MTB" */
export function disciplineList(ds: string[]): string {
  const w = ds.map((d) => DISCIPLINE_WORD[d] ?? d);
  return w.length <= 1 ? (w[0] ?? "") : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
}

/** The routes a rider can actually open: broken stored tracks are hidden by RouteCard. */
export function visibleRoutes<T>(routes: T[]): T[] {
  return routes.filter((r) => !hasBrokenTrack(r as unknown as Record<string, unknown>));
}

/**
 * A collection's listed routes: the disciplines LOOPS plans (v1: road) and
 * no broken tracks — the list, its numbering and every count use this.
 */
export function listedRoutes<T extends { discipline?: string | null }>(routes: T[]): T[] {
  return visibleRoutes(routes.filter((r) => disciplineEnabled(r.discipline)));
}

/** The badge for a list: its one discipline, or "mixed" when it really holds several. */
export function listDiscipline(routes: { discipline?: string | null }[], fallback: string): string {
  const ds = new Set(routes.map((r) => r.discipline ?? "road"));
  if (ds.size === 1) return [...ds][0];
  if (ds.size === 0) return disciplineEnabled(fallback) ? fallback : (ENABLED_DISCIPLINES.length === 1 ? ENABLED_DISCIPLINES[0] : fallback);
  return "mixed";
}

/**
 * Stored copy that promises a discipline v1 hides ("road and gravel
 * routes") — true of the data, not of the page. Callers fall back to a
 * generated line.
 */
export function mentionsHiddenDiscipline(text: string | null | undefined): boolean {
  if (!text) return false;
  const words: Record<string, RegExp> = { gravel: /\bgravel\b/i, mtb: /\b(mtb|mountain[- ]bik)/i };
  return Object.entries(words).some(([d, re]) => !disciplineEnabled(d) && re.test(text));
}

/** Total km of a list, rounded — the "Total km" stat. */
export function totalKm(routes: { distance_km?: number | string | null }[]): number {
  return Math.round(routes.reduce((s, r) => s + (Number(r.distance_km) || 0), 0));
}

/** How many routes carry a measured Road Standard report (met or named notes). */
export function measuredCount(routes: { road_report?: unknown }[]): number {
  return routes.filter((r) => roadStandardStatus(r.road_report) !== null).length;
}

/**
 * One card per region, counted from the visible routes. Regions that differ
 * only by case or stray spaces ("London" / "london", "Tipperary ") share a
 * slug — and a region page — so they are one card; the tidiest spelling
 * (trimmed, capitalised) names it.
 */
export function regionCards(routes: { region?: string | null }[]): { name: string; slug: string; routeCount: number }[] {
  const bySlug = new Map<string, { names: Map<string, number>; routeCount: number }>();
  for (const r of routes) {
    const name = (r.region ?? "").trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const entry = bySlug.get(slug) ?? { names: new Map<string, number>(), routeCount: 0 };
    entry.routeCount++;
    entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
    bySlug.set(slug, entry);
  }
  const isCapitalised = (n: string) => n.charAt(0) !== n.charAt(0).toLowerCase();
  return [...bySlug.entries()]
    .map(([slug, { names, routeCount }]) => {
      const best = [...names.entries()].sort(
        (a, b) => Number(isCapitalised(b[0])) - Number(isCapitalised(a[0])) || b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0][0];
      return { name: best, slug, routeCount };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
