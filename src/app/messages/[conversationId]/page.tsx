"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-IE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ConversationPage() {
  const params = useParams();
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<{ name: string; avatar: string | null } | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const conversationId = params.conversationId as string;

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/messages/${conversationId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch {
      setFetchError(true);
    }
    setLoadingMessages(false);
  };

  useEffect(() => {
    if (user && conversationId) {
      fetchMessages();

      // Also get conversation list to find other user's info
      fetch("/api/messages")
        .then((r) => r.json())
        .then((data) => {
          const conv = data.conversations?.find((c: { id: string }) => c.id === conversationId);
          if (conv) {
            setOtherUser({
              name: conv.other_user_name || "User",
              avatar: conv.other_user_avatar,
            });
          }
        });

      // Poll for new messages every 10 seconds
      const interval = setInterval(fetchMessages, 10000);
      return () => clearInterval(interval);
    }
  }, [user, conversationId]);

  // Track scroll position to avoid hijacking when user scrolls up
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  useEffect(() => {
    if (isNearBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newMessage.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setNewMessage("");
      } else {
        toast("Failed to send message", "error");
      }
    } catch {
      toast("Failed to send message", "error");
    }
    setSending(false);
  };

  if (loading || loadingMessages) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <header className="px-4 md:px-6 py-3 shrink-0" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="w-5 h-5 skeleton" />
            <div className="w-8 h-8 rounded-full skeleton" />
            <div className="h-5 w-24 skeleton" />
          </div>
        </header>
        <div className="flex-1 px-4 md:px-6 py-4 animate-pulse">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-start"><div className="h-10 w-48 skeleton rounded-2xl" /></div>
            <div className="flex justify-end"><div className="h-10 w-36 skeleton rounded-2xl" /></div>
            <div className="flex justify-start"><div className="h-10 w-56 skeleton rounded-2xl" /></div>
            <div className="flex justify-end"><div className="h-10 w-44 skeleton rounded-2xl" /></div>
          </div>
        </div>
      </div>
    );
  }

  const otherName = otherUser?.name || "Conversation";
  const otherAvatar = otherUser?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherName)}&background=1a1a1a&color=c8ff00&size=40&bold=true`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="px-4 md:px-6 py-3 shrink-0" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/messages" className="hover:opacity-80 transition-opacity" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <img src={otherAvatar} alt={otherName} className="w-8 h-8 rounded-full object-cover" style={{ border: "1px solid var(--border)" }} />
          <span className="font-bold tracking-tight" style={{ color: "var(--text)" }}>{otherName}</span>
        </div>
      </header>

      {/* Messages */}
      {fetchError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Could not load messages.</p>
          <button
            onClick={() => { setFetchError(false); setLoadingMessages(true); fetchMessages(); }}
            className="btn-accent px-4 py-2 rounded-lg text-sm font-bold"
          >
            Try again
          </button>
        </div>
      ) : (
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          <div className="max-w-2xl mx-auto space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-sm py-8" style={{ color: "var(--text-muted)" }}>No messages yet. Start the conversation!</p>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[75%] px-4 py-2.5 rounded-2xl"
                      style={{
                        background: isMine ? "var(--accent)" : "var(--bg-card)",
                        color: isMine ? "#000" : "var(--text)",
                        border: isMine ? "none" : "1px solid var(--border)",
                        borderBottomRightRadius: isMine ? "4px" : "16px",
                        borderBottomLeftRadius: isMine ? "16px" : "4px",
                      }}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                      <p className="text-[10px] mt-1" style={{ opacity: 0.6 }}>{formatTime(msg.created_at)}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderTop: "1px solid var(--border)" }}>
        <form onSubmit={handleSend} className="max-w-2xl mx-auto flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-full px-4 py-2.5 text-sm"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-30 transition-opacity"
            style={{ background: "var(--accent)", color: "#000" }}
            aria-label="Send message"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
