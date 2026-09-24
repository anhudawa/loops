"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DurationStrip from "@/components/DurationStrip";
import DisciplineTabs from "@/components/DisciplineTabs";
import RouteCard from "@/components/RouteCard";
import SkeletonCard from "@/components/SkeletonCard";
import HeroSection from "@/components/HeroSection";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { DEFAULT_SPEED_KMH, DEFAULT_COUNTRY } from "@/config/constants";
import { locationIfAllowed, requestLocation } from "@/lib/location";
import LocationHelp from "@/components/LocationHelp";
import FeaturedCollections from "./FeaturedCollections";
import RouteSearchBox from "@/components/RouteSearchBox";
import { guideForSearch } from "@/content/destination-guides";
import { KNOWN_PLACES } from "@/lib/places-known";

/** Nearest loop further than this: the list is not "near you" — say so and offer to plan one. */
const NONE_NEAR_KM = 100;

function kmBetween(a: { lat: number; lng: number }, b: [number, number]): number {
  const dLat = ((b[0] - a.lat) * Math.PI) / 180;
  const dLng = ((b[1] - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * "Plan one from here": the planner prompt for this duration from the known
 * start place nearest the rider (within 15 km), so the ask runs from where
 * they are. No known place that close → the planner, without a prompt.
 */
function planFromHereHref(here: { lat: number; lng: number }, duration: string | null): string {
  let best: { name: string; d: number } | null = null;
  for (const p of KNOWN_PLACES) {
    const d = kmBetween(here, p.point);
    if (d <= 15 && (!best || d < best.d)) best = { name: p.name, d };
  }
  if (!best) return "/generate";
  const hours = duration ? parseInt(duration, 10) : 2;
  return `/generate?q=${encodeURIComponent(`${hours} hour loop from ${best.name}`)}`;
}

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

/**
 * The routes API (getRoutes) returns `avg_rating` and `haversine_distance`,
 * but RouteCard reads `avg_score` and `distance_km_away`. Normalise here so
 * ratings and "X km away" actually render on the feed — they were silently
 * dropped before this mapping existed. 2026-06-11 discovery-v2.
 */
function normalizeRoute(raw: Record<string, unknown>): Route {
  const avgScore = raw.avg_score !== undefined ? raw.avg_score : raw.avg_rating;
  const distanceAway =
    raw.distance_km_away !== undefined ? raw.distance_km_away : raw.haversine_distance;
  return {
    ...(raw as unknown as Route),
    avg_score: avgScore != null ? Number(avgScore) : undefined,
    distance_km_away: distanceAway != null ? Number(distanceAway) : undefined,
    rating_count: raw.rating_count != null ? Number(raw.rating_count) : undefined,
    estimated_minutes:
      raw.estimated_minutes != null ? Number(raw.estimated_minutes) : undefined,
  };
}

/** Filters used to live in localStorage and came back on every visit. */
const LEGACY_STORAGE_KEY = "loops-filters";

interface FilterState {
  duration: string | null;
  discipline: string;
  country: string;
  region: string;
  sort: string;
  search: string;
}

const DEFAULT_FILTERS: FilterState = {
  duration: null,
  discipline: "",
  country: "",
  region: "",
  sort: "",
  search: "",
};

/**
 * The URL is the only source of truth for the feed's filters: a fresh visit
 * to loops.ie is the plain feed, a shared link is exactly that feed, and the
 * logo / "Routes" (href "/") reset it. `?city=` is the old region key.
 */
function filtersFromParams(params: URLSearchParams): FilterState {
  return {
    duration: params.get("duration") || null,
    discipline: params.get("discipline") || "",
    country: params.get("country") || "",
    region: params.get("region") || params.get("city") || "",
    sort: params.get("sort") || "",
    search: params.get("search") || "",
  };
}

function filtersToParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.duration) p.set("duration", f.duration);
  if (f.discipline) p.set("discipline", f.discipline);
  if (f.country) p.set("country", f.country);
  if (f.region) p.set("region", f.region);
  if (f.sort) p.set("sort", f.sort);
  if (f.search) p.set("search", f.search);
  return p;
}

/** The query string a set of filters is shown under (canonical key order). */
const filtersKey = (f: FilterState) => filtersToParams(f).toString();

/**
 * Region names as stored carry duplicates that differ only by case or a
 * stray space ("London" / "london", "Tipperary "): one option each, the
 * tidiest spelling. The region filter matches case-insensitively.
 */
function tidyRegions(list: unknown[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of list) {
    const r = typeof raw === "string" ? raw.trim() : "";
    if (!r) continue;
    const k = r.toLowerCase();
    const cur = byKey.get(k);
    const capitalised = (t: string) => t.charAt(0) !== t.charAt(0).toLowerCase();
    if (!cur || (!capitalised(cur) && capitalised(r))) byKey.set(k, r);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

// ── Back to the same feed ────────────────────────────────────────────────
// Route card → Back used to remount the feed on page 1 at the wrong scroll
// position. The list the rider left (all loaded pages + scroll) is kept per
// tab for the query it was showing, and restored only on a Back/Forward.

const FEED_CACHE_KEY = "loops:feed";
const FEED_CACHE_MS = 30 * 60 * 1000;

interface FeedCache {
  key: string;
  routes: Route[];
  page: number;
  hasMore: boolean;
  scrollY: number;
  userLocation: { lat: number; lng: number } | null;
  at: number;
}

/** Set by a browser Back/Forward; cleared when the feed has used it or the rider taps forward. */
let arrivedByHistory =
  typeof window !== "undefined" &&
  (performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined)?.type === "back_forward";
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => { arrivedByHistory = true; });
  // Any link tap is a forward navigation: the logo / "Routes" give a fresh feed.
  document.addEventListener("click", (e) => {
    if ((e.target as Element | null)?.closest?.("a")) arrivedByHistory = false;
  }, true);
}

function readFeedCache(key: string): FeedCache | null {
  if (!arrivedByHistory) return null;
  try {
    const raw = sessionStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as FeedCache;
    if (c.key !== key || Date.now() - c.at > FEED_CACHE_MS || !Array.isArray(c.routes)) return null;
    return c;
  } catch {
    return null;
  }
}

function writeFeedCache(c: FeedCache) {
  try { sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify(c)); } catch { /* quota / private mode */ }
}

