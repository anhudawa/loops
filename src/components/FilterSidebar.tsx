"use client";

const DISCIPLINES = [
  { value: "", label: "All" },
  { value: "road", label: "Road", icon: "🚲" },
  { value: "gravel", label: "Gravel", icon: "🪨" },
  { value: "mtb", label: "MTB", icon: "🏔️" },
];

interface FilterSidebarProps {
  filters: {
    minDistance: string;
    maxDistance: string;
    county: string;
    surface_type: string;
    verified: string;
    country: string;
    discipline: string;
  };
  countries: string[];
  regions: string[];
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

export default function FilterSidebar({ filters, countries, regions, onChange, onClear }: FilterSidebarProps) {
  const hasFilters = Object.values(filters).some((v) => v !== "");

  const selectStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  const inputStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--text)" }}>Filters</h2>
        {hasFilters && (
          <button onClick={onClear} className="text-xs font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
            Clear all
          </button>
        )}
      </div>

      {/* Country */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Country</label>
        <select value={filters.country} onChange={(e) => onChange("country", e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm cursor-pointer" style={selectStyle} aria-label="Filter by country">
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Discipline pills */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Discipline</label>
        <div className="flex gap-1.5">
          {DISCIPLINES.map((d) => (
            <button
              key={d.value}
              onClick={() => onChange("discipline", d.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all text-center"
              style={{
                background: filters.discipline === d.value ? "var(--accent-glow)" : "var(--bg-card)",
                border: filters.discipline === d.value ? "1px solid var(--accent)" : "1px solid var(--border)",
                color: filters.discipline === d.value ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {d.icon ? `${d.icon} ` : ""}{d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Verified toggle */}
      <button
        onClick={() => onChange("verified", filters.verified ? "" : "true")}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all"
        style={{
          background: filters.verified ? "var(--accent-glow)" : "var(--bg-card)",
          border: filters.verified ? "1px solid var(--accent)" : "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: filters.verified ? "var(--accent)" : "var(--text-muted)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-sm font-bold" style={{ color: filters.verified ? "var(--accent)" : "var(--text-secondary)" }}>Verified only</span>
        </div>
        <div
          className="w-8 h-4.5 rounded-full relative transition-all"
          style={{
            background: filters.verified ? "var(--accent)" : "var(--border-light)",
            padding: "2px",
          }}
        >
          <div
            className="w-3.5 h-3.5 rounded-full absolute top-0.5 transition-all"
            style={{
              background: filters.verified ? "var(--bg)" : "var(--text-muted)",
              left: filters.verified ? "calc(100% - 18px)" : "2px",
            }}
          />
        </div>
      </button>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Region</label>
        <select value={filters.county} onChange={(e) => onChange("county", e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm cursor-pointer" style={selectStyle} aria-label="Filter by region">
          <option value="">All regions</option>
          {regions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Distance (km)</label>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            placeholder="Min"
            value={filters.minDistance}
            onChange={(e) => onChange("minDistance", e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
            aria-label="Minimum distance in km"
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>to</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.maxDistance}
            onChange={(e) => onChange("maxDistance", e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
            aria-label="Maximum distance in km"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Surface</label>
        <select value={filters.surface_type} onChange={(e) => onChange("surface_type", e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm cursor-pointer" style={selectStyle} aria-label="Filter by surface type">
          <option value="">All surfaces</option>
          <option value="gravel">Gravel</option>
          <option value="mixed">Mixed</option>
          <option value="trail">Trail</option>
          <option value="road">Road</option>
          <option value="singletrack">Singletrack</option>
          <option value="technical">Technical</option>
        </select>
      </div>

    </div>
  );
}
