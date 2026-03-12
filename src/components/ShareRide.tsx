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

const WA_ICON = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export default function ShareRide({ route }: ShareRideProps) {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState(getDefaultTime);
  const [meetingPoint, setMeetingPoint] = useState("");

  const difficulty = route.difficulty.charAt(0).toUpperCase() + route.difficulty.slice(1);
  const surface = route.surface_type.charAt(0).toUpperCase() + route.surface_type.slice(1);

  const handleShare = () => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const routeUrl = `${baseUrl}/routes/${route.id}`;

    const message = [
      `🚴 *Ride Invite — ${route.name}*`,
      "",
      `📍 *Meeting point:* ${meetingPoint || "TBC"}`,
      `🕐 *Start time:* ${formatTime(startTime)}`,
      "",
      `📊 ${route.distance_km} km · ${route.elevation_gain_m}m elev · ${difficulty} · ${surface}`,
      `📌 ${route.county}, Ireland`,
      "",
      `🔗 ${routeUrl}`,
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
      {/* Full-width trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:brightness-110"
        style={{
          background: "linear-gradient(135deg, #25D366, #128C7E)",
          color: "#fff",
          boxShadow: "0 4px 20px rgba(37, 211, 102, 0.25)",
        }}
      >
        {WA_ICON}
        Invite a Friend to Ride
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden mx-0 sm:mx-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with gradient */}
            <div className="px-6 pt-5 pb-4" style={{ background: "linear-gradient(135deg, rgba(37, 211, 102, 0.12), rgba(18, 140, 126, 0.08))" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#25D366" }}>
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold tracking-tight" style={{ color: "var(--text)" }}>Invite to Ride</h3>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{route.name} · {route.county}</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="hover:opacity-70 p-1" style={{ color: "var(--text-muted)" }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              {/* Fields */}
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                    <span>📍</span> Meeting point
                  </label>
                  <input
                    type="text"
                    value={meetingPoint}
                    onChange={(e) => setMeetingPoint(e.target.value)}
                    placeholder="e.g. Lidl car park, Fermoy"
                    className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                    style={{ ...inputStyle, transition: "border-color 0.15s" }}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                    <span>🕐</span> Start time
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                    style={{ ...inputStyle, colorScheme: "dark" }}
                  />
                </div>
              </div>

              {/* Message preview */}
              <div className="mt-5 rounded-xl p-4" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                <p className="text-[10px] uppercase tracking-wider font-bold mb-2.5" style={{ color: "var(--text-muted)" }}>Message preview</p>
                <div className="text-[13px] leading-relaxed space-y-1.5" style={{ color: "var(--text-secondary)" }}>
                  <p className="font-bold" style={{ color: "var(--text)" }}>🚴 Ride Invite — {route.name}</p>
                  <div className="pt-1 space-y-0.5">
                    <p>📍 <span className="font-medium" style={{ color: "var(--text)" }}>{meetingPoint || "TBC"}</span></p>
                    <p>🕐 <span className="font-medium" style={{ color: "var(--text)" }}>{formatTime(startTime)}</span></p>
                  </div>
                  <div className="pt-1 flex flex-wrap gap-x-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{route.distance_km} km</span>
                    <span>·</span>
                    <span>{route.elevation_gain_m}m elev</span>
                    <span>·</span>
                    <span>{difficulty}</span>
                    <span>·</span>
                    <span>{surface}</span>
                  </div>
                </div>
              </div>

              {/* Send button */}
              <button
                onClick={handleShare}
                className="w-full mt-5 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all hover:brightness-110"
                style={{
                  background: "linear-gradient(135deg, #25D366, #128C7E)",
                  color: "#fff",
                  boxShadow: "0 4px 20px rgba(37, 211, 102, 0.3)",
                }}
              >
                {WA_ICON}
                Send on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
