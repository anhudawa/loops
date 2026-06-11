/**
 * Itemised quality factors — an opaque 0-100 earns no trust; named
 * factors do. Shows the three riders care about most. Shared between
 * /generate candidate cards and route detail pages (parity: the best
 * features must not be locked inside /generate).
 */

const FACTOR_MAX: Record<string, { label: string; max: number }> = {
  safety_score: { label: "Quiet & safe roads", max: 35 },
  surface_score: { label: "Surface", max: 25 },
  scenic_score: { label: "Scenery", max: 20 },
};

export default function QualityFactors({ breakdown }: { breakdown: Record<string, number> }) {
  const rows = Object.entries(FACTOR_MAX)
    .filter(([k]) => typeof breakdown[k] === "number")
    .map(([k, meta]) => ({ ...meta, pct: Math.round((breakdown[k] / meta.max) * 100) }));
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-[10px] w-28 shrink-0" style={{ color: "var(--text-muted)" }}>{r.label}</span>
          <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-raised)" }}>
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.min(100, r.pct)}%`, background: r.pct >= 70 ? "var(--accent)" : r.pct >= 45 ? "#f0c050" : "#f08050" }}
            />
          </span>
          <span className="text-[10px] w-8 text-right" style={{ color: "var(--text-secondary)" }}>{r.pct}%</span>
        </div>
      ))}
    </div>
  );
}

export interface SurfaceBreakdown {
  paved_pct: number;
  unpaved_pct: number;
  unknown_pct: number;
}

/** Paved/unpaved share line ("know before you go"). Hidden when OSM had no coverage. */
export function SurfaceSummary({ breakdown }: { breakdown: SurfaceBreakdown }) {
  if (breakdown.unknown_pct >= 100) return null;
  return (
    <p className="text-xs mt-2 font-semibold" style={{ color: breakdown.unpaved_pct > 5 ? "#f0a050" : "var(--text-secondary)" }}>
      {breakdown.paved_pct >= 99
        ? "✓ 100% paved"
        : `${breakdown.paved_pct}% paved · ${breakdown.unpaved_pct}% unpaved${breakdown.unknown_pct > 10 ? ` · ${breakdown.unknown_pct}% unknown` : ""}`}
    </p>
  );
}
