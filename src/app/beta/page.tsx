"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import {
  BETA_PRIVACY_VERSION,
  BETA_RIDING_FREQUENCIES,
  BETA_SESSION_TYPES,
} from "@/config/beta";
import { RIDE_SOURCE_PLATFORMS } from "@/config/route-policy";

type ApplicationType = "rider" | "contributor";

interface Application {
  id: string;
  application_type: ApplicationType;
  home_region: string;
  club_name: string | null;
  riding_frequency: "weekly" | "two_to_three" | "four_plus";
  routes_available: number | null;
  session_interests: string[];
  source_platforms: string[];
  notes: string | null;
  status: "submitted" | "waitlisted" | "approved" | "declined" | "withdrawn";
  created_at: string;
}

interface IntakeState {
  applications: Application[];
  membership: {
    access_level: "rider" | "contributor";
    status: "active" | "paused" | "removed";
    approved_at: string;
  } | null;
  access: boolean;
  contributorAccess: boolean;
}

const emptyForm = () => ({
  homeRegion: "",
  clubName: "",
  ridingFrequency: "two_to_three" as "weekly" | "two_to_three" | "four_plus",
  routesAvailable: "2",
  sessionInterests: ["endurance"],
  sourcePlatforms: [] as string[],
  notes: "",
});

