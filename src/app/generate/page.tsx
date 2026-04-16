"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import RoutePreviewSvg from "@/components/RoutePreviewSvg";

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
}

interface GeneratedCandidate {
  source: "generated";
  coordinates: [number, number][];
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  quality_score: number;
  gpx_data: string;
  match_score: number;
  workout_fit?: WorkoutFit;
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
}

interface GenerateResponse {
  interpreted: Interpreted;
  candidates: Candidate[];
}

const EXAMPLES = [
  "2 hour road loop from Blessington on country lanes, minimal climbing",
  "60km gravel ride near Wicklow, rolling hills, scenic",
  "2 x 20 min threshold intervals from Rathfarnham",
  "5 x 5 min vo2 max intervals from Howth",
  "90 min easy spin from Dun Laoghaire, coastal",
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
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interpreted, setInterpreted] = useState<Interpreted | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [submittedPrompt, setSubmittedPrompt] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?returnTo=/generate");
  }, [user, authLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (trimmed.length < 10) {
      setError({ message: "Describe the route you want in a bit more detail.", code: "TOO_SHORT" });
      return;
    }

    setLoading(true);
    setError(null);
    setCandidates([]);
    setInterpreted(null);
    setSubmittedPrompt(trimmed);

    try {
      const res = await fetch("/api/generate-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text)" }}>
            Plan a ride
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Describe what you want and we'll match it to a route. Ask for distance or duration,
            terrain, starting point, or a structured workout.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mb-8">
          <label htmlFor="plan-prompt" className="sr-only">
            Describe the ride you want
          </label>
          <textarea
            id="plan-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. 2 hour loop from Blessington on country lanes, minimal climbing"
            rows={3}
            maxLength={1000}
            disabled={loading}
            aria-describedby="plan-prompt-hint"
            className="w-full px-4 py-3 rounded-2xl text-sm resize-none"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              outline: "none",
            }}
          />
          <p id="plan-prompt-hint" className="sr-only">
            Describe distance or duration, terrain, starting point, and optionally a structured interval workout.
          </p>

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

        {loading && (
          <div className="grid gap-4">
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

  const bits = [
    duration && `${duration} (~${interpreted.distance_km} km)`,
    !duration && `${interpreted.distance_km} km`,
    interpreted.discipline,
    terrainLabel,
    locationLabel,
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
      <div className="grid grid-cols-[auto_1fr] gap-4 p-4">
        <RoutePreviewSvg coordinates={candidate.coordinates} highlights={highlights} width={180} height={140} />

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
            <SourceBadge source={candidate.source} score={candidate.match_score} />
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

          {workoutFit?.fits && <WorkoutAssignment fit={workoutFit} />}

          <div className="flex flex-wrap gap-2 mt-3">
            {isLibrary ? (
              <Link
                href={`/routes/${candidate.route_id}`}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                View route
              </Link>
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

function SourceBadge({ source, score }: { source: "library" | "generated"; score: number }) {
  const label = source === "library" ? "Verified" : "Generated";
  return (
    <div
      className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: source === "library" ? "var(--accent-glow)" : "var(--bg)",
        color: source === "library" ? "var(--accent)" : "var(--text-muted)",
        border: `1px solid ${source === "library" ? "var(--accent)" : "var(--border)"}`,
      }}
      title={`Match score ${score}/100`}
    >
      {label} · {score}
    </div>
  );
}

function WorkoutAssignment({ fit }: { fit: WorkoutFit }) {
  return (
    <div
      className="mt-2 p-2 rounded-lg"
      style={{ background: "var(--accent-glow)", border: "1px solid var(--accent)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>
        Interval segments
      </p>
      <ul className="space-y-0.5">
        {fit.interval_segments.map((a, i) => (
          <li key={i} className="text-xs" style={{ color: "var(--text)" }}>
            Rep {a.interval_index + 1}.{a.rep_index + 1}: {a.segment.length_km} km @ {a.segment.avg_gradient_pct}% avg
          </li>
        ))}
      </ul>
    </div>
  );
}
