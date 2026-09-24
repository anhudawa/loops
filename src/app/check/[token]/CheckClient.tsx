"use client";

import Link from "next/link";
import { useState } from "react";
import RideCheckQuestions from "@/components/RideCheckQuestions";

export default function CheckClient({ token, routeId, routeName, initialRode, initialScore }: {
  token: string; routeId: string; routeName: string; initialRode: boolean | null; initialScore: number | null;
}) {
  const [done, setDone] = useState(false);
  const post = async (body: object) =>
    (await fetch("/api/ride-checks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }) })).ok;
  return (
    <>
      {initialRode === false && !done ? (
        // "I didn't ride it" from the email: confirm with one tap (a mail
        // scanner opening the link must never record an answer).
        <div>
          <p className="text-base font-bold" style={{ color: "var(--text)" }}>You didn&apos;t ride {routeName}?</p>
          <button type="button" className="min-h-[44px] px-4 rounded-full text-sm font-semibold mt-3" style={{ background: "var(--accent)", color: "var(--bg)" }}
            onClick={async () => { if (await post({ rode: false })) setDone(true); }}>
            That&apos;s right
          </button>
        </div>
      ) : done ? (
        <p className="text-sm" style={{ color: "var(--text)" }} role="status">Thanks — noted.</p>
      ) : (
        <RideCheckQuestions routeName={routeName} initialRode={initialRode} initialScore={initialScore} answer={post} onDone={() => {}} />
      )}
      <p className="text-xs mt-5"><Link href={`/routes/${routeId}`} style={{ color: "var(--text-muted)" }}>Open the route →</Link></p>
    </>
  );
}
