"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

type SessionType = "endurance" | "tempo" | "sweet_spot" | "threshold";

interface Suggestion {
  start_index: number;
  end_index: number;
  start_distance_km: number;
  end_distance_km: number;
  length_km: number;
  avg_gradient_pct: number;
  max_gradient_pct: number;
  gradient_variance: number;
  suitable_zones: string[];
}

interface Assessment extends Suggestion {
  id: string;
  assessor_name: string;
  assessed_at: string;
  direction: "forward" | "reverse";
  session_type: SessionType;
  min_effort_seconds: number;
  max_effort_seconds: number;
  surface_rating: "good" | "mixed" | "poor";
  traffic_rating: "low" | "moderate" | "high";
  sightlines_rating: "clear" | "mixed" | "poor";
  junction_count: number;
  entry_notes: string;
  recovery_notes: string;
  runout_notes: string;
  hazards_notes: string | null;
  review_status: "pending" | "approved" | "rejected" | "revoked";
  review_notes: string | null;
}

interface SegmentData {
  route: {
    id: string;
    name: string;
    publication_status: string;
    ridden_by_name: string | null;
    last_ridden_at: string | null;
  };
  automated_suggestions: Suggestion[];
  assessments: Assessment[];
  suggestion_notice: string;
}

interface SegmentForm {
  direction: "forward" | "reverse";
  session_type: SessionType;
  min_effort_seconds: string;
  max_effort_seconds: string;
  surface_rating: "good" | "mixed" | "poor";
  traffic_rating: "low" | "moderate" | "high";
  sightlines_rating: "clear" | "mixed" | "poor";
  junction_count: string;
  entry_notes: string;
  recovery_notes: string;
  runout_notes: string;
  hazards_notes: string;
  human_confirmation: boolean;
}

const INITIAL_FORM: SegmentForm = {
  direction: "forward",
  session_type: "threshold",
  min_effort_seconds: "600",
  max_effort_seconds: "1200",
  surface_rating: "good",
  traffic_rating: "low",
  sightlines_rating: "clear",
  junction_count: "0",
  entry_notes: "",
  recovery_notes: "",
  runout_notes: "",
  hazards_notes: "",
  human_confirmation: false,
};

