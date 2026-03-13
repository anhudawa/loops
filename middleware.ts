import { NextRequest, NextResponse } from "next/server";

/**
 * Auth gate – redirect unauthenticated users to /login.
 * Allowed without session:
 *   - /login page
 *   - /api/auth/* (login/callback/session endpoints)
 *   - /api/stats (used on the login page for social proof)
 *   - /_next/* and static assets
 *   - /.well-known/* (Apple/Android app links)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow these paths
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/stats") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/.well-known") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session")?.value;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files (_next/static, _next/image, favicon, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
