"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

interface ActivityItem {
  type: "rating" | "comment" | "condition" | "photo";
  route_id: string;
  route_name: string;
  detail: string;
  created_at: string;
}

interface RouteItem {
  id: string;
  name: string;
  difficulty: string;
  distance_km: number;
  county: string;
  country?: string;
  region?: string | null;
  avg_score?: number;
  rating_count?: number;
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
  uploadedRoutes: RouteItem[];
  downloadedRoutes: RouteItem[];
  favouritedRoutes: RouteItem[];
  followers: number;
  following: number;
  activity: ActivityItem[];
  viewerFollowing: boolean;
  communityScore: {
    score: number;
    tier: string;
  };
  loopRating: {
    average: number;
    totalRatings: number;
    routesRated: number;
  };
}

const DIFFICULTY_STYLES: Record<string, { color: string; bg: string }> = {
  easy: { color: "var(--success)", bg: "rgba(0, 255, 136, 0.1)" },
  moderate: { color: "var(--warning)", bg: "rgba(255, 187, 0, 0.1)" },
  hard: { color: "var(--danger)", bg: "rgba(255, 51, 85, 0.1)" },
  expert: { color: "var(--purple)", bg: "rgba(187, 68, 255, 0.1)" },
};

const TIER_STYLES: Record<string, { color: string; bg: string; icon: string }> = {
  Explorer: { color: "#88aacc", bg: "rgba(136, 170, 204, 0.1)", icon: "\uD83E\uDDED" },
  Pathfinder: { color: "var(--success)", bg: "rgba(0, 255, 136, 0.1)", icon: "\uD83E\uDD7E" },
  Trailblazer: { color: "var(--warning)", bg: "rgba(255, 187, 0, 0.1)", icon: "\uD83D\uDD25" },
  Legend: { color: "var(--purple)", bg: "rgba(187, 68, 255, 0.1)", icon: "\u26A1" },
};

