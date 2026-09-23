import type { Metadata } from "next";

/**
 * One source of truth for share/SEO metadata. Every public page's canonical
 * and og:url is its OWN URL on www.loops.ie (the apex redirects), and every
 * page that sets its own openGraph still carries the site default image —
 * Next replaces the root openGraph object wholesale, so a page that defines
 * openGraph without images would otherwise unfurl with no picture.
 */
export const SITE_URL = "https://www.loops.ie";
export const SITE_NAME = "LOOPS";

export const DEFAULT_OG_IMAGE = {
  url: "/api/og",
  width: 1200,
  height: 630,
  alt: "LOOPS — Discover cycling routes worldwide",
};

/** Absolute www URL for a site path ("/" → "https://www.loops.ie"). */
export function siteUrl(path = "/"): string {
  if (!path || path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

type OgImages = NonNullable<NonNullable<Metadata["openGraph"]>["images"]>;

/**
 * openGraph block for a page: og:url, og:site_name, locale and (unless the
 * page passes its own) the site default image.
 */
export function pageOpenGraph(opts: {
  path: string;
  title?: string;
  description?: string;
  type?: "website" | "article";
  images?: OgImages;
}): NonNullable<Metadata["openGraph"]> {
  return {
    ...(opts.title && { title: opts.title }),
    ...(opts.description && { description: opts.description }),
    url: siteUrl(opts.path),
    siteName: SITE_NAME,
    locale: "en_IE",
    type: opts.type ?? "website",
    images: opts.images ?? [DEFAULT_OG_IMAGE],
  };
}

/** canonical + openGraph for a simple page, in one call. */
export function pageMeta(opts: {
  path: string;
  title?: string;
  description?: string;
  type?: "website" | "article";
  images?: OgImages;
}): Pick<Metadata, "alternates" | "openGraph"> {
  return {
    alternates: { canonical: siteUrl(opts.path) },
    openGraph: pageOpenGraph(opts),
  };
}
