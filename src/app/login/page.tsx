"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

/* ── Animated counter ── */
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

/* ── Fade-in on scroll ── */
function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

interface FeaturedRoute {
  id: string;
  name: string;
  distance_km: number;
  difficulty: string;
  surface_type: string;
  country: string;
  discipline: string;
  avg_score: number;
  rating_count: number;
  cover_photo: string | null;
}

const DIFF_COLORS: Record<string, { color: string; bg: string }> = {
  easy: { color: "var(--success)", bg: "rgba(0, 255, 136, 0.15)" },
  moderate: { color: "var(--warning)", bg: "rgba(255, 187, 0, 0.15)" },
  hard: { color: "var(--danger)", bg: "rgba(255, 51, 85, 0.15)" },
  expert: { color: "var(--purple)", bg: "rgba(187, 68, 255, 0.15)" },
};

/* ── Main login/squeeze page ── */
function LoginPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [stats, setStats] = useState<{
    routes: number;
    totalKm: number;
    countries: number;
    featuredRoutes: FeaturedRoute[];
    community: { riders: number; comments: number; ratings: number };
  } | null>(null);
  const [navSolid, setNavSolid] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "google_failed") setError("Could not sign in with Google. Please try again.");
    if (err === "account_suspended") setError("This account has been suspended.");
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  // Sticky nav transition
  useEffect(() => {
    const handleScroll = () => setNavSolid(window.scrollY > 60);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

  const GoogleButton = ({ size = "default" }: { size?: "default" | "small" }) => (
    <button
      onClick={handleGoogleLogin}
      className={`flex items-center justify-center gap-2.5 rounded-xl font-bold uppercase tracking-wider transition-all hover:opacity-90 hover:scale-[1.02] ${
        size === "small" ? "px-5 py-2.5 text-xs" : "w-full py-3.5 text-sm"
      }`}
      style={{ background: "#fff", color: "#333" }}
    >
      <svg className={size === "small" ? "w-4 h-4" : "w-5 h-5"} viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      {size === "small" ? "Get Started" : "Get Started with Google"}
    </button>
  );

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
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
          <GoogleButton size="small" />
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section ref={heroRef} className="relative overflow-hidden px-4 pt-24 pb-16 md:pt-32 md:pb-24">
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
            Routes Worth Riding
          </h1>
          <p className="text-base md:text-lg max-w-lg mx-auto leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Real routes from real riders. No paywall, no algorithm, no&nbsp;lock&#8209;in. Just&nbsp;GPX&nbsp;files you can use anywhere.
          </p>

          {/* CTA */}
          <div className="mt-8 max-w-xs mx-auto">
            {error && (
              <div className="alert-error mb-3 text-sm" role="alert">{error}</div>
            )}
            <GoogleButton />
            <p className="text-[11px] text-center mt-2.5" style={{ color: "var(--text-muted)" }}>
              Free forever. No credit card. No subscription.
            </p>
          </div>

          {/* Live stats */}
          {stats && (
            <div className="flex items-center justify-center gap-8 md:gap-14 mt-12">
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

      {/* ─── App Preview (Browser Mockup) ─── */}
      <FadeIn className="px-4 pb-16 md:pb-24">
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
          >
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: "#ff5f56" }} />
                <div className="w-3 h-3 rounded-full" style={{ background: "#ffbd2e" }} />
                <div className="w-3 h-3 rounded-full" style={{ background: "#27c93f" }} />
              </div>
              <div
                className="flex-1 mx-4 px-3 py-1 rounded-md text-xs text-center"
                style={{ background: "var(--bg)", color: "var(--text-muted)" }}
              >
                loops.ie
              </div>
            </div>
            {/* App preview content */}
            <div style={{ background: "var(--bg-card)" }}>
              <img
                src="/api/og"
                alt="LOOPS app — discover cycling routes worldwide"
                className="w-full"
                style={{ aspectRatio: "1200/630", objectFit: "cover" }}
              />
            </div>
          </div>
          <p className="text-center text-xs mt-4" style={{ color: "var(--text-muted)" }}>
            Discover verified cycling routes near you
          </p>
        </div>
      </FadeIn>

      {/* ─── Value Props ─── */}
      <section className="px-4 pb-16 md:pb-24">
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
              ),
              title: "Human-Curated Routes",
              desc: "Every route uploaded by a real rider who's actually ridden it. No algorithm-generated paths down motorways.",
            },
            {
              icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              ),
              title: "Your Data, Your GPX",
              desc: "Download any route as a GPX file, instantly. No paywall. No subscription. It's your data.",
            },
            {
              icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              ),
              title: "Free Forever",
              desc: "No premium tier. No feature gates. No \"pay to see your own stats\". Every feature is free.",
            },
          ].map((prop, i) => (
            <FadeIn key={prop.title} delay={i * 100}>
              <div
                className="rounded-2xl p-6 text-center h-full transition-all duration-200 hover:border-[rgba(200,255,0,0.3)]"
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
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {prop.desc}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ─── Featured Routes Preview ─── */}
      {stats?.featuredRoutes && stats.featuredRoutes.length > 0 && (
        <FadeIn className="px-4 pb-16 md:pb-24">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-center font-extrabold text-sm uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Popular Routes
            </h2>
            <p className="text-center text-xs mb-8" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
              Here&apos;s a taste of what&apos;s waiting inside
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {stats.featuredRoutes.map((route) => {
                const diff = DIFF_COLORS[route.difficulty] || DIFF_COLORS.easy;
                return (
                  <div
                    key={route.id}
                    className="rounded-xl overflow-hidden relative group cursor-pointer"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                    onClick={handleGoogleLogin}
                  >
                    {/* Cover */}
                    <div className="aspect-[16/9] relative overflow-hidden" style={{ background: "var(--bg-raised)" }}>
                      <img
                        src={route.cover_photo ? `/photos/${route.cover_photo}` : `/api/og/${route.id}`}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {/* Blur overlay */}
                      <div
                        className="absolute inset-0 flex items-center justify-center backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.5)" }}
                      >
                        <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg" style={{ background: "var(--accent)", color: "var(--bg)" }}>
                          Sign in to explore
                        </span>
                      </div>
                      {/* Badges */}
                      <div className="absolute top-2 right-2 flex gap-1">
                        <span
                          className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                          style={{ color: diff.color, background: diff.bg, backdropFilter: "blur(4px)" }}
                        >
                          {route.difficulty}
                        </span>
                      </div>
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-bold text-sm truncate" style={{ color: "var(--text)" }}>{route.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        <span className="font-bold" style={{ color: "var(--accent)" }}>{route.distance_km} km</span>
                        <span>|</span>
                        <span className="capitalize">{route.surface_type}</span>
                        <span>|</span>
                        <span>{route.country}</span>
                      </div>
                      {route.avg_score > 0 && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="var(--warning)">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                          <span className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>{route.avg_score.toFixed(1)}</span>
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>({route.rating_count})</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Community stats */}
            {stats.community && (
              <div className="flex items-center justify-center gap-6 mt-8">
                {[
                  { value: stats.community.riders, label: "Riders" },
                  { value: stats.community.comments, label: "Comments" },
                  { value: stats.community.ratings, label: "Ratings" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-sm font-extrabold" style={{ color: "var(--text-secondary)" }}>
                      <AnimatedNumber target={s.value} duration={1200} />
                    </p>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FadeIn>
      )}

      {/* ─── How It Works ─── */}
      <FadeIn className="px-4 pb-16 md:pb-24">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-center font-extrabold text-sm uppercase tracking-wider mb-8" style={{ color: "var(--text-muted)" }}>
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Find a loop", desc: "Search by location, distance, surface, or discipline" },
              { step: "2", title: "Download the GPX", desc: "One tap export to Strava, Komoot, Wahoo, or Garmin" },
              { step: "3", title: "Ride & share back", desc: "Upload your own favourites for the community" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 font-extrabold text-sm"
                  style={{ background: "rgba(200, 255, 0, 0.1)", color: "var(--accent)", border: "1px solid rgba(200, 255, 0, 0.2)" }}
                >
                  {item.step}
                </div>
                <h3 className="font-bold text-sm mb-1" style={{ color: "var(--text)" }}>{item.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ─── Why LOOPS (comparison) ─── */}
      <FadeIn className="px-4 pb-16 md:pb-24">
        <div className="max-w-xl mx-auto">
          <h2 className="text-center font-extrabold text-sm uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Tired of the paywall?
          </h2>
          <p className="text-center text-xs mb-8" style={{ color: "var(--text-muted)" }}>
            We built LOOPS because route discovery shouldn&apos;t cost a subscription.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {[
              { them: "Routes behind a paywall", us: "Every route free to download" },
              { them: "AI routes down busy roads", us: "Human-ridden, human-shared" },
              { them: "Locked into one ecosystem", us: "Open GPX — use any app" },
              { them: "Bloated with features you don't use", us: "Simple: find loops, ride loops" },
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

      {/* ─── Works With ─── */}
      <FadeIn className="px-4 pb-16 md:pb-24">
        <div className="max-w-md mx-auto text-center">
          <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: "var(--text-muted)" }}>
            No lock-in — works with everything
          </p>
          <p className="text-xs mb-5" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
            Download GPX and load it into whatever you ride with
          </p>
          <div className="flex items-center justify-center gap-8">
            {[
              { name: "Strava", svg: <svg className="w-8 h-8" viewBox="0 0 24 24" fill="var(--strava)"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg> },
              { name: "Komoot", svg: <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="#6AA127" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5" fill="#6AA127" stroke="none" /></svg> },
              { name: "Wahoo", svg: <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><path d="M7 12l2.5 4 2.5-6 2.5 6L17 12" strokeLinecap="round" strokeLinejoin="round" /></svg> },
              { name: "Garmin", svg: <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 2l-1 2m9-2l1 2" strokeLinecap="round" /></svg> },
            ].map((app) => (
              <div key={app.name} className="flex flex-col items-center gap-1.5">
                {app.svg}
                <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>{app.name}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ─── Bottom CTA ─── */}
      <section className="px-4 pb-20 md:pb-28">
        <FadeIn>
          <div className="max-w-sm mx-auto text-center">
            <h2 className="font-extrabold text-lg uppercase tracking-wider mb-2" style={{ color: "var(--text)" }}>
              Ready to ride?
            </h2>
            <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
              Join riders who are done paying to discover routes.
            </p>
            <GoogleButton />
            <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
              No credit card. No spam. No paywall. Just loops.
            </p>
          </div>
        </FadeIn>
      </section>

      {/* ─── Footer ─── */}
      <footer className="px-4 py-10 border-t" style={{ borderColor: "var(--border)", background: "var(--bg-raised)" }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="logo-mark text-lg" style={{ color: "var(--text)" }}>LOOPS</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Built by riders, for riders</span>
            </div>
            <div className="flex items-center gap-5 text-xs" style={{ color: "var(--text-muted)" }}>
              <a href="mailto:hello@loops.ie" className="hover:opacity-80 transition-opacity">Contact</a>
              <a href="/privacy" className="hover:opacity-80 transition-opacity">Privacy</a>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 mt-6 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
              &copy; 2026 LOOPS. All rights reserved.
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
              Made in Ireland
            </p>
          </div>
        </div>
      </footer>
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
