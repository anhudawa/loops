"use client";

import { type Climb, CATEGORY_COLORS } from "@/lib/climb-detection";

interface ClimbCardsProps {
  climbs: Climb[];
  onClimbSelect: (climb: Climb) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  HC:   "Hors Catégorie",
  Cat1: "Category 1",
  Cat2: "Category 2",
  Cat3: "Category 3",
  Cat4: "Category 4",
};

export default function ClimbCards({ climbs, onClimbSelect }: ClimbCardsProps) {
  if (climbs.length === 0) return null;

  const categorised = climbs.filter((c) => c.category !== null);
  if (categorised.length === 0) return null;

  return (
    <div>
      <h2
        className="text-xs font-extrabold uppercase tracking-wider mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        Notable Climbs
      </h2>
      <div className="flex flex-col gap-2">
        {categorised.map((climb, i) => {
          const color = climb.category ? (CATEGORY_COLORS[climb.category] ?? "#c8ff00") : "#c8ff00";
          const label = climb.category ? (CATEGORY_LABELS[climb.category] ?? climb.category) : "";
          return (
            <button
              key={i}
              onClick={() => onClimbSelect(climb)}
              className="flex items-center gap-3 w-full text-left rounded-xl px-3 py-2.5 transition-all hover:opacity-80 hover:scale-[1.01]"
              style={{
                background: `${color}12`,
                border: `1px solid ${color}30`,
              }}
            >
              {/* Category badge */}
              <span
                className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                style={{ color, background: `${color}20` }}
              >
                {climb.category}
              </span>

              {/* Stats */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>
                  {label}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {climb.lengthKm}km · +{climb.elevationGainM}m · {climb.avgGradePct}% avg
                </p>
              </div>

              {/* Arrow */}
              <svg
                className="w-3.5 h-3.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                style={{ color: "var(--text-muted)" }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
