"use client";

import { useState } from "react";

interface ShareRideProps {
  route: {
    id: string;
    name: string;
    distance_km: number;
    elevation_gain_m: number;
    difficulty: string;
    surface_type: string;
    county: string;
  };
}

function getDefaultTime(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  // Format for datetime-local input: YYYY-MM-DDTHH:mm
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const d = String(tomorrow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T09:00`;
}

function formatTime(dtStr: string): string {
  const dt = new Date(dtStr);
  return dt.toLocaleDateString("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }) + ", " + dt.toLocaleTimeString("en-IE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ShareRide({ route }: ShareRideProps) {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState(getDefaultTime);
  const [meetingPoint, setMeetingPoint] = useState("");

  const handleShare = () => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const routeUrl = `${baseUrl}/routes/${route.id}`;
    const difficulty = route.difficulty.charAt(0).toUpperCase() + route.difficulty.slice(1);

    const message = [
      `🚴 Ride Invite — ${route.name}`,
      "",
      `📍 Meeting point: ${meetingPoint || "TBC"}`,
      `🕐 Start time: ${formatTime(startTime)}`,
      "",
      `Route: ${route.distance_km} km · ${route.elevation_gain_m}m elevation · ${difficulty} · ${route.surface_type.charAt(0).toUpperCase() + route.surface_type.slice(1)}`,
      `County: ${route.county}`,
      "",
      `View route: ${routeUrl}`,
    ].join("\n");

    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
    setOpen(false);
  };

  const inputStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90"
        style={{ background: "#25D366", color: "#fff" }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Share Ride
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 mx-0 sm:mx-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-extrabold tracking-tight" style={{ color: "var(--text)" }}>Share Ride</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{route.name}</p>
              </div>
              <button onClick={() => setOpen(false)} className="hover:opacity-70" style={{ color: "var(--text-muted)" }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Meeting point
                </label>
                <input
                  type="text"
                  value={meetingPoint}
                  onChange={(e) => setMeetingPoint(e.target.value)}
                  placeholder="e.g. Lidl car park, Fermoy"
                  className="w-full rounded-lg px-4 py-2.5 text-sm"
                  style={inputStyle}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Start time
                </label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg px-4 py-2.5 text-sm"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Preview */}
            <div className="mt-4 rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <p className="font-bold" style={{ color: "var(--text)" }}>🚴 Ride Invite — {route.name}</p>
              <p className="mt-1">📍 {meetingPoint || "TBC"}</p>
              <p>🕐 {formatTime(startTime)}</p>
              <p className="mt-1">{route.distance_km} km · {route.elevation_gain_m}m · {route.difficulty} · {route.surface_type}</p>
            </div>

            {/* Send button */}
            <button
              onClick={handleShare}
              className="w-full mt-5 py-3 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{ background: "#25D366", color: "#fff" }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Send on WhatsApp
            </button>
          </div>
        </div>
      )}
    </>
  );
}
