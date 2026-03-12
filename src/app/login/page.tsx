"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/* ── Animated counter (reused from HeroSection pattern) ── */
function AnimatedNumber({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [current, setCurrent] = useState(0);
  const startTime = useRef<number | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || target === 0) return;
    startTime.current = null;
    const animate = (ts: number) => {
      if (!startTime.current) startTime.current = ts;
      const progress = Math.min((ts - startTime.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [visible, target, duration]);

  return <span ref={ref}>{current.toLocaleString()}</span>;
}

/* ── Main login/squeeze page ── */
function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [stats, setStats] = useState<{ routes: number; totalKm: number; countries: number } | null>(null);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "invalid_or_expired") setError("Link expired or already used. Request a new one.");
    if (err === "missing_token") setError("Invalid sign-in link. Request a new one.");
    if (err === "strava_failed") setError("Could not connect to Strava. Please try again.");
    if (err === "google_failed") setError("Could not sign in with Google. Please try again.");
    if (err === "account_suspended") setError("This account has been suspended.");
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError("Please enter your email"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send link");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  const handleStravaLogin = async () => {
    try {
      const res = await fetch("/api/auth/strava");
      const data = await res.json();
      if (!data.url) { setError("Could not connect to Strava. Please try again."); return; }
      const webUrl = data.url as string;
      const queryString = webUrl.split("?")[1];
      const appUrl = `strava://oauth/mobile/authorize?${queryString}`;
      window.location.href = appUrl;
      setTimeout(() => { if (!document.hidden) window.location.href = webUrl; }, 1500);
    } catch {
      setError("Could not connect to Strava. Please try again.");
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch("/api/auth/google");
      const data = await res.json();
      if (!data.url) { setError("Could not sign in with Google. Please try again."); return; }
      window.location.href = data.url;
    } catch {
      setError("Could not sign in with Google. Please try again.");
    }
  };

  const inputStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  const valueProps = [
    {
      icon: (
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
      ),
      title: "Discover",
      desc: "Browse loops uploaded by riders who've actually ridden them",
    },
    {
      icon: (
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25" />
        </svg>
      ),
      title: "Share",
      desc: "Upload your favourite routes and help fellow riders explore new roads",
    },
    {
      icon: (
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      ),
      title: "Connect",
      desc: "Follow riders, message them, and build your community score",
    },
  ];

  const howItWorks = [
    { step: "1", title: "Find a loop", desc: "Search by location, distance, or surface type" },
    { step: "2", title: "Download the GPX", desc: "One tap to get it into Strava, Komoot, or Wahoo" },
    { step: "3", title: "Ride & share back", desc: "Upload your own favourites for the community" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden px-4 pt-16 pb-14 md:pt-24 md:pb-20">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(200, 255, 0, 0.06) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, var(--text-muted) 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <span className="logo-mark text-gradient" style={{ fontSize: "clamp(3.5rem, 10vw, 7rem)" }}>
            LOOPS
          </span>
          <h1
            className="font-extrabold uppercase tracking-tight leading-[0.95] mt-4 mb-4"
            style={{ fontSize: "clamp(1.75rem, 5vw, 3rem)", color: "var(--text)" }}
          >
            Stop Riding The Same Loop
          </h1>
          <p className="text-base md:text-lg max-w-lg mx-auto" style={{ color: "var(--text-muted)" }}>
            Discover and share the best gravel, road &amp; MTB loops worldwide. Built by riders, for riders.
          </p>

          {/* Live stats — social proof */}
          {stats && (
            <div className="flex items-center justify-center gap-8 md:gap-14 mt-10">
              {[
                { value: stats.routes, label: "Routes" },
                { value: stats.totalKm, label: "Km Mapped" },
                { value: stats.countries, label: "Countries" },
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

      {/* ─── Value Props ─── */}
      <section className="px-4 pb-12 md:pb-16">
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {valueProps.map((prop) => (
            <div
              key={prop.title}
              className="rounded-2xl p-6 text-center transition-all duration-200 hover:border-[rgba(200,255,0,0.3)]"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "rgba(200, 255, 0, 0.08)", color: "var(--accent)" }}
              >
                {prop.icon}
              </div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider mb-2" style={{ color: "var(--text)" }}>
                {prop.title}
              </h3>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {prop.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="px-4 pb-12 md:pb-16">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-center font-extrabold text-sm uppercase tracking-wider mb-8" style={{ color: "var(--text-muted)" }}>
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {howItWorks.map((item) => (
              <div key={item.step} className="text-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 font-extrabold text-sm"
                  style={{ background: "rgba(200, 255, 0, 0.1)", color: "var(--accent)", border: "1px solid rgba(200, 255, 0, 0.2)" }}
                >
                  {item.step}
                </div>
                <h3 className="font-bold text-sm mb-1" style={{ color: "var(--text)" }}>{item.title}</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Works With ─── */}
      <section className="px-4 pb-12 md:pb-16">
        <div className="max-w-md mx-auto text-center">
          <p className="text-[10px] uppercase tracking-wider font-bold mb-4" style={{ color: "var(--text-muted)" }}>
            Works with your favourite apps
          </p>
          <div className="flex items-center justify-center gap-8">
            {/* Strava */}
            <div className="flex flex-col items-center gap-1.5">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="var(--strava)">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>Strava</span>
            </div>
            {/* Komoot */}
            <div className="flex flex-col items-center gap-1.5">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="#6AA127" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5" fill="#6AA127" stroke="none" />
              </svg>
              <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>Komoot</span>
            </div>
            {/* Wahoo */}
            <div className="flex flex-col items-center gap-1.5">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10" />
                <path d="M7 12l2.5 4 2.5-6 2.5 6L17 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>Wahoo</span>
            </div>
            {/* Garmin */}
            <div className="flex flex-col items-center gap-1.5">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 2l-1 2m9-2l1 2" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>Garmin</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Auth Section ─── */}
      <section className="px-4 pb-16 md:pb-24">
        <div className="max-w-md mx-auto">
          <h2 className="text-center font-extrabold text-lg uppercase tracking-wider mb-6" style={{ color: "var(--text)" }}>
            Join the community
          </h2>

          <div className="rounded-2xl p-8" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {!sent && (
              <>
                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-opacity hover:opacity-90"
                  style={{ background: "#fff", color: "#333" }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </button>

                <button
                  onClick={handleStravaLogin}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-opacity hover:opacity-90 mt-3"
                  style={{ background: "var(--strava)", color: "#fff" }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                  </svg>
                  Continue with Strava
                </button>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>or sign in with email</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>
              </>
            )}

            {sent ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(200, 255, 0, 0.1)" }}>
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-extrabold tracking-tight mb-2" style={{ color: "var(--text)" }}>Check your email</h2>
                <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>We sent a sign-in link to</p>
                <p className="text-sm font-bold mb-4" style={{ color: "var(--accent)" }}>{email}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  The link expires in 15 minutes. Check your spam folder if you don&apos;t see it.
                </p>
                <button
                  onClick={() => { setSent(false); setSubmitting(false); }}
                  className="mt-5 text-sm font-bold hover:opacity-80"
                  style={{ color: "var(--accent)" }}
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                    Email address <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full rounded-lg px-4 py-2.5 text-sm transition-colors"
                    style={inputStyle}
                  />
                </div>

                {error && (
                  <div className="alert-error" role="alert">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-accent w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Sending link..." : "Send magic link"}
                </button>

                <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                  We&apos;ll email you a secure sign-in link. No password needed.
                </p>
              </form>
            )}
          </div>

          {/* Free to use note */}
          <p className="text-center text-xs mt-4" style={{ color: "var(--text-muted)" }}>
            100% free. No credit card. No spam. Just loops.
          </p>
        </div>
      </section>

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
