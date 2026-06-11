"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";
import RoutePreviewSvg from "@/components/RoutePreviewSvg";

const RouteEditor = dynamic(() => import("@/components/RouteEditor"), { ssr: false });
import RideDisclaimer from "@/components/RideDisclaimer";
import SendToGarmin from "@/components/SendToGarmin";
import QualityFactors, { SurfaceSummary } from "@/components/QualityFactors";
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
  discipline: "road" | "gravel" | "mtb";
  county: string;
  country: string;
  match_score: number;
  distance_from_start_km: number;
  workout_fit?: WorkoutFit;
  wind_note?: string;
}

interface GeneratedCandidate {
  source: "generated";
  coordinates: [number, number][];
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  quality_score: number;
  quality_tier?: "excellent" | "good";
  quality_breakdown?: Record<string, number>;
  highlights?: string[];
  surface_breakdown?: { paved_pct: number; unpaved_pct: number; unknown_pct: number };
  gpx_data: string;
  match_score: number;
  workout_fit?: WorkoutFit;
  wind_note?: string;
  wind_forecast?: { direction_deg: number; speed_kmh: number };
  waypoints_used?: [number, number][];
}

type Candidate = LibraryCandidate | GeneratedCandidate;

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
  "2 hour ride with a few rolling hills on quiet lanes",
  "90 min Zone 2 endurance ride, flat and steady",
  "2 x 20 min threshold intervals, somewhere safe",
  "5 x 5 min VO2 max efforts on a steady climb",
  "60km gravel ride, scenic, rolling hills",
];

