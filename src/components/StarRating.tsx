"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";

export default function StarRating({ routeId }: { routeId: string }) {
  const { user } = useAuth();
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window);
  }, []);

  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/routes/${routeId}/ratings`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setAverage(data.average);
        setCount(data.count);
        setUserRating(data.userRating);
      })
      .catch(() => setError(true));
  }, [routeId]);

  const handleRate = async (score: number) => {
    if (!user) return;

    // Optimistic: update rating immediately
    const prevAverage = average;
    const prevCount = count;
    const prevUserRating = userRating;
    const isNew = userRating === null;
    const newCount = isNew ? count + 1 : count;
    const newAverage = isNew
      ? (average * count + score) / newCount
      : (average * count - (userRating ?? 0) + score) / count;
    setAverage(newAverage);
    setCount(newCount);
    setUserRating(score);

    const res = await fetch(`/api/routes/${routeId}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    });

    if (res.ok) {
      const data = await res.json();
      setAverage(data.average);
      setCount(data.count);
      setUserRating(data.userRating);
    } else {
      // Revert on failure
      setAverage(prevAverage);
      setCount(prevCount);
      setUserRating(prevUserRating);
    }
  };

  const displayScore = hovered ?? userRating ?? 0;

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Ratings unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRate(star)}
            onMouseEnter={() => !isTouchDevice && user && setHovered(star)}
            onMouseLeave={() => !isTouchDevice && setHovered(null)}
            onTouchStart={(e) => {
              if (!user) return;
              e.preventDefault();
              setHovered(star);
            }}
            onTouchEnd={(e) => {
              if (!user) return;
              e.preventDefault();
              handleRate(star);
              setHovered(null);
            }}
            disabled={!user}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${user ? "cursor-pointer" : "cursor-default"}`}
            title={user ? `Rate ${star} star${star > 1 ? "s" : ""}` : "Sign in to rate"}
          >
            <svg
              className="w-6 h-6"
              style={{ color: star <= displayScore ? "var(--warning)" : "var(--border-light)" }}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>
      <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
        <span className="font-bold">{average > 0 ? average.toFixed(1) : "—"}</span>
        <span className="ml-1" style={{ color: "var(--text-muted)" }}>
          ({count} rating{count !== 1 ? "s" : ""})
        </span>
      </div>
      {userRating && (
        <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>Your rating: {userRating}/5</span>
      )}
      {!user && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Sign in to rate</span>
      )}
    </div>
  );
}
