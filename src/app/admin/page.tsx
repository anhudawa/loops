"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { getRideSourceLabel } from "@/config/route-policy";

interface Stats {
  totalUsers: number;
  totalRoutes: number;
  totalComments: number;
  bannedUsers: number;
  beta: {
    publicRoutes: number;
    activeRiders28d: number;
    routeViews28d: number;
    actionConversions28d: number;
    routeActionRatePct: number | null;
    eligibleRidePlans: number;
    confirmedWithin14Days: number;
    rideConfirmationRatePct: number | null;
    retentionCohortSize: number;
    retainedAtFourWeeks: number;
    fourWeekRetentionPct: number | null;
  };
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

interface RouteRow {
  id: string;
  name: string;
  county: string;
  country?: string;
  region?: string | null;
  discipline?: string;
  distance_km: number;
  created_at: string;
  publication_status?: "draft" | "in_review" | "published" | "stale" | "quarantined" | "retired";
  human_ridden?: boolean;
  last_ridden_at?: string | null;
  rights_confirmed_at?: string | null;
  version_number?: number | null;
  geometry_hash?: string | null;
  rider_name?: string | null;
  ridden_at?: string | null;
  evidence_type?: string | null;
  evidence_reference?: string | null;
  source_platform?: string | null;
  evidence_file_hash?: string | null;
  evidence_started_at?: string | null;
  evidence_ended_at?: string | null;
  evidence_point_count?: number | null;
  evidence_timestamped_point_count?: number | null;
  attestation_status?: string | null;
  latest_review_decision?: string | null;
  latest_review_notes?: string | null;
  open_incidents?: number;
}

interface CommentRow {
  id: string;
  user_name: string | null;
  user_email: string;
  route_name: string;
  body: string;
  created_at: string;
}

interface IncidentRow {
  id: string;
  route_id: string;
  route_name: string;
  reporter_name: string | null;
  reporter_email: string | null;
  condition_status: string | null;
  severity: "review" | "critical";
  status: "open" | "resolved" | "dismissed";
  summary: string;
  created_at: string;
}

interface OperationalErrorRow {
  id: string;
  fingerprint: string;
  source: "api" | "next_request" | "background";
  error_name: string;
  error_code: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_reference_id: string;
  status: "open" | "resolved" | "ignored";
}

interface BetaApplicationRow {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string;
  application_type: "rider" | "contributor";
  home_region: string;
  club_name: string | null;
  riding_frequency: "weekly" | "two_to_three" | "four_plus";
  routes_available: number | null;
  session_interests: string[];
  source_platforms: string[];
  notes: string | null;
  status: "submitted" | "waitlisted" | "approved" | "declined" | "withdrawn";
  membership_access_level: "rider" | "contributor" | null;
  membership_status: "active" | "paused" | "removed" | null;
  created_at: string;
}

type Tab = "users" | "beta" | "routes" | "incidents" | "errors" | "comments";

const REVIEW_CHECKS = [
  ["evidence_checked", "Ride evidence matches this route version"],
  ["rights_checked", "Contributor identity and publication rights checked"],
  ["geometry_checked", "Full loop geometry, elevation profile and closure checked"],
  ["start_finish_checked", "Start, finish and parking/meeting point checked"],
  ["road_suitability_checked", "Road suitability, surface and obvious hazards checked"],
  ["description_checked", "Description, warnings and route facts checked"],
] as const;

type ReviewChecklist = Record<(typeof REVIEW_CHECKS)[number][0], boolean>;

const emptyChecklist = (): ReviewChecklist => ({
  evidence_checked: false,
  rights_checked: false,
  geometry_checked: false,
  start_finish_checked: false,
  road_suitability_checked: false,
  description_checked: false,
});

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [operationalErrors, setOperationalErrors] = useState<OperationalErrorRow[]>([]);
  const [betaApplications, setBetaApplications] = useState<BetaApplicationRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [confirm, setConfirm] = useState<{ type: string; id: string; label: string } | null>(null);
  const [loadingTab, setLoadingTab] = useState(false);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reviewRoute, setReviewRoute] = useState<RouteRow | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewChecklist, setReviewChecklist] = useState<ReviewChecklist>(emptyChecklist);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [incidentReview, setIncidentReview] = useState<IncidentRow | null>(null);
  const [incidentResolutionNotes, setIncidentResolutionNotes] = useState("");
  const [incidentResolutionStatus, setIncidentResolutionStatus] = useState<"resolved" | "dismissed">("resolved");
  const [incidentSubmitting, setIncidentSubmitting] = useState(false);
  const [operationalErrorReview, setOperationalErrorReview] = useState<OperationalErrorRow | null>(null);
  const [operationalErrorNotes, setOperationalErrorNotes] = useState("");
  const [operationalErrorStatus, setOperationalErrorStatus] = useState<"resolved" | "ignored">("resolved");
  const [operationalErrorSubmitting, setOperationalErrorSubmitting] = useState(false);
  const [betaApplicationReview, setBetaApplicationReview] = useState<BetaApplicationRow | null>(null);
  const [betaReviewNotes, setBetaReviewNotes] = useState("");
  const [betaReviewStatus, setBetaReviewStatus] = useState<"approved" | "waitlisted" | "declined">("approved");
  const [betaReviewSubmitting, setBetaReviewSubmitting] = useState(false);
  const [betaMembershipReview, setBetaMembershipReview] = useState<BetaApplicationRow | null>(null);
  const [betaMembershipStatus, setBetaMembershipStatus] = useState<"active" | "paused" | "removed">("paused");
  const [betaMembershipReason, setBetaMembershipReason] = useState("");
  const [betaMembershipSubmitting, setBetaMembershipSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.push("/");
    }
  }, [user, loading, router]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) setStats(await res.json());
    } catch {
      // Stats are non-critical, silently ignore
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data.users);
    } catch {
      setLoadError(true);
    }
  }, []);

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/routes");
      if (!res.ok) throw new Error("Failed to fetch routes");
      const data = await res.json();
      setRoutes(data.routes);
    } catch {
      setLoadError(true);
    }
  }, []);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/comments");
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data = await res.json();
      setComments(data.comments);
    } catch {
      setLoadError(true);
    }
  }, []);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/incidents");
      if (!res.ok) throw new Error("Failed to fetch incidents");
      const data = await res.json();
      setIncidents(data.incidents);
    } catch {
      setLoadError(true);
    }
  }, []);

  const fetchOperationalErrors = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/errors");
      if (!res.ok) throw new Error("Failed to fetch operational errors");
      const data = await res.json();
      setOperationalErrors(data.errors);
    } catch {
      setLoadError(true);
    }
  }, []);

  const fetchBetaApplications = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/beta-applications");
      if (!res.ok) throw new Error("Failed to fetch beta applications");
      const data = await res.json();
      setBetaApplications(data.applications);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") {
      fetchStats();
      fetchUsers();  
    }
  }, [user, fetchStats, fetchUsers]);

  useEffect(() => {
    if (tab === "routes" && routes.length === 0) {
      setLoadingTab(true);
      fetchRoutes().finally(() => setLoadingTab(false));
    }
    if (tab === "comments" && comments.length === 0) {
      setLoadingTab(true);  
      fetchComments().finally(() => setLoadingTab(false));
    }
    if (tab === "incidents" && incidents.length === 0) {
      setLoadingTab(true);
      fetchIncidents().finally(() => setLoadingTab(false));
    }
    if (tab === "errors" && operationalErrors.length === 0) {
      setLoadingTab(true);
      fetchOperationalErrors().finally(() => setLoadingTab(false));
    }
    if (tab === "beta" && betaApplications.length === 0) {
      setLoadingTab(true);
      fetchBetaApplications().finally(() => setLoadingTab(false));
    }
  }, [tab, routes.length, comments.length, incidents.length, operationalErrors.length, betaApplications.length, fetchRoutes, fetchComments, fetchIncidents, fetchOperationalErrors, fetchBetaApplications]);

  const handleBan = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, { method: "POST" });
      if (!res.ok) throw new Error();
      fetchUsers();
      fetchStats();
      setConfirm(null);
    } catch {
      setActionError("Action failed. Please try again.");
      setTimeout(() => setActionError(""), 3000);
      setConfirm(null);
    }
  };

  const handleUnban = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      fetchUsers();
      fetchStats();
      setConfirm(null);
    } catch {
      setActionError("Action failed. Please try again.");
      setTimeout(() => setActionError(""), 3000);
      setConfirm(null);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    try {
      const res = await fetch(`/api/admin/routes/${routeId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRoutes((prev) => prev.filter((r) => r.id !== routeId));
      fetchStats();
      setConfirm(null);
    } catch {
      setActionError("Action failed. Please try again.");
      setTimeout(() => setActionError(""), 3000);
      setConfirm(null);
    }
  };

  const handleRouteStatus = async (
    routeId: string,
    status: "stale" | "quarantined" | "retired"
  ) => {
    try {
      const res = await fetch(`/api/admin/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      await fetchRoutes();
      await fetchStats();
      setConfirm(null);
    } catch {
      setActionError("Route status update failed. Please try again.");
      setTimeout(() => setActionError(""), 3000);
      setConfirm(null);
    }
  };

  const handlePublishRoute = async () => {
    if (!reviewRoute) return;
    setReviewSubmitting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/routes/${reviewRoute.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "published",
          review_notes: reviewNotes,
          checklist: reviewChecklist,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Publication failed");
      setReviewRoute(null);
      setReviewNotes("");
      setReviewChecklist(emptyChecklist());
      await fetchRoutes();
      await fetchStats();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Publication failed");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleRejectRoute = async () => {
    if (!reviewRoute) return;
    setReviewSubmitting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/routes/${reviewRoute.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          review_notes: reviewNotes,
          checklist: reviewChecklist,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Rejection failed");
      setReviewRoute(null);
      setReviewNotes("");
      setReviewChecklist(emptyChecklist());
      await fetchRoutes();
      await fetchStats();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/admin/comments/${commentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      fetchStats();
      setConfirm(null);
    } catch {
      setActionError("Action failed. Please try again.");
      setTimeout(() => setActionError(""), 3000);
      setConfirm(null);
    }
  };

  const handleResolveIncident = async () => {
    if (!incidentReview || incidentResolutionNotes.trim().length < 10) return;
    setIncidentSubmitting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/incidents/${incidentReview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: incidentResolutionStatus,
          resolution_notes: incidentResolutionNotes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Incident update failed");
      setIncidentReview(null);
      setIncidentResolutionNotes("");
      await fetchIncidents();
      await fetchRoutes();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Incident update failed");
    } finally {
      setIncidentSubmitting(false);
    }
  };

  const handleResolveOperationalError = async () => {
    if (!operationalErrorReview || operationalErrorNotes.trim().length < 10) return;
    setOperationalErrorSubmitting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/errors/${operationalErrorReview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: operationalErrorStatus,
          resolution_notes: operationalErrorNotes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Error update failed");
      setOperationalErrorReview(null);
      setOperationalErrorNotes("");
      await fetchOperationalErrors();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error update failed");
    } finally {
      setOperationalErrorSubmitting(false);
    }
  };

  const handleReviewBetaApplication = async () => {
    if (!betaApplicationReview || betaReviewNotes.trim().length < 10) return;
    setBetaReviewSubmitting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/beta-applications/${betaApplicationReview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: betaReviewStatus, adminNotes: betaReviewNotes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Beta application review failed");
      setBetaApplicationReview(null);
      setBetaReviewNotes("");
      await fetchBetaApplications();
    } catch (reviewError) {
      setActionError(reviewError instanceof Error ? reviewError.message : "Beta application review failed");
    } finally {
      setBetaReviewSubmitting(false);
    }
  };

  const handleBetaMembershipStatus = async () => {
    if (!betaMembershipReview || betaMembershipReason.trim().length < 10) return;
    setBetaMembershipSubmitting(true);
    setActionError("");
    try {
      const response = await fetch(`/api/admin/beta-memberships/${betaMembershipReview.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: betaMembershipStatus,
          reason: betaMembershipReason,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Membership update failed");
      setBetaMembershipReview(null);
      setBetaMembershipReason("");
      await fetchBetaApplications();
    } catch (membershipError) {
      setActionError(membershipError instanceof Error ? membershipError.message : "Membership update failed");
    } finally {
      setBetaMembershipSubmitting(false);
    }
  };

  if (loading || !user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="animate-pulse" style={{ color: "var(--text-muted)" }}>Loading...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-center">
          <p className="text-lg font-bold mb-2" style={{ color: "var(--danger)" }}>Failed to load admin data</p>
          <button
            onClick={() => { setLoadError(false); fetchStats(); fetchUsers(); }}
            className="text-sm font-bold px-4 py-2 rounded-lg"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const q = search.toLowerCase();
  const filteredUsers = q ? users.filter((u) => (u.name || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : users;
  const filteredBetaApplications = q ? betaApplications.filter((application) =>
    (application.user_name || application.user_email).toLowerCase().includes(q) ||
    application.home_region.toLowerCase().includes(q) ||
    (application.club_name || "").toLowerCase().includes(q)
  ) : betaApplications;
  const filteredRoutes = q ? routes.filter((r) => r.name.toLowerCase().includes(q) || (r.region || r.county).toLowerCase().includes(q)) : routes;
  const filteredIncidents = q ? incidents.filter((incident) =>
    incident.route_name.toLowerCase().includes(q) ||
    incident.summary.toLowerCase().includes(q) ||
    (incident.reporter_name || incident.reporter_email || "").toLowerCase().includes(q)
  ) : incidents;
  const filteredOperationalErrors = q ? operationalErrors.filter((error) =>
    error.error_name.toLowerCase().includes(q) ||
    (error.error_code || "").toLowerCase().includes(q) ||
    error.fingerprint.toLowerCase().includes(q) ||
    error.last_reference_id.toLowerCase().includes(q)
  ) : operationalErrors;
  const filteredComments = q ? comments.filter((c) => (c.user_name || c.user_email).toLowerCase().includes(q) || c.route_name.toLowerCase().includes(q) || c.body.toLowerCase().includes(q)) : comments;

  const tabStyle = (t: Tab) => ({
    color: tab === t ? "var(--accent)" : "var(--text-muted)",
    borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
            </Link>
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: "rgba(255, 51, 85, 0.15)", color: "var(--danger)" }}>
              Admin
            </span>
          </div>
          <Link href="/" className="text-sm font-medium hover:opacity-80" style={{ color: "var(--text-muted)" }}>
            Back to app
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {/* Stats */}
        {stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Users", value: stats.totalUsers, color: "var(--accent)" },
                { label: "All routes", value: stats.totalRoutes, color: "var(--success)" },
                { label: "Comments", value: stats.totalComments, color: "var(--warning)" },
                { label: "Banned", value: stats.bannedUsers, color: "var(--danger)" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wider font-bold mt-1" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <p className="text-sm font-extrabold" style={{ color: "var(--text)" }}>Ireland beta gates</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Signed-in, first-party measurement only</p>
                </div>
                <p className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                  {stats.beta.activeRiders28d} active riders · {stats.beta.routeViews28d} route views (28d)
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Published supply", value: `${stats.beta.publicRoutes} / 25`, pass: stats.beta.publicRoutes >= 25, detail: "reviewed routes" },
                  { label: "View → action", value: stats.beta.routeActionRatePct == null ? "—" : `${stats.beta.routeActionRatePct}%`, pass: (stats.beta.routeActionRatePct ?? 0) >= 30, detail: `${stats.beta.actionConversions28d} saves/downloads/transfers · gate 30%` },
                  { label: "Ridden in 14 days", value: stats.beta.rideConfirmationRatePct == null ? "—" : `${stats.beta.rideConfirmationRatePct}%`, pass: (stats.beta.rideConfirmationRatePct ?? 0) >= 25, detail: `${stats.beta.confirmedWithin14Days}/${stats.beta.eligibleRidePlans} mature plans · gate 25%` },
                  { label: "Four-week retention", value: stats.beta.fourWeekRetentionPct == null ? "—" : `${stats.beta.fourWeekRetentionPct}%`, pass: (stats.beta.fourWeekRetentionPct ?? 0) >= 25, detail: `${stats.beta.retainedAtFourWeeks}/${stats.beta.retentionCohortSize} matured riders · gate 25%` },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg p-3" style={{ background: "var(--bg-raised)", border: `1px solid ${metric.pass ? "rgba(0,255,136,0.35)" : "var(--border)"}` }}>
                    <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>{metric.label}</p>
                    <p className="text-xl font-extrabold mt-1" style={{ color: metric.pass ? "var(--success)" : "var(--text)" }}>{metric.value}</p>
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{metric.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Tabs */}
        <div className="flex gap-6 mb-6 border-b overflow-x-auto" style={{ borderColor: "var(--border)" }}>
          {(["users", "beta", "routes", "incidents", "errors", "comments"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="pb-2 text-sm font-bold uppercase tracking-wider transition-colors"
              style={tabStyle(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab}...`}
            className="w-full max-w-sm rounded-lg px-4 py-2 text-sm"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* Action error */}
        {actionError && (
          <div className="mb-4 px-4 py-2 rounded-lg text-sm" style={{ background: "rgba(255,51,85,0.15)", color: "var(--danger)" }}>
            {actionError}
          </div>
        )}

        {/* Content */}
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {loadingTab && (
            <div className="p-4 space-y-3 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 rounded w-1/4" style={{ background: "var(--border)" }} />
                  <div className="h-4 rounded w-1/3" style={{ background: "var(--border)" }} />
                  <div className="h-4 rounded w-1/6" style={{ background: "var(--border)" }} />
                  <div className="h-4 rounded w-1/6" style={{ background: "var(--border)" }} />
                </div>
              ))}
            </div>
          )}
          {!loadingTab && tab === "users" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>User</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Email</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Role</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Joined</th>
                    <th className="text-right p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-3 font-bold" style={{ color: "var(--text)" }}>
                        <Link href={`/profile/${u.id}`} className="hover:underline">
                          {u.name || "—"}
                        </Link>
                      </td>
                      <td className="p-3" style={{ color: "var(--text-muted)" }}>{u.email}</td>
                      <td className="p-3">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                          style={{
                            color: u.role === "admin" ? "#c8ff00" : u.role === "banned" ? "var(--danger)" : "var(--text-muted)",
                            background: u.role === "admin" ? "rgba(200, 255, 0, 0.1)" : u.role === "banned" ? "rgba(255, 51, 85, 0.1)" : "var(--bg)",
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {new Date(u.created_at + "Z").toLocaleDateString("en-IE")}
                      </td>
                      <td className="p-3 text-right">
                        {u.id !== user.id && u.role !== "admin" && (
                          u.role === "banned" ? (
                            <button
                              onClick={() => handleUnban(u.id)}
                              className="text-xs font-bold hover:opacity-80"
                              style={{ color: "var(--success)" }}
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirm({ type: "ban", id: u.id, label: u.name || u.email })}
                              className="text-xs font-bold hover:opacity-80"
                              style={{ color: "var(--danger)" }}
                            >
                              Ban
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loadingTab && tab === "beta" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Applicant</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Cohort</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Fit</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Status</th>
                    <th className="text-right p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBetaApplications.map((application) => (
                    <tr key={application.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-3">
                        <p className="font-bold" style={{ color: "var(--text)" }}>{application.user_name || "Name missing"}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{application.user_email}</p>
                        <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{application.home_region}{application.club_name ? ` · ${application.club_name}` : ""}</p>
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded" style={{ background: "var(--bg)", color: application.application_type === "contributor" ? "var(--accent)" : "var(--text-secondary)" }}>
                          {application.application_type}
                        </span>
                        {application.routes_available && <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{application.routes_available} routes offered</p>}
                      </td>
                      <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        <p>{application.riding_frequency.replaceAll("_", " ")}</p>
                        <p>{application.session_interests.join(", ")}</p>
                        {application.source_platforms.length > 0 && <p>{application.source_platforms.map((source) => getRideSourceLabel(source) || source).join(", ")}</p>}
                        {application.membership_status && <p className="mt-1 font-bold">Access: {application.membership_access_level} · {application.membership_status}</p>}
                      </td>
                      <td className="p-3 text-xs font-bold uppercase" style={{ color: application.status === "approved" ? "var(--success)" : application.status === "declined" ? "var(--danger)" : "var(--warning)" }}>
                        {application.status}
                      </td>
                      <td className="p-3 text-right">
                        {(application.status === "submitted" || application.status === "waitlisted") && (
                          <button
                            onClick={() => {
                              setBetaApplicationReview(application);
                              setBetaReviewStatus("approved");
                              setBetaReviewNotes("");
                            }}
                            className="text-xs font-bold hover:opacity-80"
                            style={{ color: "var(--accent)" }}
                          >
                            Review
                          </button>
                        )}
                        {application.status === "approved" && application.membership_status && (
                          <button
                            onClick={() => {
                              setBetaMembershipReview(application);
                              setBetaMembershipStatus(application.membership_status === "active" ? "paused" : "active");
                              setBetaMembershipReason("");
                            }}
                            className="text-xs font-bold hover:opacity-80"
                            style={{ color: application.membership_status === "active" ? "var(--warning)" : "var(--accent)" }}
                          >
                            Manage access
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredBetaApplications.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No beta applications.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loadingTab && tab === "routes" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Route</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Status</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Ride evidence</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Route facts</th>
                    <th className="text-right p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutes.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-3 font-bold" style={{ color: "var(--text)" }}>
                        <Link href={`/routes/${r.id}`} className="hover:underline">{r.name}</Link>
                        <p className="text-[10px] font-normal mt-1" style={{ color: "var(--text-muted)" }}>
                          {r.region || r.county}{r.country ? `, ${r.country}` : ""}
                        </p>
                      </td>
                      <td className="p-3">
                        <span
                          className="inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
                          style={{
                            color: r.publication_status === "published" ? "var(--success)" : r.publication_status === "quarantined" ? "var(--danger)" : "var(--warning)",
                            background: "var(--bg)",
                          }}
                        >
                          {r.publication_status || "legacy"}
                        </span>
                        {!!r.open_incidents && r.open_incidents > 0 && (
                          <p className="text-[10px] mt-1 font-bold" style={{ color: "var(--danger)" }}>
                            {r.open_incidents} open incident{r.open_incidents === 1 ? "" : "s"}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {r.rider_name ? (
                          <>
                            <p className="font-bold" style={{ color: "var(--text-secondary)" }}>{r.rider_name}</p>
                            <p>{r.ridden_at ? new Date(r.ridden_at).toLocaleDateString("en-IE") : "No ride date"} · {r.evidence_type?.toUpperCase() || "Unknown"}</p>
                            <p>Source: {getRideSourceLabel(r.source_platform) || "Unknown"}</p>
                            <p>Attestation: {r.attestation_status || "missing"}</p>
                          </>
                        ) : (
                          <span style={{ color: "var(--danger)" }}>No attestation</span>
                        )}
                      </td>
                      <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        <p>{r.distance_km} km · {r.discipline || "unknown"}</p>
                        <p>Version {r.version_number || "—"}</p>
                        {r.geometry_hash && <p title={r.geometry_hash}>Hash {r.geometry_hash.slice(0, 10)}…</p>}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {r.publication_status === "in_review" && (
                            <button
                              onClick={() => {
                                setReviewRoute(r);
                                setReviewNotes("");
                                setReviewChecklist(emptyChecklist());
                              }}
                              className="text-xs font-bold hover:opacity-80"
                              style={{ color: "var(--success)" }}
                            >
                              Review
                            </button>
                          )}
                          {r.publication_status === "published" && (
                            <>
                              <Link
                                href={`/admin/routes/${r.id}/segments`}
                                className="text-xs font-bold hover:opacity-80"
                                style={{ color: "var(--accent)" }}
                              >
                                Workout segments
                              </Link>
                              <button
                                onClick={() => setConfirm({ type: "quarantineRoute", id: r.id, label: r.name })}
                                className="text-xs font-bold hover:opacity-80"
                                style={{ color: "var(--warning)" }}
                              >
                                Quarantine
                              </button>
                            </>
                          )}
                          {r.publication_status !== "retired" && r.publication_status !== "in_review" && (
                            <button
                              onClick={() => setConfirm({ type: "retireRoute", id: r.id, label: r.name })}
                              className="text-xs font-bold hover:opacity-80"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Retire
                            </button>
                          )}
                          <button
                            onClick={() => setConfirm({ type: "deleteRoute", id: r.id, label: r.name })}
                            className="text-xs font-bold hover:opacity-80"
                            style={{ color: "var(--danger)" }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loadingTab && tab === "incidents" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Severity</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Route</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Report</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Reporter</th>
                    <th className="text-right p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncidents.map((incident) => (
                    <tr key={incident.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-3">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
                          style={{
                            color: incident.severity === "critical" ? "var(--danger)" : "var(--warning)",
                            background: incident.severity === "critical" ? "rgba(255,51,85,0.1)" : "rgba(255,184,0,0.1)",
                          }}
                        >
                          {incident.severity}
                        </span>
                      </td>
                      <td className="p-3 font-bold" style={{ color: "var(--text)" }}>
                        <Link href={`/routes/${incident.route_id}`} className="hover:underline">{incident.route_name}</Link>
                        {incident.condition_status && (
                          <p className="text-[10px] font-normal mt-1 uppercase" style={{ color: "var(--text-muted)" }}>
                            Condition: {incident.condition_status}
                          </p>
                        )}
                      </td>
                      <td className="p-3 max-w-sm" style={{ color: "var(--text-muted)" }}>
                        <p className="line-clamp-3">{incident.summary}</p>
                        <p className="text-[10px] mt-1">{new Date(incident.created_at).toLocaleDateString("en-IE")}</p>
                      </td>
                      <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {incident.reporter_name || incident.reporter_email || "Anonymous"}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setIncidentReview(incident);
                            setIncidentResolutionNotes("");
                            setIncidentResolutionStatus("resolved");
                          }}
                          className="text-xs font-bold hover:opacity-80"
                          style={{ color: "var(--accent)" }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredIncidents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                        No open route incidents.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loadingTab && tab === "errors" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Error group</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Occurrences</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Last seen</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Safe references</th>
                    <th className="text-right p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOperationalErrors.map((error) => (
                    <tr key={error.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-3">
                        <p className="font-bold" style={{ color: "var(--text)" }}>{error.error_name}</p>
                        <p className="text-[10px] mt-1 uppercase" style={{ color: "var(--text-muted)" }}>
                          {error.source.replace("_", " ")}{error.error_code ? ` · ${error.error_code}` : ""}
                        </p>
                      </td>
                      <td className="p-3 font-bold" style={{ color: error.occurrence_count > 1 ? "var(--warning)" : "var(--text-secondary)" }}>
                        {error.occurrence_count}
                      </td>
                      <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {new Date(error.last_seen_at).toLocaleString("en-IE")}
                      </td>
                      <td className="p-3 text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                        <p title={error.fingerprint}>Group {error.fingerprint.slice(0, 12)}…</p>
                        <p title={error.last_reference_id}>Latest {error.last_reference_id.slice(0, 12)}…</p>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setOperationalErrorReview(error);
                            setOperationalErrorNotes("");
                            setOperationalErrorStatus("resolved");
                          }}
                          className="text-xs font-bold hover:opacity-80"
                          style={{ color: "var(--accent)" }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredOperationalErrors.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                        No open application errors.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loadingTab && tab === "comments" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>User</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Route</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Comment</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Date</th>
                    <th className="text-right p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComments.map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-3 font-bold" style={{ color: "var(--text)" }}>{c.user_name || c.user_email}</td>
                      <td className="p-3" style={{ color: "var(--text-muted)" }}>{c.route_name}</td>
                      <td className="p-3 max-w-xs truncate" style={{ color: "var(--text-muted)" }}>{c.body}</td>
                      <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {new Date(c.created_at + "Z").toLocaleDateString("en-IE")}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setConfirm({ type: "deleteComment", id: c.id, label: c.body.slice(0, 40) })}
                          className="text-xs font-bold hover:opacity-80"
                          style={{ color: "var(--danger)" }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {betaApplicationReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl p-5 md:p-6 max-w-lg w-full" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>Ireland beta application</p>
            <h3 className="text-xl font-extrabold" style={{ color: "var(--text)" }}>{betaApplicationReview.user_name || betaApplicationReview.user_email}</h3>
            <p className="text-xs mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
              {betaApplicationReview.application_type} · {betaApplicationReview.home_region} · {betaApplicationReview.riding_frequency.replaceAll("_", " ")}
            </p>
            <div className="rounded-xl p-3 mb-4 text-xs space-y-1" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <p>Sessions: {betaApplicationReview.session_interests.join(", ")}</p>
              {betaApplicationReview.routes_available && <p>Routes offered: {betaApplicationReview.routes_available}</p>}
              {betaApplicationReview.source_platforms.length > 0 && <p>Sources: {betaApplicationReview.source_platforms.map((source) => getRideSourceLabel(source) || source).join(", ")}</p>}
              {betaApplicationReview.notes && <p className="pt-2" style={{ color: "var(--text-secondary)" }}>{betaApplicationReview.notes}</p>}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(["approved", "waitlisted", "declined"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setBetaReviewStatus(status)}
                  className="py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                  style={{
                    background: betaReviewStatus === status ? "var(--accent-glow)" : "var(--bg)",
                    border: `1px solid ${betaReviewStatus === status ? "var(--accent)" : "var(--border)"}`,
                    color: betaReviewStatus === status ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
            <textarea
              value={betaReviewNotes}
              onChange={(event) => setBetaReviewNotes(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Why this person fits this wave, or why they should wait."
              className="w-full rounded-xl p-3 text-sm resize-y"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <p className="text-[10px] mt-1 mb-4" style={{ color: betaReviewNotes.trim().length >= 10 ? "var(--success)" : "var(--text-muted)" }}>{betaReviewNotes.trim().length}/10 minimum characters</p>
            <div className="flex gap-3">
              <button onClick={() => setBetaApplicationReview(null)} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>Cancel</button>
              <button
                onClick={handleReviewBetaApplication}
                disabled={betaReviewSubmitting || betaReviewNotes.trim().length < 10}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                {betaReviewSubmitting ? "Saving…" : `Mark ${betaReviewStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {betaMembershipReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl p-5 md:p-6 max-w-lg w-full" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--warning)" }}>Closed-beta access</p>
            <h3 className="text-xl font-extrabold" style={{ color: "var(--text)" }}>{betaMembershipReview.user_name || betaMembershipReview.user_email}</h3>
            <p className="text-xs mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
              Current: {betaMembershipReview.membership_access_level} · {betaMembershipReview.membership_status}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(["active", "paused", "removed"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={status === betaMembershipReview.membership_status}
                  onClick={() => setBetaMembershipStatus(status)}
                  className="py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-30"
                  style={{
                    background: betaMembershipStatus === status ? "var(--accent-glow)" : "var(--bg)",
                    border: `1px solid ${betaMembershipStatus === status ? "var(--accent)" : "var(--border)"}`,
                    color: status === "removed" ? "var(--danger)" : betaMembershipStatus === status ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
            <textarea
              value={betaMembershipReason}
              onChange={(event) => setBetaMembershipReason(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Record why access is being paused, restored or removed."
              className="w-full rounded-xl p-3 text-sm resize-y"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <p className="text-[10px] mt-1 mb-4" style={{ color: betaMembershipReason.trim().length >= 10 ? "var(--success)" : "var(--text-muted)" }}>{betaMembershipReason.trim().length}/10 minimum characters</p>
            <div className="flex gap-3">
              <button onClick={() => setBetaMembershipReview(null)} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>Cancel</button>
              <button
                onClick={handleBetaMembershipStatus}
                disabled={betaMembershipSubmitting || betaMembershipReason.trim().length < 10 || betaMembershipStatus === betaMembershipReview.membership_status}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-40"
                style={{ background: betaMembershipStatus === "removed" ? "var(--danger)" : "var(--accent)", color: "var(--bg)" }}
              >
                {betaMembershipSubmitting ? "Saving…" : `Set ${betaMembershipStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operational error resolution dialog */}
      {operationalErrorReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl p-5 md:p-6 max-w-lg w-full" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--danger)" }}>Application error group</p>
            <h3 className="text-xl font-extrabold" style={{ color: "var(--text)" }}>{operationalErrorReview.error_name}</h3>
            <p className="text-xs mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
              {operationalErrorReview.occurrence_count} occurrence{operationalErrorReview.occurrence_count === 1 ? "" : "s"} · latest reference {operationalErrorReview.last_reference_id}
            </p>
            <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              This queue intentionally stores no raw message, request URL, stack trace, IP address or request body. Use the reference ID to correlate with restricted hosting logs.
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(["resolved", "ignored"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setOperationalErrorStatus(status)}
                  className="py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                  style={{
                    background: operationalErrorStatus === status ? "rgba(200,255,0,0.12)" : "var(--bg)",
                    border: `1px solid ${operationalErrorStatus === status ? "var(--accent)" : "var(--border)"}`,
                    color: operationalErrorStatus === status ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
            <textarea
              value={operationalErrorNotes}
              onChange={(event) => setOperationalErrorNotes(event.target.value)}
              rows={4}
              placeholder="What was checked, fixed or intentionally ignored?"
              className="w-full rounded-xl p-3 text-sm resize-y"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <p className="text-[10px] mt-1 mb-4" style={{ color: operationalErrorNotes.trim().length >= 10 ? "var(--success)" : "var(--text-muted)" }}>
              {operationalErrorNotes.trim().length}/10 minimum characters
            </p>
            <div className="flex gap-3">
              <button onClick={() => setOperationalErrorReview(null)} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>Cancel</button>
              <button
                onClick={handleResolveOperationalError}
                disabled={operationalErrorSubmitting || operationalErrorNotes.trim().length < 10}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                {operationalErrorSubmitting ? "Saving…" : `Mark ${operationalErrorStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incident resolution dialog */}
      {incidentReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl p-5 md:p-6 max-w-lg w-full" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: incidentReview.severity === "critical" ? "var(--danger)" : "var(--warning)" }}>
              {incidentReview.severity} route incident
            </p>
            <h3 className="text-xl font-extrabold mb-1" style={{ color: "var(--text)" }}>{incidentReview.route_name}</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>{incidentReview.summary}</p>

            {incidentReview.severity === "critical" && (
              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: "rgba(255,51,85,0.1)", border: "1px solid rgba(255,51,85,0.25)", color: "var(--text-secondary)" }}>
                This route remains quarantined after resolution. Returning it to the library requires fresh ride evidence and a new publication review.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mb-4">
              {(["resolved", "dismissed"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setIncidentResolutionStatus(status)}
                  className="py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                  style={{
                    background: incidentResolutionStatus === status ? "rgba(200,255,0,0.12)" : "var(--bg)",
                    border: `1px solid ${incidentResolutionStatus === status ? "var(--accent)" : "var(--border)"}`,
                    color: incidentResolutionStatus === status ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {status}
                </button>
              ))}
            </div>

            <label className="block mb-5">
              <span className="block text-xs font-extrabold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Resolution notes</span>
              <textarea
                value={incidentResolutionNotes}
                onChange={(event) => setIncidentResolutionNotes(event.target.value)}
                rows={4}
                placeholder="Record what was checked and why this report is resolved or dismissed."
                className="w-full rounded-xl p-3 text-sm resize-y"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <span className="block text-[10px] mt-1" style={{ color: incidentResolutionNotes.trim().length >= 10 ? "var(--success)" : "var(--text-muted)" }}>
                {incidentResolutionNotes.trim().length}/10 minimum characters
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => setIncidentReview(null)}
                className="flex-1 py-3 rounded-xl text-sm font-bold"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleResolveIncident}
                disabled={incidentSubmitting || incidentResolutionNotes.trim().length < 10}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                {incidentSubmitting ? "Saving…" : `Mark ${incidentResolutionStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Human review dialog */}
      {reviewRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div
            className="rounded-2xl p-5 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>
                  Publication review
                </p>
                <h3 className="text-xl font-extrabold" style={{ color: "var(--text)" }}>{reviewRoute.name}</h3>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {reviewRoute.region || reviewRoute.county}, {reviewRoute.country || "Ireland"} · {reviewRoute.distance_km} km · Version {reviewRoute.version_number || "—"}
                </p>
              </div>
              <button
                onClick={() => setReviewRoute(null)}
                className="min-w-[44px] min-h-[44px] rounded-lg text-lg"
                style={{ color: "var(--text-muted)", background: "var(--bg)" }}
                aria-label="Close review"
              >
                ×
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-5">
              <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Ride evidence</p>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{reviewRoute.rider_name || "Missing rider"}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {reviewRoute.ridden_at ? new Date(reviewRoute.ridden_at).toLocaleDateString("en-IE") : "No ride date"} · {reviewRoute.evidence_type?.toUpperCase() || "No evidence type"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Source: {getRideSourceLabel(reviewRoute.source_platform) || "Missing source"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Recorded {reviewRoute.evidence_started_at ? new Date(reviewRoute.evidence_started_at).toLocaleString("en-IE") : "unknown"}
                  {reviewRoute.evidence_point_count
                    ? ` · ${reviewRoute.evidence_timestamped_point_count || 0}/${reviewRoute.evidence_point_count} timestamped points`
                    : " · no point evidence"}
                </p>
                <p className="text-[10px] mt-1 break-all" style={{ color: "var(--text-muted)" }}>
                  File hash: {reviewRoute.evidence_file_hash || "missing"}
                </p>
                <p className="text-xs" style={{ color: reviewRoute.attestation_status === "pending" ? "var(--warning)" : "var(--text-muted)" }}>
                  Attestation: {reviewRoute.attestation_status || "missing"}
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Immutable route version</p>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Version {reviewRoute.version_number || "—"}</p>
                <p className="text-xs mt-1 break-all" style={{ color: "var(--text-muted)" }}>
                  {reviewRoute.geometry_hash || "Missing geometry hash"}
                </p>
                <Link href={`/routes/${reviewRoute.id}`} target="_blank" className="inline-block text-xs font-bold mt-2 hover:underline" style={{ color: "var(--accent)" }}>
                  Inspect route and map ↗
                </Link>
              </div>
            </div>

            <fieldset className="space-y-2 mb-5">
              <legend className="text-xs font-extrabold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
                Required checks
              </legend>
              {REVIEW_CHECKS.map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-start gap-3 rounded-xl p-3 cursor-pointer"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                >
                  <input
                    type="checkbox"
                    checked={reviewChecklist[key]}
                    onChange={(event) => setReviewChecklist((current) => ({ ...current, [key]: event.target.checked }))}
                    className="mt-0.5 h-4 w-4 accent-lime-400"
                  />
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
                </label>
              ))}
            </fieldset>

            <label className="block mb-5">
              <span className="block text-xs font-extrabold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
                Reviewer notes
              </span>
              <textarea
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                rows={4}
                placeholder="Record what you checked, known cautions, and why this exact version is safe to publish."
                className="w-full rounded-xl p-3 text-sm resize-y"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <span className="block text-[10px] mt-1" style={{ color: reviewNotes.trim().length >= 20 ? "var(--success)" : "var(--text-muted)" }}>
                {reviewNotes.trim().length}/20 minimum characters
              </span>
            </label>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={() => setReviewRoute(null)}
                className="sm:flex-1 py-3 rounded-xl text-sm font-bold"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                Save for later
              </button>
              <button
                onClick={handleRejectRoute}
                disabled={reviewSubmitting || reviewNotes.trim().length < 20}
                className="sm:flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "rgba(255,51,85,0.12)", border: "1px solid rgba(255,51,85,0.4)", color: "var(--danger)" }}
              >
                {reviewSubmitting ? "Saving…" : "Reject with reason"}
              </button>
              <button
                onClick={handlePublishRoute}
                disabled={reviewSubmitting || !Object.values(reviewChecklist).every(Boolean) || reviewNotes.trim().length < 20}
                className="sm:flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                {reviewSubmitting ? "Publishing…" : "Approve and publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl p-6 max-w-sm w-full mx-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h3 className="text-lg font-extrabold mb-2" style={{ color: "var(--text)" }}>
              {confirm.type === "ban"
                ? "Ban User"
                : confirm.type === "quarantineRoute"
                  ? "Quarantine route"
                  : confirm.type === "retireRoute"
                    ? "Retire route"
                    : "Delete"}
            </h3>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              {confirm.type === "ban"
                ? `Are you sure you want to ban "${confirm.label}"? They will be logged out immediately.`
                : confirm.type === "quarantineRoute"
                  ? `Remove "${confirm.label}" from the public library immediately? It will require fresh ride evidence and review before it can return.`
                  : confirm.type === "retireRoute"
                    ? `Retire "${confirm.label}" permanently from the public library? Its audit history will be kept.`
                    : `Are you sure you want to delete "${confirm.label}"? This cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirm.type === "ban") handleBan(confirm.id);
                  else if (confirm.type === "deleteRoute") handleDeleteRoute(confirm.id);
                  else if (confirm.type === "deleteComment") handleDeleteComment(confirm.id);
                  else if (confirm.type === "quarantineRoute") handleRouteStatus(confirm.id, "quarantined");
                  else if (confirm.type === "retireRoute") handleRouteStatus(confirm.id, "retired");
                }}
                className="flex-1 py-2 rounded-xl text-sm font-bold"
                style={{ background: "rgba(255, 51, 85, 0.15)", color: "var(--danger)" }}
              >
                {confirm.type === "ban"
                  ? "Ban"
                  : confirm.type === "quarantineRoute"
                    ? "Quarantine"
                    : confirm.type === "retireRoute"
                      ? "Retire"
                      : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
