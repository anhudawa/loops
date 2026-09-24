"use client";

import { ENABLED_DISCIPLINES } from "@/config/constants";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";
import RoutePreviewSvg from "@/components/RoutePreviewSvg";

const RouteEditor = dynamic(() => import("@/components/RouteEditor"), { ssr: false });
import type { EditedRoute } from "@/components/RouteEditor";
import { useToast } from "@/components/Toast";
import {
  promptLongEnough,
  friendlyHttpError,
  resultsHeading,
  readResults,
  writeResults,
  clearResults,
} from "./generate-helpers";
import RideDisclaimer from "@/components/RideDisclaimer";
import SendToGarmin from "@/components/SendToGarmin";
import QualityFactors, { SurfaceSummary } from "@/components/QualityFactors";
import ShareButton from "@/components/ShareButton";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { describeCompromise, type Compromise } from "@/lib/road-segments";
import { useGeolocation } from "@/lib/useGeolocation";
import LocationHelp from "@/components/LocationHelp";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@/lib/metrics";
import { deliveryNote } from "@/lib/delivery-note";
import { estimateRideMinutes, formatRideTime } from "@/lib/ride-time";

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
  /** Served as ride-out + verified loop + ride-back from the rider's start. */
  from_home?: boolean;
  approach_km?: number;
  loop_km?: number;
  gpx_data?: string;
  road_report?: { standard_met: boolean; summary: string; compromises?: Compromise[] };
  /** "Ridden and rated ★ 4.6 by 5 LOOPS riders" — riders' own check-ins. */
  proof?: string;
}

interface GeneratedCandidate {
  source: "generated";
  coordinates: [number, number][];
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  /** Absent once the rider has edited the line (re-checked on save). */
  quality_score?: number;
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
  /** Destination ride name and shape ("Out and back on the same road — …"). */
  title?: string;
  ride_note?: string;
  /** Road Standard report from the routing engine (see road-segments.ts). */
  road_report?: {
    standard_met: boolean;
    summary: string;
    compromises: Compromise[];
    surface: { paved_pct: number; unpaved_pct: number; unknown_pct: number };
    main_road_pct: number;
  };
}

type Candidate = LibraryCandidate | GeneratedCandidate;

