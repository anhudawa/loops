import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = { title: "Route not found — LOOPS", robots: { index: false } };

/** A route link that leads nowhere: say so, and keep the header (log in, plan, routes). */
export default function RouteNotFound() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-2" style={{ color: "var(--text)" }}>Route not found</h1>
        <p className="text-lg mb-8" style={{ color: "var(--text-muted)" }}>
          This loop doesn&apos;t exist — yet.
        </p>
        <Link
          href="/"
          className="btn-accent px-8 py-3 min-h-[44px] inline-flex items-center rounded-xl font-bold text-sm uppercase tracking-wider"
        >
          Back to exploring
        </Link>
      </div>
    </div>
  );
}
