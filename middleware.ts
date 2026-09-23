import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT_AUTH, RATE_LIMIT_UPLOAD, RATE_LIMIT_WRITE, RATE_LIMIT_READ } from "@/config/constants";
import { ATTRIBUTION_COOKIE, attributionFromParams, encodeAttribution } from "@/lib/attribution";
import { isPrivatePath } from "@/app/login/private-paths";

function getRateLimitConfig(pathname: string, method: string) {
  if (pathname.startsWith("/api/auth")) {
    // The session-check GET /api/auth fires on every page load — it must use
    // the generous READ limit, not the strict login limiter (that's for POST
    // login attempts). Capping it at 5 made normal navigation 429, which the
    // client read as "logged out" and dumped signed-in riders to the paywall.
    if (method === "GET") return { max: RATE_LIMIT_READ, prefix: "read" };
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

  // SEO files — always public
  if (pathname === "/sitemap.xml" || pathname === "/robots.txt" || pathname === "/llms.txt") {
    return NextResponse.next();
  }

  // First-touch signup attribution: the first time a visitor lands with a
  // source hint (utm_*/?source/?ref or an external referrer), remember it in a
  // cookie so the signup handler can bucket where they came from (podcast,
  // newsletter, Clubhouse, search…). First-touch wins; never overwritten.
  const applyAttribution = (res: NextResponse): NextResponse => {
    if (request.cookies.get(ATTRIBUTION_COOKIE)) return res;
    let referrerHost: string | null = null;
    const ref = request.headers.get("referer");
    if (ref) {
      try {
        const u = new URL(ref);
        referrerHost = u.host === request.nextUrl.host ? null : u.host;
      } catch { /* ignore malformed referer */ }
    }
    const attr = attributionFromParams(request.nextUrl.searchParams, referrerHost);
    if (attr) {
      res.cookies.set(ATTRIBUTION_COOKIE, encodeAttribution(attr), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90, // 90 days
      });
    }
    return res;
  };

  // Static app assets must never hit the login wall (PWA manifest, icons,
  // link-unfurler touch icons).
  if (
    pathname === "/manifest.json" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/") ||
    /\.(png|svg|ico|jpg|jpeg|webp|txt|xml)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Redirect /explore to homepage (anchor id is scroll-anchor)
  if (pathname === "/explore") {
    return NextResponse.redirect(new URL("/#scroll-anchor", request.url));
  }

  // Only the signed-in pages sit behind the login wall (see private-paths.ts).
  // Everything else is public — the homepage, route and ride pages, the
  // planner (it draws logged out and says so), SEO pages — and an unknown
  // URL falls through to the 404 page instead of "Log in".
  if (isPrivatePath(pathname) && !request.cookies.get("session")?.value) {
    // Preserve intent: come back to where the user was heading
    const login = new URL("/login", request.url);
    login.searchParams.set("redirect", pathname + request.nextUrl.search);
    return applyAttribution(NextResponse.redirect(login));
  }

  return applyAttribution(NextResponse.next());
}

export const config = {
  matcher: ["/:path*"],
};
