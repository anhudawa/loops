"use client";

import { useEffect, useRef, useState } from "react";

interface RouteSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the debounced value once the user pauses typing. */
  onDebouncedChange: (value: string) => void;
  debounceMs?: number;
  placeholder?: string;
}

/**
 * Discovery search box (2026-06-11). The routes API already accepts a
 * `search` param matching name/description/county/region — this is the UI
 * that finally sends it. Debounced so we don't hammer the endpoint while
 * the rider is still typing.
 */
export default function RouteSearchBox({
  value,
  onChange,
  onDebouncedChange,
  debounceMs = 300,
  placeholder = "Search routes, towns, regions…",
}: RouteSearchBoxProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync when the parent clears/sets the value externally.
  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleChange = (next: string) => {
    setLocal(next);
    onChange(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onDebouncedChange(next.trim()), debounceMs);
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setLocal("");
    onChange("");
    onDebouncedChange("");
  };

  return (
    <div className="relative">
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: "var(--text-muted)" }}
        aria-hidden="true"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </span>
      <label htmlFor="route-search" className="sr-only">
        Search routes
      </label>
      <input
        id="route-search"
        type="search"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full pl-10 pr-10 rounded-xl text-sm min-h-[48px]"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          outline: "none",
        }}
      />
      {local && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
