"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import FilterSidebar from "@/components/FilterSidebar";
import RouteCard from "@/components/RouteCard";
import SkeletonCard from "@/components/SkeletonCard";
import HeroSection from "@/components/HeroSection";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

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
}

/** Returns true when viewport is >= 640px (Tailwind `sm` breakpoint). */
function useIsSmScreen(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    const mql = window.matchMedia("(min-width: 640px)");
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  }, []);
  const getSnapshot = useCallback(() => window.matchMedia("(min-width: 640px)").matches, []);
  // During SSR, assume mobile (sm = false) so the mobile input is the active one.
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const DEFAULT_FILTERS = {
  difficulty: "",
  minDistance: "",
  maxDistance: "",
  county: "",
  surface_type: "",
  search: "",
  verified: "",
  country: "",
  discipline: "",
};

export default function Home() {
  const { user, logout, unreadCount } = useAuth();
  const isSmScreen = useIsSmScreen();
  const contentRef = useRef<HTMLDivElement>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Auto-request geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSortBy("nearby");
      },
      () => {
        // Permission denied or error — stay on "newest"
      }
    );
  }, []);

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => v !== "" && k !== "search"
  ).length;

  // Fetch regions when country filter changes
  useEffect(() => {
    const countryParam = filters.country ? `&country=${encodeURIComponent(filters.country)}` : "";
    fetch(`/api/routes?regions=true${countryParam}`)
      .then((r) => r.json())
      .then((data) => setRegions(Array.isArray(data) ? data : []));
  }, [filters.country]);

  const fetchRoutes = useCallback(async (pageNum = 1, append = false) => {
    const params = new URLSearchParams();
    if (filters.difficulty) params.set("difficulty", filters.difficulty);
    if (filters.minDistance) params.set("minDistance", filters.minDistance);
    if (filters.maxDistance) params.set("maxDistance", filters.maxDistance);
    if (filters.county) params.set("county", filters.county);
    if (filters.country) params.set("country", filters.country);
    if (filters.discipline) params.set("discipline", filters.discipline);
    if (filters.surface_type) params.set("surface_type", filters.surface_type);
    if (filters.search) params.set("search", filters.search);
    if (filters.verified) params.set("verified", "true");
    if (sortBy) params.set("sort", sortBy);
    if (userLocation) {
      params.set("lat", String(userLocation.lat));
      params.set("lng", String(userLocation.lng));
      if (!filters.country) {
        params.set("maxRadius", "500");
      }
    }
    params.set("page", String(pageNum));

    const res = await fetch(`/api/routes?${params}`);
    const json = await res.json();
    const newRoutes = json.data ?? json;
    setRoutes((prev) => append ? [...prev, ...newRoutes] : newRoutes);
    setHasMore(json.hasMore ?? false);
    setPage(pageNum);
    setLoading(false);
    setLoadingMore(false);
  }, [filters, sortBy, userLocation]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchRoutes(1, false);
  }, [fetchRoutes]);

  const loadMore = () => {
    setLoadingMore(true);
    fetchRoutes(page + 1, true);
  };

  const handleFilterChange = (key: string, value: string) => {
    // Reset region when country changes
    if (key === "country") {
      setFilters((prev) => ({ ...prev, country: value, county: "" }));
      return;
    }
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const stats = useMemo(() => {
    return {
      total: routes.length,
      totalKm: Math.round(routes.reduce((sum, r) => sum + r.distance_km, 0)),
    };
  }, [routes]);

  const scrollToContent = () => {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Dynamic subtitle based on active filters
  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (filters.discipline) {
      const map: Record<string, string> = { road: "road", gravel: "gravel", mtb: "MTB" };
      parts.push(map[filters.discipline] || filters.discipline);
    }
    if (filters.country) {
      parts.push(`in ${filters.country}`);
    }
    if (parts.length === 0) return userLocation && !filters.country ? `${stats.totalKm} km of routes near you` : `${stats.totalKm} km of routes worldwide`;
    if (parts.length === 1 && filters.country) return `${stats.totalKm} km of routes ${parts[0]}`;
    return `${stats.totalKm} km of ${parts.join(" ")}`;
  }, [stats.totalKm, filters.discipline, filters.country]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Hero */}
      <HeroSection onExplore={scrollToContent} />

      {/* Header */}
      <header ref={contentRef} className="px-4 md:px-6 py-3 border-b" style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}>
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="shrink-0">
            <span className="logo-mark text-2xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-lg mx-3 hidden sm:block">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                placeholder="Search routes, regions..."
                className="w-full rounded-lg pl-9 pr-3 py-2 text-sm"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                aria-hidden={!isSmScreen}
                tabIndex={isSmScreen ? 0 : -1}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/upload"
              className="btn-accent px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Share Loop</span>
            </Link>
            {user?.role === "admin" && (
              <Link
                href="/admin"
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded hidden sm:inline-block hover:opacity-80"
                style={{ background: "rgba(255, 51, 85, 0.15)", color: "var(--danger)" }}
              >
                Admin
              </Link>
            )}
            {user && (
              <Link
                href="/messages"
                className="relative p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                style={{ color: "var(--text-muted)" }}
                aria-label="Messages"
                title="Messages"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1"
                    style={{ background: "var(--danger)", color: "#fff" }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            {user && (
              <Link
                href={`/profile/${user.id}`}
                className="shrink-0 hover:opacity-80 transition-opacity"
              >
                <img
                  src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.email)}&background=1a1a1a&color=c8ff00&size=32&bold=true`}
                  alt={user.name || user.email}
                  className="w-7 h-7 rounded-full object-cover"
                  style={{ border: "1.5px solid var(--border)" }}
                />
              </Link>
            )}
            {user ? (
              <button
                onClick={logout}
                className="text-xs font-medium hidden sm:block hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                Sign out
              </button>
            ) : (
              <Link
                href="/login"
                className="text-xs font-medium hidden sm:block hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        {/* Mobile search */}
        <div className="mt-2.5 sm:hidden">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              placeholder="Search routes, regions..."
              className="w-full rounded-lg pl-9 pr-3 py-2 text-sm"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              aria-hidden={isSmScreen}
              tabIndex={isSmScreen ? -1 : 0}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row max-w-screen-2xl mx-auto w-full">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-72 shrink-0 border-r p-5 overflow-y-auto" style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}>
          <FilterSidebar
            filters={filters}
            regions={regions}
            onChange={handleFilterChange}
            onClear={() => {
              setFilters(DEFAULT_FILTERS);
              if (sortBy !== "nearby") setSortBy(userLocation ? "nearby" : "newest");
            }}
          />
        </aside>

        {/* Mobile Filter Drawer */}
        {filtersOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setFiltersOpen(false)} aria-hidden="true" />
            <div role="dialog" aria-modal="true" aria-label="Route filters" className="absolute bottom-0 left-0 right-0 rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up" style={{ background: "var(--bg-raised)" }}>
              <div className="sticky top-0 px-5 pt-3 pb-2 flex items-center justify-end" style={{ background: "var(--bg-raised)" }}>
                <div className="w-10 h-1 rounded-full absolute left-1/2 -translate-x-1/2 top-2" style={{ background: "var(--border-light)" }} />
                <button
                  onClick={() => setFiltersOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Close filters"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-5">
                <FilterSidebar
                  filters={filters}
                  regions={regions}
                  onChange={handleFilterChange}
                  onClear={() => {
                    setFilters(DEFAULT_FILTERS);
                    if (sortBy !== "nearby") setSortBy(userLocation ? "nearby" : "newest");
                  }}
                />
              </div>
              <div className="sticky bottom-0 border-t p-4" style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}>
                <button
                  onClick={() => setFiltersOpen(false)}
                  className="btn-accent w-full py-3 rounded-xl font-bold"
                >
                  Show {stats.total} loop{stats.total !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Map */}
          <div className="h-[25vh] md:h-[45vh] map-container">
            <MapView
              routes={routes}
              selectedRouteId={selectedRouteId || undefined}
              onRouteSelect={(id) => setSelectedRouteId(id)}
            />
          </div>

          {/* Route List */}
          <div className="flex-1 overflow-y-auto p-3 md:p-5">
            <div className="flex items-center justify-between mb-4 gap-2">
              <div>
                <h2 className="text-base font-extrabold tracking-tight uppercase" style={{ color: "var(--text)" }}>
                  {stats.total} loop{stats.total !== 1 ? "s" : ""}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-xs rounded-lg px-2 py-1.5 appearance-none pr-6 cursor-pointer"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 6px center',
                  }}
                >
                  {userLocation && <option value="nearby">Nearest</option>}
                  <option value="rating">Top Rated</option>
                  <option value="distance">Longest</option>
                  <option value="newest">Newest</option>
                </select>
                <button
                  onClick={() => setFiltersOpen(true)}
                  className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold" style={{ background: "var(--accent)", color: "var(--bg)" }}>
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="space-y-2 md:space-y-2.5">
                {[...Array(6)].map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : routes.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "var(--bg-card)" }}>
                  <svg className="w-6 h-6" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>No loops match your filters</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Try broadening your search or exploring a different area</p>
                <button
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    if (sortBy !== "nearby") setSortBy(userLocation ? "nearby" : "newest");
                  }}
                  className="mt-2 text-sm font-bold hover:opacity-80"
                  style={{ color: "var(--accent)" }}
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="space-y-2 md:space-y-2.5">
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
