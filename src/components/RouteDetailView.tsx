"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useClientUrl, loginHrefFor } from "@/lib/useClientUrl";
import { checkTrack, shapeLabel, type TrackCheck } from "@/lib/track-shape";
import ElevationProfile from "@/components/ElevationProfile";
import ClimbCards from "@/components/ClimbCards";
import StarRating from "@/components/StarRating";
import Comments from "@/components/Comments";
import PhotoGallery from "@/components/PhotoGallery";
import ConditionReports from "@/components/ConditionReports";
import RideActions from "@/components/RideActions";
import RideDisclaimer from "@/components/RideDisclaimer";
import ShareRide from "@/components/ShareRide";
import { describeCompromise, type Compromise } from "@/lib/road-segments";
import WeatherCard from "@/components/WeatherCard";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import Breadcrumbs from "@/components/Breadcrumbs";
import AppHeader from "@/components/AppHeader";
import SendToGarmin from "@/components/SendToGarmin";
import QualityFactors, { SurfaceSummary, type SurfaceBreakdown } from "@/components/QualityFactors";
import RouteFaq from "@/components/RouteFaq";
import RelatedRoutes from "@/components/RelatedRoutes";
import { slugify } from "@/lib/seo";
import { parseRideTime } from "@/lib/ride-invite";
import { SOCIAL_FEATURES_ENABLED } from "@/config/constants";
import { detectClimbs, haversine, CATEGORY_COLORS, type Climb } from "@/lib/climb-detection";
import { cleanClimbs } from "@/lib/climb-cleanup";



// Track shape is measured once per route/track (hover re-renders are frequent).
const trackCheckCache = new Map<string, TrackCheck | null>();
function cachedTrackCheck(id: string, coords: [number, number][], name: string): TrackCheck | null {
  const key = `${id}:${coords.length}`;
  if (!trackCheckCache.has(key)) trackCheckCache.set(key, checkTrack(coords, name));
  return trackCheckCache.get(key) ?? null;
}

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

/** True once the ride's day is over (client only; the server says false). */
function rideDayPassed(t: string | null | undefined): boolean {
  const p = parseRideTime(t);
  if (!p) return false;
  return new Date(p.y, p.mo - 1, p.d + 1).getTime() <= Date.now();
}
const noSubscribe = () => () => {};

/** "Where" list: the longest stretches first; the rest behind "+N more". */
const WHERE_LIST_SHOWN = 12;

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
  gpx_filename: string | null;
  coordinates: string;
  created_by: string | null;
  created_at: string;
  is_verified?: number;
  creator_name?: string | null;
  creator_avatar?: string | null;
  creator_rating?: number;
  creator_rating_count?: number;
  operator_name?: string | null;
  operator_url?: string | null;
  quality_score?: number | null;
  quality_breakdown?: Record<string, number> | null;
  quality_surface?: SurfaceBreakdown | null;
  road_report?: { standard_met: boolean; summary: string; compromises?: Compromise[] } | null;
}

interface RouteQualityData {
  total: number;
  breakdown: Record<string, number>;
  surface_breakdown?: SurfaceBreakdown;
  confidence?: number;
  confidence_level?: "high" | "medium" | "low";
}

export interface RideInvite {
  /** Human "Sat 26 Sep · 9:00" (already formatted, wall-clock). */
  when: string | null;
  /** Raw wall-clock "2026-09-26T09:00" for the forecast. */
  t?: string | null;
  meet: string | null;
}

