import { useSyncExternalStore } from "react";

/**
 * The page's path + query on the client, null on the server and during
 * hydration. Components that build links from the URL (login redirects,
 * ride-link params) render the server value first and then the real one,
 * so server-rendered pages never hydrate with a stale href.
 */
const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const getSnapshot = () => window.location.pathname + window.location.search;
const getServerSnapshot = () => null;

export function useClientUrl(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** "/login?redirect=<url>" (with gpx=1 when asked), or "/login" before the URL is known. */
export function loginHrefFor(url: string | null, opts: { gpx?: boolean; signup?: boolean } = {}): string {
  const mode = opts.signup ? "&mode=signup" : "";
  if (!url) return opts.signup ? "/login?mode=signup" : "/login";
  let target = url;
  if (opts.gpx) {
    const [path, query = ""] = url.split("?");
    const q = new URLSearchParams(query);
    q.set("gpx", "1");
    target = `${path}?${q.toString()}`;
  }
  return `/login?redirect=${encodeURIComponent(target)}${mode}`;
}

/** One query param from a client URL (null when unknown). */
export function paramFrom(url: string | null, name: string): string | null {
  if (!url) return null;
  try {
    return new URLSearchParams(url.split("?")[1] ?? "").get(name);
  } catch {
    return null;
  }
}
