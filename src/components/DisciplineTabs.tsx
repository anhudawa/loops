"use client";

interface DisciplineTabsProps {
  selected: string;
  onSelect: (discipline: string) => void;
}

const TABS = [
  { label: "All", value: "" },
  { label: "Road", value: "road" },
  { label: "Gravel", value: "gravel" },
  { label: "MTB", value: "mtb" },
];

export default function DisciplineTabs({
  selected,
  onSelect,
}: DisciplineTabsProps) {
  return (
    <div style={{ display: "flex", width: "100%" }}>
      {TABS.map(({ label, value }) => {
        const isActive = selected === value;

        return (
          <button
            key={value}
            onClick={() => onSelect(value)}
            style={{
              flex: 1,
              minHeight: "44px",
              padding: "0.75rem 0.5rem",
              background: "transparent",
              border: "none",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              color: isActive ? "var(--accent)" : "var(--text-muted)",
              fontWeight: 700,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
