"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <span className="logo-mark text-gradient text-5xl mb-6">LOOPS</span>
      <h1 className="text-2xl font-extrabold mb-2" style={{ color: "var(--text)" }}>Something went wrong</h1>
      <p className="text-sm mb-8 max-w-md text-center" style={{ color: "var(--text-muted)" }}>
        Admin panel hit an error. Try again or head back to the homepage.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="btn-accent px-6 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-6 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider hover:opacity-80"
          style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
