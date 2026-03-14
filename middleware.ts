import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT_AUTH, RATE_LIMIT_UPLOAD, RATE_LIMIT_WRITE, RATE_LIMIT_READ } from "@/config/constants";

function getRateLimitConfig(pathname: string, method: string) {
  if (pathname.startsWith("/api/auth")) {
    return { max: RATE_LIMIT_AUTH, prefix: "auth" };
  }
  if (
    (pathname === "/api/routes" && method === "POST") ||
    (pathname === "/api/profile/avatar" && method === "POST") ||
    (/\/api\/routes\/[^/]+\/photos$/.test(pathname) && method === "POST")
  ) {
    return { max: RATE_LIMIT_UPLOAD, prefix: "upload" };
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { max: RATE_LIMIT_WRITE, prefix: "write" };
  }
  return { max: RATE_LIMIT_READ, prefix: "read" };
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

  // Public pages — homepage, info pages, login, route pages, photos
  const publicExactPaths = ["/", "/about", "/privacy", "/terms", "/feedback"];
  if (
    publicExactPaths.includes(pathname) ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/routes/") ||
    pathname.startsWith("/photos")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session")?.value;
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
