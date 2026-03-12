"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

interface ActivityItem {
  type: "rating" | "comment" | "condition" | "photo";
  route_id: string;
  route_name: string;
  detail: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  created_at: string;
  stats: {
    routesRated: number;
    commentsPosted: number;
    conditionsReported: number;
    photosUploaded: number;
  };
  routes: {
    id: string;
    name: string;
    difficulty: string;
    distance_km: number;
    county: string;
    country?: string;
    region?: string | null;
  }[];
  totalKm: number;
  followers: number;
  following: number;
  activity: ActivityItem[];
  viewerFollowing: boolean;
}

const DIFFICULTY_STYLES: Record<string, { color: string; bg: string }> = {
  easy: { color: "#00ff88", bg: "rgba(0, 255, 136, 0.1)" },
  moderate: { color: "#ffbb00", bg: "rgba(255, 187, 0, 0.1)" },
  hard: { color: "#ff3355", bg: "rgba(255, 51, 85, 0.1)" },
  expert: { color: "#bb44ff", bg: "rgba(187, 68, 255, 0.1)" },
};

const ACTIVITY_ICONS: Record<string, { icon: string; label: string; color: string }> = {
  rating: { icon: "★", label: "Rated", color: "#ffbb00" },
  comment: { icon: "💬", label: "Commented on", color: "#c8ff00" },
  condition: { icon: "🛤️", label: "Reported conditions on", color: "#00ff88" },
  photo: { icon: "📸", label: "Added a photo to", color: "#bb44ff" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function ProfilePage() {
  const params = useParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const isOwnProfile = currentUser?.id === params.id;

  useEffect(() => {
    if (params.id) {
      fetch(`/api/users/${params.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.error) {
            setProfile(data);
            setIsFollowing(data.viewerFollowing);
          }
          setLoading(false);
        });
    }
  }, [params.id]);

  const handleFollow = async () => {
    if (!currentUser || followLoading) return;
    setFollowLoading(true);

    const method = isFollowing ? "DELETE" : "POST";
    const res = await fetch(`/api/users/${params.id}/follow`, { method });
    if (res.ok) {
      setIsFollowing(!isFollowing);
      if (profile) {
        setProfile({
          ...profile,
          followers: profile.followers + (isFollowing ? -1 : 1),
        });
      }
    }
    setFollowLoading(false);
  };

  const loadMoreActivity = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = activityPage + 1;
    const res = await fetch(`/api/users/${params.id}/activity?page=${nextPage}`);
    const data = await res.json();
    if (data.activity.length === 0) {
      setHasMore(false);
    } else {
      setProfile((prev) =>
        prev ? { ...prev, activity: [...prev.activity, ...data.activity] } : prev
      );
      setActivityPage(nextPage);
    }
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full" style={{ background: "var(--border)" }} />
          <div className="h-5 rounded w-32" style={{ background: "var(--border)" }} />
          <div className="h-3 rounded w-24" style={{ background: "var(--border)" }} />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-center">
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>User not found</p>
          <Link href="/" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>Back to routes</Link>
        </div>
      </div>
    );
  }

  const displayName = profile.name || profile.email.split("@")[0];
  const initial = displayName[0].toUpperCase();
  const avatarUrl = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a1a&color=c8ff00&size=120&bold=true`;
  const joinDate = new Date(profile.created_at + "Z").toLocaleDateString("en-IE", { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="hover:opacity-80 transition-opacity" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <Link href="/">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        {/* Profile header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 mb-8">
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-20 h-20 rounded-full object-cover"
            style={{ border: "2px solid var(--border)" }}
          />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
              <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{displayName}</h1>
              {!isOwnProfile && currentUser && (
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className="px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all"
                  style={{
                    background: isFollowing ? "transparent" : "var(--accent)",
                    color: isFollowing ? "var(--accent)" : "#000",
                    border: isFollowing ? "1px solid var(--accent)" : "1px solid transparent",
                  }}
                >
                  {isFollowing ? "Following" : "Follow"}
                </button>
              )}
              {isOwnProfile && (
                <Link
                  href="/profile/edit"
                  className="px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                  style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                >
                  Edit Profile
                </Link>
              )}
            </div>
            {profile.location && (
              <p className="text-sm flex items-center gap-1 justify-center sm:justify-start" style={{ color: "var(--text-muted)" }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {profile.location}
              </p>
            )}
            {profile.bio && (
              <p className="text-sm mt-2 max-w-md" style={{ color: "var(--text-secondary)" }}>{profile.bio}</p>
            )}
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Member since {joinDate}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
          {[
            { label: "Total Km", value: profile.totalKm, color: "var(--accent)" },
            { label: "Rated", value: profile.stats.routesRated, color: "#ffbb00" },
            { label: "Reports", value: profile.stats.conditionsReported, color: "#00ff88" },
            { label: "Photos", value: profile.stats.photosUploaded, color: "#bb44ff" },
            { label: "Followers", value: profile.followers, color: "var(--text)" },
            { label: "Following", value: profile.following, color: "var(--text)" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl p-3 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-lg font-extrabold" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Activity Feed */}
        <div className="rounded-2xl p-5 md:p-6 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-xs font-extrabold uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Activity</h2>
          {profile.activity.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>No activity yet</p>
          ) : (
            <div className="space-y-3">
              {profile.activity.map((item, i) => {
                const config = ACTIVITY_ICONS[item.type];
                return (
                  <div key={i} className="flex items-start gap-3 py-2" style={{ borderBottom: i < profile.activity.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <span className="text-lg mt-0.5" style={{ minWidth: 24, textAlign: "center" }}>{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: "var(--text)" }}>
                        <span style={{ color: "var(--text-muted)" }}>{config.label} </span>
                        <Link href={`/routes/${item.route_id}`} className="font-bold hover:underline" style={{ color: config.color }}>
                          {item.route_name}
                        </Link>
                        {item.type === "rating" && (
                          <span style={{ color: "#ffbb00" }}> — {item.detail}/5</span>
                        )}
                        {item.type === "condition" && (
                          <span className="capitalize" style={{ color: "var(--text-muted)" }}> — {item.detail}</span>
                        )}
                      </p>
                      {item.type === "comment" && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>"{item.detail}"</p>
                      )}
                    </div>
                    <span className="text-[10px] shrink-0 mt-1" style={{ color: "var(--text-muted)" }}>{timeAgo(item.created_at)}</span>
                  </div>
                );
              })}

              {hasMore && profile.activity.length >= 20 && (
                <button
                  onClick={loadMoreActivity}
                  disabled={loadingMore}
                  className="w-full py-2 text-xs font-bold uppercase tracking-wider rounded-lg hover:opacity-80"
                  style={{ color: "var(--accent)", background: "var(--accent-glow)" }}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Routes explored */}
        <div className="rounded-2xl p-5 md:p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-xs font-extrabold uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Routes Explored</h2>
          {profile.routes.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>No routes explored yet</p>
          ) : (
            <div className="space-y-1">
              {profile.routes.map((route) => {
                const diff = DIFFICULTY_STYLES[route.difficulty] || DIFFICULTY_STYLES.easy;
                return (
                  <Link key={route.id} href={`/routes/${route.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-xl transition-colors" style={{ background: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <p className="font-bold tracking-tight" style={{ color: "var(--text)" }}>{route.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{route.region || route.county}{route.country ? `, ${route.country}` : ""} — {route.distance_km} km</p>
                      </div>
                      <span
                        className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg capitalize neon-badge"
                        style={{ color: diff.color, background: diff.bg }}
                      >
                        {route.difficulty}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