export default function RouteDetailView({ ride, initialRoute }: { ride?: RideInvite | null; initialRoute?: Route | null } = {}) {
  const params = useParams();
  const clientUrl = useClientUrl();
  const router = useRouter();
  const { user, loading: authLoading, authError } = useAuth();
  // Sign-in state not known yet (first paint, or /api/auth failed).
  const authUnknown = !user && (authLoading || authError);
  const { toast } = useToast();
  // An old ride link (last week's invite): say the ride has been.
  const ridePassed = useSyncExternalStore(noSubscribe, () => rideDayPassed(ride?.t), () => false);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const [showAllStretches, setShowAllStretches] = useState(false);
  // A "Where" entry tapped: the map zooms to that stretch and names it.
  const [focusStretch, setFocusStretch] = useState<{ at: [number, number]; label: string; n: number } | null>(null);
  // The server passes the route it already fetched, so the banner, title and
  // Road Standard card paint with the HTML instead of after a second fetch.
  const [route, setRoute] = useState<Route | null>(initialRoute ?? null);
  const [loading, setLoading] = useState(!initialRoute);
  const [windData, setWindData] = useState<{ direction: number; speed: number } | null>(null);
  const [windOverlayEnabled, setWindOverlayEnabled] = useState(false);
  // Ride links show the direction of travel from the start — riders want to
  // know which way the group goes before they get there.
  const [travelOverlayEnabled, setTravelOverlayEnabled] = useState(!!ride);
  const [isFollowingCreator, setIsFollowingCreator] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [isFavourited, setIsFavourited] = useState(false);
  const [favCount, setFavCount] = useState(0);
  const [favLoading, setFavLoading] = useState(false);
  // On a /ride link the first screen is banner + map + forecast; the sticky
  // "Join LOOPS" bar waits until the rider scrolls past ~60% of the viewport
  // so it never covers the forecast on arrival (ride links and route pages).
  const [pastRideFold, setPastRideFold] = useState(false);
  useEffect(() => {
    const onScroll = () => setPastRideFold(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const [fetchError, setFetchError] = useState(false);
  const [mutationError, setMutationError] = useState("");
  // Quality/surface scoring (parity with /generate) — fetched fire-and-forget
  const [quality, setQuality] = useState<RouteQualityData | null>(null);
  // Profile hover → map marker (set by profile, drives map)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // Map click → profile crosshair (set by map click, drives profile)
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  // Climb card → map highlight section
  const [highlightSection, setHighlightSection] = useState<{
    coords: [number, number][];
    color: string;
  } | null>(null);

  const fetchRoute = async (silent = false) => {
    if (!params.id) return;
    setFetchError(false);
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/routes/${params.id}`);
      // A 5xx returns { error, code } — treat it as a transient failure
      // ("Try again"), NOT as "this route doesn't exist". Only a real 404
      // (or a payload with no coordinates) is a genuine missing route.
      if (res.status >= 500) {
        if (!silent) setFetchError(true);
        return;
      }
      const data = await res.json();
      setRoute(data);
      // Instant quality: if the route already has a persisted score, show it
      // immediately (no waiting on live Overpass). The live effect below still
      // runs and refreshes/persists a fresher score when it can.
      if (data && typeof data.quality_score === "number" && data.quality_score > 0) {
        setQuality({
          total: data.quality_score,
          breakdown: data.quality_breakdown ?? {},
          surface_breakdown: data.quality_surface ?? undefined,
        });
      }
    } catch {
      if (!silent) setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // With server data: refresh quietly (the API heals tracks and starts the
    // road trace); without: the normal loading path.
    fetchRoute(!!initialRoute);
  }, [params.id]);


  const [relatedRoutes, setRelatedRoutes] = useState<Route[]>([]);
  // Whether the related rail is actually showing same-region routes (true) or
  // fell back to country-wide (false) — so we never label Dublin routes as
  // "More routes in Wicklow".
  const [relatedIsRegion, setRelatedIsRegion] = useState(false);

  useEffect(() => {
    if (!route) return;
    fetch(`/api/routes?country=${encodeURIComponent(route.country)}`)
      .then((r) => r.json())
      .then((data) => {
        const all = data.data || data;
        const sameRegion = route.region
          ? all.filter((r: Route) => r.id !== route.id && r.region === route.region)
          : [];
        if (sameRegion.length > 0) {
          setRelatedRoutes(sameRegion.slice(0, 4));
          setRelatedIsRegion(true);
        } else {
          setRelatedRoutes(all.filter((r: Route) => r.id !== route.id).slice(0, 4));
          setRelatedIsRegion(false);
        }
      })
      .catch(() => {});
  }, [route?.id, route?.country, route?.region]);

  // Check favourite status
  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/routes/${params.id}/favourite`)
      .then((r) => r.json())
      .then((data) => {
        setIsFavourited(data.favourited);
        setFavCount(data.count);
      })
      .catch(() => {});
  }, [params.id]);

  // Quality + surface scoring — same engine the generator uses, surfaced
  // here for parity. Fire-and-forget: degrade silently if Overpass/the
  // API is down, the page works without it.
  useEffect(() => {
    if (!route?.id || !route.coordinates) return;
    let cancelled = false;
    fetch("/api/routes/quality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routeId: route.id }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        // Only surface a score we could actually STAND OVER. A total of 0 with
        // zero confidence means "couldn't verify" (Overpass down/rate-limited
        // or the route failed a hard rule) — showing that as a damning "0/100"
        // on every route is worse than showing nothing. Require a real,
        // confidently-verified score before rendering the module.
        const d = body?.data as RouteQualityData | undefined;
        const verified =
          d &&
          typeof d.total === "number" &&
          d.total > 0 &&
          (d.confidence === undefined || d.confidence > 0.3);
        if (!cancelled && verified) {
          setQuality(d);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [route?.id, route?.coordinates]);

  // Check if viewer follows the route creator
  useEffect(() => {
    if (!route?.created_by || !user || user.id === route.created_by) return;
    fetch(`/api/users/${route.created_by}/follow`)
      .then((r) => r.json())
      .then((data) => setIsFollowingCreator(data.following))
      .catch(() => {});
  }, [route?.created_by, user]);

  const handleFollowCreator = async () => {
    if (!route?.created_by || followLoading) return;
    // Optimistic: toggle immediately
    const wasFollowing = isFollowingCreator;
    setIsFollowingCreator(!wasFollowing);
    setFollowLoading(true);
    try {
      const method = wasFollowing ? "DELETE" : "POST";
      const res = await fetch(`/api/users/${route.created_by}/follow`, { method });
      if (!res.ok) {
        setIsFollowingCreator(wasFollowing);
        setMutationError("Action failed. Please try again.");
        setTimeout(() => setMutationError(""), 3000);
      }
    } catch {
      setIsFollowingCreator(wasFollowing);
      setMutationError("Action failed. Please try again.");
      setTimeout(() => setMutationError(""), 3000);
    }
    setFollowLoading(false);
  };

  const handleFavourite = async () => {
    if (favLoading || !user) return;
    // Optimistic: toggle immediately
    const wasFavourited = isFavourited;
    const prevCount = favCount;
    setIsFavourited(!wasFavourited);
    setFavCount(wasFavourited ? prevCount - 1 : prevCount + 1);
    setFavLoading(true);
    try {
      const res = await fetch(`/api/routes/${params.id}/favourite`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIsFavourited(data.favourited);
        setFavCount(data.count);
      } else {
        setIsFavourited(wasFavourited);
        setFavCount(prevCount);
        setMutationError("Action failed. Please try again.");
        setTimeout(() => setMutationError(""), 3000);
      }
    } catch {
      setIsFavourited(wasFavourited);
      setFavCount(prevCount);
      setMutationError("Action failed. Please try again.");
      setTimeout(() => setMutationError(""), 3000);
    }
    setFavLoading(false);
  };

  if (fetchError) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="flex flex-col items-center justify-center gap-4 py-32">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Something went wrong loading this route.</p>
          <button
            onClick={() => fetchRoute(false)}
            className="btn-accent px-4 py-2 rounded-lg text-sm font-bold"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="flex items-center justify-center py-32">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full" style={{ background: "var(--border)" }} />
            <div className="h-3 rounded w-24" style={{ background: "var(--border)" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!route || !route.coordinates) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <AppHeader />
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold mb-2" style={{ color: "var(--text)" }}>Route not found</h1>
          <p className="text-lg mb-8" style={{ color: "var(--text-muted)" }}>
            This loop doesn&apos;t exist — yet.
          </p>
          <Link
            href="/"
            className="btn-accent px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-wider"
          >
            Back to exploring
          </Link>
        </div>
      </div>
    );
  }

  // Guard the parse: malformed/truncated coordinates must degrade to an
  // empty route, never crash the page in the render path.
  let rawCoords: number[][] = [];
  try {
    const parsed = JSON.parse(route.coordinates);
    if (Array.isArray(parsed)) rawCoords = parsed;
  } catch {
    rawCoords = [];
  }
  // The profile and the climb cards read the track with elevation spikes
  // taken out (a DEM spike once showed Cap Formentor as a 43.5 % "climb")
  // and a climb broken by a short dip read as one.
  const { coords: fullCoordinates, climbs } = cleanClimbs(
    rawCoords.map((c) => [c[0], c[1], c[2] ?? 0] as [number, number, number]),
    detectClimbs
  );
  const coordinates: [number, number][] = rawCoords.map((c) => [c[0], c[1]]);
  const elevations: number[] = rawCoords.map((c) => c[2] ?? 0);
  // Measured on the full track by the server; the client measures only as a fallback.
  const track = (route as Route & { track_check?: TrackCheck | null }).track_check ?? cachedTrackCheck(route.id, coordinates, route.name);

  const handlePositionChange = (index: number | null) => {
    setHoverIndex(index);
    // Clear map-to-profile crosshair when user starts hovering profile
    if (index != null) setHighlightIndex(null);
  };

  const handleClimbSelect = (climb: Climb) => {
    const sectionCoords = fullCoordinates
      .slice(climb.startIndex, climb.endIndex + 1)
      .map((c): [number, number] => [c[0], c[1]]);
    const color = climb.category ? CATEGORY_COLORS[climb.category] ?? "#c8ff00" : "#c8ff00";
    setHighlightSection({ coords: sectionCoords, color });
    // The map sits well above the climb list: bring it into view so the tap
    // visibly does something.
    mapWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Up a level within LOOPS: back only when we came from a LOOPS page,
  // otherwise the region (or country) listing — never back out to Google,
  // WhatsApp or a blank tab.
  const listingHref = route.region
    ? `/routes/country/${slugify(route.country)}/${slugify(route.region)}`
    : `/routes/country/${slugify(route.country)}`;
  const goBack = () => {
    let sameOrigin = false;
    try {
      sameOrigin = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin && window.history.length > 1) router.back();
    else router.push(listingHref);
  };

  // "Ride something like this": the generator needs an account, so a
  // signed-out rider goes to sign-up carrying the ask (no prefetch: a cached
  // /generate redirect would drop the query).
  const likeThisHref = `/generate?q=${encodeURIComponent(`${route.distance_km}km ${route.discipline} loop from ${route.region || route.county}`)}`;
  const likeThisLink = !user && !authUnknown ? loginHrefFor(likeThisHref, { signup: true }) : likeThisHref;
  const compromiseCount = route.road_report?.compromises?.length ?? 0;

  const handlePolylineClick = (latlng: { lat: number; lng: number }) => {
    // Find nearest coordinate index — drives profile crosshair
    let minDist = Infinity;
    let nearestIdx = 0;
    for (let i = 0; i < fullCoordinates.length; i++) {
      const d = haversine([fullCoordinates[i][0], fullCoordinates[i][1]], [latlng.lat, latlng.lng]);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }
    setHighlightIndex(nearestIdx);
  };

  // Compute hover position for map marker (from profile hover only)
  const hoverPosition = hoverIndex != null && hoverIndex < fullCoordinates.length
    ? { lat: fullCoordinates[hoverIndex][0], lng: fullCoordinates[hoverIndex][1] }
    : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader />

      {/* Group-ride invite banner (the /ride/<id> link from WhatsApp) */}
      {ride && (ride.when || ride.meet) && (
        <div className="px-4 py-3 border-b" style={{ background: "var(--accent-glow)", borderColor: "var(--accent)" }} data-testid="ride-banner">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
            Group ride{ride.when ? ` · ${ride.when}` : ""}
          </p>
          {ridePassed && ride.when && (
            <p className="text-xs font-bold mt-1" style={{ color: "#f5a524" }} data-testid="ride-passed">
              This ride was on {ride.when}. Plan the next one with “Forward this ride”.
            </p>
          )}
          <h1 className="text-lg font-extrabold leading-tight mt-0.5" style={{ color: "var(--text)" }}>{route.name}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text)" }}>
            {route.distance_km} km · +{route.elevation_gain_m} m{track ? ` · ${shapeLabel(track)}` : ""}
            {ride.meet ? <> · Meet: <strong>{ride.meet}</strong></> : null}
          </p>
          {/* Always the route's first point: a typed meeting point can't be
              geocoded reliably, so the label says what the button does. */}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${route.start_lat},${route.start_lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Directions to the route start ↗
          </a>
        </div>
      )}

      {/* Plain route page: name + key stats above the map, so a phone's
          first screen says what this is (the title card sits below). */}
      {!(ride && (ride.when || ride.meet)) && (
        <div className="px-4 py-2.5 border-b md:hidden" style={{ background: "var(--bg-raised)", borderColor: "var(--border)" }}>
          <p className="text-base font-extrabold leading-tight truncate" style={{ color: "var(--text)" }}>{route.name}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {route.distance_km} km · +{route.elevation_gain_m} m · {route.region || route.county}{track ? ` · ${shapeLabel(track)}` : ""}
          </p>
        </div>
      )}

      {/* A track that is not fit to ride says so — before anyone rides it. */}
      {track?.broken && (
        <div className="px-4 py-3 border-b" style={{ background: "rgba(245,165,36,0.12)", borderColor: "rgba(245,165,36,0.5)" }} role="alert" data-testid="track-broken">
          <p className="text-sm font-bold" style={{ color: "#f5a524" }}>We&apos;re rebuilding this route — don&apos;t ride it yet.</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Its stored track isn&apos;t right: {track.broken}.</p>
        </div>
      )}

      {/* Hero: Map full-bleed */}
      <div ref={mapWrapRef} className="h-[42vh] min-h-[260px] md:h-[400px] relative">
        <MapView
          routes={[route]}
          selectedRouteId={route.id}
          detailsLink={false}
          attributionPosition="topright"
          windOverlay={windOverlayEnabled && windData ? windData : null}
          travelOverlay={travelOverlayEnabled}
          startLabel={ride?.meet ? "Meet here" : "Start"}
          compromiseMarkers={(route?.road_report?.compromises ?? [])
            .filter((c) => Array.isArray(c.at))
            .slice(0, WHERE_LIST_SHOWN) // the longest stretches (already sorted), same as the Where list
            .map((c) => ({ at: c.at as [number, number], label: describeCompromise(c) }))}
          hoverPosition={hoverPosition}
          highlightSection={highlightSection}
          focus={focusStretch}
          onPolylineClick={handlePolylineClick}
          onMapClick={() => setHighlightSection(null)}
        />
        <div className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none z-[1]" style={{ background: "linear-gradient(to top, var(--bg), transparent)" }} />
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 -mt-8 relative z-[2]">
        {/* Weather */}
        <div className="mb-4">
          <WeatherCard
            routeId={route.id}
            windOverlayEnabled={windOverlayEnabled}
            onWindToggle={setWindOverlayEnabled}
            travelOverlayEnabled={travelOverlayEnabled}
            onTravelToggle={setTravelOverlayEnabled}
            onWeatherLoaded={(wind) => setWindData(wind)}
            coordinates={coordinates}
            rideTime={ride?.t ?? null}
            rideWhen={ride?.when ?? null}
          />
        </div>

        {/* Back + Breadcrumbs */}
        <div className="mb-3 flex items-center gap-1">
          <button
            onClick={goBack}
            aria-label="Go back"
            className="min-w-[44px] min-h-[44px] -ml-3 shrink-0 flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <Breadcrumbs
            items={[
              { label: "LOOPS", href: "/" },
              { label: route.country, href: `/routes/country/${slugify(route.country)}` },
              ...(route.region
                ? [{ label: route.region, href: `/routes/country/${slugify(route.country)}/${slugify(route.region)}` }]
                : []),
              { label: route.name },
            ]}
          />
        </div>

        {/* Title card */}
        <div className="rounded-2xl p-4 md:p-7 mb-4 md:mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                <span>{route.region || route.county}</span>
                <span>·</span>
                <span>{route.country || "Ireland"}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* One h1 per page: the ride banner owns it on /ride links */}
                {ride && (ride.when || ride.meet) ? (
                  <h2 className="text-lg md:text-2xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{route.name}</h2>
                ) : (
                  <h1 className="text-lg md:text-2xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{route.name}</h1>
                )}
                {/* Not on a one-way track with no way home, nor on a broken one:
                    "verified" would vouch for a ride nobody can do as served. */}
                {route.is_verified === 1 && track?.shape !== "point_to_point" && !track?.broken && (
                  <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg shrink-0" style={{ color: "var(--success)", background: "rgba(0, 255, 136, 0.1)" }}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Verified
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {user ? (
              <button
                onClick={handleFavourite}
                disabled={favLoading}
                aria-label={isFavourited ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={isFavourited}
                className="flex items-center justify-center gap-1 px-2.5 py-2 min-h-[44px] min-w-[44px] rounded-lg transition-all"
                style={{
                  background: isFavourited ? "rgba(255, 51, 85, 0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isFavourited ? "rgba(255, 51, 85, 0.3)" : "var(--border)"}`,
                  opacity: favLoading ? 0.5 : 1,
                }}
                title={isFavourited ? "Remove from favourites" : "Add to favourites"}
              >
                <svg
                  className="w-4 h-4 transition-transform"
                  viewBox="0 0 24 24"
                  fill={isFavourited ? "var(--danger)" : "none"}
                  stroke={isFavourited ? "var(--danger)" : "var(--text-muted)"}
                  strokeWidth={2}
                  style={{ transform: isFavourited ? "scale(1.1)" : "scale(1)" }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {favCount > 0 && (
                  <span className="text-[11px] font-bold" style={{ color: isFavourited ? "var(--danger)" : "var(--text-muted)" }}>
                    {favCount}
                  </span>
                )}
              </button>
              ) : authUnknown ? (
              // Sign-in state not known yet: a quiet placeholder, never a
              // login link in front of a signed-in rider.
              <span
                aria-hidden="true"
                className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", opacity: 0.5 }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </span>
              ) : (
              <Link
                href={loginHrefFor(clientUrl)}
                aria-label="Log in to save this route"
                className="flex items-center justify-center gap-1 px-2.5 py-2 min-h-[44px] min-w-[44px] rounded-lg transition-all hover:opacity-80"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border)",
                }}
                title="Log in to save this route"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-muted)"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {favCount > 0 && (
                  <span className="text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>
                    {favCount}
                  </span>
                )}
              </Link>
              )}
            </div>
          </div>
          {mutationError && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{mutationError}</p>}

          {SOCIAL_FEATURES_ENABLED && (
            <div className="mb-4">
              <StarRating routeId={route.id} />
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            {[
              { label: "Distance", value: `${route.distance_km} km` },
              { label: "Gain", value: `${route.elevation_gain_m} m` },
              { label: "Loss", value: `${route.elevation_loss_m} m` },
              { label: "Surface", value: route.surface_type },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className={`text-base md:text-xl font-extrabold${stat.label === "Surface" ? " capitalize" : ""}`} style={{ color: "var(--accent)" }}>{stat.value}</p>
                <p className="text-[9px] md:text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Ride something like this — hand the route's shape to the generator */}
          <Link
            href={likeThisLink}
            prefetch={false}
            className="mt-4 w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:brightness-110"
            style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid rgba(200,255,0,0.3)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Ride something like this
          </Link>
        </div>

        {/* Road Standard — the Trust Rule: every served route names its
            compromises. Shown whenever a report exists, whether or not the
            optional quality score arrives. */}
        {route?.road_report && (
          <div
            className="rounded-2xl px-4 py-3 md:px-6 mb-4 flex items-start gap-2.5"
            style={{
              background: "var(--bg-card)",
              border: `1px solid ${route.road_report.standard_met ? "var(--border)" : "rgba(245,165,36,0.5)"}`,
            }}
            data-testid="road-standard"
          >
            <span
              className="text-base leading-5 shrink-0"
              aria-hidden="true"
              style={{ color: route.road_report.standard_met ? "var(--accent)" : "#f5a524" }}
            >
              {route.road_report.standard_met ? "✓" : "⚠"}
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Road Standard
              </p>
              <p className="text-sm leading-snug" style={{ color: route.road_report.standard_met ? "var(--text)" : "#f5a524" }}>
                {route.road_report.summary}
              </p>
              {/* Every stretch, named where we could: the rider decides. */}
              {!!route.road_report.compromises?.length && (
                <details
                  className="mt-2"
                  style={{ scrollMarginBottom: 112 }}
                  onToggle={(e) => {
                    // Opened: bring the whole list clear of the sticky sign-up bar.
                    const el = e.currentTarget;
                    if (el.open) requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }));
                  }}
                >
                  <summary className="text-xs font-bold cursor-pointer select-none py-3.5 -my-2.5" style={{ color: "var(--text-secondary)" }}>
                    Where ({compromiseCount} {compromiseCount === 1 ? "stretch" : "stretches"})
                  </summary>
                  <ul className="mt-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {route.road_report.compromises.slice(0, showAllStretches ? undefined : WHERE_LIST_SHOWN).map((c, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span aria-hidden="true" className="py-3" style={{ color: "#f5a524" }}>·</span>
                        {Array.isArray(c.at) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setFocusStretch((f) => ({ at: c.at as [number, number], label: describeCompromise(c), n: (f?.n ?? 0) + 1 }));
                              mapWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }}
                            className="text-left min-h-[44px] py-3 underline decoration-dotted underline-offset-2"
                            style={{ color: "var(--text-secondary)" }}
                            title="Show on the map"
                          >
                            {describeCompromise(c)}
                          </button>
                        ) : (
                          <span className="py-3">{describeCompromise(c)}</span>
                        )}
                      </li>
                    ))}
                    {!showAllStretches && compromiseCount > WHERE_LIST_SHOWN && (
                      <li>
                        <button
                          type="button"
                          onClick={() => setShowAllStretches(true)}
                          className="min-h-[44px] -my-2 text-xs font-bold underline"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Show {compromiseCount - WHERE_LIST_SHOWN} more
                        </button>
                      </li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}

        {/* No report yet: say so — unknown is not the same as clean. The first
            view of a route starts the trace; the next view shows the card. */}
        {route && !route.road_report && (
          <p className="text-xs mb-4 px-1" style={{ color: "var(--text-muted)" }} data-testid="road-standard-pending">
            Road Standard: not measured yet for this route.
          </p>
        )}

        {/* Route quality — same scoring engine as /generate; renders only
            when the score arrives, degrades silently otherwise */}
        {quality && (
          <div className="rounded-2xl p-4 md:p-6 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Route Quality
              </h2>
              <span className="text-sm font-extrabold" style={{ color: "var(--accent)" }}>
                {quality.total}/100
              </span>
            </div>
            {quality.surface_breakdown && <SurfaceSummary breakdown={quality.surface_breakdown} />}
            <QualityFactors breakdown={quality.breakdown} />
          </div>
        )}

        {/* Uploaded by — social + attribution: hidden for launch. Routes are
            facts (no public attribution); the persona/rating/follow only shows
            when social features are switched on. */}
        {SOCIAL_FEATURES_ENABLED && route.created_by && route.creator_name && (
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 mb-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <Link href={`/profile/${route.created_by}`} className="shrink-0">
              {route.creator_avatar ? (
                <img
                  src={route.creator_avatar}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover"
                  style={{ border: "2px solid var(--border)" }}
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "2px solid var(--border)" }}
                >
                  {route.creator_name.charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                Uploaded by
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={`/profile/${route.created_by}`}
                  className="text-sm font-bold hover:opacity-80 transition-opacity truncate"
                  style={{ color: "var(--text)" }}
                >
                  {route.creator_name}
                </Link>
                {route.creator_rating !== undefined && Number(route.creator_rating) > 0 && (
                  <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="var(--warning)" aria-hidden="true">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span className="font-bold">{(Math.round(Number(route.creator_rating) * 10) / 10).toFixed(1)}</span>
                    <span style={{ opacity: 0.5 }}>({route.creator_rating_count})</span>
                  </span>
                )}
              </div>
            </div>
            {user && user.id !== route.created_by && (
              <button
                onClick={handleFollowCreator}
                disabled={followLoading}
                className="shrink-0 text-xs font-bold uppercase tracking-wider px-4 py-2.5 min-h-[44px] rounded-lg transition-all hover:scale-[1.03]"
                style={
                  isFollowingCreator
                    ? { background: "rgba(200, 255, 0, 0.1)", color: "var(--accent)", border: "1px solid rgba(200, 255, 0, 0.3)" }
                    : { background: "var(--accent)", color: "var(--bg)", border: "1px solid var(--accent)" }
                }
              >
                {isFollowingCreator ? "Following" : "Follow"}
              </button>
            )}
          </div>
        )}

        {/* Photos — social feature, hidden for launch */}
        {SOCIAL_FEATURES_ENABLED && (
          <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <PhotoGallery routeId={route.id} />
          </div>
        )}

        {/* Share Ride — prominent CTA */}
        <div className="mb-4">
          <ShareRide route={route} ride={ride} />
        </div>

        {/* Ride Actions */}
        <div className="mb-6">
          <RideActions routeId={route.id} routeName={route.name} rideLink={!!ride} />
          {/* One-tap Send to Garmin — renders nothing until Garmin keys are configured */}
          <div className="mt-2.5 flex justify-center empty:hidden">
            <SendToGarmin
              name={route.name}
              coordinates={coordinates}
              elevations={elevations}
              distance_km={route.distance_km}
              elevation_gain_m={route.elevation_gain_m}
              discipline={route.discipline}
            />
          </div>
          <RideDisclaimer />
        </div>

        {/* Elevation Profile — full width */}
        <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-xs font-extrabold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
            Elevation Profile
          </h2>
          <ElevationProfile
            coordinates={fullCoordinates}
            distanceKm={route.distance_km}
            onPositionChange={handlePositionChange}
            highlightIndex={highlightIndex}
          />
        </div>

        {/* Climb Cards */}
        {climbs.length > 0 && (
          <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <ClimbCards climbs={climbs} onClimbSelect={handleClimbSelect} />
          </div>
        )}

        {/* About this route — full width */}
        <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-xs font-extrabold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
            About this route
          </h2>
          {route.description ? (
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{route.description}</p>
          ) : (
            <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>No description provided</p>
          )}
        </div>

        {/* FAQ */}
        <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <RouteFaq
            routeName={route.name}
            distanceKm={route.distance_km}
            elevationGainM={route.elevation_gain_m}
            surfaceType={route.surface_type}
            discipline={route.discipline}
          />
        </div>

        {/* Related Routes */}
        <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <RelatedRoutes
            routes={relatedRoutes}
            regionOrCountry={relatedIsRegion && route.region ? route.region : route.country}
            country={route.country}
            isRegion={relatedIsRegion && !!route.region}
          />
        </div>

        {/* Trail Conditions */}
        {SOCIAL_FEATURES_ENABLED && (
          <div className="rounded-2xl p-4 md:p-6 mb-3 md:mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <ConditionReports routeId={route.id} />
          </div>
        )}

        {/* Comments */}
        {SOCIAL_FEATURES_ENABLED && (
          <div className="rounded-2xl p-4 md:p-6 mb-6 md:mb-8" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <Comments routeId={route.id} />
          </div>
        )}
      </div>

      {/* Spacer so the sticky CTA never covers the footer/content */}
      {!user && !authUnknown && <div className="h-24" aria-hidden="true" />}

      {/* Sticky bottom CTA for unauthenticated users (on /ride: after scrolling) */}
      {!user && !authUnknown && pastRideFold && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 md:py-4"
          style={{
            background: "linear-gradient(to top, var(--bg) 60%, transparent)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
                Join LOOPS
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Save routes, get GPX, plan your own loops
              </p>
            </div>
            <Link
              href={loginHrefFor(clientUrl, { signup: true })}
              className="shrink-0 px-5 min-h-[44px] inline-flex items-center rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:brightness-110"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
              }}
            >
              Sign Up Free
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
