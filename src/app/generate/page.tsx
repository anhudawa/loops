"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";
import RoutePreviewSvg from "@/components/RoutePreviewSvg";

import RideDisclaimer from "@/components/RideDisclaimer";
import ShareButton from "@/components/ShareButton";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { useGeolocation } from "@/lib/useGeolocation";

// ── Types mirror the /api/generate-route unified response ───────────────────

interface IntervalSegment {
  start_index: number;
  end_index: number;
  length_km: number;
  avg_gradient_pct: number;
  max_gradient_pct: number;
  suitable_zones: string[];
}

interface WorkoutFit {
  fits: boolean;
  interval_segments: Array<{
    interval_index: number;
    rep_index: number;
    segment: IntervalSegment;
  }>;
  candidate_segments: IntervalSegment[];
}

interface LibraryCandidate {
  source: "library";
  route_id: string;
  name: string;
  description: string | null;
  coordinates: [number, number][];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  discipline: "road";
  county: string;
  country: string;
  match_score: number;
  distance_from_start_km: number;
  workout_fit?: WorkoutFit;
  wind_note?: string;
}

type Candidate = LibraryCandidate;

interface Interpreted {
  distance_km: number;
  duration_minutes?: number;
  discipline: "road" | "gravel" | "mtb";
  elevation_preference: "flat" | "rolling" | "hilly" | "mountainous" | "any";
  region?: string;
  country: string;
  is_workout: boolean;
  workout_summary?: string;
  wind_strategy?: "tailwind_home" | "tailwind_out" | "headwind_out";
  cafe_stop?: boolean;
}

interface GenerateResponse {
  interpreted: Interpreted;
  candidates: Candidate[];
}

const EXAMPLES = [
  "2 hour road loop from Dublin on quiet lanes",
  "90 min Zone 2 road ride from Bray",
  "2 x 20 min threshold intervals near Blessington",
  "3 x 12 min sweet spot on quiet roads near Dublin",
  "60 km scenic road loop from Dún Laoghaire",
];

export default function GeneratePage() {
  return (
    <Suspense>
      <GenerateContent />
    </Suspense>
  );
}

function GenerateContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interpreted, setInterpreted] = useState<Interpreted | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [betaAccess, setBetaAccess] = useState<boolean | null>(null);

  // Run a homepage-handed-off ?q= prompt exactly once.
  const autoRanRef = useRef(false);
  // First result card — scrolled into view when candidates land so the rider
  // sees the answer without hunting (mobile especially).
  const resultsRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceInput();
  const geo = useGeolocation();

  useEffect(() => {
    if (!authLoading && !user) {
      // Keep the rider's question through the login round-trip.
      const q = searchParams.get("q");
      const target = q ? `/generate?q=${encodeURIComponent(q)}` : "/generate";
      router.push(`/login?redirect=${encodeURIComponent(target)}`);
    }
  }, [user, authLoading, router, searchParams]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/beta/application")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setBetaAccess(data.access === true))
      .catch(() => setBetaAccess(false));
  }, [user]);

  // Homepage answer machine hands off via /generate?q=… — prefill the
  // prompt and, when it's substantial enough, run the library search immediately.
  useEffect(() => {
    if (authLoading || !user || betaAccess !== true || autoRanRef.current) return;
    const q = searchParams.get("q")?.trim() ?? "";
    if (!q) return;
    autoRanRef.current = true;
    setPrompt(q);
    if (q.length >= 10) runSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, betaAccess, searchParams]);

  // When results land, bring the first one into view. The submit lives in a
  // sticky bar inside the input card, so on mobile the rider would otherwise
  // stay parked on the input with the answer rendered off-screen below.
  useEffect(() => {
    if (!loading && candidates.length > 0 && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading, candidates]);

  function toggleVoice() {
    if (voice.listening) {
      voice.stop();
    } else {
      voice.start((text) => setPrompt(text));
    }
  }

  async function toggleLocation() {
    if (useMyLocation) {
      setUseMyLocation(false);
      return;
    }
    const coords = await geo.request();
    if (coords) setUseMyLocation(true);
  }

  async function handleSubmit(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    if (voice.listening) voice.stop();
    const trimmed = prompt.trim();
    if (trimmed.length < 10) {
      setError({ message: "Describe the route you want in a bit more detail.", code: "TOO_SHORT" });
      return;
    }
    await runSearch(trimmed);
  }

  // Retry the last submitted prompt — wired to the Retry button on errors so a
  // timeout or network blip is never a dead end.
  function retryLast() {
    if (submittedPrompt) runSearch(submittedPrompt);
  }

  async function runSearch(trimmed: string) {
    setLoading(true);
    setError(null);
    setCandidates([]);
    setInterpreted(null);
    setSubmittedPrompt(trimmed);

    // Send current location when the rider opted in — used as the start
    // point if their prompt doesn't name a place.
    const origin = useMyLocation ? geo.coords : null;

    // Cap the wait at 55s and turn a stalled search into an actionable,
    // hang into an actionable, retryable error instead of an endless spinner.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

    try {
      const res = await fetch("/api/generate-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, ...(origin ? { origin } : {}) }),
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        setError({ message: body?.error ?? "Could not search the route library.", code: body?.code });
      } else {
        const data = body.data as GenerateResponse | Candidate[] | undefined;
        // Tolerate both the new { interpreted, candidates } shape and the
        // old array shape in case of a stale worker.
        if (data && !Array.isArray(data)) {
          setInterpreted(data.interpreted ?? null);
          setCandidates(data.candidates ?? []);
        } else {
          setCandidates(data ?? []);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setError({
          message: "The route search took longer than a minute.",
          code: "TIMEOUT",
        });
      } else {
        setError({
          message: err instanceof Error ? err.message : "Network error. Please try again.",
          code: "NETWORK",
        });
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  if (authLoading || !user || betaAccess === null) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!betaAccess) {
    return (
      <main className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>Invitation-only beta</p>
          <h1 className="text-3xl font-extrabold mb-3" style={{ color: "var(--text)" }}>Apply to search Irish routes</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            We are opening in small waves while the route evidence, coverage and review operation are proven.
          </p>
          <Link href="/beta" className="btn-accent inline-flex px-6 py-3 rounded-xl text-sm font-bold">Apply for beta access</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text)" }}>
            Plan a ride
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Search Ireland&apos;s human-ridden road loops by distance, duration,
            terrain or supported workout. Use your location or name an Irish
            starting area.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mb-8">
          <label htmlFor="plan-prompt" className="sr-only">
            Describe the ride you want
          </label>
          <div className="relative">
            <textarea
              id="plan-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // Enter submits (Shift+Enter keeps the newline) — matches the
                // mobile keyboard's Go/Search affordance so a tap actually does
                // something instead of inserting a blank line.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!loading) handleSubmit();
                }
              }}
              placeholder="e.g. 2 hour loop on country lanes with a few rolling hills"
              rows={3}
              maxLength={1000}
              disabled={loading}
              aria-describedby="plan-prompt-hint"
              className="w-full px-4 py-3 pr-14 rounded-2xl text-sm resize-none"
              style={{
                background: "var(--bg-card)",
                border: voice.listening ? "1px solid var(--accent)" : "1px solid var(--border)",
                color: "var(--text)",
                outline: "none",
              }}
            />
            {voice.supported && (
              <button
                type="button"
                onClick={toggleVoice}
                disabled={loading}
                aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
                aria-pressed={voice.listening}
                className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all"
                style={{
                  background: voice.listening ? "var(--accent)" : "var(--bg-raised)",
                  color: voice.listening ? "var(--bg)" : "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {voice.listening ? (
                  <span className="relative flex items-center justify-center">
                    <span
                      className="absolute w-9 h-9 rounded-full animate-ping"
                      style={{ background: "var(--accent)", opacity: 0.3 }}
                      aria-hidden="true"
                    />
                    <svg className="w-4 h-4 relative" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="7" y="7" width="10" height="10" rx="1.5" />
                    </svg>
                  </span>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>
            )}
          </div>
          <p id="plan-prompt-hint" className="sr-only">
            Describe distance or duration, terrain, starting point, and optionally a structured interval workout. You can also dictate with the microphone. Press Enter to search.
          </p>

          {voice.listening && (
            <p className="text-xs mt-2" style={{ color: "var(--accent)" }}>
              Listening… speak your route, then tap the mic to stop.
            </p>
          )}
          {voice.error && (
            <p className="text-xs mt-2" style={{ color: "#ff6b6b" }}>{voice.error}</p>
          )}

          {/* Primary submit — placed directly under the textarea so it's the
              first thing below the input on a 375px screen, and made sticky so
              it stays reachable above the on-screen keyboard while scrolling.
              This is the fix for "typed a prompt and nothing happened": the old
              layout buried this CTA below the examples and the location toggle,
              off-screen on mobile. */}
          <div className="sticky bottom-3 z-10 mt-3">
            <button
              type="submit"
              disabled={loading || prompt.trim().length < 10}
              aria-busy={loading}
              className="w-full min-h-[52px] py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
              }}
            >
              {loading && (
                <span
                  className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0"
                  aria-hidden="true"
                />
              )}
              {loading ? "Finding your route…" : "Find my route"}
            </button>
          </div>

          {/* Use my location toggle — the "I'm here now, give me a ride" path */}
          <button
            type="button"
            onClick={toggleLocation}
            disabled={loading || geo.loading}
            aria-pressed={useMyLocation}
            className="mt-3 inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-full transition-all min-h-[44px]"
            style={{
              background: useMyLocation ? "var(--accent-glow)" : "var(--bg-card)",
              border: `1px solid ${useMyLocation ? "var(--accent)" : "var(--border)"}`,
              color: useMyLocation ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {geo.loading ? "Locating…" : useMyLocation ? "Starting from my location" : "Start from my location"}
          </button>
          {geo.error && (
            <p className="text-xs mt-2" style={{ color: "#ff6b6b" }}>{geo.error}</p>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-full"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                {ex}
              </button>
            ))}
          </div>

          <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            Ireland road beta. Every result has been ridden by a person and independently reviewed.
          </p>
        </form>

        {error && (
          <ErrorPanel
            error={error}
            onRetry={submittedPrompt && error.code !== "TOO_SHORT" ? retryLast : undefined}
          />
        )}
        {error?.code === "PARSE_FAILED" && (
          <FallbackForm
            onSubmit={(text) => {
              setPrompt(text);
              runSearch(text);
            }}
          />
        )}

        {loading && (
          <div className="grid gap-4">
            <LoadingStages />
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl p-4 animate-pulse"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", height: 180 }}
              />
            ))}
          </div>
        )}

        {!loading && interpreted && (
          <InterpretedPanel interpreted={interpreted} />
        )}

        {!loading && candidates.length > 0 && (
          <div ref={resultsRef} style={{ scrollMarginTop: 16 }}>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Matched from our human-ridden library
            </h2>
            <div className="grid gap-4">
              {candidates.map((c, i) => (
                <CandidateCard key={i} candidate={c} />
              ))}
            </div>
            <RideDisclaimer />
          </div>
        )}

        {!loading && !error && candidates.length === 0 && submittedPrompt && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {interpreted?.is_workout
                ? "No current human-reviewed segment assessment fits that exact session. Try a different area or supported session — LOOPS will not infer interval safety from a map."
                : "No human-ridden match yet. Try a different area or distance — LOOPS will not invent a route to fill the gap."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Interpreted panel ─────────────────────────────────────────────────────────

function InterpretedPanel({ interpreted }: { interpreted: Interpreted }) {
  const duration = interpreted.duration_minutes
    ? formatDuration(interpreted.duration_minutes)
    : null;

  const terrainLabel =
    interpreted.elevation_preference === "any"
      ? null
      : interpreted.elevation_preference;

  const locationLabel = interpreted.region
    ? `from ${interpreted.region}`
    : `in ${interpreted.country}`;

  const windLabel = interpreted.wind_strategy
    ? {
        tailwind_home: "wind-planned for the run home",
        tailwind_out: "tailwind to start",
        headwind_out: "into the wind first",
      }[interpreted.wind_strategy]
    : null;

  const bits = [
    duration && `${duration} (~${interpreted.distance_km} km)`,
    !duration && `${interpreted.distance_km} km`,
    interpreted.discipline,
    terrainLabel,
    locationLabel,
    windLabel,
    interpreted.cafe_stop && "café stop",
  ].filter(Boolean);

  // Prominent intent confirmation (deconstruction A1 / our NL wedge): show the
  // rider we understood their request before they commit to reading results.
  return (
    <div
      className="mb-5 rounded-2xl p-4"
      style={{
        background: "var(--accent-glow)",
        border: "1px solid var(--accent)",
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>
        Here&apos;s what we understood
      </p>
      <p className="text-base font-bold" style={{ color: "var(--text)" }}>
        {bits.join(" · ")}
      </p>
      {interpreted.is_workout && interpreted.workout_summary && (
        <p className="text-sm mt-1 font-bold" style={{ color: "var(--accent)" }}>
          Workout: {interpreted.workout_summary}
        </p>
      )}
      <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
        Not quite right? Edit your request above and search again.
      </p>
    </div>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Error panel ───────────────────────────────────────────────────────────────

function ErrorPanel({
  error,
  onRetry,
}: {
  error: { message: string; code?: string };
  onRetry?: () => void;
}) {
  const hint = (() => {
    switch (error.code) {
      case "FEATURE_DISABLED":
        return "Route search is not yet enabled on this environment.";
      case "UNSUPPORTED_DISCIPLINE":
        return "The first LOOPS beta covers road cycling in Ireland only.";
      case "UNSUPPORTED_MARKET":
        return "Search an Irish starting area for now.";
      case "BETA_ACCESS_REQUIRED":
        return "The Ireland beta is invitation-only while we validate route trust and usefulness.";
      case "NO_WORKOUT_MATCH":
        return "Try a shorter interval, a different zone, or starting from a different location.";
      case "NO_ROUTES_FOUND":
        return "Try a different distance or location in Ireland.";
      case "GEOCODE_FAILED":
        return "Name a town or landmark — e.g. 'from Blessington' or 'near Dalkey'.";
      case "TIMEOUT":
        return "Give it another go, or try a more specific Irish starting area.";
      case "NETWORK":
        return "Check your connection and try again — your request is still here.";
      case "RATE_LIMITED":
        return "You've asked a few times in a row — give it a minute and try again.";
      default:
        return null;
    }
  })();

  // An honest "no" is a product feature, not a failure. Decline codes get
  // a calm, on-brand treatment (accent, not danger-red) so the moment that
  // proves our honesty positioning never looks like a crash.
  const isDecline =
    error.code === "NO_WORKOUT_MATCH" ||
    error.code === "NO_ROUTES_FOUND" ||
    error.code === "BETA_ACCESS_REQUIRED" ||
    error.code === "UNSUPPORTED_DISCIPLINE" ||
    error.code === "UNSUPPORTED_MARKET" ||
    error.code === "GEOCODE_FAILED";

  return (
    <div
      role="alert"
      className="mb-6 rounded-2xl p-4"
      style={{
        background: isDecline ? "var(--bg-card)" : "rgba(255, 80, 80, 0.08)",
        border: isDecline
          ? "1px solid var(--accent)"
          : "1px solid rgba(255, 80, 80, 0.3)",
      }}
    >
      <p
        className="text-sm font-bold"
        style={{ color: isDecline ? "var(--text)" : "#ff6b6b" }}
      >
        {error.message}
      </p>
      {isDecline && (
        <p className="text-[11px] mt-1 font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          We won&apos;t serve a route we can&apos;t stand over
        </p>
      )}
      {hint && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
      {error.code === "BETA_ACCESS_REQUIRED" && (
        <Link
          href="/beta"
          className="mt-3 inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl text-sm font-bold uppercase tracking-wider"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          Apply for beta access
        </Link>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-bold uppercase tracking-wider"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          Try again
        </button>
      )}
    </div>
  );
}

// ── Fallback form ─────────────────────────────────────────────────────────────

/**
 * Structured fallback when natural-language parsing fails (launch spec
 * resilience: fall back to a form instead of a dead end). Composes a
 * clean prompt from the fields and reruns the library search.
 */
function FallbackForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [hours, setHours] = useState("2");
  const [terrain, setTerrain] = useState("rolling");
  const [place, setPlace] = useState("");

  const selectStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  } as const;

  return (
    <form
      className="mb-6 rounded-2xl p-4 grid gap-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onSubmit={(e) => {
        e.preventDefault();
        const placePart = place.trim() ? ` from ${place.trim()}` : "";
        onSubmit(
          `${hours} hour road loop, ${terrain} terrain${placePart}`
        );
      }}
    >
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        Quick form
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Hours
          <select value={hours} onChange={(e) => setHours(e.target.value)} className="w-full mt-1 rounded-lg px-2 py-2 text-sm" style={selectStyle}>
            {["1", "1.5", "2", "3", "4", "5"].map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Terrain
          <select value={terrain} onChange={(e) => setTerrain(e.target.value)} className="w-full mt-1 rounded-lg px-2 py-2 text-sm" style={selectStyle}>
            <option value="flat">Flat</option>
            <option value="rolling">Rolling</option>
            <option value="hilly">Hilly</option>
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Start (optional)
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="e.g. Skerries"
            className="w-full mt-1 rounded-lg px-2 py-2 text-sm"
            style={selectStyle}
          />
        </label>
      </div>
      <button
        type="submit"
        className="justify-self-start font-bold text-sm px-4 py-2 rounded-lg"
        style={{ background: "var(--accent)", color: "var(--bg)" }}
      >
        Find me a route
      </button>
    </form>
  );
}

// ── Full-screen route viewer ──────────────────────────────────────────────────

const RouteViewerMap = dynamic(() => import("@/components/RouteViewerMap"), { ssr: false });

function RouteViewerModal({
  coordinates,
  title,
  stats,
  onClose,
}: {
  coordinates: [number, number][];
  title: string;
  stats: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col"
      style={{ background: "var(--bg)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg font-bold"
          style={{ color: "var(--text)" }}
          aria-label="Close map"
        >
          ✕
        </button>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>{title}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{stats}</p>
        </div>
      </div>
      <div className="flex-1">
        <RouteViewerMap coordinates={coordinates} />
      </div>
    </div>
  );
}

// ── Loading stages ────────────────────────────────────────────────────────────

/**
 * Honest progress narration while the reviewed route library is searched.
 */
const LOADING_STAGES = [
  { at: 0, label: "Reading your request…" },
  { at: 2000, label: "Searching human-ridden Irish routes…" },
  { at: 4500, label: "Checking ride and review status…" },
  { at: 8000, label: "Matching distance, terrain and session…" },
  { at: 12000, label: "Ranking the closest reviewed loops…" },
];

function LoadingStages() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = LOADING_STAGES.map((s, i) =>
      setTimeout(() => setStage(i), s.at)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Big, unmissable progress card for the slow path.
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--accent)" }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-block w-6 h-6 rounded-full border-[3px] border-t-transparent animate-spin shrink-0"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          aria-hidden="true"
        />
        <p className="text-base font-bold" style={{ color: "var(--text)" }}>
          {LOADING_STAGES[stage].label}
        </p>
      </div>
      <p className="text-sm mt-3" style={{ color: "var(--text-muted)" }}>
        We only return the exact, current version of routes that have been ridden
        and independently reviewed.
      </p>
    </div>
  );
}

// ── Candidate card ────────────────────────────────────────────────────────────

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const [viewing, setViewing] = useState(false);

  const workoutFit = candidate.workout_fit;
  const highlights = workoutFit?.fits
    ? workoutFit.interval_segments.map((a) => ({
        start_index: a.segment.start_index,
        end_index: a.segment.end_index,
        label: `Interval ${a.interval_index + 1}.${a.rep_index + 1}`,
      }))
    : [];

  return (
    <article
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 p-4">
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="block w-full sm:w-auto text-left cursor-pointer hover:opacity-90"
          aria-label="View this route on the map"
        >
          <span className="block sm:hidden">
            <RoutePreviewSvg
              coordinates={candidate.coordinates}
              highlights={highlights}
              width={640}
              height={300}
              className="w-full"
            />
          </span>
          <span className="hidden sm:block">
            <RoutePreviewSvg
              coordinates={candidate.coordinates}
              highlights={highlights}
              width={180}
              height={140}
            />
          </span>
          <span className="block text-[10px] mt-1 text-center" style={{ color: "var(--text-muted)" }}>
            Tap to view full map
          </span>
        </button>

        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>
                {candidate.name}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {candidate.county} · human-ridden · independently reviewed
              </p>
            </div>
            <SourceBadge score={candidate.match_score} />
          </div>

          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            <div>
              <dt className="inline">Distance </dt>
              <dd className="inline font-bold" style={{ color: "var(--text)" }}>
                {candidate.distance_km} km
              </dd>
            </div>
            <div>
              <dt className="inline">Climbing </dt>
              <dd className="inline font-bold" style={{ color: "var(--text)" }}>
                {candidate.elevation_gain_m} m
              </dd>
            </div>
          </dl>

          {viewing && (
            <RouteViewerModal
              coordinates={candidate.coordinates}
              title={candidate.name}
              stats={`${candidate.distance_km} km · +${candidate.elevation_gain_m} m`}
              onClose={() => setViewing(false)}
            />
          )}

          {candidate.wind_note && (
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              🌬 {candidate.wind_note}
            </p>
          )}

          {workoutFit?.fits && <WorkoutAssignment fit={workoutFit} coordinates={candidate.coordinates} />}

          <div className="flex flex-wrap gap-2 mt-3">
            <Link
              href={`/routes/${candidate.route_id}`}
              className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              View route
            </Link>
            <ShareButton
              routeId={candidate.route_id}
              title={candidate.name}
              distance={candidate.distance_km}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function SourceBadge({ score }: { score: number }) {
  return (
    <div
      className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: "var(--accent-glow)",
        color: "var(--accent)",
        border: "1px solid var(--accent)",
      }}
      title={`Match score ${score}/100`}
    >
      Verified · {score}
    </div>
  );
}

function haversineKmUI(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Plain-language session sheet (spec §3): where each effort starts, how
 * long it runs, what the road does. Distances computed from the route
 * geometry so they match the head unit.
 */
function WorkoutAssignment({
  fit,
  coordinates,
}: {
  fit: WorkoutFit;
  coordinates: [number, number][];
}) {
  // Cumulative km at each coordinate index (computed once per render —
  // candidate cards are small and static).
  const cum: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cum.push(cum[i - 1] + haversineKmUI(coordinates[i - 1], coordinates[i]));
  }
  const atKm = (idx: number) => (cum[Math.min(idx, cum.length - 1)] ?? 0).toFixed(1);

  const gradWord = (g: number) =>
    g > 1.5 ? `a steady ${g}% climb` : g < -1.5 ? `a gentle ${Math.abs(g)}% descent` : "flat road";

  return (
    <div
      className="mt-2 p-2.5 rounded-lg"
      style={{ background: "var(--accent-glow)", border: "1px solid var(--accent)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--accent)" }}>
        Your session, on the road
      </p>
      <ul className="space-y-1">
        {fit.interval_segments.map((a, i) => (
          <li key={i} className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>
            <span className="font-bold">Effort {i + 1}</span> — starts {atKm(a.segment.start_index)} km in:
            {" "}{a.segment.length_km} km on {gradWord(a.segment.avg_gradient_pct)}, ends at {atKm(a.segment.end_index)} km.
          </li>
        ))}
      </ul>
      <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
        Review these effort points before riding. Conditions change; stop the effort whenever the road is not clear.
      </p>
    </div>
  );
}
