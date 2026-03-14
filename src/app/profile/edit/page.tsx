"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function EditProfilePage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avgSpeedKmh, setAvgSpeedKmh] = useState(25);
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
            setAvatarUrl(data.avatar_url || null);
            setAvgSpeedKmh(data.avg_speed_kmh ?? 25);
          }
          setLoadingProfile(false);
        });
    }
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2MB");
      return;
    }

    setUploadingAvatar(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload");
      }

      setAvatarUrl(data.avatar_url);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio, location, avg_speed_kmh: avgSpeedKmh }),
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

  const displayName = name || user?.email?.split("@")[0] || "User";
  const currentAvatar = avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a1a&color=c8ff00&size=120&bold=true`;

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
          {/* Avatar Upload */}
          <div className="flex flex-col items-center gap-3 mb-2">
            <div className="relative">
              <img
                src={currentAvatar}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover"
                style={{ border: "2px solid var(--border)" }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "#000" }}
              >
                {uploadingAvatar ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
              {uploadingAvatar ? "Uploading..." : "Tap to change photo"}
            </p>
          </div>

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

          {/* Cruising Speed */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
              Your typical cruising speed
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={15}
                max={45}
                step={1}
                value={avgSpeedKmh}
                onChange={(e) => setAvgSpeedKmh(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="text-sm font-bold min-w-[52px] text-right" style={{ color: "var(--accent)" }}>
                {avgSpeedKmh} km/h
              </span>
            </div>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Used to estimate ride duration on route cards
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(255, 51, 85, 0.1)", border: "1px solid rgba(255, 51, 85, 0.3)", color: "var(--danger)" }}>
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
