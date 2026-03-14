"use client";

interface DurationStripProps {
  selected: string | null;
  onSelect: (duration: string | null) => void;
  avgSpeedKmh: number;
}

const DURATIONS = [
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "3h", hours: 3 },
  { label: "4h+", hours: 4 },
];

export default function DurationStrip({
  selected,
  onSelect,
  avgSpeedKmh,
}: DurationStripProps) {
  return (
    <div>
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.875rem",
          marginBottom: "0.5rem",
        }}
      >
        How long have you got?
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {DURATIONS.map(({ label, hours }) => {
          const isSelected = selected === label;
          const approxKm = Math.round(avgSpeedKmh * hours);

          return (
            <button
              key={label}
              onClick={() => onSelect(isSelected ? null : label)}
              style={{
                flex: 1,
                minHeight: "44px",
                padding: "0.75rem 0.5rem",
                borderRadius: "0.75rem",
                border: isSelected
                  ? "2px solid var(--accent)"
                  : "1px solid var(--border)",
                backgroundColor: isSelected
                  ? "rgba(200,255,0,0.08)"
                  : "var(--bg-card)",
                color: isSelected ? "var(--accent)" : "var(--text)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.125rem",
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "1.125rem" }}>
                {label}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: isSelected ? "var(--accent)" : "var(--text-muted)",
                  opacity: 0.8,
                }}
              >
                ~{approxKm}km
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
