"use client";

import { useState, useRef, useEffect } from "react";

interface RefineChipsProps {
  surface: string;
  region: string;
  verified: boolean;
  regions: string[];
  onSurfaceChange: (v: string) => void;
  onRegionChange: (v: string) => void;
  onVerifiedChange: (v: boolean) => void;
}

const SURFACE_OPTIONS = [
  { label: "Road", value: "road" },
  { label: "Gravel", value: "gravel" },
  { label: "Trail", value: "trail" },
  { label: "Mixed", value: "mixed" },
];

interface DropdownChipProps {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}

function DropdownChip({ label, value, options, onChange }: DropdownChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const isActive = value !== "";
  const activeLabel = options.find((o) => o.value === value)?.label;

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          minHeight: "36px",
          padding: "0.375rem 0.75rem",
          borderRadius: "9999px",
          border: isActive ? "none" : "1px solid var(--border)",
          backgroundColor: isActive ? "var(--accent)" : "transparent",
          color: isActive ? "var(--bg)" : "var(--text-muted)",
          fontSize: "0.8125rem",
          fontWeight: 500,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          whiteSpace: "nowrap",
          transition: "all 0.15s ease",
        }}
      >
        {isActive ? activeLabel : label}
        {isActive ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setOpen(false);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              backgroundColor: "rgba(0,0,0,0.2)",
              fontSize: "0.625rem",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ✕
          </span>
        ) : (
          <span style={{ fontSize: "0.625rem" }}>▾</span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: "140px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "0.75rem",
            overflow: "hidden",
            zIndex: 50,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={{
                width: "100%",
                padding: "0.625rem 0.875rem",
                background:
                  value === option.value
                    ? "rgba(200,255,0,0.08)"
                    : "transparent",
                border: "none",
                color:
                  value === option.value ? "var(--accent)" : "var(--text)",
                fontSize: "0.8125rem",
                textAlign: "left",
                cursor: "pointer",
                transition: "background 0.1s ease",
              }}
              onPointerEnter={(e) => {
                if (e.pointerType !== "touch" && value !== option.value) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== "touch") {
                  e.currentTarget.style.background =
                    value === option.value
                      ? "rgba(200,255,0,0.08)"
                      : "transparent";
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RefineChips({
  surface,
  region,
  verified,
  regions,
  onSurfaceChange,
  onRegionChange,
  onVerifiedChange,
}: RefineChipsProps) {
  const regionOptions = regions.map((r) => ({ label: r, value: r }));

  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        overflowX: "auto",
        flexWrap: "nowrap",
        paddingBottom: "0.25rem",
        scrollbarWidth: "none",
      }}
    >
      <DropdownChip
        label="Surface"
        value={surface}
        options={SURFACE_OPTIONS}
        onChange={onSurfaceChange}
      />
      <DropdownChip
        label="Region"
        value={region}
        options={regionOptions}
        onChange={onRegionChange}
      />

      {/* Verified toggle chip */}
      <button
        onClick={() => onVerifiedChange(!verified)}
        style={{
          minHeight: "36px",
          padding: "0.375rem 0.75rem",
          borderRadius: "9999px",
          border: verified ? "none" : "1px solid var(--border)",
          backgroundColor: verified ? "var(--accent)" : "transparent",
          color: verified ? "var(--bg)" : "var(--text-muted)",
          fontSize: "0.8125rem",
          fontWeight: 500,
          cursor: "pointer",
          flexShrink: 0,
          whiteSpace: "nowrap",
          transition: "all 0.15s ease",
        }}
      >
        Verified
      </button>
    </div>
  );
}
