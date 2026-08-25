"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { RIDE_SOURCE_PLATFORMS } from "@/config/route-policy";

interface PrivateRoute {
  id: string;
  name: string;
  description: string | null;
  publication_status: "draft" | "in_review" | "published" | "stale" | "quarantined" | "retired";
}

const REVISABLE = new Set(["draft", "stale", "quarantined", "retired"]);

export default function ReviseSubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [route, setRoute] = useState<PrivateRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [riddenAt, setRiddenAt] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [description, setDescription] = useState("");
  const [riddenBySubmitter, setRiddenBySubmitter] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?redirect=/submissions/${id}/revise`);
  }, [authLoading, user, router, id]);

  useEffect(() => {
    if (!user || !id) return;
    fetch(`/api/routes/${id}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Submission not found");
        setRoute(body);
        setDescription(body.description || "");
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Submission not found"))
      .finally(() => setLoading(false));
  }, [user, id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !riddenAt || !sourcePlatform || !riddenBySubmitter || !rightsConfirmed || !privacyConfirmed) {
      setError("Add the completed ride file and confirm every contributor declaration");
      return;
    }
    setSubmitting(true);
    setError("");
    const formData = new FormData();
    formData.append("route_file", file);
    formData.append("ridden_at", riddenAt);
    formData.append("source_platform", sourcePlatform);
    formData.append("source_reference", sourceReference.trim());
    formData.append("description", description);
    formData.append("ridden_by_submitter", String(riddenBySubmitter));
    formData.append("rights_confirmed", String(rightsConfirmed));
    formData.append("privacy_confirmed", String(privacyConfirmed));
    try {
      const response = await fetch(`/api/routes/${id}/revision`, { method: "POST", body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not submit the new version");
      router.push("/submissions");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit the new version");
      setSubmitting(false);
    }
  }

  if (authLoading || loading || !user) {
    return <main className="min-h-screen" style={{ background: "var(--bg)" }}><AppHeader /><p className="max-w-2xl mx-auto px-4 py-16 text-sm" style={{ color: "var(--text-muted)" }}>Loading submission…</p></main>;
  }

  if (!route || !REVISABLE.has(route.publication_status)) {
    return (
      <main className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-extrabold mb-3" style={{ color: "var(--text)" }}>A new version cannot be supplied now</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            {error || (route?.publication_status === "in_review" ? "The current evidence is already awaiting review." : "Published routes must first be made stale or quarantined by a curator so an unreviewed replacement never silently takes over.")}
          </p>
          <Link href="/submissions" className="btn-accent inline-flex px-5 py-3 rounded-xl text-sm font-bold">Back to submissions</Link>
        </div>
      </main>
    );
  }

  const inputStyle = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" };

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />
      <form onSubmit={submit} className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div>
          <Link href="/submissions" className="text-xs font-bold" style={{ color: "var(--accent)" }}>← My submissions</Link>
          <h1 className="text-3xl font-extrabold mt-3" style={{ color: "var(--text)" }}>Supply a new ridden version</h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>{route.name}</p>
        </div>

        <div className="rounded-xl p-4 text-sm" style={{ background: "var(--accent-glow)", border: "1px solid rgba(200,255,0,0.3)", color: "var(--text-secondary)" }}>
          Identical geometry keeps the existing immutable version and adds fresh ride evidence. Changed geometry creates the next version. Either way, the route remains private until another independent review.
        </div>

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="w-full rounded-2xl p-8 text-center"
          style={{ border: `2px dashed ${file ? "var(--accent)" : "var(--border)"}`, color: file ? "var(--text)" : "var(--text-muted)" }}
        >
          {file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "Choose your completed GPX, FIT or TCX recording"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".gpx,.fit,.tcx"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0] || null;
            setFile(selected);
            setError("");
          }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
            Date ridden
            <input type="date" value={riddenAt} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setRiddenAt(event.target.value)} className="w-full rounded-xl px-4 py-3 text-sm mt-1.5" style={inputStyle} />
          </label>
          <label className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
            Recording source
            <select value={sourcePlatform} onChange={(event) => setSourcePlatform(event.target.value)} className="w-full rounded-xl px-4 py-3 text-sm mt-1.5" style={inputStyle}>
              <option value="">Select source</option>
              {RIDE_SOURCE_PLATFORMS.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
          Private activity or route reference <span className="font-normal">(optional)</span>
          <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} maxLength={500} className="w-full rounded-xl px-4 py-3 text-sm mt-1.5" style={inputStyle} />
        </label>

        <label className="block text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
          Updated description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={4} className="w-full rounded-xl px-4 py-3 text-sm mt-1.5" style={inputStyle} />
        </label>

        <div className="space-y-3 rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <label className="flex items-start gap-3 text-sm" style={{ color: "var(--text-secondary)" }}><input type="checkbox" checked={riddenBySubmitter} onChange={(event) => setRiddenBySubmitter(event.target.checked)} className="mt-1" /><span>I personally rode this exact loop and this file records that ride.</span></label>
          <label className="flex items-start gap-3 text-sm" style={{ color: "var(--text-secondary)" }}><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1" /><span>I control this recording and grant the contributor licence in the <Link href="/terms" target="_blank" className="underline">Terms</Link>.</span></label>
          <label className="flex items-start gap-3 text-sm" style={{ color: "var(--text-secondary)" }}><input type="checkbox" checked={privacyConfirmed} onChange={(event) => setPrivacyConfirmed(event.target.checked)} className="mt-1" /><span>I checked the start and finish for sensitive locations and understand the approved route, rider name and ride date become public.</span></label>
        </div>

        {error && <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(255,51,85,0.12)", color: "var(--danger)" }}>{error}</div>}

        <button type="submit" disabled={submitting} className="btn-accent w-full py-3.5 rounded-xl text-sm font-bold disabled:opacity-40">
          {submitting ? "Submitting…" : "Submit this ridden version for review"}
        </button>
      </form>
    </main>
  );
}
