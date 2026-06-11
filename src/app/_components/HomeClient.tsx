"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DurationStrip from "@/components/DurationStrip";
import DisciplineTabs from "@/components/DisciplineTabs";
import RouteCard from "@/components/RouteCard";
import SkeletonCard from "@/components/SkeletonCard";
import HeroSection from "@/components/HeroSection";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { DEFAULT_SPEED_KMH } from "@/config/constants";
import FeaturedCollections from "./FeaturedCollections";

interface Route {
  id: string;
  name: string;
  description: string | null;
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  surface_type: string;
  county: string;
  country: string;
  region: string | null;
  discipline: string;
  start_lat: number;
  start_lng: number;
  coordinates: string;
  cover_photo: string | null;
  is_verified: number;
  distance_km_away?: number;
  estimated_minutes?: number;
  avg_score?: number;
  rating_count?: number;
}

const STORAGE_KEY = "loops-filters";

interface FilterState {
  duration: string | null;
  discipline: string;
  country: string;
  city: string;
  sort: string;
}

const DEFAULT_FILTERS: FilterState = {
  duration: null,
  discipline: "",
  country: "",
  city: "",
  sort: "",
};

function filtersFromParams(params: URLSearchParams): FilterState | null {
  const keys = ["duration", "discipline", "country", "city", "sort"];
  const hasAny = keys.some((k) => params.has(k));
  if (!hasAny) return null;

  return {
    duration: params.get("duration") || null,
    discipline: params.get("discipline") || "",
    country: params.get("country") || "",
    city: params.get("city") || "",
    sort: params.get("sort") || "",
  };
}

function filtersFromStorage(): FilterState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as FilterState;
  } catch {
    return null;
  }
}

function filtersToParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.duration) p.set("duration", f.duration);
  if (f.discipline) p.set("discipline", f.discipline);
  if (f.country) p.set("country", f.country);
  if (f.city) p.set("city", f.city);
  if (f.sort) p.set("sort", f.sort);
  return p;
}

const selectStyle = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13,
  minHeight: 44,
};

/**
 * The answer machine (2026-06-11 redesign): logged-in riders get the one
 * question, not a marketing hero. Free text → /generate; Draw → /plan;
 * Browse nearby → the geo-sorted feed below.
 */
function AnswerMachine({ onBrowseNearby }: { onBrowseNearby: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <section className="px-4 md:px-6 pt-6">
      <div
        className="max-w-3xl mx-auto rounded-2xl p-4 md:p-6"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <h1 className="text-xl md:text-2xl font-extrabold mb-3" style={{ color: "var(--text)" }}>
          Where should I ride today?
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = q.trim();
            if (trimmed) router.push(`/generate?q=${encodeURIComponent(trimmed)}`);
          }}
          className="flex gap-2"
        >
          <label htmlFor="ride-question" className="sr-only">
            Describe the ride you want
          </label>
          <input
            id="ride-question"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={1000}
            placeholder="e.g. 2 hours, rolling hills, tailwind home"
            className="flex-1 min-w-0 px-4 rounded-xl text-sm min-h-[48px]"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!q.trim()}
            className="btn-accent px-4 rounded-xl text-sm font-bold uppercase tracking-wider min-h-[48px] disabled:opacity-50"
          >
            Go
          </button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link
            href="/plan"
            className="text-xs font-bold uppercase tracking-wider px-3 min-h-[44px] inline-flex items-center rounded-lg hover:opacity-80"
            style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}
          >
            Draw a route
          </Link>
          <button
            type="button"
            onClick={onBrowseNearby}
            className="text-xs font-bold uppercase tracking-wider px-3 min-h-[44px] inline-flex items-center rounded-lg hover:opacity-80"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Browse nearby
          </button>
        </div>
      </div>
    </section>
  );
}

function HomeContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [filters, setFilters] = useState<FilterState>(() => {
    return filtersFromParams(searchParams) ?? filtersFromStorage() ?? DEFAULT_FILTERS;
  });

  const [routes, setRoutes] = useState<Route[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [avgSpeedKmh, setAvgSpeedKmh] = useState(DEFAULT_SPEED_KMH);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  // Persist filters to localStorage and URL
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* noop */ }
    const params = filtersToParams(filters);
    const paramStr = params.toString();
    const currentStr = new URLSearchParams(window.location.search).toString();
    if (paramStr !== currentStr) {
      router.replace(paramStr ? `/?${paramStr}` : "/", { scroll: false });
    }
  }, [filters, router]);

  const hasActiveFilters = filters.duration !== null || filters.discipline !== "" || filters.country !== "" || filters.city !== "";

  // Fetch countries on mount
  useEffect(() => {
    fetch("/api/routes?countries=true")
      .then((r) => r.json())
      .then((data) => setCountries(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch cities when country changes
  useEffect(() => {
    if (!filters.country) {
      setCities([]);
      return;
    }
    fetch(`/api/routes?regions=true&country=${encodeURIComponent(filters.country)}`)
      .then((r) => r.json())
      .then((data) => setCities(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [filters.country]);

  const fetchRoutes = useCallback(async (pageNum = 1, append = false, fallbackSort?: string) => {
    const params = new URLSearchParams();
    if (filters.discipline) params.set("discipline", filters.discipline);
    if (filters.country) params.set("country", filters.country);
    if (filters.city) params.set("county", filters.city);
    if (filters.duration) params.set("duration", filters.duration);

    // Use fallback sort if provided, otherwise use filter sort
    const effectiveSort = fallbackSort || filters.sort;
    if (effectiveSort) params.set("sort", effectiveSort);

    if (userLocation) {
      params.set("lat", String(userLocation.lat));
      params.set("lng", String(userLocation.lng));
    }
    params.set("page", String(pageNum));

    setFetchError(false);
    try {
      const res = await fetch(`/api/routes?${params}`);
      if (!res.ok) throw new Error(`routes API ${res.status}`);
      const json = await res.json();
      const newRoutes = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];

      // If no routes found with default sort and user has location, fall back to top rated
      if (newRoutes.length === 0 && pageNum === 1 && !append && !fallbackSort && !filters.sort && userLocation) {
        fetchRoutes(1, false, "rating");
        return;
      }

      setRoutes((prev) => append ? [...prev, ...newRoutes] : newRoutes);
      setHasMore(json.hasMore ?? false);
      setPage(pageNum);
      if (json.avgSpeedKmh) setAvgSpeedKmh(json.avgSpeedKmh);
      setLoading(false);
      setLoadingMore(false);
    } catch {
      setFetchError(true);
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters, userLocation]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchRoutes(1, false);
  }, [fetchRoutes]);

  const loadMore = () => {
    setLoadingMore(true);
    fetchRoutes(page + 1, true);
  };

  const clearAllFilters = () => setFilters(DEFAULT_FILTERS);

  const scrollToContent = () => {
    const el = document.getElementById("scroll-anchor");
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const sortLabel = useMemo(() => {
    if (filters.sort === "newest") return "Newest";
    if (filters.sort === "distance") return "Longest";
    if (filters.sort === "rating") return "Top rated";
    if (filters.sort === "nearby") return "Nearest";
    if (userLocation) return "Nearby · Best rated";
    return "Best rated";
  }, [filters.sort, userLocation]);

  const sortSelect = (
    <select
      value={filters.sort}
      onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
      className="cursor-pointer"
      style={selectStyle}
    >
      <option value="">Default</option>
      {userLocation && <option value="nearby">Nearest</option>}
      <option value="rating">Top Rated</option>
      <option value="distance">Longest</option>
      <option value="newest">Newest</option>
    </select>
  );

  const emptyState = (
    <div className="text-center py-16">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "var(--bg-card)" }}>
        <svg className="w-6 h-6" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>No loops match your filters</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Try broadening your search</p>
      {filters.duration && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Try {filters.duration === "1h" ? "2h" : filters.duration === "4h+" ? "3h" : filters.duration === "2h" ? "1h or 3h" : "2h or 4h+"} instead
        </p>
      )}
      <button onClick={clearAllFilters} className="mt-3 text-sm font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
        Clear all filters
      </button>
    </div>
  );

  const errorState = (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ background: "var(--bg-card)" }}>
        <svg className="w-6 h-6" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>Something went wrong loading routes.</p>
      <button onClick={() => fetchRoutes(1, false)} className="btn-accent px-4 py-2 rounded-lg text-sm font-bold">
        Try again
      </button>
    </div>
  );

  const routeList = (
    <>
      {routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          showDistance={!!userLocation}
        />
      ))}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          {loadingMore ? "Loading..." : "Load more loops"}
        </button>
      )}

      {/* Discovery rail — trips, not today's answer. Near-you routes
          always come first (north star: where should I ride TODAY). */}
      <div className="pt-10">
        <p className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
          Planning a trip?
        </p>
        <FeaturedCollections />
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {user ? (
        // Logged in: the answer machine. Header on top, the question next,
        // no marketing hero (CEO north star, 2026-06-11).
        <>
          <AppHeader />
          <AnswerMachine onBrowseNearby={scrollToContent} />
          {/* Scroll anchor — "Browse nearby" lands here */}
          <div id="scroll-anchor" />
        </>
      ) : (
        // Logged out: the question as a headline, then real routes.
        <>
          <HeroSection onExplore={scrollToContent} />
          {/* Scroll anchor — must be above the sticky header so scrolling works */}
          <div id="scroll-anchor" />
          <AppHeader />
        </>
      )}

      {/* Main Content */}
      <main className="max-w-3xl mx-auto w-full px-4 md:px-6 pb-20">
        {/* Duration Strip */}
        <div className="py-6">
          <DurationStrip
            selected={filters.duration}
            onSelect={(d: string | null) => setFilters((f) => ({ ...f, duration: d }))}
            avgSpeedKmh={avgSpeedKmh}
          />
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-2 pb-4">
          <DisciplineTabs
            selected={filters.discipline}
            onSelect={(d: string) => setFilters((f) => ({ ...f, discipline: d }))}
          />

          <select
            value={filters.country}
            onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value, city: "" }))}
            className="cursor-pointer"
            style={selectStyle}
          >
            <option value="">All Countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={filters.city}
            onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
            disabled={!filters.country}
            className="cursor-pointer disabled:opacity-50"
            style={selectStyle}
          >
            <option value="">All Cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {sortSelect}

          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="text-xs font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
              Clear all
            </button>
          )}
        </div>

        {/* Route Count */}
        <div className="flex items-center gap-2 pb-3">
          <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>{sortLabel}</span>
          <span className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.5 }}>&mdash;</span>
          <span className="text-xs font-bold" style={{ color: "var(--text)" }}>
            {loading ? "..." : `${routes.length} loop${routes.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Route Cards */}
        <div className="space-y-2">
          {loading ? (
            [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
          ) : fetchError ? (
            errorState
          ) : routes.length === 0 ? (
            emptyState
          ) : (
            routeList
          )}
        </div>
      </main>
    </div>
  );
}

export default function HomeClient() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