interface Interpreted {
  /** The ask was adjusted (gravel/MTB → road in v1). */
  notice?: string;
  distance_km: number;
  duration_minutes?: number;
  /** The rider's own avg_speed_kmh when the server used it. */
  rider_speed_kmh?: number;
  discipline: "road" | "gravel" | "mtb";
  elevation_preference: "flat" | "rolling" | "hilly" | "mountainous" | "any";
  region?: string;
  /** Destination ride: where it goes (out and back). */
  destination?: string;
  distance_asked?: boolean;
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

/** The prompt describes structured efforts (mirrors the server's parser). */
function looksLikeSession(text: string): boolean {
  return /\d\s*[x×]\s*\d|\binterval|\bthreshold\b|\bftp\b|\btempo\b|\bvo2|sweet\s*spot|\banaerobic\b|\bsprints?\b|\bzone\s*[3-7]\b|\bz[3-7]\b/i.test(text);
}

const EXAMPLES = [
  "2 hour ride with a few rolling hills on quiet lanes",
  "90 min Zone 2 endurance ride, flat and steady",
  "2 x 20 min threshold intervals, somewhere safe",
  "5 x 5 min VO2 max efforts on a steady climb",
  "60 km scenic loop with rolling hills",
];

function downloadGpx(gpx: string, filename: string) {
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  // Funnel: client-side GPX download (never hits a server route otherwise).
  track(ANALYTICS_EVENTS.GPX_DOWNLOADED, { source: "generated" });
}

async function saveGeneratedRoute(
  candidate: GeneratedCandidate | LibraryCandidate,
  submittedPrompt: string,
  interpreted: Interpreted | null
): Promise<{ ok: true; routeId: string } | { ok: false; error: string; needsLogin?: boolean }> {
  // A "from your start" ride built on a verified loop is a NEW loop (owner
  // rule): saved as its own route, named after the loop it is built on.
  // Otherwise the rider's prompt is the initial name.
  const rawName = candidate.source === "library"
    ? `${candidate.name} from ${interpreted?.region ?? "your start"}`.slice(0, 80)
    : (candidate.title ?? submittedPrompt).slice(0, 80).trim();
  const name = rawName.length > 0 ? rawName : `Generated ${candidate.distance_km} km route`;

  // Use the discipline the LLM parsed from the prompt; fall back to road
  // only when we have no intent context (shouldn't happen in practice).
  const discipline = interpreted?.discipline ?? "road";

  let res: Response;
  try {
    res = await fetch("/api/routes/from-generated", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: `Generated from "${submittedPrompt}"`,
        coordinates: candidate.coordinates,
        elevations: candidate.source === "generated" ? candidate.elevations : (candidate as LibraryCandidate & { elevations?: number[] }).elevations,
        distance_km: candidate.distance_km,
        elevation_gain_m: candidate.elevation_gain_m,
        elevation_loss_m: candidate.elevation_loss_m,
        discipline,
        country: interpreted?.country,
        region: interpreted?.region,
        // The verdicts the rider saw — saved with the route, never re-guessed.
        quality_score: candidate.source === "generated" ? candidate.quality_score : undefined,
        quality_breakdown: candidate.source === "generated" ? candidate.quality_breakdown : undefined,
        surface_breakdown: candidate.source === "generated" ? candidate.surface_breakdown : undefined,
        road_report: candidate.road_report,
      }),
    });
  } catch {
    return { ok: false, error: "Network hiccup — your route is still here. Try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) return { ok: false, error: "Your sign-in has expired — log in to save this route.", needsLogin: true };
  if (!res.ok) return { ok: false, error: body?.error ?? "Could not save route." };
  return { ok: true, routeId: body?.data?.id };
}

/** Log in, then come back to this ask (its results are kept for this tab). */
function loginHrefFor(prompt: string): string {
  const target = prompt ? `/generate?q=${encodeURIComponent(prompt)}` : "/generate";
  return `/login?redirect=${encodeURIComponent(target)}`;
}

export default function GeneratePage() {
  return (
    <Suspense>
      <GenerateContent />
    </Suspense>
  );
}

function GenerateContent() {
  const { user, loading: authLoading, authError, refresh: refreshAuth } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prompt, setPrompt] = useState("");
  // Interval sessions: "OK to repeat your efforts on the same stretch?"
  // Yes (default) → every effort on the best stretch (hill repeats on a
  // climb, laps of a flat road); No → efforts spread along the ride.
  const [repeatEfforts, setRepeatEfforts] = useState(true);
  const isSession = looksLikeSession(prompt);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interpreted, setInterpreted] = useState<Interpreted | null>(null);
  const [error, setError] = useState<{ message: string; code?: string; notice?: string } | null>(null);
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  /** repeat_efforts sent with the last session ask (null: not a session). */
  const [submittedRepeat, setSubmittedRepeat] = useState<boolean | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  // The answer when it is a "no" — scrolled into view like results are (on a
  // phone it otherwise sat below the fold).
  const errorRef = useRef<HTMLDivElement>(null);
  const [useMyLocation, setUseMyLocation] = useState(false);

  // Run a homepage-handed-off ?q= prompt exactly once.
  const autoRanRef = useRef(false);
  // First result card — scrolled into view when candidates land so the rider
  // sees the answer without hunting (mobile especially).
  const resultsRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceInput();
  const geo = useGeolocation();
  const { toast } = useToast();

  useEffect(() => {
    // Only redirect a CONFIRMED logged-out rider. If auth couldn't be checked
    // (server/network error), don't eject — the retry UI below handles it.
    if (!authLoading && !user && !authError) {
      // Keep the rider's question through the login round-trip. Replace, not
      // push: Back from the login page must not land here and bounce again.
      const q = searchParams.get("q");
      const target = q ? `/generate?q=${encodeURIComponent(q)}` : "/generate";
      router.replace(`/login?redirect=${encodeURIComponent(target)}`);
    }
  }, [user, authLoading, authError, router, searchParams]);

  // On arrival: put back the results this tab was looking at (Back from a
  // route page, a sign-in or a Garmin round-trip), else run a
  // homepage-handed-off ?q= prompt. Runs once — our own ?q= updates after a
  // search must not start a second generation.
  useEffect(() => {
    if (authLoading || !user || autoRanRef.current) return;
    autoRanRef.current = true;
    const q = searchParams.get("q")?.trim() ?? "";
    const garmin = searchParams.get("garmin");
    if (garmin === "connected") toast("Garmin connected — tap Send to Garmin on your route.", "success");
    else if (garmin === "error") toast("Couldn't connect Garmin — try again.", "error");

    const cached = readResults<Interpreted, Candidate>();
    if (cached && (q ? cached.prompt === q : !!garmin)) {
      setPrompt(cached.prompt);
      setSubmittedPrompt(cached.prompt);
      setInterpreted(cached.interpreted);
      setCandidates(cached.candidates);
      if (garmin) router.replace(`/generate?q=${encodeURIComponent(cached.prompt)}`, { scroll: false });
      return;
    }
    if (garmin) router.replace(q ? `/generate?q=${encodeURIComponent(q)}` : "/generate", { scroll: false });
    if (!q) return;
    setPrompt(q);
    if (promptLongEnough(q)) runGeneration(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, searchParams]);

  // When results land, bring the first one into view. The submit lives in a
  // sticky bar inside the input card, so on mobile the rider would otherwise
  // stay parked on the input with the answer rendered off-screen below.
  useEffect(() => {
    if (!loading && candidates.length > 0 && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading, candidates]);
  useEffect(() => {
    if (!loading && error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading, error]);

  /** Back to the request box — for a "no" that the same words will only get again. */
  function editRequest() {
    const el = promptRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }

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
    if (!promptLongEnough(trimmed)) {
      setError({ message: "Describe the route you want in a bit more detail.", code: "TOO_SHORT" });
      return;
    }
    await runGeneration(trimmed);
  }

  // Retry the last submitted prompt — wired to the Retry button on errors so a
  // timeout or network blip is never a dead end.
  function retryLast() {
    if (submittedPrompt) runGeneration(submittedPrompt);
  }

  async function runGeneration(trimmed: string, repeat: boolean = repeatEfforts) {
    const session = looksLikeSession(trimmed);
    setLoading(true);
    setError(null);
    setCandidates([]);
    setInterpreted(null);
    setSubmittedPrompt(trimmed);
    setSubmittedRepeat(session ? repeat : null);
    // The ask lives in the URL (replace: no extra history entry), so Back
    // from a route page lands on these results, restored from this tab.
    clearResults();
    router.replace(`/generate?q=${encodeURIComponent(trimmed)}`, { scroll: false });

    // Send current location when the rider opted in — used as the start
    // point if their prompt doesn't name a place.
    const origin = useMyLocation ? geo.coords : null;

    // Public routing can stall on busy roads. Cap the wait at 55s and turn a
    // hang into an actionable, retryable error instead of an endless spinner.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

    try {
      const res = await fetch("/api/generate-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          ...(origin ? { origin } : {}),
          ...(session ? { repeat_efforts: repeat } : {}),
        }),
        signal: controller.signal,
      });
      // A platform error page (HTML) is not JSON — never show a parser
      // message to a rider.
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        const fallback = friendlyHttpError(res.ok ? 502 : res.status);
        setError({
          message: body?.error ?? fallback.message,
          code: body?.code ?? fallback.code,
          // A server note on the "no" (e.g. no map data there yet) is shown as sent.
          ...(typeof body?.notice === "string" && body.notice ? { notice: body.notice } : {}),
        });
      } else {
        const data = body.data as GenerateResponse | Candidate[] | undefined;
        // Tolerate both the new { interpreted, candidates } shape and the
        // old array shape in case of a stale worker.
        const next = data && !Array.isArray(data)
          ? { interpreted: data.interpreted ?? null, candidates: data.candidates ?? [] }
          : { interpreted: null, candidates: data ?? [] };
        setInterpreted(next.interpreted);
        setCandidates(next.candidates);
        if (next.candidates.length > 0) writeResults({ prompt: trimmed, ...next });
      }
    } catch {
      if (controller.signal.aborted) {
        setError({
          message: "This one took longer than a minute — busy roads can do that.",
          code: "TIMEOUT",
        });
      } else {
        setError({
          message: "We couldn't reach LOOPS just now.",
          code: "NETWORK",
        });
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  // Couldn't reach the auth service — don't eject the rider to /login, offer a
  // retry. This keeps an authenticated rider on the planner through a blip.
  if (!authLoading && !user && authError) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 text-center">
          <p style={{ color: "var(--text)" }}>
            We couldn&apos;t reach the server for a second. Your session is fine — let&apos;s try again.
          </p>
          <button
            onClick={() => refreshAuth()}
            className="rounded-full px-5 py-3 font-bold"
            style={{ background: "var(--accent)", color: "#fff", minHeight: 44 }}
          >
            Try again
          </button>
        </div>
      </div>
    );
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
            {voice.supported
              ? "Type or talk. Ask for distance or duration, terrain, or a structured workout — tap the mic to dictate, and turn on your location to start from where you are."
              : "Ask for distance or duration, terrain, or a structured workout — and turn on your location to start from where you are."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mb-8">
          <label htmlFor="plan-prompt" className="sr-only">
            Describe the ride you want
          </label>
          <div className="relative">
            <textarea
              ref={promptRef}
              id="plan-prompt"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (error?.code === "TOO_SHORT") setError(null);
              }}
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
                className="absolute top-2 right-2 w-11 h-11 rounded-full flex items-center justify-center transition-all"
                style={{
                  background: voice.listening ? "var(--accent)" : "var(--bg-raised)",
                  color: voice.listening ? "var(--bg)" : "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {voice.listening ? (
                  <span className="relative flex items-center justify-center">
                    <span
                      className="absolute w-11 h-11 rounded-full animate-ping"
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
            Describe distance or duration, terrain, starting point, and optionally a structured interval workout.{voice.supported ? " You can also dictate with the microphone." : ""} Press Enter to search.
          </p>
          {prompt.trim().length > 0 && !promptLongEnough(prompt) && !loading && (
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              Add a little more — how long, where from, what terrain (e.g. &ldquo;50 km loop from Skerries&rdquo;).
            </p>
          )}

          {voice.listening && (
            <p className="text-xs mt-2" style={{ color: "var(--accent)" }}>
              Listening… speak your route, then tap the mic to stop.
            </p>
          )}
          {voice.error && (
            <p className="text-xs mt-2" style={{ color: "#ff6b6b" }}>{voice.error}</p>
          )}

          {isSession && (
            <fieldset className="mt-3 rounded-xl p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <legend className="sr-only">Where to do your efforts</legend>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                OK to repeat your efforts on the same stretch?
              </p>
              <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>
                We&apos;ll find the best place for them — light traffic, no traffic lights, no junctions: a steady climb for VO2 work, a quiet flat road for threshold.
              </p>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {[
                  { v: true, label: "Yes — best stretch" },
                  { v: false, label: "No — spread them out" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={repeatEfforts === o.v}
                    onClick={() => setRepeatEfforts(o.v)}
                    disabled={loading}
                    className="min-h-[44px] px-4 rounded-full text-sm font-semibold"
                    style={{
                      background: repeatEfforts === o.v ? "var(--accent)" : "var(--bg-raised)",
                      color: repeatEfforts === o.v ? "var(--bg)" : "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>
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
              disabled={loading || prompt.trim().length === 0}
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
          {geo.blocked ? (
            <LocationHelp onRetry={toggleLocation} />
          ) : geo.error ? (
            <p className="text-xs mt-2" style={{ color: "#ff6b6b" }}>{geo.error}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 mt-3">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setPrompt(ex);
                  if (error?.code === "TOO_SHORT") setError(null);
                }}
                disabled={loading}
                className="inline-flex items-center min-h-[44px] text-xs px-3 py-1.5 rounded-full text-left"
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
            <Link href="/plan" className="inline-flex items-center min-h-[44px] font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
              Open the map planner →
            </Link>
          </p>
        </form>

        {error && (
          <div ref={errorRef} style={{ scrollMarginTop: 16 }}>
          <ErrorPanel
            error={error}
            onRetry={submittedPrompt && error.code !== "TOO_SHORT" && error.code !== "UNAUTHORIZED" ? retryLast : undefined}
            onEdit={editRequest}
            onRepeatOnOneStretch={
              error.code === "NO_WORKOUT_MATCH" && submittedRepeat === false
                ? () => { setRepeatEfforts(true); runGeneration(submittedPrompt, true); }
                : undefined
            }
            loginHref={loginHrefFor(submittedPrompt)}
          />
          </div>
        )}
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

        {/* The scroll target includes "Here's what we understood", so a
            rider on a phone lands on the confirmation, then the loops. */}
        <div ref={resultsRef} style={{ scrollMarginTop: 16 }}>
        {!loading && interpreted && (
          <InterpretedPanel interpreted={interpreted} />
        )}

        {!loading && candidates.length > 0 && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              {resultsHeading(candidates.map((c) => c.source))}
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
        </div>

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

  // Always say WHERE we planned — a named place is shown with the country it
  // resolved to, so "Girona" planned in the wrong country can never pass
  // unnoticed.
  const locationLabel = interpreted.region
    ? `from ${interpreted.region}${interpreted.country ? `, ${interpreted.country}` : ""}`
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
    interpreted.destination && `to ${interpreted.destination} and back`,
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
      {interpreted.notice && (
        <p className="text-sm mt-1 font-bold" style={{ color: "#f5a524" }} role="status">{interpreted.notice}</p>
      )}
      {interpreted.is_workout && interpreted.workout_summary && (
        <p className="text-sm mt-1 font-bold" style={{ color: "var(--accent)" }}>
          Workout: {interpreted.workout_summary}
        </p>
      )}
      <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
        Not quite right? Edit your request above and search again.
      </p>
      <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)", opacity: 0.8 }}>
        Road data © OpenStreetMap contributors · Place data © GeoNames (CC BY 4.0)
      </p>
    </div>
  );
}

/** The rider's asked-for duration, rounded like every other ride time (ride-time.ts). */
/** The rider's OWN asked duration, echoed back exactly ("2h 20m") — estimate
 *  rounding (formatRideTime) applies to estimates, never to what they typed. */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

// ── Error panel ───────────────────────────────────────────────────────────────

function ErrorPanel({
  error,
  onRetry,
  onEdit,
  onRepeatOnOneStretch,
  loginHref,
}: {
  error: { message: string; code?: string; notice?: string };
  onRetry?: () => void;
  /** Back to the request box (a decline the same words would only get again). */
  onEdit?: () => void;
  /** The efforts could not be spread out: offer them on one stretch instead. */
  onRepeatOnOneStretch?: () => void;
  loginHref: string;
}) {
  const hint = (() => {
    switch (error.code) {
      case "FEATURE_DISABLED":
        return "Route generation is not yet enabled on this environment.";
      case "NO_WORKOUT_MATCH":
        // After "No — spread them out" the one-tap alternative says it all.
        return onRepeatOnOneStretch
          ? "Your efforts can all go on one good stretch instead — the best one near you."
          : "Try a shorter interval, a different zone, or starting from a different location.";
      case "NO_ROUTES_FOUND":
        return "Try a different distance or start point.";
      case "NO_MAP_DATA":
        return "We don't have the road map for that area yet, so we can't plan there honestly. Try a start in Ireland or one of our destinations.";
      case "GEOCODE_FAILED":
        return "Try naming a specific town or landmark — and add the country if it's abroad (e.g. 'from Calpe, Spain').";
      case "TIMEOUT":
        return "Busy roads can take a while to plot. Give it another go, or try a shorter distance or a more specific location.";
      case "NETWORK":
        return "Check your connection and try again — your request is still here.";
      case "RATE_LIMITED":
        return "You've asked a few times in a row — give it a minute and try again.";
      case "SERVER":
        return "Nothing wrong with your request — try again in a moment.";
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
    error.code === "GEOCODE_FAILED" ||
    error.code === "NO_MAP_DATA";
  // Sending the same words again gets the same honest "no": these go back
  // to the request box instead.
  const editInstead = !!onEdit && (error.code === "GEOCODE_FAILED" || error.code === "NO_ROUTES_FOUND" || error.code === "NO_MAP_DATA");

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
      {error.notice && (
        <p className="text-xs mt-1 font-bold" style={{ color: "#f5a524" }} role="status">
          {error.notice}
        </p>
      )}
      {hint && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
      {onRepeatOnOneStretch && (
        <button
          type="button"
          onClick={onRepeatOnOneStretch}
          className="mt-3 mr-2 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-bold"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          Yes, repeat on one stretch
        </button>
      )}
      {error.code === "UNAUTHORIZED" && (
        <Link
          href={loginHref}
          className="mt-3 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-bold uppercase tracking-wider"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          Log in
        </Link>
      )}
      {editInstead ? (
        <button
          type="button"
          onClick={onEdit}
          className="mt-3 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-bold uppercase tracking-wider"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          Change my request
        </button>
      ) : onRetry && !onRepeatOnOneStretch && (
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
            {(ENABLED_DISCIPLINES as readonly string[]).map((d) => (
              <option key={d} value={d}>{d === "mtb" ? "MTB" : d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
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
        className="justify-self-start min-h-[44px] font-bold text-sm px-4 py-2 rounded-lg"
        style={{ background: "var(--accent)", color: "var(--bg)" }}
      >
        Find me a route
      </button>
    </form>
  );
}

// ── Full-screen route viewer ──────────────────────────────────────────────────

const RouteViewerMap = dynamic(() => import("@/components/RouteViewerMap"), { ssr: false });

/** Close the full-screen map by stepping back over its history entry (the
 * popstate listener then closes it), or directly if it has none. */
function closeViewer(onClose: () => void) {
  if ((window.history.state as { loopsViewer?: boolean } | null)?.loopsViewer) window.history.back();
  else onClose();
}

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
  // The full-screen map is its own history entry: phone Back (or swipe)
  // closes it and leaves the rider on their results, as does Escape.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!(window.history.state as { loopsViewer?: boolean } | null)?.loopsViewer) {
      window.history.pushState({ loopsViewer: true }, "");
    }
    const onPop = () => onCloseRef.current();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeViewer(() => onCloseRef.current()); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

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
          onClick={() => closeViewer(onClose)}
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

  // Big, unmissable progress card. Slow-path honesty (spec): public routing can
  // take up to a minute, so we say so plainly instead of leaving the rider
  // wondering whether anything is happening.
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
        This can take up to a minute on busy roads — we&apos;re checking real
        road quality, not just drawing a line. Hang tight.
      </p>
    </div>
  );
}

// ── Candidate card ────────────────────────────────────────────────────────────

/** Card action buttons: a full 44 px tap target on a phone. */
const ACTION_CLASS =
  "inline-flex items-center justify-center min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider";

/**
 * The card's route once the rider has edited it: the engine's new line,
 * profile, GPX and road report. The generator's quality verdicts described
 * the old line, so they are dropped (re-checked when the route is saved).
 */
function applyEdit(c: GeneratedCandidate, e: EditedRoute): GeneratedCandidate {
  return {
    ...c,
    coordinates: e.coordinates,
    elevations: e.elevations,
    distance_km: e.distance_km,
    elevation_gain_m: e.elevation_gain_m,
    elevation_loss_m: e.elevation_loss_m,
    gpx_data: e.gpx_data,
    road_report: e.road_report,
    waypoints_used: e.waypoints,
    quality_score: undefined,
    quality_tier: undefined,
    quality_breakdown: undefined,
    surface_breakdown: e.road_report?.surface,
    highlights: undefined,
  };
}

function CandidateCard({
  candidate: served,
  submittedPrompt,
  interpreted,
}: {
  candidate: Candidate;
  submittedPrompt: string;
  interpreted: Interpreted | null;
}) {
  const router = useRouter();
  // "Use this route" in the editor replaces the card's route everywhere:
  // stats, map, Save, Download GPX and Send to Garmin.
  const [edit, setEdit] = useState<EditedRoute | null>(null);
  const candidate: Candidate = edit && served.source === "generated" ? applyEdit(served, edit) : served;
  const isLibrary = candidate.source === "library";
  const title = isLibrary
    ? candidate.name
    : candidate.title ?? `Generated ${candidate.distance_km} km route`;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; needsLogin?: boolean } | null>(null);
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
    if (isLibrary && !candidate.from_home) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveGeneratedRoute(candidate, submittedPrompt, interpreted);
      if (result.ok && result.routeId) {
        router.push(`/routes/${result.routeId}`);
      } else if (!result.ok) {
        setSaveError({ message: result.error, needsLogin: result.needsLogin });
      }
    } catch {
      setSaveError({ message: "Something went wrong saving — try again." });
    } finally {
      setSaving(false);
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
                {isLibrary
                  ? candidate.from_home
                    ? `${candidate.county} · new loop from your start, built on this ${candidate.proof ? "rider-proven" : "verified"} route`
                    : `${candidate.county} · ${candidate.proof ? "rider-proven" : "verified"}`
                  : edit
                  ? "Your edit · quality re-checked when you save"
                  : candidate.ride_note ?? "Freshly generated"}
              </p>
              {isLibrary && candidate.proof && (
                <p className="text-xs mt-0.5 font-semibold" style={{ color: "var(--accent)" }}>{candidate.proof}</p>
              )}
            </div>
            {edit ? (
              <div
                className="shrink-0 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ background: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              >
                Edited
              </div>
            ) : (
            <SourceBadge
              source={candidate.source}
              // Show the QUALITY score next to the quality tier so the badge and
              // the "Quality" stat agree (was showing match_score → two
              // different numbers for the same route). Library routes have no
              // quality score, so they fall back to match.
              score={!isLibrary && candidate.quality_score !== undefined ? candidate.quality_score : candidate.match_score}
              qualityTier={!isLibrary ? candidate.quality_tier : undefined}
            />
            )}
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
            <div title="Riding time at a steady pace — stops go on top">
              <dt className="inline">Riding time </dt>
              <dd className="inline font-bold" style={{ color: "var(--text)" }}>
                {formatRideTime(
                  estimateRideMinutes({
                    distance_km: candidate.distance_km,
                    elevation_gain_m: candidate.elevation_gain_m,
                    discipline: interpreted?.discipline,
                    avgSpeedKmh: interpreted?.rider_speed_kmh,
                  }),
                  { style: "card" }
                )}
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

          {candidate.road_report && (
            <p
              className="text-xs mt-2 flex items-start gap-1.5"
              style={{ color: candidate.road_report.standard_met ? "var(--text-muted)" : "#f5a524" }}
              data-testid="road-standard"
            >
              <span aria-hidden="true">{candidate.road_report.standard_met ? "✓" : "⚠"}</span>
              <span>{candidate.road_report.summary}</span>
            </p>
          )}
          {!!candidate.road_report?.compromises?.length && (
            <details className="mt-1 ml-5">
              <summary className="inline-flex items-center min-h-[44px] text-[11px] font-bold cursor-pointer select-none" style={{ color: "var(--text-secondary)" }}>
                Where ({candidate.road_report.compromises.length})
              </summary>
              <ul className="mt-1 space-y-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {candidate.road_report.compromises.slice(0, 10).map((c, i) => (
                  <li key={i}>· {describeCompromise(c)}</li>
                ))}
                {candidate.road_report.compromises.length > 10 && (
                  <li style={{ color: "var(--text-muted)" }}>+{candidate.road_report.compromises.length - 10} more</li>
                )}
              </ul>
            </details>
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
              title={isLibrary ? candidate.name : candidate.title ?? `${candidate.distance_km} km ${interpreted?.discipline ?? ""} route`}
              stats={`${candidate.distance_km} km · +${candidate.elevation_gain_m} m`}
              onClose={() => setViewing(false)}
            />
          )}

          {candidate.wind_note && (
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              🌬 {candidate.wind_note}
            </p>
          )}

          {(() => {
            // Honesty: say so when the loop came out materially different from
            // what was asked (shorter/longer, or hillier than a flat request),
            // rather than quietly serving it as a match.
            const note = deliveryNote(interpreted, candidate);
            return note ? (
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                ⚖️ {note}
              </p>
            ) : null;
          })()}

          {workoutFit?.fits && <WorkoutAssignment fit={workoutFit} coordinates={candidate.coordinates} />}

          {!isLibrary && candidate.waypoints_used && candidate.waypoints_used.length >= 3 && !workoutFit?.fits && (
            <div className="mt-2">
              {!editing ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center min-h-[44px] text-xs font-bold px-3 py-1.5 rounded-lg"
                    style={{ border: "1px solid var(--border)", color: "var(--text)" }}
                  >
                    ✎ Edit route
                  </button>
                  {edit && (
                    <button
                      onClick={() => setEdit(null)}
                      className="inline-flex items-center min-h-[44px] text-xs font-bold px-3 py-1.5 rounded-lg underline"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Back to the original
                    </button>
                  )}
                </span>
              ) : (
                <RouteEditor
                  initialCoordinates={candidate.coordinates}
                  initialWaypoints={candidate.waypoints_used}
                  discipline={interpreted?.discipline ?? "road"}
                  onClose={() => setEditing(false)}
                  onApply={(route) => {
                    setEdit(route);
                    setEditing(false);
                    setSaveError(null);
                  }}
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {isLibrary && candidate.from_home ? (
              <>
                {/* A new loop from your start: save it (then share the saved
                    route) — sharing the original library route would send
                    friends a different ride. */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={`${ACTION_CLASS} disabled:opacity-50`}
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  {saving ? "Saving…" : "Save to my routes"}
                </button>
                <Link
                  href={`/routes/${candidate.route_id}`}
                  className={ACTION_CLASS}
                  style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  The verified loop
                </Link>
                {candidate.from_home && candidate.gpx_data && (
                  <button
                    type="button"
                    onClick={() => {
                      const filename = `loops-${candidate.name.slice(0, 30).replace(/[^a-z0-9]+/gi, "-")}-from-start.gpx`;
                      downloadGpx(candidate.gpx_data!, filename);
                    }}
                    className={ACTION_CLASS}
                    style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                  >
                    Download GPX (from your start)
                  </button>
                )}
              </>
            ) : isLibrary ? (
              <>
                <Link
                  href={`/routes/${candidate.route_id}`}
                  className={ACTION_CLASS}
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
                  className={`${ACTION_CLASS} disabled:opacity-50`}
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  {saving ? "Saving…" : "Save to my routes"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const filename = `loops-${submittedPrompt.slice(0, 30).replace(/[^a-z0-9]+/gi, "-")}${edit ? "-edited" : ""}.gpx`;
                    downloadGpx(candidate.gpx_data, filename);
                  }}
                  className={ACTION_CLASS}
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
            <p className="text-xs mt-2" style={{ color: "#ff6b6b" }} role="alert">
              {saveError.message}
              {saveError.needsLogin && (
                <>
                  {" "}
                  <Link
                    href={loginHrefFor(submittedPrompt)}
                    className="inline-flex items-center min-h-[44px] font-bold underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Log in →
                  </Link>
                </>
              )}
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
      title={`${source === "library" ? "Match" : "Quality"} score ${score}/100`}
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
