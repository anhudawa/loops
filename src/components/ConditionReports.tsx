"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";
import Link from "next/link";

interface Condition {
  id: string;
  user_name: string | null;
  status: string;
  note: string;
  created_at: string;
}

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  good: { color: "var(--success)", bg: "rgba(0, 255, 136, 0.1)", label: "Good" },
  fair: { color: "var(--warning)", bg: "rgba(255, 187, 0, 0.1)", label: "Fair" },
  poor: { color: "var(--danger)", bg: "rgba(255, 51, 85, 0.1)", label: "Poor" },
  closed: { color: "#666", bg: "rgba(102, 102, 102, 0.15)", label: "Closed" },
};

export default function ConditionReports({ routeId }: { routeId: string }) {
  const { user } = useAuth();
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState("good");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetch(`/api/routes/${routeId}/conditions`)
      .then((r) => r.json())
      .then((json) => {
        setConditions(json.data ?? json);
        setHasMore(json.hasMore ?? false);
        setPage(1);
      });
  }, [routeId]);

  const loadMore = async () => {
    setLoadingMore(true);
    const nextPage = page + 1;
    const res = await fetch(`/api/routes/${routeId}/conditions?page=${nextPage}`);
    const json = await res.json();
    setConditions((prev) => [...prev, ...(json.data ?? json)]);
    setHasMore(json.hasMore ?? false);
    setPage(nextPage);
    setLoadingMore(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    setSubmitting(true);
    const res = await fetch(`/api/routes/${routeId}/conditions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });

    if (res.ok) {
      const json = await res.json();
      setConditions(json.data ?? json);
      setHasMore(json.hasMore ?? false);
      setPage(1);
      setNote("");
      setShowForm(false);
    }
    setSubmitting(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "Z");
    return date.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
  };

  const latest = conditions[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Trail Conditions</h2>
        {user && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm font-bold hover:opacity-80 flex items-center gap-1"
            style={{ color: "var(--accent)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Report
          </button>
        )}
      </div>

      {/* Latest condition badge */}
      {latest && (() => {
        const s = STATUS_STYLES[latest.status];
        return (
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold mb-4 neon-badge"
            style={{ color: s?.color, background: s?.bg }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: s?.color, boxShadow: `0 0 6px ${s?.color}40` }} />
            {s?.label} — {formatDate(latest.created_at)}
          </div>
        );
      })()}

      {/* Report form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 p-4 rounded-lg" style={{ background: "var(--bg)" }}>
          <div className="mb-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Status</label>
            <div className="flex gap-2">
              {Object.entries(STATUS_STYLES).map(([key, style]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatus(key)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                  style={{
                    color: status === key ? style.color : "var(--text-muted)",
                    background: status === key ? style.bg : "var(--bg-card)",
                    border: status === key ? `1px solid ${style.color}40` : "1px solid var(--border)",
                    boxShadow: status === key ? `0 0 8px ${style.color}20` : "none",
                  }}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Muddy after recent rain, gate at km 5 is locked..."
              rows={2}
              maxLength={500}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm hover:opacity-80" style={{ color: "var(--text-muted)" }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !note.trim()}
              className="btn-accent px-4 py-1.5 rounded-lg text-sm font-bold disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Submit Report"}
            </button>
          </div>
        </form>
      )}

      {!user && conditions.length === 0 && (
        <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
          <Link href="/login" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>Sign in</Link> to report trail conditions
        </p>
      )}

      {conditions.length === 0 && user && !showForm && (
        <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>No condition reports yet</p>
      )}

      {/* Condition history */}
      {conditions.length > 0 && (
        <div className="space-y-3">
          {conditions.map((c) => {
            const s = STATUS_STYLES[c.status];
            return (
              <div key={c.id} className="flex items-start gap-3">
                <span
                  className="shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold neon-badge"
                  style={{ color: s?.color, background: s?.bg }}
                >
                  {s?.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{c.note}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {c.user_name || "Anonymous"} — {formatDate(c.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-2 text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ color: "var(--accent)" }}
            >
              {loadingMore ? "Loading..." : "Load more reports"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
