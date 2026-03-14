"use client";

import { CATEGORY_COLORS, type Climb } from "@/lib/climb-detection";

interface ClimbCardsProps {
  climbs: Climb[];
  onClimbSelect?: (climb: Climb) => void;
}

export default function ClimbCards({ climbs, onClimbSelect }: ClimbCardsProps) {
  if (climbs.length === 0) return null;

  // Build summary: count by category
  const categoryCounts: Record<string, number> = {};
  climbs.forEach((c) => {
    if (c.category) {
      categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
    }
  });

  const summaryParts = Object.entries(categoryCounts)
    .sort(([a], [b]) => {
      const order = ["HC", "Cat 1", "Cat 2", "Cat 3", "Cat 4"];
      return order.indexOf(a) - order.indexOf(b);
    })
    .map(([cat, count]) => `${count} ${cat}`);

  return (
    <div>
      {/* Summary header */}
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-4 h-4 shrink-0"
          style={{ color: "var(--warning)" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <h3
          className="text-xs font-extrabold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          {climbs.length} {climbs.length === 1 ? "Climb" : "Climbs"}
        </h3>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {summaryParts.join(", ")}
        </span>
      </div>

      {/* Climb cards */}
      <div className="grid gap-2">
        {climbs.map((climb, i) => {
          const color = climb.category ? CATEGORY_COLORS[climb.category] ?? "var(--text-muted)" : "var(--text-muted)";

          return (
            <button
              key={i}
              onClick={() => onClimbSelect?.(climb)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: `${color}26`, // 15% opacity
                border: `1px solid ${color}40`, // 25% opacity
              }}
            >
              {/* Category badge */}
              <div
                className="shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center"
                style={{
                  background: `${color}26`, // 15% opacity
                  border: `1px solid ${color}40`, // 25% opacity
                }}
              >
                <span
                  className="text-[10px] font-extrabold uppercase tracking-wider leading-none"
                  style={{ color }}
                >
                  {climb.category}
                </span>
              </div>

              {/* Climb info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-bold" style={{ color: "var(--text)" }}>
                    km {climb.startKm.toFixed(1)} → {climb.endKm.toFixed(1)}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    ({climb.distanceKm.toFixed(1)} km)
                  </span>
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {Math.round(climb.startElev)}m → {Math.round(climb.endElev)}m · +{Math.round(climb.gain)}m
                </div>
              </div>

              {/* Gradient % — large and prominent */}
              <div className="shrink-0 text-right">
                <div className="text-lg font-extrabold leading-none" style={{ color }}>
                  {climb.avgGradient.toFixed(1)}%
                </div>
                <div className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>
                  avg
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
