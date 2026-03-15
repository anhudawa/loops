"use client";

import { useState } from "react";

interface StravaConnectButtonProps {
  isConnected: boolean;
  returnTo?: string;
  onDisconnected?: () => void;
}

export default function StravaConnectButton({ isConnected, returnTo = "/upload", onDisconnected }: StravaConnectButtonProps) {
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/strava/connect", { method: "DELETE" });
      if (res.ok) {
        onDisconnected?.();
      }
    } catch {
      // Silently fail — user can try again
    } finally {
      setDisconnecting(false);
    }
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          ✓ Strava connected
        </span>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          style={{
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            opacity: disconnecting ? 0.5 : 1,
          }}
        >
          {disconnecting ? "Disconnecting..." : "Disconnect"}
        </button>
      </div>
    );
  }

  return (
    <a
      href={`/api/strava/connect?returnTo=${encodeURIComponent(returnTo)}`}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white transition-colors"
      style={{ background: "#FC4C02" }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
        <path d="M6.8 12.8L8.4 9.2H6L9.6 2H11.2L9.2 6.8H11.6L6.8 12.8Z" />
      </svg>
      Connect with Strava
    </a>
  );
}
