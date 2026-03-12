"use client";

import { useState, useRef } from "react";

interface RideActionsProps {
  routeId: string;
  routeName: string;
}

export default function RideActions({ routeId, routeName }: RideActionsProps) {
  const [copied, setCopied] = useState(false);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const gpxUrl = `/api/routes/${routeId}/gpx`;

  const triggerDownload = () => {
    downloadRef.current?.click();
  };

  const openStrava = () => {
    triggerDownload();
    window.open("https://www.strava.com/upload/select", "_blank");
  };

  const openKomoot = () => {
    triggerDownload();
    window.open("https://www.komoot.com/plan", "_blank");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2.5">
      {/* Hidden download link */}
      <a ref={downloadRef} href={gpxUrl} download={`${routeName}.gpx`} className="hidden" />

      {/* Primary: Download GPX */}
      <a
        href={gpxUrl}
        download={`${routeName}.gpx`}
        className="btn-accent w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download GPX File
      </a>

      {/* Secondary actions */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={openStrava}
          className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-bold transition-all hover:border-[rgba(200,255,0,0.3)]"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FC4C02" }}>
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Strava
        </button>

        <button
          onClick={openKomoot}
          className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-bold transition-all hover:border-[rgba(200,255,0,0.3)]"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#6AA127" }}>
            <circle cx="12" cy="12" r="10" />
            <polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5" fill="currentColor" stroke="none" />
          </svg>
          Komoot
        </button>

        <button
          onClick={copyLink}
          className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-bold transition-all hover:border-[rgba(200,255,0,0.3)]"
          style={{
            background: copied ? "var(--accent-glow)" : "var(--bg-card)",
            border: copied ? "1px solid var(--accent)" : "1px solid var(--border)",
            color: copied ? "var(--accent)" : "var(--text-secondary)",
          }}
        >
          {copied ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          )}
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}
