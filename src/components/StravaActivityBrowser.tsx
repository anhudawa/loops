"use client";

import { useState, useEffect, useCallback } from "react";

interface StravaActivityItem {
  id: number;
  name: string;
  type: string;
  date: string;
  distance_km: number;
  elevation_gain_m: number;
  polyline: string | null;
  already_on_loops: boolean;
}

interface StravaActivityBrowserProps {
  onImport: (activityId: number) => void;
  importing: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  Ride: "Road",
  GravelRide: "Gravel",
  MountainBikeRide: "MTB",
  EBikeRide: "E-Bike",
};

const TYPE_COLORS: Record<string, string> = {
  Ride: "var(--warning)",
  GravelRide: "var(--accent)",
  MountainBikeRide: "var(--purple)",
  EBikeRide: "var(--success)",
};

export default function StravaActivityBrowser({ onImport, importing }: StravaActivityBrowserProps) {
  const [activities, setActivities] = useState<StravaActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (pageNum: number) => {
    try {
      const res = await fetch(`/api/strava/activities?page=${pageNum}`);
      const json = await res.json();

      if (!res.ok) {
        if (json.code === "STRAVA_NOT_CONNECTED") {
          setError("Strava disconnected — reconnect to import.");
        } else if (json.code === "RATE_LIMITED") {
          setError("Too many imports. Try again in a few minutes.");
        } else {
          setError(json.error || "Failed to load activities.");
        }
        return;
      }

      const newActivities = json.data as StravaActivityItem[];
      if (newActivities.length < 30) setHasMore(false);

      setActivities((prev) => pageNum === 1 ? newActivities : [...prev, ...newActivities]);
    } catch {
      setError("Strava is temporarily unavailable. Try again or upload a file instead.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage);
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Loading Strava activities...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 px-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 px-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No cycling activities found on Strava.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-2">
        {activities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => onImport(activity.id)}
            disabled={importing !== null}
            className="w-full text-left px-4 py-3 rounded-xl transition-colors flex items-center justify-between gap-3"
            style={{
              background: importing === activity.id ? "var(--surface-hover)" : "var(--surface)",
              border: `1px solid ${importing === activity.id ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold truncate">{activity.name}</span>
                <span
                  className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                  style={{ color: TYPE_COLORS[activity.type] || "var(--text-muted)", background: "var(--bg)" }}
                >
                  {TYPE_LABELS[activity.type] || activity.type}
                </span>
                {activity.already_on_loops && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: "var(--success)", background: "rgba(0,255,136,0.1)" }}>
                    On LOOPS
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>{new Date(activity.date).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span>{activity.distance_km} km</span>
                <span>{activity.elevation_gain_m}m ↑</span>
              </div>
            </div>
            {importing === activity.id && (
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            )}
          </button>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
        >
          Load more activities
        </button>
      )}

      <p className="text-center text-[10px] mt-3" style={{ color: "var(--text-muted)" }}>
        Powered by Strava
      </p>
    </div>
  );
}