const ACTIVITY_ICONS: Record<string, { icon: string; label: string; color: string }> = {
  rating: { icon: "\u2605", label: "Rated", color: "var(--warning)" },
  comment: { icon: "\uD83D\uDCAC", label: "Commented on", color: "var(--accent)" },
  condition: { icon: "\uD83D\uDEE4\uFE0F", label: "Reported conditions on", color: "var(--success)" },
  photo: { icon: "\uD83D\uDCF8", label: "Added a photo to", color: "var(--purple)" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const isoStr = dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`;
  const then = new Date(isoStr).getTime();
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

type Tab = "loops" | "activity";
type LoopFilter = "all" | "uploaded" | "downloaded" | "favourited";

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user: currentUser, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("loops");
  const [loopFilter, setLoopFilter] = useState<LoopFilter>("all");
  const [activityPage, setActivityPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [socialModal, setSocialModal] = useState<"followers" | "following" | null>(null);
  const [socialList, setSocialList] = useState<{ id: string; name: string | null; avatar_url: string | null }[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [shareToast, setShareToast] = useState(false);

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

  const handleMessage = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: params.id, body: "👋" }),
      });
      const data = await res.json();
      if (data.conversationId) {
        router.push(`/messages/${data.conversationId}`);
      }
    } catch {
      // silently fail
    }
  };

  const openSocialList = async (type: "followers" | "following") => {
    setSocialModal(type);
    setSocialLoading(true);
    setSocialList([]);
    try {
      const res = await fetch(`/api/users/${params.id}?include=${type}`);
      const data = await res.json();
      setSocialList(data.users || []);
    } catch {
      // ignore
    }
    setSocialLoading(false);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${displayName} on LOOPS`, url });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setShareToast(true);
    setTimeout(() => setShareToast(false), 2000);
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
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="w-5 h-5 skeleton" />
            <div className="h-5 w-16 skeleton" />
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 animate-pulse">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 mb-6">
            <div className="w-20 h-20 rounded-full skeleton" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-40 skeleton" />
              <div className="h-3 w-24 skeleton" />
              <div className="h-3 w-56 skeleton" />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mb-6">
            <div className="rounded-xl h-16 flex-1 skeleton" />
            {[...Array(2)].map((_, i) => (
              <div key={i} className="rounded-xl p-3 h-16 w-20 skeleton" />
            ))}
          </div>
          <div className="h-10 w-full skeleton mb-4" />
          <div className="h-64 w-full skeleton rounded-2xl" />
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
  const avatarUrl = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a1a&color=c8ff00&size=120&bold=true`;
  const joinDate = new Date(profile.created_at).toLocaleDateString("en-IE", { month: "long", year: "numeric" });
  const tierStyle = TIER_STYLES[profile.communityScore?.tier] || TIER_STYLES.Explorer;

  // Merge all loops into a deduplicated list
  const uploaded = profile.uploadedRoutes || [];
  const downloaded = profile.downloadedRoutes || [];
  const favourited = profile.favouritedRoutes || [];

  const allLoopsMap = new Map<string, RouteItem & { sources: Set<string> }>();
  uploaded.forEach((r) => {
    const existing = allLoopsMap.get(r.id);
    if (existing) existing.sources.add("uploaded");
    else allLoopsMap.set(r.id, { ...r, sources: new Set(["uploaded"]) });
  });
  downloaded.forEach((r) => {
    const existing = allLoopsMap.get(r.id);
    if (existing) existing.sources.add("downloaded");
    else allLoopsMap.set(r.id, { ...r, sources: new Set(["downloaded"]) });
  });
  favourited.forEach((r) => {
    const existing = allLoopsMap.get(r.id);
    if (existing) existing.sources.add("favourited");
    else allLoopsMap.set(r.id, { ...r, sources: new Set(["favourited"]) });
  });
  const allLoops = Array.from(allLoopsMap.values());

  const totalLoopsCount = allLoops.length;

  const filteredLoops =
    loopFilter === "all" ? allLoops
    : loopFilter === "uploaded" ? allLoops.filter((r) => r.sources.has("uploaded"))
    : loopFilter === "downloaded" ? allLoops.filter((r) => r.sources.has("downloaded"))
    : allLoops.filter((r) => r.sources.has("favourited"));

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "loops", label: "My Loops", count: totalLoopsCount },
    { key: "activity", label: "Activity", count: profile.activity?.length || 0 },
  ];

  const loopFilters: { key: LoopFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: allLoops.length },
    { key: "uploaded", label: "Uploaded", count: uploaded.length },
    { key: "downloaded", label: "Downloaded", count: downloaded.length },
    { key: "favourited", label: "Favourited", count: favourited.length },
  ];

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
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 mb-6">
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-20 h-20 rounded-full object-cover"
            style={{ border: "2px solid var(--border)" }}
          />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
              <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{displayName}</h1>

              {/* Community Score Badge */}
              {profile.communityScore && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                  style={{ color: tierStyle.color, background: tierStyle.bg }}
                >
                  {tierStyle.icon} {profile.communityScore.score} · {profile.communityScore.tier}
                </span>
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

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 justify-center sm:justify-start">
              {!isOwnProfile && currentUser && (
                <>
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all"
                    style={{
                      background: isFollowing ? "transparent" : "var(--accent)",
                      color: isFollowing ? "var(--accent)" : "#000",
                      border: isFollowing ? "1px solid var(--accent)" : "1px solid transparent",
                    }}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </button>
                  <button
                    onClick={handleMessage}
                    className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all hover:opacity-80"
                    style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                  >
                    Message
                  </button>
                </>
              )}
              {isOwnProfile && (
                <>
                  <Link
                    href="/profile/edit"
                    className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
                    style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                  >
                    Edit Profile
                  </Link>
                  <button
                    onClick={async () => { await logout(); router.push("/"); }}
                    className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
                    style={{ border: "1px solid rgba(255, 51, 85, 0.3)", color: "var(--danger)" }}
                  >
                    Sign Out
                  </button>
                </>
              )}
              <button
                onClick={handleShare}
                className="p-1.5 rounded-full hover:opacity-80 transition-opacity"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                aria-label="Share profile"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Loop Rating + Stats */}
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          {/* Loop Rating — prominent */}
          {profile.loopRating && profile.loopRating.average > 0 && (
            <div
              className="flex items-center gap-3 rounded-xl px-5 py-4 flex-1"
              style={{ background: "rgba(255, 187, 0, 0.08)", border: "1px solid rgba(255, 187, 0, 0.2)" }}
            >
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg
                    key={star}
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill={star <= Math.round(profile.loopRating.average) ? "var(--warning)" : "none"}
                    stroke="var(--warning)"
                    strokeWidth={1.5}
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <div>
                <p className="text-lg font-extrabold leading-tight" style={{ color: "var(--warning)" }}>
                  {profile.loopRating.average.toFixed(1)}
                </p>
                <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--text-muted)" }}>
                  {profile.loopRating.totalRatings} rating{profile.loopRating.totalRatings !== 1 ? "s" : ""} across {profile.loopRating.routesRated} loop{profile.loopRating.routesRated !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}

          {/* Followers / Following */}
          <div className="flex gap-2">
            {[
              { label: "Followers", value: profile.followers, action: () => openSocialList("followers") },
              { label: "Following", value: profile.following, action: () => openSocialList("following") },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl p-3 text-center cursor-pointer hover:opacity-80 transition-opacity min-w-[80px]"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                onClick={stat.action}
              >
                <p className="text-lg font-extrabold" style={{ color: "var(--text)" }}>{stat.value}</p>
                <p className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
              style={{
                background: activeTab === tab.key ? "var(--accent-glow)" : "transparent",
                color: activeTab === tab.key ? "var(--accent)" : "var(--text-muted)",
                border: activeTab === tab.key ? "1px solid rgba(200, 255, 0, 0.2)" : "1px solid transparent",
              }}
            >
              {tab.label} {tab.count > 0 && <span style={{ opacity: 0.6 }}>({tab.count})</span>}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="rounded-2xl p-5 md:p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {/* My Loops tab */}
          {activeTab === "loops" && (
            <>
              {/* Filter pills */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {loopFilters.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setLoopFilter(f.key)}
                    className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all"
                    style={{
                      background: loopFilter === f.key ? "var(--accent-glow)" : "transparent",
                      color: loopFilter === f.key ? "var(--accent)" : "var(--text-muted)",
                      border: loopFilter === f.key ? "1px solid rgba(200, 255, 0, 0.2)" : "1px solid var(--border)",
                    }}
                  >
                    {f.label} <span style={{ opacity: 0.6 }}>({f.count})</span>
                  </button>
                ))}
              </div>

              {filteredLoops.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
                    {loopFilter === "all" ? "No loops yet" : `No ${loopFilter} loops`}
                  </p>
                  {isOwnProfile && loopFilter === "all" && (
                    <Link href="/upload" className="text-xs font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
                      Upload your first loop →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredLoops.map((route) => {
                    const diff = DIFFICULTY_STYLES[route.difficulty] || DIFFICULTY_STYLES.easy;
                    return (
                      <Link key={route.id} href={`/routes/${route.id}`}>
                        <div className="flex items-center justify-between p-3 rounded-xl hover-row">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Source icons */}
                            <div className="flex gap-0.5 shrink-0">
                              {route.sources.has("uploaded") && (
                                <span title="Uploaded" className="text-[11px]" style={{ color: "var(--accent)" }}>↑</span>
                              )}
                              {route.sources.has("downloaded") && (
                                <span title="Downloaded" className="text-[11px]" style={{ color: "var(--success)" }}>↓</span>
                              )}
                              {route.sources.has("favourited") && (
                                <span title="Favourited" className="text-[11px]" style={{ color: "var(--danger)" }}>♥</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold tracking-tight truncate" style={{ color: "var(--text)" }}>{route.name}</p>
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                {route.region || route.county}{route.country ? `, ${route.country}` : ""} — {route.distance_km} km
                                {Number(route.avg_score) > 0 ? ` · ★ ${Number(route.avg_score).toFixed(1)}` : ""}
                              </p>
                            </div>
                          </div>
                          <span
                            className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg capitalize neon-badge shrink-0 ml-2"
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
            </>
          )}

          {/* Activity tab */}
          {activeTab === "activity" && (
            <>
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
                              <span style={{ color: "var(--warning)" }}> — {item.detail}/5</span>
                            )}
                            {item.type === "condition" && (
                              <span className="capitalize" style={{ color: "var(--text-muted)" }}> — {item.detail}</span>
                            )}
                          </p>
                          {item.type === "comment" && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>&quot;{item.detail}&quot;</p>
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
            </>
          )}
        </div>
      </div>

      {/* Followers/Following Modal */}
      {socialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSocialModal(null)} aria-hidden="true" />
          <div
            className="relative w-full max-w-sm mx-4 rounded-2xl max-h-[70vh] flex flex-col"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--text)" }}>
                {socialModal === "followers" ? "Followers" : "Following"}
              </h3>
              <button
                onClick={() => setSocialModal(null)}
                className="p-1 rounded-full hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              {socialLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-10 h-10 rounded-full skeleton" />
                      <div className="h-4 w-28 skeleton rounded" />
                    </div>
                  ))}
                </div>
              ) : socialList.length === 0 ? (
                <p className="text-center text-sm py-6" style={{ color: "var(--text-muted)" }}>
                  {socialModal === "followers" ? "No followers yet" : "Not following anyone"}
                </p>
              ) : (
                <div className="space-y-1">
                  {socialList.map((u) => (
                    <Link
                      key={u.id}
                      href={`/profile/${u.id}`}
                      onClick={() => setSocialModal(null)}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover-row"
                    >
                      <img
                        src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || "User")}&background=1a1a1a&color=c8ff00&size=40&bold=true`}
                        alt={u.name || "User"}
                        className="w-10 h-10 rounded-full object-cover"
                        style={{ border: "1.5px solid var(--border)" }}
                      />
                      <span className="font-bold text-sm" style={{ color: "var(--text)" }}>
                        {u.name || "Anonymous"}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share toast */}
      {shareToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-bold shadow-lg"
          style={{ background: "var(--accent)", color: "#000" }}
        >
          Link copied!
        </div>
      )}
    </div>
  );
}
