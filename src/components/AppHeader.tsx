"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SOCIAL_FEATURES_ENABLED } from "@/config/constants";

/**
 * The one shared header (2026-06-11 "Where should I ride today?" redesign).
 * One logo treatment, one nav, mobile-first: every primary link is visible
 * at 375px with ≥44px tap targets. Replaces the seven bespoke header
 * variants that grew across the app.
 */

const NAV = [
  { href: "/generate", label: "Plan" },
  { href: "/plan", label: "Draw" },
  { href: "/", label: "Routes" },
  { href: "/cycling", label: "Destinations" },
] as const;

function NavLinks({ pathname, signedIn = false }: { pathname: string; signedIn?: boolean }) {
  // "My rides" for signed-in riders: the rides they shared or answered.
  const items = signedIn ? [...NAV, { href: "/rides", label: "My rides" } as const] : NAV;
  return (
    <>
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="text-xs font-bold uppercase tracking-wider max-[360px]:tracking-wide px-3 max-[360px]:px-2 min-h-[44px] inline-flex items-center rounded-lg whitespace-nowrap hover:opacity-80 transition-opacity"
            style={{ color: active ? "var(--accent)" : "var(--text-secondary)" }}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export default function AppHeader({ sticky = true }: { sticky?: boolean }) {
  const { user, loading: authLoading, authError, logout, unreadCount } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const loginHref = `/login?redirect=${encodeURIComponent(pathname ?? "/")}`;
  // Keep the query (a ride link's day/time/meeting point) through sign-in.
  // The server cannot see the query, so the markup carries the path only;
  // after mount the real href (for long-press / new tab) is set on the DOM
  // and a normal tap reads it at click time.
  const fullLoginHref = (signup = false) =>
    `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}${signup ? "&mode=signup" : ""}`;
  // Callback refs: the links mount only after auth resolves, so an effect on
  // mount would run before they exist. These run whenever an anchor attaches.
  const withFullHref = (el: HTMLAnchorElement | null) => { if (el) el.href = fullLoginHref(); };
  const withSignupHref = (el: HTMLAnchorElement | null) => { if (el) el.href = fullLoginHref(true); };
  const goTo = (signup: boolean) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    router.push(fullLoginHref(signup));
  };
  const goToLogin = goTo(false);
  const goToSignup = goTo(true);
  // Draw on a phone: the map needs every pixel, so the nav row folds into a
  // menu button in the top row (one header row instead of two).
  const compact = !!pathname?.startsWith("/plan");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className={`${sticky && !pathname?.startsWith("/ride/") ? "sticky top-0 " : ""}z-40 border-b`}
      style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}
    >
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between gap-2 min-h-[52px]">
          <div className="flex items-center gap-1 min-w-0">
            <Link
              href="/"
              className="shrink-0 pr-2 min-h-[44px] inline-flex items-center"
              aria-label="LOOPS home"
            >
              <span className="logo-mark text-2xl" style={{ color: "var(--text)" }}>
                LOOPS
              </span>
            </Link>
            {/* Desktop nav — inline beside the logo */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              <NavLinks pathname={pathname} signedIn={!!user} />
            </nav>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {compact && (
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-controls="compact-nav"
                aria-label="Menu"
                className="md:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg"
                style={{ color: "var(--text)", border: "1px solid var(--border)" }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  {menuOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />}
                </svg>
              </button>
            )}
            {user && (
              <Link
                href="/upload"
                className="btn-accent rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5 px-2.5 md:px-3 min-h-[44px] min-w-[44px]"
                aria-label="Upload route"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden md:inline">Upload route</span>
              </Link>
            )}
            {user?.role === "admin" && (
              <Link
                href="/admin"
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded hidden md:inline-block hover:opacity-80"
                style={{ background: "rgba(255, 51, 85, 0.15)", color: "var(--danger)" }}
              >
                Admin
              </Link>
            )}
            {/* Messaging is a social feature — hidden for launch */}
            {SOCIAL_FEATURES_ENABLED && user && (
              <Link
                href="/messages"
                className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
                style={{ color: "var(--text-muted)" }}
                aria-label="Messages"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {unreadCount > 0 && (
                  <span
                    className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1"
                    style={{ background: "var(--danger)", color: "#fff" }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            {user && (
              <Link
                href={`/profile/${user.id}`}
                className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center hover:opacity-80 transition-opacity"
                aria-label="Your profile"
              >
                <img
                  src={
                    user.avatar_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.email)}&background=1a1a1a&color=c8ff00&size=32&bold=true`
                  }
                  alt=""
                  className="w-7 h-7 rounded-full object-cover"
                  style={{ border: "1.5px solid var(--border)", background: "var(--bg-raised)" }}
                />
              </Link>
            )}
            {user ? (
              // Leave for home once signed out: staying on a private page
              // would bounce the rider to /login ("Welcome back").
              <button
                onClick={() => { void logout({ redirectTo: "/" }); }}
                className="text-xs font-medium hover:opacity-80 px-2 min-h-[44px]"
                style={{ color: "var(--text-muted)" }}
              >
                Log out
              </button>
            ) : authLoading || authError ? (
              // Auth not resolved yet, or a transient failure — show nothing
              // rather than flashing "Log in / Sign up" at a signed-in rider.
              <span className="min-h-[44px] inline-flex items-center" aria-hidden="true" />
            ) : (
              <>
                <Link
                  ref={withFullHref}
                  href={loginHref}
                  onClick={goToLogin}
                  className="text-sm font-semibold hover:opacity-80 px-2.5 min-h-[44px] inline-flex items-center"
                  style={{ color: "var(--text)" }}
                >
                  Log in
                </Link>
                <Link
                  ref={withSignupHref}
                  href={`${loginHref}&mode=signup`}
                  onClick={goToSignup}
                  className="text-sm font-bold px-4 rounded-lg hover:opacity-90 min-h-[44px] inline-flex items-center"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile nav — second row. All four links fit from 320px (tighter
            padding under 360px), so no fade mask hiding "Destinations". */}
        {(!compact || menuOpen) && (
          <nav
            id="compact-nav"
            className="md:hidden flex items-center gap-1 overflow-x-auto -mx-1 px-1 [scrollbar-width:none]"
            aria-label="Primary"
            onClick={() => setMenuOpen(false)}
          >
            <NavLinks pathname={pathname} signedIn={!!user} />
          </nav>
        )}
      </div>
    </header>
  );
}
