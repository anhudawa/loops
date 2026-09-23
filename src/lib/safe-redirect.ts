/**
 * A post-sign-in return path: same-site, relative, bounded. Anything else
 * (absolute URLs, protocol-relative "//evil", backslash tricks) → null.
 */
export function safeRedirectPath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  const s = p.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || s.length > 500) return null;
  if (/[\u0000-\u001f]/.test(s)) return null;
  return s;
}
