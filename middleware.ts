import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Rate limits (per minute):
 *   auth 5/min, uploads 3/min, writes 10/min, reads 60/min
 */
function getRateLimitConfig(pathname: string, method: string) {
  if (pathname.startsWith("/api/auth")) {
    return { max: 5, prefix: "auth" };
  }
  if (
    (pathname === "/api/routes" && method === "POST") ||
    (pathname === "/api/profile/avatar" && method === "POST") ||
    (/\/api\/routes\/[^/]+\/photos$/.test(pathname) && method === "POST")
  ) {
    return { max: 3, prefix: "upload" };
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { max: 10, prefix: "write" };
  }
  return { max: 60, prefix: "read" };
}

function getClientId(request: NextRequest): string {
  const session = request.cookies.get("session")?.value;
  if (session) return `user:${session.substring(0, 16)}`;
  const forwarded = request.headers.get("x-forwarded-for");
  return `ip:${forwarded?.split(",")[0]?.trim() || "unknown"}`;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets — no auth or rate limiting
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/.well-known") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // API rate limiting
  if (pathname.startsWith("/api/")) {
    // Public cached endpoints — skip rate limiting
    if (pathname === "/api/stats" || pathname.startsWith("/api/og")) {
      return NextResponse.next();
    }

    const config = getRateLimitConfig(pathname, request.method);
    const result = checkRateLimit(`${config.prefix}:${getClientId(request)}`, config.max);

    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(result.resetMs / 1000)),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    return response;
  }

  // Page auth gate
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session")?.value;
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
