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
  // viewport. Non-sticky header — the map owns its own scroll. Fixed to the
  // viewport so the site footer (rendered by the root layout) sits under it
  // instead of adding a page scroll below a full-screen planner.
  return (
    <div className="fixed inset-x-0 top-0 z-30 flex flex-col" style={{ height: "100dvh", background: "var(--bg)" }}>
      <AppHeader sticky={false} />
      <div className="flex-1 min-h-0">
        <MapPlanner />
      </div>
    </div>
  );
}
