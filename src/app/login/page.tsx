"use client";

import { useState, useEffect, Suspense, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import GoogleButton from "@/components/GoogleButton";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { gateHeading, isPrivatePath } from "./private-paths";

/* ── Login page — logging in, nothing else ── */
function LoginPage() {
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();
  const [manualError, setManualError] = useState("");
  // Newsletter opt-in — unticked by default. A ref mirrors it so every
  // "Sign in with Google" CTA (there are several) reads the current choice.
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const newsletterOptInRef = useRef(false);

  // Derive URL-sourced errors directly — no effect needed
  const paramErr = searchParams.get("error");
  const urlError =
    paramErr === "google_failed"
      ? "Couldn't log in with Google. Please try again."
      : paramErr === "account_suspended"
        ? "This account has been suspended."
        : paramErr === "link_expired"
          ? "That sign-in link has expired or was already used — request a new one."
          : "";
  const error = manualError || urlError;

  // Arriving from a ride/route page (e.g. "Sign up to download GPX"): say
  // why they're here and offer the way back. Only same-site paths count.
  // "Log in" (default) vs "Sign up" (mode=signup): a returning rider must
  // land on a login page, not a marketing "Get started" page.
  const isSignup = searchParams.get("mode") === "signup";
  const [lastMethod, setLastMethod] = useState<"google" | "email" | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem("loops:lastSignIn");
      if (v === "google" || v === "email") setLastMethod(v); // eslint-disable-line react-hooks/set-state-in-effect
    } catch { /* private mode */ }
  }, []);
  const remember = (m: "google" | "email") => { try { localStorage.setItem("loops:lastSignIn", m); } catch { /* noop */ } };
  // Only same-site paths are honoured anywhere (see safeRedirectPath).
  const redirectParam = safeRedirectPath(searchParams.get("redirect"));
  const returnTo = redirectParam;
  const routeMatch = returnTo?.match(/^\/(ride|routes)\/([^/?#]+)(?:[?#]|$)/);
  const returnKind = routeMatch ? (routeMatch[1] === "ride" ? "ride" : "route") : null;
  const returnRouteId = routeMatch && routeMatch[2] !== "country" ? routeMatch[2] : null;
  // Came for the GPX (the redirect carries gpx=1) or just signing in?
  const wantsGpx = !!returnTo && /[?&]gpx=1(?:&|$)/.test(returnTo);
  // The way back never carries gpx=1: a rider who backs out (or copies that
  // link) must not trigger an automatic download later.
  const backHref = returnTo ? returnTo.replace(/([?&])gpx=1(&|$)/, (_, a, b) => (b ? a : "")).replace(/[?&]$/, "") : null;
  // Heading: what the rider is logging in for (the GPX, planning a ride, or
  // just logging in). The same button also creates an account, said below.
  const gated = returnTo ? gateHeading(returnTo) : null;
  const heading = wantsGpx ? "Log in to get the GPX" : isSignup ? "Create your free account" : gated ?? "Log in to LOOPS";
  // A way back for any same-site page, unless it is a private one (that
  // would only bounce the rider straight back here).
  const showBack = !!backHref && !isPrivatePath(backHref) && !returnRouteId;
  const [returnRouteName, setReturnRouteName] = useState<string | null>(null);
  useEffect(() => {
    if (!returnRouteId) return;
    let cancelled = false;
    fetch(`/api/routes/${encodeURIComponent(returnRouteId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const name = d?.data?.name ?? d?.name;
        if (!cancelled && typeof name === "string" && name.trim()) setReturnRouteName(name.trim());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [returnRouteId]);

  // Email (magic link) sign-in — shown only when the server can send mail.
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/magic").then((r) => r.json()).then((d) => setEmailEnabled(!!d?.data?.enabled)).catch(() => {});
  }, []);
  const handleEmailLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    try { localStorage.setItem("loops:lastSignIn", "email"); } catch { /* noop */ }
    setEmailError(null);
    const redirect = safeRedirectPath(searchParams.get("redirect"));
    if (redirect) document.cookie = `login_redirect=${encodeURIComponent(redirect)}; path=/; max-age=1800; SameSite=Lax`;
    if (newsletterOptInRef.current) document.cookie = `newsletter_optin=1; path=/; max-age=1800; SameSite=Lax`;
    setEmailState("sending");
    try {
      const res = await fetch("/api/auth/magic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, redirect }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setEmailError(body?.error ?? "Couldn't send the email."); setEmailState("idle"); return; }
      setEmailState("sent");
    } catch {
      setEmailError("Network hiccup — try again.");
      setEmailState("idle");
    }
  }, [email, searchParams]);

  const handleGoogleLogin = useCallback(async (redirectOverride?: string) => {
    try {
      // Store redirect URL in a cookie so the OAuth callback can send the
      // rider where they were headed — e.g. straight into /generate?q=…
      const redirect = safeRedirectPath(redirectOverride ?? searchParams.get("redirect"));
      if (redirect) {
        document.cookie = `login_redirect=${encodeURIComponent(redirect)}; path=/; max-age=600; SameSite=Lax`;
      }
      // Carry the (optional, unticked-by-default) newsletter opt-in through
      // OAuth via a short-lived cookie the callback reads on a new signup.
      if (newsletterOptInRef.current) {
        document.cookie = `newsletter_optin=1; path=/; max-age=600; SameSite=Lax`;
      }
      const res = await fetch("/api/auth/google");
      const data = await res.json();
      if (!data.url) { setManualError("Couldn't log in with Google. Please try again."); return; }
      window.location.href = data.url;
    } catch {
      setManualError("Couldn't log in with Google. Please try again.");
    }
  }, [searchParams]);

  // Newsletter opt-in: offered to anyone who may be creating an account
  // (not to a rider we know has signed in here before).
  const offerNewsletter = isSignup || !lastMethod;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Just the logo — the way home. Nothing else competes with logging in. */}
      <nav className="px-4 md:px-6 py-3">
        <div className="max-w-5xl mx-auto">
          <Link href="/" aria-label="LOOPS home" className="min-h-[44px] inline-flex items-center">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
        </div>
      </nav>

      <main id="main-content" className="flex-1 px-4 pt-10 pb-16">
        <div className="max-w-sm mx-auto">
          <h1 className="font-extrabold tracking-tight text-3xl" style={{ color: "var(--text)" }}>
            {heading}
          </h1>
          {returnRouteId && returnTo ? (
            <div className="mt-2 text-sm" data-testid="login-return-context">
              {returnRouteName && (
                <p style={{ color: "var(--text-secondary)" }}>
                  {wantsGpx ? "For " : "Then we'll take you back to "}
                  <span className="font-bold" style={{ color: "var(--text)" }}>{returnRouteName}</span>.
                </p>
              )}
              <a href={backHref ?? returnTo} className="inline-flex items-center min-h-[44px] text-xs font-bold underline" style={{ color: "var(--text-muted)" }}>
                ← Back to the {returnKind}
              </a>
            </div>
          ) : showBack && backHref ? (
            <a href={backHref} className="inline-flex items-center min-h-[44px] mt-1 text-xs font-bold underline" style={{ color: "var(--text-muted)" }}>
              ← Back
            </a>
          ) : null}

          <div className="mt-6">
            {error && <div className="alert-error mb-3 text-sm" role="alert">{error}</div>}
            {user ? (
              // Already signed in (bookmark, stale tab): say so, don't ask again.
              <div className="text-sm" data-testid="login-signed-in">
                <p style={{ color: "var(--text)" }}>
                  You&apos;re logged in as <strong>{user.name || user.email}</strong>.
                </p>
                <Link
                  href={returnTo ?? "/"}
                  className="btn-accent mt-4 w-full inline-flex items-center justify-center min-h-[48px] rounded-xl font-bold text-sm uppercase tracking-wider"
                >
                  Continue
                </Link>
                <button
                  onClick={() => { void logout(); }}
                  className="mt-2 inline-flex items-center min-h-[44px] text-xs font-bold underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Not you? Log out
                </button>
              </div>
            ) : (<>
              <GoogleButton onClick={() => { remember("google"); handleGoogleLogin(); }} />
              {lastMethod && (
                <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                  Last time you used {lastMethod === "google" ? "Google" : "an email link"}.
                </p>
              )}
              {emailEnabled && (
                emailState === "sent" ? (
                  <p className="text-sm mt-5" style={{ color: "var(--text)" }} role="status">
                    Check your email — we sent a sign-in link to <strong>{email}</strong>. It works for 15 minutes.
                  </p>
                ) : (
                  <form onSubmit={handleEmailLogin} className="mt-5">
                    <label htmlFor="login-email" className="block text-xs mb-2" style={{ color: "var(--text-muted)" }}>Or email me a sign-in link:</label>
                    <div className="flex gap-2">
                      <input
                        id="login-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        className="flex-1 min-w-0 px-3 py-3 min-h-[44px] rounded-xl text-sm"
                        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                      />
                      <button
                        type="submit"
                        disabled={emailState === "sending"}
                        className="px-4 py-3 min-h-[44px] rounded-xl text-sm font-bold disabled:opacity-50"
                        style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
                      >
                        {emailState === "sending" ? "Sending…" : "Email me"}
                      </button>
                    </div>
                    {emailError && <p className="text-xs mt-2" style={{ color: "#f5a524" }}>{emailError}</p>}
                  </form>
                )
              )}
              {offerNewsletter && (
                <label className="flex items-start gap-2 mt-3 py-1.5 min-h-[44px] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newsletterOptIn}
                    onChange={(e) => { setNewsletterOptIn(e.target.checked); newsletterOptInRef.current = e.target.checked; }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    style={{ minWidth: 16, minHeight: 16 }}
                  />
                  <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                    Also send me <span style={{ color: "var(--text)" }}>the Saturday Spin</span>, the free weekly cycling newsletter.
                  </span>
                </label>
              )}
              <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>
                {isSignup ? (
                  <>Free. No credit card.{" "}
                    <a href={`/login${redirectParam ? `?redirect=${encodeURIComponent(redirectParam)}` : ""}`} className="underline font-bold inline-flex items-center min-h-[44px]">Already have an account? Log in</a></>
                ) : (
                  <>New to LOOPS? The same button creates your free account.</>
                )}
              </p>
              <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                By continuing you agree to the <Link href="/terms" className="underline">Terms</Link> and{" "}
                <Link href="/privacy" className="underline">Privacy policy</Link>.
              </p>
            </>)}
          </div>
        </div>
      </main>
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
