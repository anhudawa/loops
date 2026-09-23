"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface Stats {
  totalUsers: number;
  totalRoutes: number;
  totalComments: number;
  bannedUsers: number;
}

interface MetricPair {
  thisWeek: number;
  lastWeek: number;
  deltaPct: number | null;
}

interface UsageMetrics {
  activeRiders: MetricPair;
  generationsRequested: MetricPair;
  generationsSucceeded: MetricPair;
  generationsDeclined: MetricPair;
  routesViewed: MetricPair;
  gpxDownloads: MetricPair;
  imports: MetricPair;
  signups: MetricPair;
}

interface MetricsState {
  available: boolean;
  metrics: UsageMetrics | null;
  since: string | null;
  signupSources?: { source: string; count: number }[];
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
}

interface CommentRow {
  id: string;
  user_name: string | null;
  user_email: string;
  route_name: string;
  body: string;
  created_at: string;
}

type Tab = "users" | "routes" | "comments";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [metrics, setMetrics] = useState<MetricsState | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [confirm, setConfirm] = useState<{ type: string; id: string; label: string } | null>(null);
  const [loadingTab, setLoadingTab] = useState(false);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState("");

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

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/metrics");
      if (res.ok) {
        const body = await res.json();
        setMetrics(body.data as MetricsState);
      } else {
        setMetrics({ available: false, metrics: null, since: null });
      }
    } catch {
      // Metrics are non-critical — render "unavailable", never block admin.
      setMetrics({ available: false, metrics: null, since: null });
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

  // Bundled LOOPS-curated route sets (e.g. Dublin) — one-tap import.
  const [bundles, setBundles] = useState<{ key: string; label: string; mode?: string; routes: string[] }[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/import-bundle").then((r) => (r.ok ? r.json() : null)).then((d) => d?.data && setBundles(d.data)).catch(() => {});
  }, []);
  const importBundle = async (key: string) => {
    setImporting(key);
    setImportMsg(null);
    try {
      const res = await fetch("/api/admin/import-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle: key }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "Import failed");
      const results = (d.data?.results ?? []) as { name: string; status: string }[];
      const word: Record<string, string> = { inserted: "added", exists: "already there", replaced: "track replaced", not_found: "not found" };
      setImportMsg(results.map((r) => `${r.name}: ${word[r.status] ?? r.status}`).join(" · "));
      setRoutes([]); // refetch the table
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(null);
    }
  };

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

  useEffect(() => {
    if (user?.role === "admin") {
      fetchStats(); // eslint-disable-line react-hooks/set-state-in-effect
      fetchMetrics();
      fetchUsers();
    }
  }, [user, fetchStats, fetchMetrics, fetchUsers]);

  useEffect(() => {
    if (tab === "routes" && routes.length === 0) {
      setLoadingTab(true); // eslint-disable-line react-hooks/set-state-in-effect
      fetchRoutes().finally(() => setLoadingTab(false));
    }
    if (tab === "comments" && comments.length === 0) {
      setLoadingTab(true);  
      fetchComments().finally(() => setLoadingTab(false));
    }
  }, [tab, routes.length, comments.length, fetchRoutes, fetchComments]);

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
  const filteredRoutes = q ? routes.filter((r) => r.name.toLowerCase().includes(q) || (r.region || r.county).toLowerCase().includes(q)) : routes;
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Users", value: stats.totalUsers, color: "var(--accent)" },
              { label: "Routes", value: stats.totalRoutes, color: "var(--success)" },
              { label: "Comments", value: stats.totalComments, color: "var(--warning)" },
              { label: "Banned", value: stats.bannedUsers, color: "var(--danger)" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider font-bold mt-1" style={{ color: "var(--text-muted)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Usage — this week vs last week */}
        {metrics && (
          <div className="rounded-xl p-4 md:p-5 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
              <h2 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--text)" }}>
                Usage — this week vs last week
              </h2>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {metrics.available && metrics.since
                  ? `First-party events. Recording started ${new Date(metrics.since).toLocaleDateString("en-IE")}. No extrapolation.`
                  : metrics.available
                    ? "First-party events. No events recorded yet."
                    : "Metrics unavailable"}
              </span>
            </div>

            {!metrics.available || !metrics.metrics ? (
              <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
                Metrics unavailable — the events store could not be reached.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                {([
                  { label: "Active riders", help: "distinct signed-in riders", m: metrics.metrics.activeRiders },
                  { label: "Generations requested", help: "route generations started", m: metrics.metrics.generationsRequested },
                  { label: "Generations succeeded", help: "returned ≥1 route", m: metrics.metrics.generationsSucceeded },
                  { label: "Generations declined", help: "declined or errored", m: metrics.metrics.generationsDeclined },
                  { label: "Routes viewed", help: "route detail loads", m: metrics.metrics.routesViewed },
                  { label: "GPX downloads", help: "GPX file downloads", m: metrics.metrics.gpxDownloads },
                  { label: "Imports", help: "routes uploaded/imported", m: metrics.metrics.imports },
                  { label: "Signups", help: "new accounts", m: metrics.metrics.signups },
                ] as { label: string; help: string; m: MetricPair }[]).map((row) => (
                  <div key={row.label} className="rounded-lg p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <p className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{row.m.thisWeek}</p>
                    <p className="text-[11px] font-bold" style={{ color: "var(--text)" }}>{row.label}</p>
                    <p className="text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>{row.help}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      <span>{row.m.lastWeek} last week</span>
                      {row.m.deltaPct !== null && (
                        <span className="ml-1 font-bold" style={{ color: row.m.deltaPct >= 0 ? "var(--success)" : "var(--danger)" }}>
                          {row.m.deltaPct >= 0 ? "+" : ""}{row.m.deltaPct}%
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {metrics.available && metrics.signupSources && metrics.signupSources.length > 0 && (
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text)" }}>
                  New signups by source — last 7 days
                </p>
                <div className="flex flex-wrap gap-2">
                  {metrics.signupSources.map((s) => (
                    <span key={s.source} className="text-[11px] rounded-full px-2.5 py-1" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      <span className="font-bold" style={{ color: "var(--text)" }}>{s.count}</span> {s.source}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-6 mb-6 border-b" style={{ borderColor: "var(--border)" }}>
          {(["users", "routes", "comments"] as Tab[]).map((t) => (
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

          {!loadingTab && tab === "routes" && bundles.length > 0 && (
            <div className="p-3 mb-2 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                LOOPS route sets, checked against the Road Standard. Safe to press twice — imports skip existing routes; rebuilds re-apply the same track.
              </p>
              <div className="flex flex-wrap gap-2">
                {bundles.map((b) => (
                  <button
                    key={b.key}
                    onClick={() => importBundle(b.key)}
                    disabled={importing !== null}
                    title={b.routes.join(", ")}
                    className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "var(--bg)" }}
                  >
                    {importing === b.key ? "Working…" : `${b.label} (${b.routes.length})`}
                  </button>
                ))}
              </div>
              {importMsg && <p className="text-xs mt-2" style={{ color: "var(--text)" }}>{importMsg}</p>}
            </div>
          )}

          {!loadingTab && tab === "routes" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Route</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>County</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Distance</th>
                    <th className="text-right p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutes.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-3 font-bold" style={{ color: "var(--text)" }}>
                        <Link href={`/routes/${r.id}`} className="hover:underline">{r.name}</Link>
                      </td>
                      <td className="p-3" style={{ color: "var(--text-muted)" }}>{r.region || r.county}{r.country ? `, ${r.country}` : ""}</td>
                      <td className="p-3" style={{ color: "var(--text-muted)" }}>{r.distance_km} km</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setConfirm({ type: "deleteRoute", id: r.id, label: r.name })}
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

      {/* Confirmation dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl p-6 max-w-sm w-full mx-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h3 className="text-lg font-extrabold mb-2" style={{ color: "var(--text)" }}>
              {confirm.type === "ban" ? "Ban User" : "Delete"}
            </h3>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              {confirm.type === "ban"
                ? `Are you sure you want to ban "${confirm.label}"? They will be logged out immediately.`
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
                }}
                className="flex-1 py-2 rounded-xl text-sm font-bold"
                style={{ background: "rgba(255, 51, 85, 0.15)", color: "var(--danger)" }}
              >
                {confirm.type === "ban" ? "Ban" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
