"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";
import Link from "next/link";

interface Comment {
  id: string;
  user_name: string | null;
  user_email: string;
  body: string;
  created_at: string;
}

export default function Comments({ routeId }: { routeId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/routes/${routeId}/comments`)
      .then((r) => r.json())
      .then(setComments);
  }, [routeId]);

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
      const data = await res.json();
      setComments(data);
      setBody("");
    }
    setSubmitting(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "Z");
    return date.toLocaleDateString("en-IE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
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
      <h2 className="text-xs font-extrabold uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>
        Comments
        {comments.length > 0 && (
          <span className="font-normal ml-2" style={{ color: "var(--text-muted)" }}>({comments.length})</span>
        )}
      </h2>

      {/* Comment form */}
      {user ? (
        <form onSubmit={handleSubmit} className="mb-6">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share your experience on this route..."
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg px-4 py-2.5 text-sm resize-none"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{body.length}/2000</span>
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="btn-accent px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Posting..." : "Post Comment"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-6 p-4 rounded-lg text-center" style={{ background: "var(--bg)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            <Link href="/login" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
              Sign in
            </Link>{" "}
            to leave a comment
          </p>
        </div>
      )}

      {/* Comments list */}
      {comments.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>
          No comments yet. Be the first to share your experience!
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "var(--accent-glow)", color: "var(--accent)" }}>
                {getInitial(comment)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
                    {getDisplayName(comment)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDate(comment.created_at)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-secondary)" }}>
                  {comment.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
