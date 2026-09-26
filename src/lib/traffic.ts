/**
 * Visitor analytics — pure helpers (owner 2026-09-26: "how many people are
 * visiting the site"). First-party, cookie-free:
 *
 * - A page view carries its path, the entry source (utm_source, the
 *   referring site or the in-app browser), device class and the country/city
 *   Vercel derives from the connection.
 * - People are counted by a visitor code = hash(secret salt + month + IP +
 *   browser). The IP is never stored and the code changes every month, so
 *   nobody can be followed across months; within a month the same phone
 *   counts once however many pages it opens.
 * - Bots, link-preview fetchers and automated browsers are not counted.
 */
import { createHash } from "crypto";

const BOT = /bot|crawl|spider|slurp|mediapartners|preview|facebookexternalhit|embedly|quora link|whatsapp\/|telegram|discord|skype|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|vercel|curl|wget|python|node-fetch|undici|axios|go-http|java\/|okhttp|playwright|puppeteer|phantomjs|selenium/i;

export function isBot(ua: string | null | undefined): boolean {
  return !ua || ua.length < 20 || BOT.test(ua);
}

export function deviceOf(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

/** Where an entry came from: utm_source, the referring site, the in-app browser, else "direct". */
export function sourceOf(opts: { ref?: string | null; utm?: string | null; ua?: string | null; ownHost?: string }): string {
  const utm = (opts.utm ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 40);
  if (utm) return utm;
  const ua = opts.ua ?? "";
  let host = "";
  try {
    host = opts.ref ? new URL(opts.ref).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "").replace(/^l\./, "").replace(/^lm\./, "") : "";
  } catch { host = ""; }
  if (host && host !== (opts.ownHost ?? "loops.ie") && !host.endsWith(".loops.ie")) {
    if (/(^|\.)google\./.test(host)) return "google";
    if (/(^|\.)bing\.com$/.test(host)) return "bing";
    if (/duckduckgo\.com$/.test(host)) return "duckduckgo";
    if (/instagram\.com$/.test(host)) return "instagram";
    if (/facebook\.com$|fb\.me$/.test(host)) return "facebook";
    if (/t\.co$|twitter\.com$|x\.com$/.test(host)) return "x";
    if (/whatsapp\.(com|net)$|wa\.me$/.test(host)) return "whatsapp";
    if (/strava\.com$/.test(host)) return "strava";
    if (/youtube\.com$|youtu\.be$/.test(host)) return "youtube";
    if (/linkedin\.com$|lnkd\.in$/.test(host)) return "linkedin";
    if (/reddit\.com$/.test(host)) return "reddit";
    return host.slice(0, 60);
  }
  // No referrer: in-app browsers still say who they are.
  if (/instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return "facebook";
  if (/whatsapp/i.test(ua)) return "whatsapp";
  if (/linkedinapp/i.test(ua)) return "linkedin";
  return "direct";
}

/** A path worth counting: same-site, no query, not admin/API, capped. */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//")) return null;
  const path = p.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (/^\/(admin|api|_next)(\/|$)/.test(path)) return null;
  return path.slice(0, 200);
}

/** The monthly visitor code. */
export function visitorCode(salt: string, ip: string, ua: string, now: Date = new Date()): string {
  const month = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
  return createHash("sha256").update(`${salt}|${month}|${ip}|${ua}`).digest("hex").slice(0, 20);
}
