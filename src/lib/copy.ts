import { GPX_ACCESS } from "@/config/constants";

/**
 * Small copy helpers shared by public pages, so counts, places and the
 * GPX promise read the same (and stay true) everywhere.
 */

/** "1 route", "2 routes" — counts from Postgres arrive as strings. */
export function plural(n: number | string, singular: string, pluralForm = `${singular}s`): string {
  const count = Number(n) || 0;
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Join place parts, dropping any part already named by an earlier one:
 * ("Dublin & Wicklow, Ireland", "Ireland") → "Dublin & Wicklow, Ireland".
 */
export function placeLabel(...parts: (string | null | undefined)[]): string {
  const out: string[] = [];
  for (const raw of parts) {
    const p = (raw ?? "").trim();
    if (!p) continue;
    const re = new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu");
    if (out.some((o) => re.test(o))) continue;
    out.push(p);
  }
  return out.join(", ");
}

/**
 * Can a visitor download GPX without signing in? "ride" = arriving on a
 * group-ride link (/ride/<id>). Driven by the owner switch GPX_ACCESS.
 */
export function gpxIsPublic(context: "page" | "ride" = "page"): boolean {
  const access: string = GPX_ACCESS;
  return access === "everyone" || (context === "ride" && access === "ride-links");
}

/**
 * The one line of truth on GPX cost. Lower-case phrase for mid-sentence use;
 * `title` capitalises the first letter.
 */
export function freeGpxPhrase(opts: { context?: "page" | "ride"; title?: boolean } = {}): string {
  const phrase = gpxIsPublic(opts.context) ? "free GPX downloads" : "free GPX with a free LOOPS account";
  return opts.title ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase;
}
