"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` on import — client-only.
const MapPlanner = dynamic(() => import("@/components/MapPlanner"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center"
      style={{ height: "100dvh", background: "var(--bg)", color: "var(--text-muted)" }}
    >
      <p className="text-sm">Loading the map…</p>
    </div>
  ),
});

export default function PlanClient() {
  return <MapPlanner />;
}
