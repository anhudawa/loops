"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function EditProfilePage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetch(`/api/users/${user.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.error) {
            setName(data.name || "");
            setBio(data.bio || "");
            setLocation(data.location || "");
          }
          setLoadingProfile(false);
        });
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio, location }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      await refresh();
      router.push(`/profile/${user!.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  };

  if (loading || loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="animate-pulse" style={{ color: "var(--text-muted)" }}>Loading...</div>
      </div>
    );
  }

  const inputStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href={`/profile/${user!.id}`} className="hover:opacity-80 transition-opacity" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="font-bold tracking-tight" style={{ color: "var(--text)" }}>Edit Profile</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 md:px-6 py-8">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg px-4 py-2.5 text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about your riding..."
              rows={3}
              maxLength={500}
              className="w-full rounded-lg px-4 py-2.5 text-sm resize-none"
              style={inputStyle}
            />
            <p className="text-[10px] mt-1 text-right" style={{ color: "var(--text-muted)" }}>{bio.length}/500</p>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Dublin, Ireland"
              className="w-full rounded-lg px-4 py-2.5 text-sm"
              style={inputStyle}
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(255, 51, 85, 0.1)", border: "1px solid rgba(255, 51, 85, 0.3)", color: "#ff3355" }}>
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href={`/profile/${user!.id}`}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 btn-accent py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
