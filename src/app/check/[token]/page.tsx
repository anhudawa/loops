import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { getRideCheckByToken } from "@/lib/db";
import CheckClient from "./CheckClient";

export const metadata: Metadata = { title: "Did you ride it? — LOOPS", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Opened from the "Did you ride it?" email or notification. */
export default async function CheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rode?: string; score?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const check = await getRideCheckByToken(token).catch(() => undefined);
  const score = Number(sp.score);
  return (
    <>
      <AppHeader />
      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {!check ? (
            <p className="text-sm" style={{ color: "var(--text)" }}>This link has expired or was already used.</p>
          ) : check.answered_at ? (
            <p className="text-sm" style={{ color: "var(--text)" }}>Thanks — we already have your answer for {check.route_name}.</p>
          ) : (
            <CheckClient
              token={token}
              routeId={check.route_id}
              routeName={check.route_name ?? "your ride"}
              initialRode={sp.rode === "1" ? true : sp.rode === "0" ? false : null}
              initialScore={Number.isInteger(score) && score >= 1 && score <= 5 ? score : null}
            />
          )}
        </div>
      </main>
    </>
  );
}
