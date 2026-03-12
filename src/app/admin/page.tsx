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
  difficulty: string;
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
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [confirm, setConfirm] = useState<{ type: string; id: string; label: string } | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.push("/");
    }
  }, [user, loading, router]);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }, []);

  const fetchRoutes = useCallback(async () => {
    const res = await fetch("/api/admin/routes");
    if (res.ok) {
      const data = await res.json();
      setRoutes(data.routes);
    }
  }, []);

  const fetchComments = useCallback(async () => {
    const res = await fetch("/api/admin/comments");
    if (res.ok) {
      const data = await res.json();
      setComments(data.comments);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") {
      fetchStats();
      fetchUsers();
    }
  }, [user, fetchStats, fetchUsers]);

  useEffect(() => {
    if (tab === "routes" && routes.length === 0) fetchRoutes();
    if (tab === "comments" && comments.length === 0) fetchComments();
  }, [tab, routes.length, comments.length, fetchRoutes, fetchComments]);

  const handleBan = async (userId: string) => {
    await fetch(`/api/admin/users/${userId}/ban`, { method: "POST" });
    fetchUsers();
    fetchStats();
    setConfirm(null);
  };

  const handleUnban = async (userId: string) => {
    await fetch(`/api/admin/users/${userId}/ban`, { method: "DELETE" });
    fetchUsers();
    fetchStats();
    setConfirm(null);
  };

  const handleDeleteRoute = async (routeId: string) => {
    await fetch(`/api/admin/routes/${routeId}`, { method: "DELETE" });
    setRoutes((prev) => prev.filter((r) => r.id !== routeId));
    fetchStats();
    setConfirm(null);
  };

  const handleDeleteComment = async (commentId: string) => {
    await fetch(`/api/admin/comments/${commentId}`, { method: "DELETE" });
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    fetchStats();
    setConfirm(null);
  };

  if (loading || !user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="animate-pulse" style={{ color: "var(--text-muted)" }}>Loading...</div>
      </div>
    );
  }

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
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: "rgba(255, 51, 85, 0.15)", color: "#ff3355" }}>
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
              { label: "Routes", value: stats.totalRoutes, color: "#00ff88" },
              { label: "Comments", value: stats.totalComments, color: "#ffbb00" },
              { label: "Banned", value: stats.bannedUsers, color: "#ff3355" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider font-bold mt-1" style={{ color: "var(--text-muted)" }}>{s.label}</p>
              </div>
            ))}
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

        {/* Content */}
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {tab === "users" && (
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
                  {users.map((u) => (
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
                            color: u.role === "admin" ? "#c8ff00" : u.role === "banned" ? "#ff3355" : "var(--text-muted)",
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
                              style={{ color: "#00ff88" }}
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirm({ type: "ban", id: u.id, label: u.name || u.email })}
                              className="text-xs font-bold hover:opacity-80"
                              style={{ color: "#ff3355" }}
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

          {tab === "routes" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Route</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>County</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Distance</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Difficulty</th>
                    <th className="text-right p-3 text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-3 font-bold" style={{ color: "var(--text)" }}>
                        <Link href={`/routes/${r.id}`} className="hover:underline">{r.name}</Link>
                      </td>
                      <td className="p-3" style={{ color: "var(--text-muted)" }}>{r.region || r.county}{r.country ? `, ${r.country}` : ""}</td>
                      <td className="p-3" style={{ color: "var(--text-muted)" }}>{r.distance_km} km</td>
                      <td className="p-3 capitalize" style={{ color: "var(--text-muted)" }}>{r.difficulty}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setConfirm({ type: "deleteRoute", id: r.id, label: r.name })}
                          className="text-xs font-bold hover:opacity-80"
                          style={{ color: "#ff3355" }}
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

          {tab === "comments" && (
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
                  {comments.map((c) => (
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
                          style={{ color: "#ff3355" }}
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
                style={{ background: "rgba(255, 51, 85, 0.15)", color: "#ff3355" }}
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
