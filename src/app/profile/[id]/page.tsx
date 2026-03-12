"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
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
  }[];
}

const DIFFICULTY_STYLES: Record<string, { color: string; bg: string }> = {
  easy: { color: "#00ff88", bg: "rgba(0, 255, 136, 0.1)" },
  moderate: { color: "#ffbb00", bg: "rgba(255, 187, 0, 0.1)" },
  hard: { color: "#ff3355", bg: "rgba(255, 51, 85, 0.1)" },
  expert: { color: "#bb44ff", bg: "rgba(187, 68, 255, 0.1)" },
};

export default function ProfilePage() {
  const params = useParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetch(`/api/users/${params.id}`)
        .then((r) => r.json())
        .then((data) => {
          setProfile(data);
          setLoading(false);
        });
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full" style={{ background: "var(--border)" }} />
          <div className="h-4 rounded w-32" style={{ background: "var(--border)" }} />
          <div className="h-3 rounded w-24" style={{ background: "var(--border)" }} />
        </div>
      </div>
    );
  }

  if (!profile || profile.name === undefined) {
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
  const joinDate = new Date(profile.created_at + "Z").toLocaleDateString("en-IE", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
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
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-extrabold" style={{ background: "var(--accent-glow)", color: "var(--accent)" }}>
            {initial}
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{displayName}</h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Member since {joinDate}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Routes Rated", value: profile.stats.routesRated },
            { label: "Comments", value: profile.stats.commentsPosted },
            { label: "Trail Reports", value: profile.stats.conditionsReported },
            { label: "Photos", value: profile.stats.photosUploaded },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl p-4 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>{stat.value}</p>
              <p className="text-[10px] uppercase tracking-wider font-bold mt-1" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Activity routes */}
        <div className="rounded-2xl p-5 md:p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-xs font-extrabold uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Routes Activity</h2>
          {profile.routes.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>No route activity yet</p>
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
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{route.county} — {route.distance_km} km</p>
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
