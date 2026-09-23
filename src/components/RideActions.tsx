"use client";

import { useState, useRef, useEffect } from "react";
import { GPX_ACCESS } from "@/config/constants";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";


/** Current page (path + query) as a login redirect target — keeps a ride
 *  invite's day/time/meeting point through sign-in. */
function loginHref(opts: { gpx?: boolean } = {}): string {
  if (typeof window === "undefined") return "/login";
  let search = window.location.search;
  if (opts.gpx) {
    // Ask for the GPX on return: RideActions downloads it once when a
    // signed-in rider lands with gpx=1. t & m stay untouched.
    const q = new URLSearchParams(search);
    q.set("gpx", "1");
    search = `?${q.toString()}`;
  }
  return `/login?redirect=${encodeURIComponent(window.location.pathname + search)}`;
}

/** Read one query param on the client (null during SSR / on error). */
function queryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

interface RideActionsProps {
  /** Rendered on a group-ride link (/ride/<id>). */
  rideLink?: boolean;
  routeId: string;
  routeName: string;
}

export default function RideActions({ routeId, routeName, rideLink = false }: RideActionsProps) {
  const { user } = useAuth();
  // GPX_ACCESS (owner switch): who may download without signing in.
  const openAccess = GPX_ACCESS === "everyone" || (GPX_ACCESS === "ride-links" && rideLink);
  const canDownload = !!user || openAccess;
  const [copied, setCopied] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  // On a ride link the meeting point (?m=) names the GPX start waypoint.
  const [meet] = useState(() => (rideLink ? queryParam("m") : null));
  const gpxUrl = `/api/routes/${routeId}/gpx${rideLink ? `?via=ride${meet ? `&m=${encodeURIComponent(meet)}` : ""}` : ""}`;

  // Back from "Sign up to download GPX" (redirect carried gpx=1): download
  // once for the now signed-in rider, then drop gpx=1 from the URL so a
  // reload or re-share doesn't repeat it.
  const autoDownloaded = useRef(false);
  useEffect(() => {
    if (!user || autoDownloaded.current || queryParam("gpx") !== "1") return;
    autoDownloaded.current = true;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("gpx");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      // URL cleanup is cosmetic
    }
    downloadRef.current?.click();
  }, [user]);

  // Detect Web Share API file sharing support (mobile)
  useEffect(() => {
    try {
      if (typeof navigator.canShare === "function" && typeof navigator.share === "function") {
        const testFile = new File(["test"], "test.gpx", { type: "application/gpx+xml" });
        setCanShareFiles(navigator.canShare({ files: [testFile] }));
      }
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  const triggerDownload = () => {
    downloadRef.current?.click();
  };

  const shareGpxToApp = async () => {
    try {
      const res = await fetch(gpxUrl);
      const blob = await res.blob();
      const file = new File([blob], `${routeName}.gpx`, { type: "application/gpx+xml" });
      await navigator.share({ files: [file], title: `${routeName} - GPX Route` });
    } catch {
      // User cancelled share or error — fall back to download
      triggerDownload();
    }
  };

  const openStrava = () => {
    if (canShareFiles) {
      shareGpxToApp();
    } else {
      triggerDownload();
      window.open("https://www.strava.com/upload/select", "_blank");
    }
  };

  const openKomoot = () => {
    if (canShareFiles) {
      shareGpxToApp();
    } else {
      triggerDownload();
      window.open("https://www.komoot.com/plan", "_blank");
    }
  };

  const copyLink = async () => {
    // Use native share sheet in Capacitor app
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import("@capacitor/share");
        await Share.share({
          title: routeName,
          text: `Check out this route: ${routeName}`,
          url: window.location.href,
        });
        return;
      }
    } catch {
      // Fall through to clipboard copy
    }
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2.5">
      {/* Hidden download link */}
      <a ref={downloadRef} href={gpxUrl} download={`${routeName}.gpx`} className="hidden" />

      {/* Primary: Download GPX (or sign-up CTA for non-users) */}
      {canDownload ? (
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
      ) : (
        <Link
          href={loginHref({ gpx: true })}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:brightness-110"
          style={{
            background: "linear-gradient(135deg, var(--accent), #7acc00)",
            color: "var(--bg)",
            boxShadow: "0 4px 20px rgba(200, 255, 0, 0.2)",
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Sign Up to Download GPX
        </Link>
      )}

      {!user && canDownload && (
        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          Want to save it or plan your own loops?{" "}
          <Link href={loginHref()} className="font-bold underline" style={{ color: "var(--accent)" }}>Join LOOPS free</Link>
        </p>
      )}

      {/* Secondary actions */}
      <div className={`grid ${user ? "grid-cols-3" : "grid-cols-1"} gap-2`}>
        {user && (
          <>
            <button
              onClick={openStrava}
              className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-bold transition-all hover:border-[rgba(200,255,0,0.3)]"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--strava)" }}>
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              {canShareFiles ? "Open in Strava" : "Strava"}
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
              {canShareFiles ? "Open in Komoot" : "Komoot"}
            </button>
          </>
        )}

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

      {/* Good looper nudge — only for logged-in users */}
      {user && (
        <p className="text-xs text-center pt-2" style={{ color: "var(--text-muted)" }}>
          Be a good looper — if you download a route,{" "}
          <Link href="/upload" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>
            upload a route you love
          </Link>
        </p>
      )}
    </div>
  );
}
