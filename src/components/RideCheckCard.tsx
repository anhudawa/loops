"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import RideCheckQuestions from "@/components/RideCheckQuestions";
import { canOfferPush, enablePush } from "@/lib/push-client";

interface Due { id: string; route_name: string; distance_km: number }

/**
 * The day after a rider saves a route (or takes its GPX): a card at the
 * bottom of whatever page they open — "Did you ride it? How was it?"
 * Once answered, offers push reminders for next time (when available).
 */
export default function RideCheckCard() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [due, setDue] = useState<Due | null>(null);
  const [hidden, setHidden] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [push, setPush] = useState<"offer" | "on" | "no" | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/ride-checks")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setDue((j?.data as Due[] | undefined)?.[0] ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  if (!user || !due || hidden || pathname?.startsWith("/check/")) return null;

  return (
    <div
      role="dialog"
      aria-label="Did you ride it?"
      className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-lg mx-auto rounded-2xl p-4 shadow-2xl relative" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setHidden(true)}
          className="absolute top-1 right-1 w-11 h-11 flex items-center justify-center text-lg"
          style={{ color: "var(--text-muted)" }}
        >
          ×
        </button>
        <RideCheckQuestions
          routeName={due.route_name}
          answer={async (body) => {
            const r = await fetch("/api/ride-checks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: due.id, ...body }) });
            return r.ok;
          }}
          onDone={() => { setAnswered(true); setPush(canOfferPush() ? "offer" : null); setTimeout(() => { if (!canOfferPush()) setHidden(true); }, 4000); }}
        />
        {answered && push === "offer" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Want this as a notification after your next ride?</p>
            <button type="button" className="min-h-[44px] px-4 rounded-full text-sm font-semibold" style={{ background: "var(--bg-raised)", color: "var(--text)", border: "1px solid var(--border)" }}
              onClick={async () => setPush((await enablePush()) ? "on" : "no")}>
              Turn on notifications
            </button>
          </div>
        )}
        {push === "on" && <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Notifications on.</p>}
        {push === "no" && <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Couldn&apos;t turn them on — we&apos;ll email you instead.</p>}
      </div>
    </div>
  );
}
