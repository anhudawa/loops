// ============================================================
// attribution.ts — signup-source capture (first-touch)
// ============================================================
//
// LOOPS is the free funnel into the Roadman world, so we need to know where a
// rider came from when they create an account: the podcast, the newsletter,
// the Clubhouse/Skool community, search, or direct. This is FIRST-TOUCH: the
// middleware writes a cookie the first time a visitor arrives with a source
// hint, and the signup handler reads it. No PII — just the channel bucket and
// the raw UTM values.

export const ATTRIBUTION_COOKIE = "loops_attribution";

/** The channels we care about for the funnel. `other` keeps a raw utm_source
 *  we didn't recognise; `direct` means no hint at all. */
export type SourceBucket =
  | "podcast"
  | "newsletter"
  | "clubhouse"
  | "search"
  | "social"
  | "referral"
  | "other"
  | "direct";

export interface Attribution {
  /** Normalised channel bucket for reporting. */
  source: SourceBucket;
  /** Raw utm_source (or explicit ?source=/?ref=), lowercased, for detail. */
  raw_source: string | null;
  /** Raw utm_medium, lowercased. */
  medium: string | null;
  /** Raw utm_campaign, lowercased. */
  campaign: string | null;
}

const KNOWN_SEARCH_HOSTS = ["google.", "bing.", "duckduckgo.", "yahoo.", "ecosia.", "brave."];
const KNOWN_SOCIAL_HOSTS = [
  "instagram.", "facebook.", "fb.", "t.co", "twitter.", "x.com",
  "youtube.", "youtu.be", "linkedin.", "reddit.", "strava.",
];

function clean(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim().toLowerCase().slice(0, 120);
  return t.length ? t : null;
}

/** Bucket a raw source/medium/referrer into one of our channels. */
function bucketFor(rawSource: string | null, medium: string | null, referrerHost: string | null): SourceBucket {
  const s = rawSource ?? "";
  const m = medium ?? "";
  const hay = `${s} ${m}`;

  if (/podcast|roadman|ndy|not.?done.?yet/.test(hay)) return "podcast";
  if (/newsletter|beehiiv|email|saturday.?spin/.test(hay)) return "newsletter";
  if (/clubhouse|skool|community|discord/.test(hay)) return "clubhouse";
  if (/\b(cpc|ppc|paid|organic|search|seo)\b/.test(m) || s === "google" || s === "bing") return "search";
  if (/social|instagram|facebook|twitter|^x$|youtube|linkedin|reddit|tiktok/.test(hay)) return "social";

  if (rawSource) return "other"; // an explicit but unrecognised utm_source
  if (referrerHost) {
    if (KNOWN_SEARCH_HOSTS.some((h) => referrerHost.includes(h))) return "search";
    if (KNOWN_SOCIAL_HOSTS.some((h) => referrerHost.includes(h))) return "social";
    return "referral";
  }
  return "direct";
}

/**
 * Derive attribution from a URL's query params (+ optional referrer host).
 * Returns null when there's NOTHING to capture (no utm/source/ref and no
 * referrer) — so first-touch capture doesn't overwrite a real earlier hint
 * with a bare "direct".
 */
export function attributionFromParams(
  params: URLSearchParams,
  referrerHost?: string | null
): Attribution | null {
  const rawSource = clean(params.get("utm_source") || params.get("source") || params.get("ref"));
  const medium = clean(params.get("utm_medium"));
  const campaign = clean(params.get("utm_campaign"));
  const refHost = clean(referrerHost) ?? null;

  if (!rawSource && !medium && !campaign && !refHost) return null;

  return {
    source: bucketFor(rawSource, medium, refHost),
    raw_source: rawSource,
    medium,
    campaign,
  };
}

/** Serialize for the cookie (compact, cookie-safe). */
export function encodeAttribution(a: Attribution): string {
  return encodeURIComponent(
    JSON.stringify({ s: a.source, r: a.raw_source, m: a.medium, c: a.campaign })
  );
}

/** Parse the cookie back. Tolerant of anything malformed → null. */
export function decodeAttribution(cookieValue: string | undefined | null): Attribution | null {
  if (!cookieValue) return null;
  try {
    const o = JSON.parse(decodeURIComponent(cookieValue));
    if (!o || typeof o.s !== "string") return null;
    return {
      source: o.s as SourceBucket,
      raw_source: o.r ?? null,
      medium: o.m ?? null,
      campaign: o.c ?? null,
    };
  } catch {
    return null;
  }
}
