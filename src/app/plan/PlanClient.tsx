"use client";

import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";

// Leaflet touches `window` on import — client-only.
const MapPlanner = dynamic(() => import("@/components/MapPlanner"), {
  ssr: false,
  loading: () => (
    <div
      className="flex-1 flex items-center justify-center"
      style={{ background: "var(--bg)", color: "var(--text-muted)" }}
    >
      <p className="text-sm">Loading the map…</p>
    </div>
  ),
});

export default function PlanClient() {
  // Shared header on top, planner toolbar + map filling the rest of the
  // viewport. Non-sticky header — the map owns its own scroll.
  return (
    <div className="flex flex-col" style={{ height: "100dvh", background: "var(--bg)" }}>
      <AppHeader sticky={false} />
      <div className="flex-1 min-h-0">
        <MapPlanner />
      </div>
    </div>
  );
}
