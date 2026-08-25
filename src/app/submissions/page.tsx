"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { getRideSourceLabel } from "@/config/route-policy";

interface Submission {
  id: string;
  name: string;
  distance_km: number;
  elevation_gain_m: number;
  region: string | null;
  county: string;
  publication_status: "draft" | "in_review" | "published" | "stale" | "quarantined" | "retired";
  version_number: number | null;
  geometry_hash: string | null;
  ridden_at: string | null;
  evidence_type: string | null;
  source_platform: string | null;
  attestation_status: string | null;
  latest_review_decision: string | null;
  latest_review_notes: string | null;
  created_at: string;
}

const STATUS_COPY: Record<Submission["publication_status"], string> = {
  draft: "Not ready for review",
  in_review: "Awaiting independent review",
  published: "Published in the Ireland library",
  stale: "Fresh ride evidence required",
  quarantined: "Temporarily removed while a report is reviewed",
  retired: "Not accepted for publication",
};

export default function SubmissionsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/submissions");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/submissions")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load submissions");
        setSubmissions(body.submissions || []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load submissions"))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || loading || !user) {
    return (
      <main className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <p className="max-w-3xl mx-auto px-4 py-16 text-sm" style={{ color: "var(--text-muted)" }}>Loading submissions…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>Founding contributor</p>
            <h1 className="text-3xl font-extrabold" style={{ color: "var(--text)" }}>My route submissions</h1>
            <p className="text-sm mt-2 max-w-xl" style={{ color: "var(--text-muted)" }}>
              Track the exact recording version, evidence status and independent review decision for every loop you supplied.
            </p>
          </div>
          <Link href="/upload" className="btn-accent inline-flex px-5 py-3 rounded-xl text-sm font-bold">Submit another loop</Link>
        </div>

        {error && <div className="rounded-xl p-4 mb-5 text-sm" style={{ background: "rgba(255,51,85,0.12)", color: "var(--danger)" }}>{error}</div>}

        <div className="space-y-4">
          {submissions.map((submission) => (
            <article key={submission.id} className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/routes/${submission.id}`} className="text-lg font-extrabold hover:underline" style={{ color: "var(--text)" }}>
                    {submission.name}
                  </Link>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {submission.distance_km} km · {submission.elevation_gain_m} m climbing · {submission.region || submission.county}
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded" style={{ background: "var(--bg)", color: submission.publication_status === "published" ? "var(--success)" : submission.publication_status === "retired" ? "var(--danger)" : "var(--warning)" }}>
                  {submission.publication_status.replaceAll("_", " ")}
                </span>
              </div>

              <p className="text-sm mt-4" style={{ color: "var(--text-secondary)" }}>{STATUS_COPY[submission.publication_status]}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
                <p>Version <strong style={{ color: "var(--text)" }}>{submission.version_number || "—"}</strong>{submission.geometry_hash ? ` · ${submission.geometry_hash.slice(0, 10)}…` : ""}</p>
                <p>Ridden <strong style={{ color: "var(--text)" }}>{submission.ridden_at ? new Date(submission.ridden_at).toLocaleDateString("en-IE") : "—"}</strong></p>
                <p>Evidence <strong style={{ color: "var(--text)" }}>{submission.evidence_type?.toUpperCase() || "—"} · {getRideSourceLabel(submission.source_platform) || "Unknown source"}</strong></p>
              </div>

              {submission.latest_review_decision && (
                <div className="rounded-xl p-3 mt-4 text-sm" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Independent review · {submission.latest_review_decision.replaceAll("_", " ")}</p>
                  {submission.latest_review_notes && <p className="mt-1.5" style={{ color: "var(--text-secondary)" }}>{submission.latest_review_notes}</p>}
                </div>
              )}
              {(["draft", "stale", "quarantined", "retired"] as const).includes(submission.publication_status as "draft" | "stale" | "quarantined" | "retired") && (
                <Link href={`/submissions/${submission.id}/revise`} className="inline-flex mt-4 text-xs font-bold underline" style={{ color: "var(--accent)" }}>
                  Supply a new ridden version
                </Link>
              )}
            </article>
          ))}

          {submissions.length === 0 && !error && (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="font-bold" style={{ color: "var(--text)" }}>No route submissions yet</p>
              <p className="text-sm mt-2 mb-5" style={{ color: "var(--text-muted)" }}>Upload a timestamped recording from an Irish road loop you personally rode.</p>
              <Link href="/upload" className="btn-accent inline-flex px-5 py-3 rounded-xl text-sm font-bold">Submit your first loop</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
