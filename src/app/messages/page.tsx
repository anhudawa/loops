"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

interface Conversation {
  id: string;
  other_user_id: string;
  other_user_name: string | null;
  other_user_avatar: string | null;
  last_message: string;
  last_message_at: string;
  unread: boolean;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-IE", { month: "short", day: "numeric" });
}

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetch("/api/messages")
        .then((r) => r.json())
        .then((data) => {
          setConversations(data.conversations || []);
          setLoadingConversations(false);
        })
        .catch(() => setLoadingConversations(false));
    }
  }, [user]);

  if (loading || loadingConversations) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="w-5 h-5 skeleton" />
            <div className="h-5 w-16 skeleton" />
            <div className="h-5 w-20 skeleton" />
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 space-y-2 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
              <div className="w-12 h-12 rounded-full skeleton shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-28 skeleton" />
                <div className="h-3 w-48 skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/" className="hover:opacity-80 transition-opacity" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <Link href="/">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
          <span className="font-bold tracking-tight ml-2" style={{ color: "var(--text)" }}>Messages</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">
        {conversations.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--text-muted)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="font-bold mb-1" style={{ color: "var(--text)" }}>No messages yet</p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Visit a rider&apos;s profile to send them a message</p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => {
              const name = conv.other_user_name || "User";
              const avatar = conv.other_user_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a1a&color=c8ff00&size=48&bold=true`;

              return (
                <Link key={conv.id} href={`/messages/${conv.id}`}>
                  <div className="flex items-center gap-3 p-3 rounded-xl hover-row cursor-pointer">
                    <div className="relative">
                      <img src={avatar} alt={name} className="w-12 h-12 rounded-full object-cover" style={{ border: "1px solid var(--border)" }} />
                      {conv.unread && (
                        <div className="absolute top-0 right-0 w-3 h-3 rounded-full" style={{ background: "var(--accent)", border: "2px solid var(--bg)" }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-sm truncate" style={{ color: conv.unread ? "var(--text)" : "var(--text-secondary)" }}>{name}</p>
                        <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{timeAgo(conv.last_message_at)}</span>
                      </div>
                      <p className="text-xs truncate mt-0.5" style={{ color: conv.unread ? "var(--text-secondary)" : "var(--text-muted)" }}>
                        {conv.last_message}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
