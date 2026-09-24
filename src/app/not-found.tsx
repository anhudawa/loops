import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

// Its own tab title (not the home page's), and kept out of search results.
export const metadata: Metadata = {
  title: "Page not found — LOOPS",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <span className="logo-mark text-gradient text-5xl mb-6">LOOPS</span>
        <h1 className="text-6xl font-extrabold mb-2" style={{ color: "var(--text)" }}>404</h1>
        <p className="text-lg mb-8" style={{ color: "var(--text-muted)" }}>
          This loop doesn&apos;t exist — yet.
        </p>
        <Link
          href="/"
          className="btn-accent px-8 py-3 min-h-[44px] inline-flex items-center rounded-xl font-bold text-sm uppercase tracking-wider"
        >
          Back to exploring
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-x-6 mt-4">
          <Link href="/cycling" className="inline-flex items-center min-h-[44px] text-sm font-bold underline underline-offset-2" style={{ color: "var(--text-secondary)" }}>
            Browse destinations
          </Link>
          <Link href="/generate" className="inline-flex items-center min-h-[44px] text-sm font-bold underline underline-offset-2" style={{ color: "var(--text-secondary)" }}>
            Plan a ride
          </Link>
        </div>
      </div>
    </div>
  );
}
