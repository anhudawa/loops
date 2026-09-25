"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

type Status = "yes" | "maybe" | "no";
interface Roll {
  saved: boolean;
  counts: Record<Status, number>;
  names?: Record<Status, string[]>;
  organiser?: string | null;
  mine: Status | null;
}

const CHOICES: Array<{ status: Status; label: string; short: string }> = [
  { status: "yes", label: "I'm in", short: "Going" },
  { status: "maybe", label: "Maybe", short: "Maybe" },
  { status: "no", label: "Can't make it", short: "Not this time" },
];

const isStatus = (v: string | null): v is Status => v === "yes" || v === "maybe" || v === "no";

/**
 * The roll call on a group-ride link (owner 2026-09-25): three toggles —
 * in / maybe / can't — and who said what. Counts for everyone with the
 * link; first names for signed-in riders. Answering saves the ride to the
 * rider's "My rides".
 *
 * Signed out, the loud part is "Confirm your attendance" → sign up / log in;
 * those links carry rsvp=yes, so arriving back signed in answers "I'm in"
 * for them (once — the parameter is then dropped from the address).
 * A ride whose day has gone shows its roll call read-only.
 */
export default function RollCall({ routeId, t, meet, when, passed = false }: { routeId: string; t: string; meet: string | null; when?: string | null; passed?: boolean }) {
  const { user, loading } = useAuth();
  const [roll, setRoll] = useState<Roll | null>(null);
  const [busy, setBusy] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAnswered, setJustAnswered] = useState(false);
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

  const answer = useCallback(async (status: Status) => {
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
      if (res.ok && b?.data) { setRoll(b.data); setJustAnswered(true); }
      else setError(b?.error ?? "Couldn't save your answer — try again.");
    } catch {
      setError("Couldn't save your answer — check your connection.");
    } finally {
      setBusy(null);
    }
  }, [routeId, t, meet]);

  // Back from "Sign up to confirm": answer for them, once.
  const autoAnswered = useRef(false);
  useEffect(() => {
    if (!user || !roll || passed || autoAnswered.current) return;
    const url = new URL(window.location.href);
    const wanted = url.searchParams.get("rsvp");
    if (!wanted) return;
    autoAnswered.current = true;
    url.searchParams.delete("rsvp");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (isStatus(wanted) && !roll.mine) void answer(wanted);
  }, [user, roll, passed, answer]);

  const counts = roll?.counts ?? { yes: 0, maybe: 0, no: 0 };
  const answered = counts.yes + counts.maybe + counts.no;
  // Where sign-in comes back to: this ride, answering "I'm in".
  const back = () => {
    if (typeof window === "undefined") return "";
    const u = new URL(window.location.href);
    u.searchParams.set("rsvp", "yes");
    return encodeURIComponent(u.pathname + u.search);
  };
  const calendarHref = `/api/rides/calendar?${query}`;
  const confirmation =
    roll?.mine === "yes" ? `You're in${when ? ` — see you ${when.replace(" · ", " at ")}` : ""}${meet ? `, ${meet}` : ""}.`
    : roll?.mine === "maybe" ? "Marked as maybe — change it any time before the ride."
    : roll?.mine === "no" ? "Thanks for letting the group know."
    : null;

  return (
    <section className="mt-3" aria-labelledby="roll-call-title" data-testid="roll-call">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="roll-call-title" className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Roll call{counts.yes ? ` · ${counts.yes} ${passed ? "said they were in" : "going"}` : ""}
        </h2>
        {user && roll?.organiser && (
          <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }} data-testid="roll-call-organiser">
            Shared by <strong style={{ color: "var(--text-secondary)" }}>{roll.organiser}</strong>
          </p>
        )}
      </div>
      {passed ? (
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
          {answered ? `${counts.yes} in · ${counts.maybe} maybe · ${counts.no} couldn't make it.` : "Nobody answered the roll call for this one."}
        </p>
      ) : loading ? (
        // Sign-in state not known yet: hold the space so nothing jumps.
        <div className="mt-2 h-[112px] rounded-xl" style={{ background: "var(--bg-card)" }} aria-hidden="true" />
      ) : !user ? (
        // Arriving from a shared link, signed out (owner 2026-09-25): the
        // first thing to do is say you're coming — make that the loud part.
        <div className="mt-2 rounded-xl p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--accent)" }} data-testid="roll-call-signin">
          <p className="text-base font-extrabold leading-tight" style={{ color: "var(--text)" }}>Are you riding? Confirm your attendance</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {answered
              ? `${counts.yes} in · ${counts.maybe} maybe · ${counts.no} can't make it. `
              : "Be the first to say you're in. "}
            Free account — takes a few seconds.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <a
              href="/login?mode=signup"
              onClick={(e) => { e.currentTarget.href = `/login?mode=signup&redirect=${back()}`; }}
              className="min-h-[48px] rounded-xl text-sm font-extrabold flex items-center justify-center text-center px-2"
              style={{ background: "var(--accent)", color: "#0a0a0a" }}
              data-testid="roll-call-signup"
            >
              Sign up to confirm
            </a>
            <a
              href="/login"
              onClick={(e) => { e.currentTarget.href = `/login?redirect=${back()}`; }}
              className="min-h-[48px] rounded-xl text-sm font-bold flex items-center justify-center text-center px-2"
              style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }}
              data-testid="roll-call-login"
            >
              Log in
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mt-2" role="group" aria-label="Are you riding?">
            {CHOICES.map((c) => {
              const on = roll?.mine === c.status;
              return (
                <button
                  key={c.status}
                  type="button"
                  onClick={() => answer(c.status)}
                  disabled={busy !== null || !roll}
                  aria-pressed={on}
                  className="min-h-[52px] rounded-xl text-xs font-bold px-2 flex flex-col items-center justify-center disabled:opacity-60 transition-colors"
                  style={{
                    background: on ? (c.status === "yes" ? "var(--accent)" : "var(--text)") : "var(--bg-card)",
                    color: on ? "#0a0a0a" : "var(--text)",
                    border: `1px solid ${on ? "transparent" : "var(--border)"}`,
                  }}
                >
                  <span>{on ? "✓ " : ""}{c.label}</span>
                  <span className="text-[10px] font-semibold opacity-80">{counts[c.status]}</span>
                </button>
              );
            })}
          </div>
          {confirmation && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2" role="status" aria-live="polite">
              <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{justAnswered || roll?.mine !== "yes" ? confirmation : "You're in."}</p>
              {roll?.mine === "yes" && (
                <a href={calendarHref} className="text-xs font-bold underline underline-offset-2" style={{ color: "var(--accent)" }} data-testid="roll-call-calendar">
                  Add to calendar
                </a>
              )}
            </div>
          )}
        </>
      )}
      {user && roll?.names && answered > 0 && (
        <ul className="mt-2 space-y-1.5 text-xs" aria-label="Who's riding">
          {CHOICES.map((c) => (roll.names![c.status].length ? (
            <li key={c.status} className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold mr-0.5" style={{ color: "var(--text)" }}>{c.short}</span>
              {roll.names![c.status].map((n, i) => (
                <span key={`${n}-${i}`} className="px-2 py-0.5 rounded-full" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{n}</span>
              ))}
            </li>
          ) : null))}
        </ul>
      )}
      {error && <p className="text-xs mt-2" style={{ color: "#ff6b6b" }} role="status">{error}</p>}
    </section>
  );
}
