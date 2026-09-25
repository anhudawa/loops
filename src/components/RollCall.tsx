"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

type Status = "yes" | "maybe" | "no";
interface Roll {
  saved: boolean;
  counts: Record<Status, number>;
  names?: Record<Status, string[]>;
  mine: Status | null;
}

const CHOICES: Array<{ status: Status; label: string; short: string }> = [
  { status: "yes", label: "I'm in", short: "Going" },
  { status: "maybe", label: "Maybe", short: "Maybe" },
  { status: "no", label: "Can't make it", short: "Not this time" },
];

/**
 * The roll call on a group-ride link (owner 2026-09-25): three toggles —
 * in / maybe / can't — and who said what. Counts for everyone with the
 * link; first names for signed-in riders. Answering saves the ride to the
 * rider's "My rides". Signed out, a toggle goes to sign-in and back.
 */
export default function RollCall({ routeId, t, meet }: { routeId: string; t: string; meet: string | null }) {
  const { user, loading } = useAuth();
  const [roll, setRoll] = useState<Roll | null>(null);
  const [busy, setBusy] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = new URLSearchParams({ route: routeId, t, ...(meet ? { m: meet } : {}) }).toString();

  useEffect(() => {
    if (loading) return;
    let gone = false;
    fetch(`/api/rides?${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!gone && b?.data) setRoll(b.data); })
      .catch(() => {});
    return () => { gone = true; };
  }, [query, loading, user?.id]);

  const answer = async (status: Status) => {
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    setBusy(status);
    setError(null);
    // Optimistic: the tap shows at once.
    setRoll((r) => {
      if (!r) return r;
      const counts = { ...r.counts };
      if (r.mine) counts[r.mine] = Math.max(0, counts[r.mine] - 1);
      counts[status]++;
      return { ...r, counts, mine: status };
    });
    try {
      const res = await fetch("/api/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route_id: routeId, t, m: meet ?? "", status }),
      });
      const b = await res.json().catch(() => null);
      if (res.ok && b?.data) setRoll(b.data);
      else setError(b?.error ?? "Couldn't save your answer — try again.");
    } catch {
      setError("Couldn't save your answer — check your connection.");
    } finally {
      setBusy(null);
    }
  };

  const counts = roll?.counts ?? { yes: 0, maybe: 0, no: 0 };
  return (
    <section className="mt-3" aria-labelledby="roll-call-title" data-testid="roll-call">
      <h2 id="roll-call-title" className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
        Roll call{counts.yes ? ` · ${counts.yes} going` : ""}
      </h2>
      <div className="grid grid-cols-3 gap-2 mt-2" role="group" aria-label="Are you riding?">
        {CHOICES.map((c) => {
          const on = roll?.mine === c.status;
          return (
            <button
              key={c.status}
              type="button"
              onClick={() => answer(c.status)}
              disabled={busy !== null}
              aria-pressed={on}
              className="min-h-[48px] rounded-xl text-xs font-bold px-2 flex flex-col items-center justify-center disabled:opacity-60"
              style={{
                background: on ? (c.status === "yes" ? "var(--accent)" : "var(--text)") : "var(--bg-card)",
                color: on ? "#0a0a0a" : "var(--text)",
                border: `1px solid ${on ? "transparent" : "var(--border)"}`,
              }}
            >
              <span>{c.label}</span>
              <span className="text-[10px] font-semibold opacity-80">{counts[c.status]}</span>
            </button>
          );
        })}
      </div>
      {roll?.names && (counts.yes + counts.maybe + counts.no > 0) && (
        <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          {CHOICES.map((c) => (roll.names![c.status].length ? (
            <li key={c.status}>
              <span className="font-bold" style={{ color: "var(--text)" }}>{c.short}:</span> {roll.names![c.status].join(", ")}
            </li>
          ) : null))}
        </ul>
      )}
      {!user && !loading && (
        <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>Sign in to answer and see who&apos;s riding.</p>
      )}
      {error && <p className="text-xs mt-2" style={{ color: "#ff6b6b" }} role="status">{error}</p>}
    </section>
  );
}
