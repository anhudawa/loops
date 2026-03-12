"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "invalid_or_expired") setError("Link expired or already used. Request a new one.");
    if (err === "missing_token") setError("Invalid sign-in link. Request a new one.");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send link");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  const inputStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <span className="logo-mark text-4xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
          <p className="mt-3" style={{ color: "var(--text-muted)" }}>Sign in to share and discover gravel loops</p>
        </div>

        {/* Form / Success */}
        <div className="rounded-2xl p-8" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(200, 255, 0, 0.1)" }}>
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-extrabold tracking-tight mb-2" style={{ color: "var(--text)" }}>Check your email</h2>
              <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
                We sent a sign-in link to
              </p>
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
                  Email address <span style={{ color: "#ff3355" }}>*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-lg px-4 py-2.5 text-sm transition-colors"
                  style={inputStyle}
                />
              </div>

              {error && (
                <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(255, 51, 85, 0.1)", border: "1px solid rgba(255, 51, 85, 0.3)", color: "#ff3355" }}>
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

        {/* Browse link */}
        <p className="text-center mt-6 text-sm" style={{ color: "var(--text-muted)" }}>
          Just want to browse?{" "}
          <Link href="/" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
            View loops without signing in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
