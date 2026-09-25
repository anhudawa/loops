"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { formatRideWhen } from "@/lib/ride-invite";

interface MyRide {
  id: string;
  route_id: string;
  starts_at: string;
  meet: string;
  route_name: string;
  distance_km: number;
  elevation_gain_m: number;
  my_status: "yes" | "maybe" | "no" | null;
  is_creator: boolean;
  yes_count: number;
  maybe_count: number;
}

const MINE: Record<string, string> = { yes: "You're in", maybe: "Maybe", no: "Can't make it" };
const PAST: Record<string, string> = { yes: "You were in", maybe: "Maybe", no: "Couldn't make it" };

/** Rides the rider shared or answered — open one to see the roll call, re-share it, or forward it. */
export default function MyRidesClient() {
  const { user, loading } = useAuth();
  const [rides, setRides] = useState<MyRide[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent("/rides")}`;
      return;
    }
    fetch("/api/rides/mine")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => setRides(b.data ?? []))
      .catch(() => setFailed(true));
  }, [user, loading]);

  // A ride stays "coming up" all of its day (as on the ride page), by the
  // wall-clock date in the link.
  const today = (() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();
  const upcoming = (rides ?? []).filter((r) => r.starts_at.slice(0, 10) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = (rides ?? []).filter((r) => r.starts_at.slice(0, 10) < today);

  const card = (r: MyRide, isPast: boolean) => {
    const href = `/ride/${r.route_id}?${new URLSearchParams({ t: r.starts_at, ...(r.meet ? { m: r.meet } : {}) }).toString()}`;
    const chip = r.my_status ? (isPast ? PAST : MINE)[r.my_status] : r.is_creator ? "You shared it" : null;
    const chipOn = r.my_status === "yes";
    return (
      <li key={r.id}>
        <Link href={href} className="block rounded-2xl p-4 transition-colors hover:brightness-110" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: isPast ? "var(--text-muted)" : "var(--accent)" }}>
              {formatRideWhen(r.starts_at) ?? r.starts_at}{r.meet ? ` · ${r.meet}` : ""}
            </p>
            {chip && (
              <span
                className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={chipOn ? { background: "var(--accent)", color: "#0a0a0a" } : { border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              >
                {chip}
              </span>
            )}
          </div>
          <p className="text-base font-extrabold mt-1" style={{ color: "var(--text)" }}>{r.route_name}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {Math.round(Number(r.distance_km) * 10) / 10} km · +{Math.round(Number(r.elevation_gain_m))} m
            {" · "}<strong style={{ color: "var(--text)" }}>{r.yes_count} {isPast ? "said they were in" : "going"}</strong>{r.maybe_count ? ` · ${r.maybe_count} maybe` : ""}
          </p>
        </Link>
      </li>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />
      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>My rides</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Rides you&apos;ve shared or answered. Open one to see who&apos;s in, forward it, or share it to your Instagram Story.
        </p>
        {failed && <p className="text-sm mt-6" style={{ color: "#ff6b6b" }}>Couldn&apos;t load your rides — refresh to try again.</p>}
        {rides === null && !failed && (
          <ul className="grid gap-3 mt-6" aria-label="Loading your rides">
            {[0, 1].map((i) => <li key={i} className="h-[92px] rounded-2xl animate-pulse" style={{ background: "var(--bg-card)" }} />)}
          </ul>
        )}
        {rides && rides.length === 0 && (
          <div className="mt-6 rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-bold" style={{ color: "var(--text)" }}>No rides yet</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Open a route, tap <strong>Invite friends to ride</strong>, pick the day and meeting point and share it — it lands here, with its roll call.
            </p>
            <Link href="/routes" className="inline-flex items-center mt-4 px-4 min-h-[44px] rounded-xl text-sm font-bold" style={{ background: "var(--accent)", color: "#0a0a0a" }}>
              Find a route
            </Link>
          </div>
        )}
        {upcoming.length > 0 && (
          <>
            <h2 className="text-xs font-bold uppercase tracking-wider mt-6 mb-2" style={{ color: "var(--text-secondary)" }}>Coming up</h2>
            <ul className="grid gap-3">{upcoming.map((r) => card(r, false))}</ul>
          </>
        )}
        {past.length > 0 && (
          <>
            <h2 className="text-xs font-bold uppercase tracking-wider mt-8 mb-2" style={{ color: "var(--text-secondary)" }}>Past rides</h2>
            <ul className="grid gap-3 opacity-80">{past.map((r) => card(r, true))}</ul>
          </>
        )}
      </main>
    </div>
  );
}
