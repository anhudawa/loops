"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface Stats {
  routes: number;
  totalKm: number;
  counties: number;
}

function AnimatedNumber({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [current, setCurrent] = useState(0);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) return;
    startTime.current = null;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [target, duration]);

  return <>{current.toLocaleString()}</>;
}

export default function HeroSection({ onExplore }: { onExplore: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  return (
    <section
      className="min-h-[85vh] flex flex-col items-center justify-center relative overflow-hidden px-4"
      style={{ background: "var(--bg)" }}
    >
      {/* Background effects */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(200, 255, 0, 0.06) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, var(--text-muted) 1px, transparent 0)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 text-center max-w-3xl mx-auto">
        {/* Logo */}
        <div className="mb-6">
          <span
            className="logo-mark text-gradient"
            style={{ fontSize: "clamp(4rem, 12vw, 8rem)" }}
          >
            LOOPS
          </span>
        </div>

        {/* Tagline */}
        <h1
          className="font-extrabold uppercase tracking-tight leading-[0.95] mb-4"
          style={{
            fontSize: "clamp(2rem, 6vw, 3.5rem)",
            color: "var(--text)",
          }}
        >
          Find Your Gravel
        </h1>
        <p
          className="text-base md:text-lg mb-10 max-w-md mx-auto"
          style={{ color: "var(--text-muted)" }}
        >
          Discover and share the best gravel cycling loops across Ireland. Built by riders, for riders.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 mb-14">
          <button
            onClick={onExplore}
            className="btn-accent px-8 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider"
          >
            Explore Loops
          </button>
          <Link
            href="/upload"
            className="px-8 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:border-[rgba(200,255,0,0.5)]"
            style={{
              border: "1px solid var(--border-light)",
              color: "var(--text-secondary)",
            }}
          >
            Share a Loop
          </Link>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex items-center justify-center gap-8 md:gap-14">
            {[
              { value: stats.routes, label: "Routes" },
              { value: stats.totalKm, label: "Km Mapped" },
              { value: stats.counties, label: "Counties" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p
                  className="text-3xl md:text-4xl font-extrabold"
                  style={{ color: "var(--accent)" }}
                >
                  <AnimatedNumber target={stat.value} />
                </p>
                <p
                  className="text-[10px] md:text-xs uppercase tracking-wider font-bold mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scroll indicator */}
      <button
        onClick={onExplore}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 hero-bounce"
        style={{ color: "var(--text-muted)" }}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
    </section>
  );
}
