"use client";

import { useState, useSyncExternalStore } from "react";
import { locationHelpFor } from "@/lib/location-help";

const noop = () => () => {};

/** Shown when location is blocked: the exact steps for this phone + a Try again. */
export default function LocationHelp({ onRetry, onDismiss }: { onRetry: () => void; onDismiss?: () => void }) {
  const [open, setOpen] = useState(true);
  const help = useSyncExternalStore(
    noop,
    () => locationHelpFor(navigator.userAgent, !!(navigator as Navigator & { brave?: unknown }).brave),
    () => null,
  );
  if (!help) return null;
  return (
    <div className="mt-2 rounded-xl p-3 text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }} role="status">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold" style={{ color: "var(--text)" }}>
          Location is off for LOOPS in {help.where}.
        </p>
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Close" className="min-w-[44px] min-h-[44px] -m-3 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>✕</button>
        )}
      </div>
      <button onClick={() => setOpen((o) => !o)} className="mt-1 min-h-[44px] font-bold underline" style={{ color: "var(--accent)" }}>
        {open ? "Hide how to turn it on" : "How to turn it on"}
      </button>
      {open && (
        <ol className="mt-1 space-y-1 list-decimal pl-4" style={{ color: "var(--text-secondary)" }}>
          {help.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={onRetry} className="min-h-[44px] px-4 rounded-lg font-bold" style={{ background: "var(--accent)", color: "var(--bg)" }}>
          Try again
        </button>
        <span style={{ color: "var(--text-muted)" }}>Or just name a start point in your request.</span>
      </div>
    </div>
  );
}