export default function BetaPage() {
  const { user, loading: authLoading } = useAuth();
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<ApplicationType>("rider");
  const [form, setForm] = useState(emptyForm);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [upgradeToContributor, setUpgradeToContributor] = useState(false);

  const loadIntake = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch("/api/beta/application");
      if (!response.ok) throw new Error("Could not load your beta application");
      const data = await response.json() as IntakeState;
      setIntake(data);
      if (data.contributorAccess) setUpgradeToContributor(false);
      const first = data.applications[0];
      if (first) {
        setKind(first.application_type);
        setForm({
          homeRegion: first.home_region,
          clubName: first.club_name ?? "",
          ridingFrequency: first.riding_frequency,
          routesAvailable: String(first.routes_available ?? 2),
          sessionInterests: first.session_interests,
          sourcePlatforms: first.source_platforms,
          notes: first.notes ?? "",
        });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your beta application");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) loadIntake();
    if (!authLoading && !user) setLoading(false);
  }, [authLoading, user, loadIntake]);

  function chooseKind(nextKind: ApplicationType) {
    setKind(nextKind);
    setConsent(false);
    setSaved(false);
    const existing = intake?.applications.find((application) => application.application_type === nextKind);
    if (existing) {
      setForm({
        homeRegion: existing.home_region,
        clubName: existing.club_name ?? "",
        ridingFrequency: existing.riding_frequency,
        routesAvailable: String(existing.routes_available ?? 2),
        sessionInterests: existing.session_interests,
        sourcePlatforms: existing.source_platforms,
        notes: existing.notes ?? "",
      });
    } else {
      setForm(emptyForm());
    }
  }

  function toggleList(field: "sessionInterests" | "sourcePlatforms", value: string) {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/beta/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationType: kind,
          ...form,
          routesAvailable: kind === "contributor" ? Number(form.routesAvailable) : null,
          sourcePlatforms: kind === "contributor" ? form.sourcePlatforms : [],
          contactConsent: consent,
          privacyVersion: BETA_PRIVACY_VERSION,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not submit the application");
      setSaved(true);
      setConsent(false);
      await loadIntake();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit the application");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || loading) {
    return (
      <main className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <p className="max-w-2xl mx-auto px-4 py-16 text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-extrabold mb-3" style={{ color: "var(--text)" }}>Ireland road beta</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Sign in first, then apply as a beta rider or a founding route contributor.
          </p>
          <Link href="/login?redirect=/beta" className="btn-accent inline-flex px-6 py-3 rounded-xl text-sm font-bold">
            Sign in to apply
          </Link>
        </div>
      </main>
    );
  }

  if (intake?.access && !upgradeToContributor) {
    return (
      <main className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="max-w-xl mx-auto px-4 py-16">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>Access approved</p>
          <h1 className="text-3xl font-extrabold mb-3" style={{ color: "var(--text)" }}>
            Welcome to the Ireland beta
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Your access level is {intake.contributorAccess ? "founding contributor" : "beta rider"}.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/generate" className="btn-accent inline-flex px-5 py-3 rounded-xl text-sm font-bold">Find a route</Link>
            {intake.contributorAccess && (
              <>
                <Link href="/upload" className="inline-flex px-5 py-3 rounded-xl text-sm font-bold" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
                  Submit a ridden loop
                </Link>
                <Link href="/submissions" className="inline-flex px-5 py-3 rounded-xl text-sm font-bold" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
                  My submissions
                </Link>
              </>
            )}
            {!intake.contributorAccess && (
              <button
                type="button"
                onClick={() => {
                  chooseKind("contributor");
                  setUpgradeToContributor(true);
                }}
                className="inline-flex px-5 py-3 rounded-xl text-sm font-bold"
                style={{ border: "1px solid var(--border)", color: "var(--text)" }}
              >
                Apply to contribute routes
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (intake?.membership && intake.membership.status !== "active") {
    return (
      <main className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="max-w-xl mx-auto px-4 py-16">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--warning)" }}>Beta access {intake.membership.status}</p>
          <h1 className="text-3xl font-extrabold mb-3" style={{ color: "var(--text)" }}>
            Your Ireland beta access is not active
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Route matching, GPX access and contributor uploads are disabled for this account. Reply to your LOOPS beta contact if you believe this is a mistake.
          </p>
          <Link href="/" className="inline-flex px-5 py-3 rounded-xl text-sm font-bold" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>Back to LOOPS</Link>
        </div>
      </main>
    );
  }

  const currentApplication = intake?.applications.find((application) => application.application_type === kind);
  const locked = currentApplication?.status === "declined" || currentApplication?.status === "approved";
  const inputStyle = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" };

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />
      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-extrabold mb-2" style={{ color: "var(--text)" }}>Apply for the Ireland road beta</h1>
        <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-muted)" }}>
          We are admitting a small Irish cohort: riders who will use the product honestly, and contributors who can supply recent recordings of loops they personally rode.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-6">
          {(["rider", "contributor"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => chooseKind(option)}
              className="rounded-xl px-3 py-3 text-sm font-bold"
              style={{
                background: kind === option ? "var(--accent-glow)" : "var(--bg-card)",
                border: `1px solid ${kind === option ? "var(--accent)" : "var(--border)"}`,
                color: kind === option ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {option === "rider" ? "Beta rider" : "Route contributor"}
            </button>
          ))}
        </div>

        {currentApplication && (
          <div className="rounded-xl p-3 mb-5 text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            Current status: <strong style={{ color: "var(--text)" }}>{currentApplication.status}</strong>
            {currentApplication.status === "waitlisted" && " — you may update and resubmit while waiting."}
          </div>
        )}

        {!locked && (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--text-secondary)" }}>County or general riding area</label>
              <input
                value={form.homeRegion}
                onChange={(event) => setForm((current) => ({ ...current, homeRegion: event.target.value }))}
                maxLength={80}
                placeholder="e.g. south Dublin / north Wicklow"
                className="w-full rounded-xl px-4 py-3 text-sm"
                style={inputStyle}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Keep this coarse—do not enter a home address.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
                Riding frequency
                <select
                  value={form.ridingFrequency}
                  onChange={(event) => setForm((current) => ({ ...current, ridingFrequency: event.target.value as typeof current.ridingFrequency }))}
                  className="w-full rounded-xl px-4 py-3 text-sm mt-1.5"
                  style={inputStyle}
                >
                  {BETA_RIDING_FREQUENCIES.map((frequency) => <option key={frequency.value} value={frequency.value}>{frequency.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
                Club or riding group <span className="font-normal">(optional)</span>
                <input
                  value={form.clubName}
                  onChange={(event) => setForm((current) => ({ ...current, clubName: event.target.value }))}
                  maxLength={120}
                  className="w-full rounded-xl px-4 py-3 text-sm mt-1.5"
                  style={inputStyle}
                />
              </label>
            </div>

            <fieldset>
              <legend className="text-xs font-bold mb-2" style={{ color: "var(--text-secondary)" }}>Rides or sessions you want to test</legend>
              <div className="grid grid-cols-2 gap-2">
                {BETA_SESSION_TYPES.map((session) => (
                  <label key={session.value} className="rounded-xl px-3 py-2.5 text-sm flex items-center gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    <input type="checkbox" checked={form.sessionInterests.includes(session.value)} onChange={() => toggleList("sessionInterests", session.value)} />
                    {session.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {kind === "contributor" && (
              <>
                <label className="block text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
                  Recently ridden Irish road loops you could contribute
                  <select value={form.routesAvailable} onChange={(event) => setForm((current) => ({ ...current, routesAvailable: event.target.value }))} className="w-full rounded-xl px-4 py-3 text-sm mt-1.5" style={inputStyle}>
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>
                <fieldset>
                  <legend className="text-xs font-bold mb-2" style={{ color: "var(--text-secondary)" }}>Where your completed-ride files come from</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {RIDE_SOURCE_PLATFORMS.map((platform) => (
                      <label key={platform.value} className="rounded-xl px-3 py-2.5 text-sm flex items-center gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        <input type="checkbox" checked={form.sourcePlatforms.includes(platform.value)} onChange={() => toggleList("sourcePlatforms", platform.value)} />
                        {platform.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}

            <label className="block text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
              Anything useful for cohort selection? <span className="font-normal">(optional)</span>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} maxLength={1000} rows={4} className="w-full rounded-xl px-4 py-3 text-sm mt-1.5" style={inputStyle} />
            </label>

            <label className="rounded-xl p-4 text-sm flex items-start gap-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
              <span>
                LOOPS may contact me about this application and beta research. I have read the <Link href="/privacy" target="_blank" className="font-bold underline" style={{ color: "var(--accent)" }}>Privacy Policy</Link>. Application data is used only to select and operate the Ireland beta.
              </span>
            </label>

            {error && <p role="alert" className="alert-error">{error}</p>}
            {saved && <p className="text-sm font-bold" style={{ color: "var(--success)" }}>Application submitted for review.</p>}
            <button type="submit" disabled={submitting || !consent} className="btn-accent w-full rounded-xl py-3.5 text-sm font-bold disabled:opacity-50">
              {submitting ? "Submitting…" : currentApplication ? "Update application" : "Submit application"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
