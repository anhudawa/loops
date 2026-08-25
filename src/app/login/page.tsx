"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import AnimatedNumber from "@/components/AnimatedNumber";
import FadeIn from "@/components/FadeIn";
import GoogleButton from "@/components/GoogleButton";
import FeaturedRouteTeaser, { type FeaturedRoute } from "@/components/FeaturedRouteTeaser";

/* ── Demo prompts for the answer-machine preview ── */
const DEMO_PROMPTS = [
  "2 hours from Dublin on quiet road lanes",
  "70 km scenic road loop from Bray",
  "90 min Zone 2 road ride from Blessington",
  "Road loop near Dún Laoghaire for 2x20 min threshold",
];

/* ── Login page — everything answers "Where should I ride today?" ── */
function LoginPage() {
  const searchParams = useSearchParams();
  const [manualError, setManualError] = useState("");
  const [stats, setStats] = useState<{
    routes: number;
    totalKm: number;
    countries: number;
    counties?: number;
    featuredRoutes: FeaturedRoute[];
  } | null>(null);
  const [navSolid, setNavSolid] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);

  // Derive URL-sourced errors directly — no effect needed
  const paramErr = searchParams.get("error");
  const urlError =
    paramErr === "google_failed"
      ? "Could not sign in with Google. Please try again."
      : paramErr === "account_suspended"
        ? "This account has been suspended."
        : "";
  const error = manualError || urlError;

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.routes === "number") setStats(data);
      })
      .catch(() => {});
  }, []);

  // Sticky nav transition
  useEffect(() => {
    const handleScroll = () => setNavSolid(window.scrollY > 60);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Rotate the demo prompt
  useEffect(() => {
    const id = setInterval(() => setDemoIndex((i) => (i + 1) % DEMO_PROMPTS.length), 3500);
    return () => clearInterval(id);
  }, []);

  const handleGoogleLogin = useCallback(async (redirectOverride?: string) => {
    try {
      // Store redirect URL in a cookie so the OAuth callback can send the
      // rider where they were headed — e.g. straight into /generate?q=…
      const redirect = redirectOverride ?? searchParams.get("redirect") ?? "/beta";
      if (redirect) {
        document.cookie = `login_redirect=${encodeURIComponent(redirect)}; path=/; max-age=600; SameSite=Lax`;
      }
      const res = await fetch("/api/auth/google");
      const data = await res.json();
      if (!data.url) { setManualError("Could not sign in with Google. Please try again."); return; }
      window.location.href = data.url;
    } catch {
      setManualError("Could not sign in with Google. Please try again.");
    }
  }, [searchParams]);

  // "Try it" carries the demo prompt through login into a real library search.
  const handleTryDemo = useCallback(() => {
    handleGoogleLogin(`/generate?q=${encodeURIComponent(DEMO_PROMPTS[demoIndex])}`);
  }, [handleGoogleLogin, demoIndex]);

  return (
    <div style={{ background: "var(--bg)" }}>
      {/* ─── Sticky Nav ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 px-4 md:px-6 py-3 transition-all duration-300"
        style={{
          background: navSolid ? "rgba(10, 10, 10, 0.95)" : "transparent",
          backdropFilter: navSolid ? "blur(12px)" : "none",
          borderBottom: navSolid ? "1px solid var(--border)" : "1px solid transparent",
        }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          <GoogleButton size="small" onClick={() => handleGoogleLogin()} />
        </div>
      </nav>

      {/* ─── Hero: the one question ─── */}
      <section className="relative overflow-hidden px-4 pt-24 pb-12 md:pt-32 md:pb-16">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(200, 255, 0, 0.06) 0%, transparent 70%)" }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: `radial-gradient(circle at 1px 1px, var(--text-muted) 1px, transparent 0)`, backgroundSize: "40px 40px" }}
        />

        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <span className="logo-mark text-gradient" style={{ fontSize: "clamp(2.5rem, 7vw, 4.5rem)" }}>
            LOOPS
          </span>
          <h1
            className="font-extrabold tracking-tight leading-[1.02] mt-4 mb-3"
            style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", color: "var(--text)" }}
          >
            Where should I ride today?
          </h1>
          <p className="text-base md:text-xl font-bold max-w-lg mx-auto" style={{ color: "var(--text-muted)" }}>
            Stop riding the same loops.
          </p>

          {/* The one CTA */}
          <div className="mt-8 max-w-xs mx-auto">
            {error && (
              <div className="alert-error mb-3 text-sm" role="alert">{error}</div>
            )}
            <GoogleButton onClick={() => handleGoogleLogin()} />
            <p className="text-[11px] text-center mt-2.5" style={{ color: "var(--text-muted)" }}>
              Apply for the free, invitation-only Ireland beta. No credit card.
            </p>
          </div>

          {/* Demo of the answer machine — ask it, sign in, search reviewed routes */}
          <div className="mt-10 max-w-md mx-auto">
            <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: "var(--text-muted)" }}>
              Ask it like you&apos;d ask a riding buddy
            </p>
            <div
              className="flex items-center gap-2 rounded-xl p-2 pl-4 text-left"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <span
                key={demoIndex}
                className="flex-1 min-w-0 truncate text-sm"
                style={{ color: "var(--text-secondary)", animation: "fade-in 0.4s ease" }}
                aria-live="polite"
              >
                &ldquo;{DEMO_PROMPTS[demoIndex]}&rdquo;
              </span>
              <button
                onClick={handleTryDemo}
                className="btn-accent shrink-0 px-4 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider"
              >
                Try it
              </button>
            </div>
            <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
              Sign in and we&apos;ll search reviewed, human-ridden Irish road loops.
            </p>
          </div>

          {/* Live stats — evidence, not marketing */}
          {stats && (
            <div className="flex items-center justify-center gap-8 md:gap-14 mt-12">
              {[
                { value: stats.routes, label: "Routes" },
                { value: stats.totalKm, label: "Km Mapped" },
                { value: stats.counties ?? 0, label: "Counties" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl md:text-3xl font-extrabold" style={{ color: "var(--accent)" }}>
                    <AnimatedNumber target={s.value} />
                  </p>
                  <p className="text-[10px] md:text-xs uppercase tracking-wider font-bold mt-1" style={{ color: "var(--text-muted)" }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── Featured Routes: real answers waiting inside ─── */}
      {stats?.featuredRoutes && stats.featuredRoutes.length > 0 && (
        <FadeIn className="px-4 pb-16 md:pb-24 pt-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-center font-extrabold text-sm uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Answers waiting inside
            </h2>
            <p className="text-center text-xs mb-8" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
              Human-ridden and independently reviewed — sign in to ride one
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {stats.featuredRoutes.map((route) => (
                <FeaturedRouteTeaser key={route.id} route={route} onClick={() => handleGoogleLogin()} />
              ))}
            </div>
          </div>
        </FadeIn>
      )}

      {/* ─── Why LOOPS (comparison — every claim verified true) ─── */}
      <FadeIn className="px-4 pb-20 md:pb-28">
        <div className="max-w-xl mx-auto">
          <h2 className="text-center font-extrabold text-sm uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Routes you can trust
          </h2>
          <p className="text-center text-xs mb-8" style={{ color: "var(--text-muted)" }}>
            Every published LOOPS route is ridden by a real person and reviewed before it reaches the library.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {[
              { them: "Map-only routes with no ride evidence", us: "A recorded ride behind every published loop" },
              { them: "One generic 'good for training' label", us: "Human assessment for each supported session type" },
              { them: "Silent route changes", us: "The exact reviewed route version is preserved" },
              { them: "A made-up route to fill every gap", us: "An honest no-match when evidence is missing" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-xl px-5 py-4"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="shrink-0 flex flex-col gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs line-through" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
                    {item.them}
                  </p>
                  <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                    {item.us}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>
    </div>
  );
}

export default function LoginPageWrapper() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
