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

const MINE: Record<string, string> = { yes: "You're in", maybe: "You: maybe", no: "You can't make it" };

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

  // Wall-clock comparison, like the ride links themselves (YYYY-MM-DDTHH:MM).
  const now = (() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  })();
  const upcoming = (rides ?? []).filter((r) => r.starts_at >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = (rides ?? []).filter((r) => r.starts_at < now);

  const card = (r: MyRide) => {
    const href = `/ride/${r.route_id}?${new URLSearchParams({ t: r.starts_at, ...(r.meet ? { m: r.meet } : {}) }).toString()}`;
    return (
      <li key={r.id}>
        <Link href={href} className="block rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
            {formatRideWhen(r.starts_at) ?? r.starts_at}{r.meet ? ` · ${r.meet}` : ""}
          </p>
          <p className="text-base font-extrabold mt-1" style={{ color: "var(--text)" }}>{r.route_name}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {Math.round(Number(r.distance_km) * 10) / 10} km · +{Math.round(Number(r.elevation_gain_m))} m
            {" · "}{r.yes_count} going{r.maybe_count ? ` · ${r.maybe_count} maybe` : ""}
            {r.my_status ? ` · ${MINE[r.my_status]}` : r.is_creator ? " · You shared it" : ""}
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
        {rides === null && !failed && <p className="text-sm mt-6" style={{ color: "var(--text-muted)" }}>Loading…</p>}
        {rides && rides.length === 0 && (
          <p className="text-sm mt-6" style={{ color: "var(--text-secondary)" }}>
            No rides yet. Open a route, tap <strong>Invite friends to ride</strong>, pick the day and meeting point and share it — it lands here.
          </p>
        )}
        {upcoming.length > 0 && (
          <>
            <h2 className="text-xs font-bold uppercase tracking-wider mt-6 mb-2" style={{ color: "var(--text-secondary)" }}>Coming up</h2>
            <ul className="grid gap-3">{upcoming.map(card)}</ul>
          </>
        )}
        {past.length > 0 && (
          <>
            <h2 className="text-xs font-bold uppercase tracking-wider mt-8 mb-2" style={{ color: "var(--text-secondary)" }}>Ridden</h2>
            <ul className="grid gap-3 opacity-80">{past.map(card)}</ul>
          </>
        )}
      </main>
    </div>
  );
}