/** Positions within ~1 km are the same place: no refetch, no lost list. */
const samePlace = (a: { lat: number; lng: number } | null, b: { lat: number; lng: number }) =>
  !!a && Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lng - b.lng) < 0.01;

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
  const { user, loading: authLoading, authError } = useAuth();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const [filters, setFiltersState] = useState<FilterState>(() => filtersFromParams(searchParams));
  // Back from a route page: the list the rider left, for this exact query.
  const [restored] = useState(() => readFeedCache(filtersKey(filtersFromParams(searchParams))));

  const [routes, setRoutes] = useState<Route[]>(() => restored?.routes ?? []);
  const [countries, setCountries] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(!restored);
  const [fetchError, setFetchError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(restored?.hasMore ?? false);
  const [page, setPage] = useState(restored?.page ?? 1);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(restored?.userLocation ?? null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [avgSpeedKmh, setAvgSpeedKmh] = useState(DEFAULT_SPEED_KMH);
  // A returning rider (signed in on this device before) most likely IS
  // signed in: while auth resolves they see the answer machine; anyone else
  // sees a neutral block — never the marketing hero flashed at a member, nor
  // the member card flashed at a newcomer.
  const [likelyMember] = useState(() => {
    try { return !!localStorage.getItem("loops:lastSignIn"); } catch { return false; }
  });

  // ── Filters ⇄ URL ──────────────────────────────────────────────────────
  // The latest filters for handlers, and the query string we last wrote, so
  // a URL change we did not make (Back, the logo, a link) re-reads the URL.
  const filtersRef = useRef(filters);
  const writtenKeyRef = useRef(filtersKey(filters));
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => {
    const fromUrl = filtersFromParams(new URLSearchParams(searchKey));
    const key = filtersKey(fromUrl);
    if (key === writtenKeyRef.current) return; // our own write
    writtenKeyRef.current = key;
    filtersRef.current = fromUrl;
    setFiltersState(fromUrl);
  }, [searchKey]);

  // Old builds kept filters in localStorage and re-applied them forever.
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* noop */ }
  }, []);

  /**
   * Change the filters and the URL together. Discrete taps (tabs, pills,
   * selects, Clear) push, so Back undoes the last one; search keystrokes
   * replace. The native History API keeps Next's router in step without a
   * server round trip.
   */
  const applyFilters = useCallback((update: (f: FilterState) => FilterState, mode: "push" | "replace" = "push") => {
    const next = update(filtersRef.current);
    const key = filtersKey(next);
    if (key === filtersKey(filtersRef.current)) return;
    filtersRef.current = next;
    writtenKeyRef.current = key;
    setFiltersState(next);
    const url = key ? `/?${key}` : "/";
    if (url !== window.location.pathname + window.location.search) {
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    }
  }, []);

  // Never prompt on load: use the position only if already allowed (or
  // cached); otherwise the heading offers "Use my location".
  useEffect(() => {
    let cancelled = false;
    locationIfAllowed().then((p) => {
      if (!cancelled && p) setUserLocation((prev) => (samePlace(prev, p) ? prev : p));
    });
    return () => { cancelled = true; };
  }, []);
  const [locationBlocked, setLocationBlocked] = useState(false);
  const [locating, setLocating] = useState(false);
  const askLocation = async () => {
    const pending = requestLocation(); // straight from the tap (iOS)
    setLocating(true);
    const p = await pending;
    setLocating(false);
    if (p) { setUserLocation((prev) => (samePlace(prev, p) ? prev : p)); setLocationBlocked(false); }
    else { setLocationDenied(true); setLocationBlocked(true); }
  };

  const hasActiveFilters =
    filters.duration !== null ||
    filters.discipline !== "" ||
    filters.country !== "" ||
    filters.region !== "" ||
    filters.search !== "";

  const isSearching = filters.search !== "";
  // "Nearest" needs a position: without one (a shared link, an expired
  // location cache) the feed is the default order and says so.
  const nearbyWithoutLocation = filters.sort === "nearby" && !userLocation;
  const effectiveFilterSort = nearbyWithoutLocation ? "" : filters.sort;

  // Fetch countries on mount
  useEffect(() => {
    fetch("/api/routes?countries=true")
      .then((r) => r.json())
      .then((data) => setCountries(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch regions when country changes (a slow reply for the previous
  // country is dropped).
  useEffect(() => {
    if (!filters.country) {
      setRegions([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/routes?regions=true&country=${encodeURIComponent(filters.country)}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setRegions(Array.isArray(data) ? tidyRegions(data) : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [filters.country]);

  // Only the newest request may paint: an older reply (previous filter,
  // previous page) arriving late is dropped, and the request itself aborted.
  const requestSeq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  const fetchRoutes = useCallback(async (pageNum = 1, append = false, fallbackSort?: string) => {
    const seq = ++requestSeq.current;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    const params = new URLSearchParams();
    if (filters.discipline) params.set("discipline", filters.discipline);
    if (filters.country) params.set("country", filters.country);
    if (filters.region) {
      params.set("region", filters.region);
      // The routes API's text search matches r.region (case-insensitive),
      // so the region filter works before the API reads ?region= itself.
      // (?county= matched nothing: the options are regions.)
      if (!filters.search) params.set("search", filters.region);
    }
    if (filters.duration) params.set("duration", filters.duration);
    if (filters.search) params.set("search", filters.search);

    // Use fallback sort if provided, otherwise use filter sort; with the
    // rider's position the default is nearest first (a 1h chip in Dublin
    // must not lead with the best-rated loops 1,400 km away).
    const effectiveSort = fallbackSort || effectiveFilterSort || (userLocation ? "nearby" : "");
    if (effectiveSort) params.set("sort", effectiveSort);

    if (userLocation) {
      params.set("lat", String(userLocation.lat));
      params.set("lng", String(userLocation.lng));
    } else if (!filters.country && !filters.search && !effectiveSort) {
      // No location and no explicit filter: lead the default feed with home
      // routes instead of the globally top-rated (destination-heavy) list, so
      // a Dublin rider isn't shown Girona/Mallorca on sign-in.
      params.set("homeBias", DEFAULT_COUNTRY);
    }
    params.set("page", String(pageNum));

    setFetchError(false);
    try {
      const res = await fetch(`/api/routes?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`routes API ${res.status}`);
      const json = await res.json();
      if (seq !== requestSeq.current) return; // a newer request owns the list
      const rawRoutes = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
      const newRoutes: Route[] = rawRoutes.map(normalizeRoute);

      // If no routes found with default sort and user has location, fall back to top rated
      if (newRoutes.length === 0 && pageNum === 1 && !append && !fallbackSort && !effectiveFilterSort && userLocation) {
        fetchRoutes(1, false, "newest");
        return;
      }

      setRoutes((prev) => append ? [...prev, ...newRoutes] : newRoutes);
      setHasMore(json.hasMore ?? false);
      setPage(pageNum);
      if (json.avgSpeedKmh) setAvgSpeedKmh(json.avgSpeedKmh);
      setLoading(false);
      setLoadingMore(false);
    } catch {
      if (seq !== requestSeq.current) return; // aborted for a newer request
      setFetchError(true);
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters, userLocation, effectiveFilterSort]);

  // The restored list already answers this query: no refetch (which would
  // cut it back to page 1) until the filters or position change.
  const restoredFetchKey = useRef<string | null>(
    restored ? JSON.stringify([filtersKey(filters), restored.userLocation]) : null,
  );

  useEffect(() => {
    const key = JSON.stringify([filtersKey(filters), userLocation]);
    if (restoredFetchKey.current === key) return;
    restoredFetchKey.current = null;
    setLoading(true);
    setPage(1);
    fetchRoutes(1, false);
  }, [fetchRoutes, filters, userLocation]);

  // Back to where the rider was in the restored list.
  useEffect(() => {
    arrivedByHistory = false;
    if (!restored) return;
    const y = restored.scrollY;
    const raf = requestAnimationFrame(() => window.scrollTo(0, y));
    const t = setTimeout(() => { if (Math.abs(window.scrollY - y) > 4) window.scrollTo(0, y); }, 150);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [restored]);

  // Leaving through a route card: remember this list and the scroll.
  const rememberFeed = (e: React.MouseEvent) => {
    if (!(e.target as Element | null)?.closest?.('a[href^="/routes/"]')) return;
    writeFeedCache({
      key: filtersKey(filters),
      routes,
      page,
      hasMore,
      scrollY: window.scrollY,
      userLocation,
      at: Date.now(),
    });
  };

  const loadMore = () => {
    setLoadingMore(true);
    fetchRoutes(page + 1, true);
  };

  const clearAllFilters = () => applyFilters(() => DEFAULT_FILTERS);

  const setSearch = useCallback((value: string) => {
    // The first search is a step Back can undo; refining it is not.
    applyFilters((f) => (f.search === value ? f : { ...f, search: value }), filtersRef.current.search ? "replace" : "push");
  }, [applyFilters]);

  // Land the feed's search box just below the sticky header (the header
  // sits above the anchor for signed-in riders and would cover it).
  const scrollToContent = () => {
    const el = document.getElementById("scroll-anchor");
    if (!el) return;
    const header = document.querySelector("header");
    const headerAbove = header && header.getBoundingClientRect().top <= el.getBoundingClientRect().top;
    const offset = headerAbove ? header.offsetHeight : 0;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  // The feed heading, just below the sticky header.
  const scrollToFeed = () => {
    const el = document.getElementById("feed-results");
    if (!el) return;
    const header = document.querySelector("header");
    const offset = header && getComputedStyle(header).position === "sticky" ? header.offsetHeight : 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset - 8, behavior: "smooth" });
  };

  // "Browse nearby" means nearby: ask for the position (from the tap, iOS)
  // when there is none, then bring the feed into view.
  const browseNearby = () => {
    if (!userLocation) void askLocation();
    if (filters.sort && filters.sort !== "nearby") applyFilters((f) => ({ ...f, sort: "" }));
    scrollToContent();
  };

  // The heading above the feed answers "what am I looking at?" honestly.
  // Search results lead; otherwise near-you (with location) or top-rated.
  const sortLabel = useMemo(() => {
    if (isSearching) return `Results for "${filters.search}"`;
    if (filters.sort === "newest") return "Newest";
    if (filters.sort === "distance") return "Longest";
    if (filters.sort === "rating") return "Top rated";
    if (filters.sort === "nearby" && userLocation) return "Nearest to you";
    // A country/region/duration filter replaces the default ordering story.
    const scope = [filters.region, filters.country, filters.duration ? `${filters.duration} loops` : ""].filter(Boolean).join(" · ");
    if (scope) return scope;
    if (userLocation) return "Near you";
    return `${DEFAULT_COUNTRY} first, then the best of the rest`;
  }, [filters.sort, filters.search, filters.region, filters.country, filters.duration, isSearching, userLocation]);

  // Honest sub-label: explain why this ordering when there's no location.
  const sortSubLabel = useMemo(() => {
    if (isSearching) return null;
    if (effectiveFilterSort) return null;
    if (filters.region || filters.country || filters.duration) return null;
    // Nearby loops lead; further out the order is by rating — so not
    // "closest first" all the way down.
    if (userLocation) return "Nearest first";
    if (locationDenied) return `Location off — showing ${DEFAULT_COUNTRY} first`;
    if (nearbyWithoutLocation) return "Share your location to sort by distance";
    return null;
  }, [effectiveFilterSort, nearbyWithoutLocation, filters.region, filters.country, filters.duration, isSearching, userLocation, locationDenied]);

  const sortSelect = (
    <select
      value={filters.sort || (userLocation ? "nearby" : "")}
      onChange={(e) => applyFilters((f) => ({ ...f, sort: e.target.value }))}
      aria-label="Sort by"
      className="cursor-pointer"
      style={selectStyle}
    >
      <option value="">Default</option>
      {(userLocation || filters.sort === "nearby") && <option value="nearby">Nearest</option>}
      <option value="distance">Longest</option>
      <option value="newest">Newest</option>
    </select>
  );

  // Empty state that helps: search-aware, with concrete next steps. Never a
  // dead end (north star: always hand the rider a way forward). A search
  // that names a destination guide ("Wicklow") leads to the guide.
  const guide = isSearching ? guideForSearch(filters.search) : null;
  const emptyState = (
    <div className="text-center py-16">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "var(--bg-card)" }}>
        <svg className="w-6 h-6" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
        {isSearching ? `No loops match "${filters.search}"` : "No loops match your filters"}
      </p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {isSearching ? "Try a town, region, or route name — or a different spelling." : "Try broadening your search."}
      </p>
      {guide && (
        <p className="text-sm mt-3">
          <Link
            href={`/cycling/${guide.slug}`}
            className="font-bold underline min-h-[44px] inline-flex items-center px-2"
            style={{ color: "var(--accent)" }}
          >
            See the {guide.name} guide →
          </Link>
        </p>
      )}
      {filters.duration && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Try {filters.duration === "1h" ? "2h" : filters.duration === "4h+" ? "3h" : filters.duration === "2h" ? "1h or 3h" : "2h or 4h+"} instead
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm font-bold px-4 min-h-[44px] inline-flex items-center rounded-lg hover:opacity-80"
            style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}
          >
            Clear filters
          </button>
        )}
        <Link
          href="/generate"
          className="text-sm font-bold px-4 min-h-[44px] inline-flex items-center rounded-lg hover:opacity-80"
          style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          Ask the planner
        </Link>
        <Link
          href="/collections"
          className="text-sm font-bold px-4 min-h-[44px] inline-flex items-center rounded-lg hover:opacity-80"
          style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          Browse destinations
        </Link>
      </div>
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

  // With the rider's position, a list whose nearest loop is a flight away is
  // not an answer to "a 1h loop": say so, and offer to plan one from here.
  const nearestKm = userLocation
    ? routes.reduce((m, r) => (typeof r.distance_km_away === "number" && Number.isFinite(r.distance_km_away) ? Math.min(m, r.distance_km_away) : m), Infinity)
    : Infinity;
  const noneNear = !!userLocation && !isSearching && routes.length > 0 && Number.isFinite(nearestKm) && nearestKm > NONE_NEAR_KM;
  const noneNearNote = noneNear && userLocation ? (
    <div
      className="rounded-xl p-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2"
      style={{ background: "var(--bg-card)", border: "1px solid var(--accent)" }}
      role="status"
      data-testid="none-near"
    >
      <p className="text-sm font-bold flex-1 min-w-[12rem]" style={{ color: "var(--text)" }}>
        No {filters.duration ? `${filters.duration} ` : ""}loops near you yet
        <span className="block text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          The nearest below is {Math.round(nearestKm).toLocaleString("en-IE")} km away.
        </span>
      </p>
      <Link
        href={planFromHereHref(userLocation, filters.duration)}
        className="text-sm font-bold px-4 min-h-[44px] inline-flex items-center rounded-lg"
        style={{ background: "var(--accent)", color: "var(--bg)" }}
      >
        Plan one from here →
      </Link>
    </div>
  ) : null;

  const routeList = (
    <>
      {noneNearNote}
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
      {authLoading && !likelyMember ? (
        // Auth still resolving for someone this device has not seen sign
        // in: a neutral block the size of the hero — neither the member card
        // nor the marketing hero until we know which is true.
        <>
          <div aria-hidden="true" className="min-h-[60vh] md:min-h-[85vh]" />
          <div id="scroll-anchor" />
          <AppHeader />
        </>
      ) : user || authLoading || authError ? (
        // Logged in, auth still resolving for a returning rider, OR a
        // transient auth failure: show the answer machine. We only fall back
        // to the marketing hero on a CONFIRMED logged-out state, never on a
        // loading window or a blip — otherwise a signed-in rider gets flashed
        // the paywall.
        <>
          <AppHeader />
          <AnswerMachine onBrowseNearby={browseNearby} />
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
        {/* Search — the biggest discovery lever. Queries the routes API's
            `search` param (name/description/county/region), debounced. */}
        <div className="pt-6">
          <RouteSearchBox
            value={filters.search}
            onChange={() => { /* live text is owned by the box; commit on debounce */ }}
            onDebouncedChange={setSearch}
          />
        </div>

        {/* Duration Strip */}
        <div className="py-6">
          <DurationStrip
            selected={filters.duration}
            onSelect={(d: string | null) => {
              applyFilters((f) => ({ ...f, duration: d }));
              // The answer is below the chips: bring the list up (on a phone
              // it sat under the fold and the tap looked like it did nothing).
              if (d) requestAnimationFrame(() => scrollToFeed());
            }}
            avgSpeedKmh={avgSpeedKmh}
          />
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-2 pb-4">
          <DisciplineTabs
            selected={filters.discipline}
            onSelect={(d: string) => applyFilters((f) => ({ ...f, discipline: d }))}
          />

          <select
            value={filters.country}
            onChange={(e) => applyFilters((f) => ({ ...f, country: e.target.value, region: "" }))}
            aria-label="Country"
            className="cursor-pointer"
            style={selectStyle}
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={filters.region}
            onChange={(e) => applyFilters((f) => ({ ...f, region: e.target.value }))}
            disabled={!filters.country}
            aria-label="Region"
            className="cursor-pointer disabled:opacity-50"
            style={selectStyle}
          >
            <option value="">All regions</option>
            {/* A region from a shared link shows even before the list loads. */}
            {filters.region && !regions.includes(filters.region) && (
              <option value={filters.region}>{filters.region}</option>
            )}
            {regions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {sortSelect}

          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="text-xs font-bold hover:opacity-80 min-h-[44px] inline-flex items-center px-2" style={{ color: "var(--accent)" }}>
              Clear all
            </button>
          )}
        </div>

        {/* Feed heading — answers "what am I looking at?" honestly. */}
        {/* On a phone the heading takes its own line; the count, the note and
            "Use my location" wrap below it (not three ragged columns). */}
        <div id="feed-results" className="flex flex-wrap items-baseline gap-x-2 pb-3">
          <h2 className="text-sm font-bold basis-full sm:basis-auto" style={{ color: "var(--text)" }}>{sortLabel}</h2>
          <span className="text-xs hidden sm:inline" style={{ color: "var(--text-muted)", opacity: 0.5 }}>&mdash;</span>
          <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>
            {/* Loaded, not the total: more follow while hasMore. */}
            {loading ? "…" : hasMore ? `Showing ${routes.length} loops` : `${routes.length} loop${routes.length !== 1 ? "s" : ""}`}
          </span>
          {sortSubLabel && !loading && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>· {sortSubLabel}</span>
          )}
          {!userLocation && !isSearching && !effectiveFilterSort && !filters.region && !filters.country && !filters.duration && (
            <button
              onClick={askLocation}
              disabled={locating}
              className="text-xs font-bold underline min-h-[44px] px-1 disabled:opacity-60"
              style={{ color: "var(--accent)" }}
            >
              {locating ? "Locating…" : "Use my location"}
            </button>
          )}
        </div>
        {locationBlocked && !userLocation && (
          <div className="pb-3">
            <LocationHelp onRetry={askLocation} onDismiss={() => setLocationBlocked(false)} />
          </div>
        )}

        {/* Route Cards */}
        <div className="space-y-2" onClickCapture={rememberFeed}>
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

/**
 * What paints before the feed hydrates (useSearchParams renders it on the
 * client): the page's shape — a hero-sized block and card skeletons — so
 * the SEO block below is not the first thing a visitor sees.
 */
function HomeFallback() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div aria-hidden="true" className="min-h-[60vh] md:min-h-[85vh]" />
      <main className="max-w-3xl mx-auto w-full px-4 md:px-6 pb-20 pt-6 space-y-2" aria-busy="true">
        {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
      </main>
    </div>
  );
}

export default function HomeClient() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
