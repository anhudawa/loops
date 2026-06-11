"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

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

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="text-xs font-bold uppercase tracking-wider px-3 min-h-[44px] inline-flex items-center rounded-lg whitespace-nowrap hover:opacity-80 transition-opacity"
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
  const { user, logout, unreadCount } = useAuth();
  const pathname = usePathname();

  return (
    <header
      className={`${sticky ? "sticky top-0 " : ""}z-40 border-b`}
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
              <NavLinks pathname={pathname} />
            </nav>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {user && (
              <Link
                href="/upload"
                className="btn-accent rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5 px-2.5 md:px-3 min-h-[44px]"
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
            {user && (
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
                  alt={user.name || user.email}
                  className="w-7 h-7 rounded-full object-cover"
                  style={{ border: "1.5px solid var(--border)" }}
                />
              </Link>
            )}
            {user ? (
              <button
                onClick={logout}
                className="text-xs font-medium hover:opacity-80 px-2 min-h-[44px]"
                style={{ color: "var(--text-muted)" }}
              >
                Sign out
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-semibold hover:opacity-80 px-2.5 min-h-[44px] inline-flex items-center"
                  style={{ color: "var(--text)" }}
                >
                  Log in
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-bold px-4 rounded-lg hover:opacity-90 min-h-[44px] inline-flex items-center"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile nav — second row so all primary links stay visible at 375px */}
        <nav
          className="md:hidden flex items-center gap-1 overflow-x-auto -mx-1 px-1"
          aria-label="Primary"
        >
          <NavLinks pathname={pathname} />
        </nav>
      </div>
    </header>
  );
}