function formatEffort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export default function SegmentAssessmentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const routeId = params.id;
  const [data, setData] = useState<SegmentData | null>(null);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [form, setForm] = useState<SegmentForm>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected">("approved");

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) router.push("/");
  }, [authLoading, user, router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/routes/${routeId}/segments`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load segment assessments");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load segment assessments");
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    if (user?.role === "admin") loadData();
  }, [user, loadData]);

  const chooseSuggestion = (suggestion: Suggestion) => {
    const sessionType: SessionType = suggestion.suitable_zones.includes("z4")
      ? "threshold"
      : suggestion.suitable_zones.includes("z3")
        ? "tempo"
        : "endurance";
    setSelected(suggestion);
    setForm({ ...INITIAL_FORM, session_type: sessionType });
    setError("");
  };

  const submitAssessment = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/routes/${routeId}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selected,
          ...form,
          min_effort_seconds: Number(form.min_effort_seconds),
          max_effort_seconds: Number(form.max_effort_seconds),
          junction_count: Number(form.junction_count),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save assessment");
      setSelected(null);
      setForm(INITIAL_FORM);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save assessment");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async () => {
    if (!reviewId) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/segments/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: reviewDecision, review_notes: reviewNotes }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not review assessment");
      setReviewId(null);
      setReviewNotes("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not review assessment");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user || user.role !== "admin") {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>Loading…</div>;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--accent)" }}>Human workout assessment</p>
            <h1 className="text-lg font-extrabold" style={{ color: "var(--text)" }}>{data?.route.name || "Route segments"}</h1>
          </div>
          <Link href="/admin" className="text-sm font-bold hover:opacity-80" style={{ color: "var(--text-muted)" }}>Back to admin</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-5">
        {error && <div className="rounded-xl p-3 text-sm" style={{ background: "rgba(255,51,85,0.12)", color: "var(--danger)" }}>{error}</div>}
        {loading && <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading route evidence…</p>}

        {data && (
          <>
            <section className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold" style={{ color: "var(--success)" }}>Ride evidence</p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                    Ridden by {data.route.ridden_by_name || "unknown rider"} · {data.route.last_ridden_at ? new Date(data.route.last_ridden_at).toLocaleDateString("en-IE") : "no ride date"}
                  </p>
                </div>
                <Link href={`/routes/${routeId}`} target="_blank" className="text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>Inspect full route ↗</Link>
              </div>
            </section>

            <section className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--text)" }}>1. Choose a candidate stretch</h2>
              <p className="text-xs mt-2 mb-4" style={{ color: "var(--warning)" }}>{data.suggestion_notice}</p>
              <div className="grid md:grid-cols-2 gap-3">
                {data.automated_suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.start_index}-${suggestion.end_index}`}
                    onClick={() => chooseSuggestion(suggestion)}
                    className="text-left rounded-xl p-4 transition-colors"
                    style={{
                      background: selected?.start_index === suggestion.start_index ? "rgba(200,255,0,0.08)" : "var(--bg)",
                      border: `1px solid ${selected?.start_index === suggestion.start_index ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    <p className="font-bold text-sm" style={{ color: "var(--text)" }}>
                      {suggestion.start_distance_km}–{suggestion.end_distance_km} km into the loop
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {suggestion.length_km} km · {suggestion.avg_gradient_pct}% average · computer flags {suggestion.suitable_zones.join(", ")}
                    </p>
                  </button>
                ))}
                {data.automated_suggestions.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>No computer-assisted candidates are available. Check that the uploaded ride contains elevation data.</p>
                )}
              </div>
            </section>

            {selected && (
              <section className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-extrabold uppercase tracking-wider mb-4" style={{ color: "var(--text)" }}>2. Record the rider&apos;s assessment</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <SelectField label="Session type" value={form.session_type} onChange={(value) => setForm({ ...form, session_type: value as SessionType })} options={["endurance", "tempo", "sweet_spot", "threshold"]} />
                  <SelectField label="Direction ridden" value={form.direction} onChange={(value) => setForm({ ...form, direction: value as "forward" | "reverse" })} options={["forward", "reverse"]} />
                  <InputField label="Shortest suitable effort (seconds)" value={form.min_effort_seconds} onChange={(value) => setForm({ ...form, min_effort_seconds: value })} />
                  <InputField label="Longest suitable effort (seconds)" value={form.max_effort_seconds} onChange={(value) => setForm({ ...form, max_effort_seconds: value })} />
                  <SelectField label="Surface" value={form.surface_rating} onChange={(value) => setForm({ ...form, surface_rating: value as SegmentForm["surface_rating"] })} options={["good", "mixed", "poor"]} />
                  <SelectField label="Traffic while efforts are suitable" value={form.traffic_rating} onChange={(value) => setForm({ ...form, traffic_rating: value as SegmentForm["traffic_rating"] })} options={["low", "moderate", "high"]} />
                  <SelectField label="Sightlines" value={form.sightlines_rating} onChange={(value) => setForm({ ...form, sightlines_rating: value as SegmentForm["sightlines_rating"] })} options={["clear", "mixed", "poor"]} />
                  <InputField label="Junctions during the effort" value={form.junction_count} onChange={(value) => setForm({ ...form, junction_count: value })} />
                </div>
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <TextField label="Safe entry" value={form.entry_notes} onChange={(value) => setForm({ ...form, entry_notes: value })} placeholder="Where and how the rider starts the effort" />
                  <TextField label="Recovery" value={form.recovery_notes} onChange={(value) => setForm({ ...form, recovery_notes: value })} placeholder="Where the rider can recover safely" />
                  <TextField label="Run-out" value={form.runout_notes} onChange={(value) => setForm({ ...form, runout_notes: value })} placeholder="What happens immediately after the effort" />
                  <TextField label="Hazards or timing limits" value={form.hazards_notes} onChange={(value) => setForm({ ...form, hazards_notes: value })} placeholder="Optional cautions, school times, seasonal traffic" />
                </div>
                <label className="flex items-start gap-3 rounded-xl p-3 mt-4 cursor-pointer" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                  <input type="checkbox" checked={form.human_confirmation} onChange={(event) => setForm({ ...form, human_confirmation: event.target.checked })} className="mt-0.5 h-4 w-4 accent-lime-400" />
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    I confirm these suitability and safety details came from the named rider&apos;s experience of this exact route version. Computer suggestions were used only to locate the stretch.
                  </span>
                </label>
                <button
                  onClick={submitAssessment}
                  disabled={submitting || !form.human_confirmation}
                  className="mt-4 px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  {submitting ? "Saving…" : "Save for curator review"}
                </button>
              </section>
            )}

            <section className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-extrabold uppercase tracking-wider mb-4" style={{ color: "var(--text)" }}>Segment assessment record</h2>
              <div className="space-y-3">
                {data.assessments.map((assessment) => (
                  <div key={assessment.id} className="rounded-xl p-4" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-sm" style={{ color: "var(--text)" }}>
                          {assessment.session_type.replace("_", " ")} · {formatEffort(assessment.min_effort_seconds)}–{formatEffort(assessment.max_effort_seconds)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                          {assessment.length_km} km · {assessment.direction} · {assessment.traffic_rating} traffic · {assessment.junction_count} junctions · assessed by {assessment.assessor_name}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: assessment.review_status === "approved" ? "var(--success)" : assessment.review_status === "rejected" ? "var(--danger)" : "var(--warning)" }}>
                        {assessment.review_status}
                      </span>
                    </div>
                    {assessment.review_status === "pending" && (
                      reviewId === assessment.id ? (
                        <div className="mt-4">
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {(["approved", "rejected"] as const).map((decision) => (
                              <button key={decision} onClick={() => setReviewDecision(decision)} className="py-2 rounded-lg text-xs font-bold uppercase" style={{ border: `1px solid ${reviewDecision === decision ? "var(--accent)" : "var(--border)"}`, color: reviewDecision === decision ? "var(--accent)" : "var(--text-muted)" }}>{decision}</button>
                            ))}
                          </div>
                          <textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows={3} placeholder="Curator review notes (20 characters minimum)" className="w-full rounded-lg p-3 text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }} />
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => setReviewId(null)} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>
                            <button onClick={submitReview} disabled={submitting || reviewNotes.trim().length < 20} className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-40" style={{ color: "var(--bg)", background: "var(--accent)" }}>Submit review</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setReviewId(assessment.id); setReviewNotes(""); setReviewDecision("approved"); }} className="text-xs font-bold mt-3" style={{ color: "var(--accent)" }}>Review assessment</button>
                      )
                    )}
                  </div>
                ))}
                {data.assessments.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No human segment assessments have been recorded yet.</p>}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="block text-xs font-bold mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label>
      <span className="block text-xs font-bold mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl px-3 py-2.5 text-sm capitalize" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
        {options.map((option) => <option key={option} value={option}>{option.replace("_", " ")}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label>
      <span className="block text-xs font-bold mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} placeholder={placeholder} className="w-full rounded-xl px-3 py-2.5 text-sm resize-y" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
    </label>
  );
}
