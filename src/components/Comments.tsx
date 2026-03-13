"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";
import Link from "next/link";

interface Comment {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string;
  user_avatar: string | null;
  body: string;
  created_at: string;
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const date = new Date(dateStr + "Z").getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr + "Z").toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Comments({ routeId }: { routeId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetch(`/api/routes/${routeId}/comments`)
      .then((r) => r.json())
      .then((json) => {
        setComments(json.data ?? json);
        setHasMore(json.hasMore ?? false);
        setPage(1);
      });
  }, [routeId]);

  const loadMore = async () => {
    setLoadingMore(true);
    const nextPage = page + 1;
    const res = await fetch(`/api/routes/${routeId}/comments?page=${nextPage}`);
    const json = await res.json();
    setComments((prev) => [...prev, ...(json.data ?? json)]);
    setHasMore(json.hasMore ?? false);
    setPage(nextPage);
    setLoadingMore(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setSubmitting(true);
    const res = await fetch(`/api/routes/${routeId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    if (res.ok) {
      const json = await res.json();
      setComments(json.data ?? json);
      setHasMore(json.hasMore ?? false);
      setPage(1);
      setBody("");
    }
    setSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    setDeletingId(commentId);
    const res = await fetch(`/api/routes/${routeId}/comments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId }),
    });

    if (res.ok) {
      const json = await res.json();
      setComments(json.data ?? json);
      setHasMore(json.hasMore ?? false);
      setPage(1);
    }
    setDeletingId(null);
  };

  const getInitial = (comment: Comment) => {
    if (comment.user_name) return comment.user_name[0].toUpperCase();
    return comment.user_email[0].toUpperCase();
  };

  const getDisplayName = (comment: Comment) => {
    return comment.user_name || comment.user_email.split("@")[0];
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <h2 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Discussion
          {comments.length > 0 && (
            <span className="font-normal ml-2" style={{ color: "var(--text-muted)" }}>({comments.length})</span>
          )}
        </h2>
      </div>

      {/* Comment form */}
      {user ? (
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-3">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5"
                style={{ border: "2px solid var(--border)" }}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                style={{ background: "var(--accent-glow)", color: "var(--accent)" }}
              >
                {(user.name || user.email)[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Share your experience on this route..."
                rows={3}
                maxLength={2000}
                className="w-full rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none transition-colors"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{body.length}/2000</span>
                <button
                  type="submit"
                  disabled={submitting || !body.trim()}
                  className="px-4 py-1.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  {submitting ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <div className="mb-6 p-4 rounded-lg text-center" style={{ background: "var(--bg)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            <Link href="/login" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
              Sign in
            </Link>{" "}
            to join the discussion
          </p>
        </div>
      )}

      {/* Comments list */}
      {comments.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>
          No comments yet. Be the first to share your experience!
        </p>
      ) : (
        <div className="space-y-1" role="list" aria-label="Comments">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="flex gap-3 rounded-xl px-3 py-3 transition-colors group"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Link href={`/profile/${comment.user_id}`} className="shrink-0 mt-0.5">
                {comment.user_avatar ? (
                  <img
                    src={comment.user_avatar}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover hover:opacity-80 transition-opacity"
                    style={{ border: "2px solid var(--border)" }}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold hover:opacity-80 transition-opacity"
                    style={{ background: "var(--accent-glow)", color: "var(--accent)" }}
                  >
                    {getInitial(comment)}
                  </div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Link
                    href={`/profile/${comment.user_id}`}
                    className="text-sm font-bold hover:opacity-80 transition-opacity"
                    style={{ color: "var(--text)" }}
                  >
                    {getDisplayName(comment)}
                  </Link>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {timeAgo(comment.created_at)}
                  </span>
                  {user && user.id === comment.user_id && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                      className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-xs"
                      style={{ color: "var(--danger)" }}
                      title="Delete comment"
                    >
                      {deletingId === comment.id ? (
                        <span className="text-[11px]">...</span>
                      ) : (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {comment.body}
                </p>
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-2 text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ color: "var(--accent)" }}
            >
              {loadingMore ? "Loading..." : "Load more comments"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