function downloadGpx(gpx: string, filename: string) {
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveGeneratedRoute(
  candidate: GeneratedCandidate,
  submittedPrompt: string,
  interpreted: Interpreted | null
): Promise<{ ok: true; routeId: string } | { ok: false; error: string }> {
  // Use the rider's prompt as the initial name — they can rename later.
  const rawName = submittedPrompt.slice(0, 80).trim();
  const name = rawName.length > 0 ? rawName : `Generated ${candidate.distance_km} km route`;

  // Use the discipline the LLM parsed from the prompt; fall back to road
  // only when we have no intent context (shouldn't happen in practice).
  const discipline = interpreted?.discipline ?? "road";

  const res = await fetch("/api/routes/from-generated", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description: `Generated from "${submittedPrompt}"`,
      coordinates: candidate.coordinates,
      elevations: candidate.elevations,
      distance_km: candidate.distance_km,
      elevation_gain_m: candidate.elevation_gain_m,
      elevation_loss_m: candidate.elevation_loss_m,
      discipline,
      country: interpreted?.country,
      region: interpreted?.region,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error ?? "Could not save route." };
  return { ok: true, routeId: body?.data?.id };
}

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

  // Run a homepage-handed-off ?q= prompt exactly once.
  const autoRanRef = useRef(false);

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

  // Homepage answer machine hands off via /generate?q=… — prefill the
  // prompt and, when it's substantial enough, run generation immediately.
  useEffect(() => {
    if (authLoading || !user || autoRanRef.current) return;
    const q = searchParams.get("q")?.trim() ?? "";
    if (!q) return;
    autoRanRef.current = true;
    setPrompt(q);
    if (q.length >= 10) runGeneration(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, searchParams]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (voice.listening) voice.stop();
    const trimmed = prompt.trim();
    if (trimmed.length < 10) {
      setError({ message: "Describe the route you want in a bit more detail.", code: "TOO_SHORT" });
      return;
    }
    await runGeneration(trimmed);
  }

  async function runGeneration(trimmed: string) {
    setLoading(true);
    setError(null);
    setCandidates([]);
    setInterpreted(null);
    setSubmittedPrompt(trimmed);

    // Send current location when the rider opted in — used as the start
    // point if their prompt doesn't name a place.
    const origin = useMyLocation ? geo.coords : null;

    try {
      const res = await fetch("/api/generate-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, ...(origin ? { origin } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError({ message: body?.error ?? "Could not generate a route.", code: body?.code });
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
      setError({
        message: err instanceof Error ? err.message : "Network error. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        </div>
      </div>
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
            Type or talk. Ask for distance or duration, terrain, or a structured
            workout — tap the mic to dictate, and turn on your location to start
            from where you are.
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
            Describe distance or duration, terrain, starting point, and optionally a structured interval workout. You can also dictate with the microphone.
          </p>

          {voice.listening && (
            <p className="text-xs mt-2" style={{ color: "var(--accent)" }}>
              Listening… speak your route, then tap the mic to stop.
            </p>
          )}
          {voice.error && (
            <p className="text-xs mt-2" style={{ color: "#ff6b6b" }}>{voice.error}</p>
          )}

          {/* Use my location toggle — the "I'm here now, give me a ride" path */}
          <button
            type="button"
            onClick={toggleLocation}
            disabled={loading || geo.loading}
            aria-pressed={useMyLocation}
            className="mt-3 inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full transition-all"
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
            Prefer to draw it?{" "}
            <Link href="/plan" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
              Open the map planner →
            </Link>
          </p>

          <button
            type="submit"
            disabled={loading || prompt.trim().length < 10}
            aria-busy={loading}
            className="mt-4 w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            {loading ? "Finding a route…" : "Find me a route"}
          </button>
        </form>

        {error && <ErrorPanel error={error} />}
        {error?.code === "PARSE_FAILED" && (
          <FallbackForm
            onSubmit={(text) => {
              setPrompt(text);
              runGeneration(text);
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
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              {candidates.some((c) => c.source === "library")
                ? "Matched from our verified library"
                : "Freshly built for you"}
            </h2>
            <div className="grid gap-4">
              {candidates.map((c, i) => (
                <CandidateCard
                  key={i}
                  candidate={c}
                  submittedPrompt={submittedPrompt}
                  interpreted={interpreted}
                />
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
              No matches found. Try a different area, distance, or session.
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

  return (
    <div
      className="mb-5 rounded-2xl p-4"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
        Interpreted as
      </p>
      <p className="text-sm" style={{ color: "var(--text)" }}>
        {bits.join(" · ")}
      </p>
      {interpreted.is_workout && interpreted.workout_summary && (
        <p className="text-xs mt-1" style={{ color: "var(--accent)" }}>
          Workout: {interpreted.workout_summary}
        </p>
      )}
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

function ErrorPanel({ error }: { error: { message: string; code?: string } }) {
  const hint = (() => {
    switch (error.code) {
      case "FEATURE_DISABLED":
        return "Route generation is not yet enabled on this environment.";
      case "NO_WORKOUT_MATCH":
        return "Try a shorter interval, a different zone, or starting from a different location.";
      case "NO_ROUTES_FOUND":
        return "Try a different distance, location, or discipline.";
      case "GEOCODE_FAILED":
        return "Name a town or landmark — e.g. 'from Blessington' or 'near Dalkey'.";
      case "TIMEOUT":
        return "Try a shorter distance or a more specific location.";
      case "RATE_LIMITED":
        return "You've asked a few times in a row — give it a minute and try again.";
      default:
        return null;
    }
  })();

  return (
    <div
      role="alert"
      className="mb-6 rounded-2xl p-4"
      style={{
        background: "rgba(255, 80, 80, 0.08)",
        border: "1px solid rgba(255, 80, 80, 0.3)",
      }}
    >
      <p className="text-sm font-bold" style={{ color: "#ff6b6b" }}>
        {error.message}
      </p>
      {hint && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Fallback form ─────────────────────────────────────────────────────────────

/**
 * Structured fallback when natural-language parsing fails (launch spec
 * resilience: fall back to a form instead of a dead end). Composes a
 * clean prompt from the fields and reruns generation.
 */
function FallbackForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [hours, setHours] = useState("2");
  const [discipline, setDiscipline] = useState("road");
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
          `${hours} hour ${discipline} loop, ${terrain} terrain${placePart}`
        );
      }}
    >
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        Quick form
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Hours
          <select value={hours} onChange={(e) => setHours(e.target.value)} className="w-full mt-1 rounded-lg px-2 py-2 text-sm" style={selectStyle}>
            {["1", "1.5", "2", "3", "4", "5"].map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Bike
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className="w-full mt-1 rounded-lg px-2 py-2 text-sm" style={selectStyle}>
            <option value="road">Road</option>
            <option value="gravel">Gravel</option>
            <option value="mtb">MTB</option>
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
 * Honest progress narration while generation runs (launch spec: perceived
 * quality is quality). Stages mirror the real pipeline order; timings are
 * approximations of where the time actually goes.
 */
const LOADING_STAGES = [
  { at: 0, label: "Reading your request…" },
  { at: 2000, label: "Checking the library of verified routes…" },
  { at: 4500, label: "Plotting candidate loops…" },
  { at: 8000, label: "Checking road quality and safety…" },
  { at: 12000, label: "Scoring and ranking the best options…" },
];

function LoadingStages() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = LOADING_STAGES.map((s, i) =>
      setTimeout(() => setStage(i), s.at)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin shrink-0"
        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        aria-hidden="true"
      />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {LOADING_STAGES[stage].label}
      </p>
    </div>
  );
}

// ── Candidate card ────────────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  submittedPrompt,
  interpreted,
}: {
  candidate: Candidate;
  submittedPrompt: string;
  interpreted: Interpreted | null;
}) {
  const router = useRouter();
  const isLibrary = candidate.source === "library";
  const title = isLibrary
    ? candidate.name
    : `Generated ${candidate.distance_km} km route`;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);

  const workoutFit = candidate.workout_fit;
  const highlights = workoutFit?.fits
    ? workoutFit.interval_segments.map((a) => ({
        start_index: a.segment.start_index,
        end_index: a.segment.end_index,
        label: `Interval ${a.interval_index + 1}.${a.rep_index + 1}`,
      }))
    : [];

  async function handleSave() {
    if (isLibrary) return;
    setSaving(true);
    setSaveError(null);
    const result = await saveGeneratedRoute(candidate, submittedPrompt, interpreted);
    setSaving(false);
    if (result.ok && result.routeId) {
      router.push(`/routes/${result.routeId}`);
    } else if (!result.ok) {
      setSaveError(result.error);
    }
  }

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
              wind={!isLibrary ? candidate.wind_forecast : undefined}
              width={640}
              height={300}
              className="w-full"
            />
          </span>
          <span className="hidden sm:block">
            <RoutePreviewSvg
              coordinates={candidate.coordinates}
              highlights={highlights}
              wind={!isLibrary ? candidate.wind_forecast : undefined}
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
                {title}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {isLibrary ? `${candidate.county} · verified` : "Freshly generated"}
              </p>
            </div>
            <SourceBadge
              source={candidate.source}
              score={candidate.match_score}
              qualityTier={!isLibrary ? candidate.quality_tier : undefined}
            />
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
            {!isLibrary && candidate.quality_score !== undefined && (
              <div>
                <dt className="inline">Quality </dt>
                <dd className="inline font-bold" style={{ color: "var(--text)" }}>
                  {candidate.quality_score}
                </dd>
              </div>
            )}
          </dl>

          {!isLibrary && candidate.highlights && candidate.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {candidate.highlights.map((h, i) => (
                <span
                  key={i}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: "var(--accent-glow)",
                    color: "var(--accent)",
                    border: "1px solid rgba(200,255,0,0.2)",
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
          )}

          {!isLibrary && candidate.surface_breakdown && (
            <SurfaceSummary breakdown={candidate.surface_breakdown} />
          )}

          {!isLibrary && candidate.quality_breakdown && (
            <QualityFactors breakdown={candidate.quality_breakdown} />
          )}

          {viewing && (
            <RouteViewerModal
              coordinates={candidate.coordinates}
              title={isLibrary ? candidate.name : `${candidate.distance_km} km ${interpreted?.discipline ?? ""} route`}
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

          {!isLibrary && candidate.waypoints_used && candidate.waypoints_used.length >= 3 && !workoutFit?.fits && (
            <div className="mt-2">
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg"
                  style={{ border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  ✎ Edit route
                </button>
              ) : (
                <RouteEditor
                  initialCoordinates={candidate.coordinates}
                  initialWaypoints={candidate.waypoints_used}
                  discipline={interpreted?.discipline ?? "road"}
                  onClose={() => setEditing(false)}
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {isLibrary ? (
              <>
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
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  {saving ? "Saving…" : "Save to my routes"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const filename = `loops-${submittedPrompt.slice(0, 30).replace(/[^a-z0-9]+/gi, "-")}.gpx`;
                    downloadGpx(candidate.gpx_data, filename);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Download GPX
                </button>
                <SendToGarmin
                  name={submittedPrompt.slice(0, 80) || `LOOPS ${candidate.distance_km} km`}
                  coordinates={candidate.coordinates}
                  elevations={candidate.elevations}
                  distance_km={candidate.distance_km}
                  elevation_gain_m={candidate.elevation_gain_m}
                  discipline={interpreted?.discipline ?? "road"}
                  course_points={
                    workoutFit?.fits
                      ? workoutFit.interval_segments.flatMap((a, i) => {
                          const s = candidate.coordinates[a.segment.start_index];
                          const e = candidate.coordinates[a.segment.end_index];
                          if (!s || !e) return [];
                          return [
                            { lat: s[0], lng: s[1], name: `EFFORT ${i + 1} GO`, type: "SEGMENT_START" },
                            { lat: e[0], lng: e[1], name: `EFFORT ${i + 1} END`, type: "SEGMENT_END" },
                          ];
                        })
                      : undefined
                  }
                />
              </>
            )}
          </div>
          {saveError && (
            <p className="text-xs mt-2" style={{ color: "#ff6b6b" }}>
              {saveError}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function SourceBadge({
  source,
  score,
  qualityTier,
}: {
  source: "library" | "generated";
  score: number;
  qualityTier?: "excellent" | "good";
}) {
  let label: string;
  let accent: boolean;
  if (source === "library") {
    label = "Verified";
    accent = true;
  } else if (qualityTier === "excellent") {
    label = "Excellent";
    accent = true;
  } else {
    label = "Good";
    accent = false;
  }

  return (
    <div
      className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: accent ? "var(--accent-glow)" : "var(--bg)",
        color: accent ? "var(--accent)" : "var(--text-muted)",
        border: `1px solid ${accent ? "var(--accent)" : "var(--border)"}`,
      }}
      title={`Match score ${score}/100`}
    >
      {label} · {score}
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
        Effort start/end markers are in the GPX — your head unit will alert you on course.
      </p>
    </div>
  );
}
