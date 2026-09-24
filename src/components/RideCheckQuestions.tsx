"use client";

import { useState } from "react";

/**
 * The two questions after a ride: "Did you ride it?" then "How was it?"
 * (1–5). Used by the in-app card and the /check page (email/push link).
 * `answer` posts to /api/ride-checks and resolves true when stored.
 */
export default function RideCheckQuestions({
  routeName,
  initialRode,
  initialScore,
  answer,
  onDone,
}: {
  routeName: string;
  initialRode?: boolean | null;
  initialScore?: number | null;
  answer: (body: { rode?: boolean; score?: number; notYet?: boolean }) => Promise<boolean>;
  onDone?: (result: "rated" | "not-ridden" | "not-yet") => void;
}) {
  const [step, setStep] = useState<"rode" | "stars" | "done">(initialRode === true ? "stars" : "rode");
  const [score, setScore] = useState<number | null>(initialScore ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState("");

  async function send(body: { rode?: boolean; score?: number; notYet?: boolean }, result: "rated" | "not-ridden" | "not-yet", msg: string) {
    setBusy(true);
    setError(null);
    const ok = await answer(body).catch(() => false);
    setBusy(false);
    if (!ok) { setError("That didn't save — try again."); return; }
    setThanks(msg);
    setStep("done");
    onDone?.(result);
  }

  const btn = "min-h-[44px] px-4 rounded-full text-sm font-semibold";
  if (step === "done") {
    return <p className="text-sm" style={{ color: "var(--text)" }} role="status">{thanks}</p>;
  }
  return (
    <div>
      {step === "rode" ? (
        <>
          <p className="text-base font-bold" style={{ color: "var(--text)" }}>Did you ride {routeName}?</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className={btn} disabled={busy} onClick={() => setStep("stars")} style={{ background: "var(--accent)", color: "var(--bg)" }}>Yes, I rode it</button>
            <button type="button" className={btn} disabled={busy} onClick={() => send({ notYet: true }, "not-yet", "No problem — we'll ask again in a couple of days.")} style={{ background: "var(--bg-raised)", color: "var(--text)", border: "1px solid var(--border)" }}>Not yet</button>
            <button type="button" className={btn} disabled={busy} onClick={() => send({ rode: false }, "not-ridden", "Thanks — noted.")} style={{ background: "var(--bg-raised)", color: "var(--text)", border: "1px solid var(--border)" }}>I didn&apos;t ride it</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-base font-bold" style={{ color: "var(--text)" }}>How was {routeName}?</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Your stars decide whether we suggest it to other riders.</p>
          <div className="flex gap-1 mt-3" role="radiogroup" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onClick={() => setScore(n)}
                className="w-11 h-11 rounded-xl text-2xl leading-none"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: score && n <= score ? "var(--accent)" : "var(--text-muted)" }}
              >
                ★
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${btn} mt-3`}
            disabled={busy || !score}
            onClick={() => score && send({ rode: true, score }, "rated", score >= 4 ? "Thanks — riders like you are how good loops get found." : "Thanks — that helps us stop suggesting it.")}
            style={{ background: "var(--accent)", color: "var(--bg)", opacity: score ? 1 : 0.5 }}
          >
            {busy ? "Saving…" : "Send"}
          </button>
        </>
      )}
      {error && <p className="text-xs mt-2" style={{ color: "#ff6b6b" }} role="alert">{error}</p>}
    </div>
  );
}
