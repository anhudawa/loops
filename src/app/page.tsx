"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import FilterBar from "@/components/FilterBar";
import ShowRoutesButton from "@/components/ShowRoutesButton";
import RouteCard from "@/components/RouteCard";
import SkeletonCard from "@/components/SkeletonCard";
import HeroSection from "@/components/HeroSection";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { DEFAULT_SPEED_KMH } from "@/config/constants";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

interface Route {
  id: string;
  name: string;
  description: string | null;
  difficulty: string;
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

/** Returns true when viewport is >= 768px (Tailwind `md` breakpoint). */
function useMdScreen(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    const mql = window.matchMedia("(min-width: 768px)");
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  }, []);
  const getSnapshot = useCallback(() => window.matchMedia("(min-width: 768px)").matches, []);
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const STORAGE_KEY = "loops-filters";

interface FilterState {
  duration: string | null;
  discipline: string;
  difficulty: string;
  surface: string;
  region: string;
  verified: boolean;
  search: string;
  sort: string;
}

const DEFAULT_FILTERS: FilterState = {
  duration: null,
  discipline: "",
  difficulty: "",
  surface: "",
  region: "",
  verified: false,
  search: "",
  sort: "",
};

function filtersFromParams(params: URLSearchParams): FilterState | null {
  const keys = ["duration", "discipline", "difficulty", "surface_type", "region", "verified", "sort"];
  const hasAny = keys.some((k) => params.has(k));
  if (!hasAny) return null;

  return {
    duration: params.get("duration") || null,
    discipline: params.get("discipline") || "",
    difficulty: params.get("difficulty") || "",
    surface: params.get("surface_type") || "",
    region: params.get("region") || "",
    verified: params.get("verified") === "true",
    search: params.get("search") || "",
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
  if (f.difficulty) p.set("difficulty", f.difficulty);
  if (f.surface) p.set("surface_type", f.surface);
  if (f.region) p.set("region", f.region);
  if (f.verified) p.set("verified", "true");
  if (f.sort) p.set("sort", f.sort);
  return p;
}

function HomeContent() {
  const { user, logout, unreadCount } = useAuth();
  const isMdScreen = useMdScreen();
  const contentRef = useRef<HTMLDivElement>(null);
  const routeListRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [filters, setFilters] = useState<FilterState>(() => {
    return filtersFromParams(searchParams) ?? filtersFromStorage() ?? DEFAULT_FILTERS;
  });

  const [routes, setRoutes] = useState<Route[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [showMap, setShowMap] = useState(false);
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

  const hasActiveFilters = filters.duration !== null || filters.discipline !== "" || filters.difficulty !== "" || filters.surface !== "" || filters.region !== "" || filters.verified;

  useEffect(() => {
    fetch(`/api/routes?regions=true`)
      .then((r) => r.json())
      .then((data) => setRegions(Array.isArray(data) ? data : []));
  }, []);

  const fetchRoutes = useCallback(async (pageNum = 1, append = false, fallbackSort?: string) => {
    const params = new URLSearchParams();
    if (filters.difficulty) params.set("difficulty", filters.difficulty);
    if (filters.discipline) params.set("discipline", filters.discipline);
    if (filters.surface) params.set("surface_type", filters.surface);
    if (filters.region) params.set("county", filters.region);
    if (filters.verified) params.set("verified", "true");
    if (filters.search) params.set("search", filters.search);
    if (filters.duration) params.set("duration", filters.duration);

    // Use fallback sort if provided, otherwise use filter sort
    const effectiveSort = fallbackSort || filters.sort;
    if (effectiveSort) params.set("sort", effectiveSort);

    if (userLocation) {
      params.set("lat", String(userLocation.lat));
      params.set("lng", String(userLocation.lng));
    }
    params.set("page", String(pageNum));

    const res = await fetch(`/api/routes?${params}`);
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

  const scrollToRoutes = () => routeListRef.current?.scrollIntoView({ behavior: "smooth" });
  const scrollToContent = () => contentRef.current?.scrollIntoView({ behavior: "smooth" });

  const sortLabel = useMemo(() => {
    if (filters.sort === "newest") return "Newest";
    if (filters.sort === "distance") return "Longest";
    if (filters.sort === "rating") return "Top rated";
    if (filters.sort === "nearby") return "Nearest";
    if (userLocation) return "Nearby · Best rated";
    return "Best rated";
  }, [filters.sort, userLocation]);

  const filterBarProps = {
    duration: filters.duration,
    discipline: filters.discipline,
    difficulty: filters.difficulty,
    surface: filters.surface,
    region: filters.region,
    verified: filters.verified,
    regions,
    avgSpeedKmh,
    routeCount: routes.length,
    onDurationChange: (d: string | null) => setFilters((f) => ({ ...f, duration: d })),
    onDisciplineChange: (d: string) => setFilters((f) => ({ ...f, discipline: d })),
    onDifficultyChange: (v: string) => setFilters((f) => ({ ...f, difficulty: v })),
    onSurfaceChange: (v: string) => setFilters((f) => ({ ...f, surface: v })),
    onRegionChange: (v: string) => setFilters((f) => ({ ...f, region: v })),
    onVerifiedChange: (v: boolean) => setFilters((f) => ({ ...f, verified: v })),
  };

  const sortSelect = (
    <select
      value={filters.sort}
      onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
      className="text-[10px] rounded px-1.5 py-1 cursor-pointer"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
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

  const routeList = (
    <>
      {routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          isSelected={route.id === selectedRouteId}
          onHover={(id) => setSelectedRouteId(id)}
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
          {loadingMore ? "Loading..." : "Load more routes"}
        </button>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <HeroSection onExplore={scrollToContent} />

      {/* Header */}
      <header id="explore" ref={contentRef} className="px-4 md:px-6 py-3 border-b" style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}>
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="shrink-0">
            <span className="logo-mark text-2xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>

          <div className="flex-1 max-w-lg mx-3 hidden md:block">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                placeholder="Search routes, regions..."
                className="w-full rounded-lg pl-9 pr-3 py-2 text-sm"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link href="/upload" className="btn-accent px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden md:inline">Share Loop</span>
            </Link>
            {user?.role === "admin" && (
              <Link href="/admin" className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded hidden md:inline-block hover:opacity-80" style={{ background: "rgba(255, 51, 85, 0.15)", color: "var(--danger)" }}>
                Admin
              </Link>
            )}
            {user && (
              <Link href="/messages" className="relative p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity" style={{ color: "var(--text-muted)" }} aria-label="Messages">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1" style={{ background: "var(--danger)", color: "#fff" }}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            {user && (
              <Link href={`/profile/${user.id}`} className="shrink-0 hover:opacity-80 transition-opacity">
                <img
                  src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.email)}&background=1a1a1a&color=c8ff00&size=32&bold=true`}
                  alt={user.name || user.email}
                  className="w-7 h-7 rounded-full object-cover"
                  style={{ border: "1.5px solid var(--border)" }}
                />
              </Link>
            )}
            {user ? (
              <button onClick={logout} className="text-xs font-medium hidden md:block hover:opacity-80" style={{ color: "var(--text-muted)" }}>Sign out</button>
            ) : (
              <Link href="/login" className="text-xs font-medium hidden md:block hover:opacity-80" style={{ color: "var(--text-muted)" }}>Sign in</Link>
            )}
          </div>
        </div>

        <div className="mt-2.5 md:hidden">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="Search routes, regions..."
              className="w-full rounded-lg pl-9 pr-3 py-2 text-sm"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row max-w-screen-2xl mx-auto w-full">
        {/* Desktop: Left panel */}
        <aside className="hidden md:flex md:flex-col w-80 shrink-0 border-r overflow-y-auto" style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}>
          <div className="p-4">
            <FilterBar {...filterBarProps} />
          </div>
          <div className="px-4 py-2 border-t border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>{sortLabel}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.5 }}>—</span>
              <span className="text-xs font-bold" style={{ color: "var(--text)" }}>
                {loading ? "..." : `${routes.length} route${routes.length !== 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button onClick={clearAllFilters} className="text-[10px] font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>Clear all</button>
              )}
              {sortSelect}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? [...Array(6)].map((_, i) => <SkeletonCard key={i} />) : routes.length === 0 ? emptyState : routeList}
          </div>
        </aside>

        {/* Desktop: Map */}
        <div className="hidden md:block flex-1 min-w-0">
          <div className="h-full map-container">
            <MapView routes={routes} selectedRouteId={selectedRouteId || undefined} onRouteSelect={(id) => setSelectedRouteId(id)} />
          </div>
        </div>

        {/* Mobile */}
        <div className="md:hidden flex-1 flex flex-col min-w-0">
          <div className="px-3 pt-3 pb-1">
            <FilterBar {...filterBarProps} />
          </div>
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>{sortLabel}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.5 }}>—</span>
              <span className="text-xs font-bold" style={{ color: "var(--text)" }}>
                {loading ? "..." : `${routes.length} route${routes.length !== 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button onClick={clearAllFilters} className="text-[10px] font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>Clear</button>
              )}
              <button
                onClick={() => setShowMap(!showMap)}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                style={{
                  background: showMap ? "var(--accent-glow)" : "var(--bg-card)",
                  border: showMap ? "1px solid var(--accent)" : "1px solid var(--border)",
                  color: showMap ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                Map
              </button>
              {sortSelect}
            </div>
          </div>

          {showMap && (
            <div className="h-[30vh] map-container">
              <MapView routes={routes} selectedRouteId={selectedRouteId || undefined} onRouteSelect={(id) => setSelectedRouteId(id)} />
            </div>
          )}

          <div ref={routeListRef} className="flex-1 overflow-y-auto p-3 pb-20">
            {loading ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}</div>
            ) : routes.length === 0 ? emptyState : (
              <div className="space-y-2">{routeList}</div>
            )}
          </div>

          <ShowRoutesButton count={routes.length} onClick={scrollToRoutes} />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
