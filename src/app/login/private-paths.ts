/**
 * The pages that need a signed-in rider. Everything else is public, so an
 * unknown URL falls through to the 404 page instead of the login wall.
 * Shared by middleware.ts (the gate) and the login page (its heading and
 * whether a "Back" link would just bounce back here).
 */
export const PRIVATE_PATH_PREFIXES = ["/generate", "/upload", "/messages", "/profile", "/admin"] as const;

/** Path only (query and hash ignored). "/generate" and "/generate/…" match; "/generated" does not. */
export function isPrivatePath(path: string): boolean {
  const pathname = path.split(/[?#]/)[0];
  return PRIVATE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Login-page heading when the rider was sent here by the gate (or tapped a
 * link into a private page). Neutral: most of them are new, so never
 * "Welcome back".
 */
export function gateHeading(path: string): string | null {
  if (!isPrivatePath(path)) return null;
  const pathname = path.split(/[?#]/)[0];
  if (pathname.startsWith("/generate")) return "Plan a ride with LOOPS";
  if (pathname.startsWith("/upload")) return "Upload a route to LOOPS";
  if (pathname.startsWith("/messages")) return "Log in to see your messages";
  if (pathname.startsWith("/profile")) return "Log in to see your profile";
  return "Log in to continue";
}
