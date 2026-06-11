"use client";

/**
 * One-tap "Send to Garmin" (Komoot-rival roadmap #1 — the feature they
 * paywalled). Renders nothing until GARMIN_CONSUMER_KEY is configured
 * server-side; then offers Connect → Push with honest states.
 */

import { useEffect, useState } from "react";

interface SendToGarminProps {
  name: string;
  coordinates: [number, number][];
  elevations?: number[];
  distance_km: number;
  elevation_gain_m: number;
  discipline: string;
  course_points?: Array<{ lat: number; lng: number; name: string; type: string }>;
}

type Status = "hidden" | "connect" | "ready" | "pushing" | "done" | "error";

export default function SendToGarmin(props: SendToGarminProps) {
  const [status, setStatus] = useState<Status>("hidden");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    fetch("/api/garmin/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const d = body?.data;
        if (!d?.enabled) return; // stays hidden
        setStatus(d.connected ? "ready" : "connect");
      })
      .catch(() => {});
  }, []);

  if (status === "hidden") return null;

  async function push() {
    setStatus("pushing");
    setMessage("");
    try {
      const res = await fetch("/api/garmin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: props.name,
          coordinates: props.coordinates,
          elevations: props.elevations,
          distance_km: props.distance_km,
          elevation_gain_m: props.elevation_gain_m,
          discipline: props.discipline,
          course_points: props.course_points,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("done");
      } else if (body?.code === "NOT_CONNECTED") {
        setStatus("connect");
      } else {
        setStatus("error");
        setMessage(body?.error ?? "Push failed — try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network hiccup — try again.");
    }
  }

  const base = "text-xs font-bold px-3 py-1.5 rounded-lg";

  if (status === "connect") {
    return (
      <a href="/api/garmin/connect" className={base} style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
        Connect Garmin
      </a>
    );
  }
  if (status === "done") {
    return (
      <span className={base} style={{ color: "var(--success, #00ff88)" }}>
        ✓ On your Garmin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={push}
        disabled={status === "pushing"}
        className={base}
        style={{ background: "var(--accent)", color: "var(--bg)", opacity: status === "pushing" ? 0.6 : 1 }}
      >
        {status === "pushing" ? "Sending…" : "Send to Garmin"}
      </button>
      {status === "error" && (
        <span className="text-[10px]" style={{ color: "#ff6b6b" }}>{message}</span>
      )}
    </span>
  );
}
