"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

interface RideActionsProps {
  routeId: string;
  routeName: string;
}

interface RidePlan {
  id: string;
  status: "planned" | "completed" | "cancelled";
  planned_at: string;
  completed_at: string | null;
}

export default function RideActions({ routeId, routeName }: RideActionsProps) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [ridePlan, setRidePlan] = useState<RidePlan | null>(null);
  const [ridePlanLoading, setRidePlanLoading] = useState(false);
  const [ridePlanError, setRidePlanError] = useState("");
  const [betaAccess, setBetaAccess] = useState<boolean | null>(null);
  const [contributorAccess, setContributorAccess] = useState(false);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const gpxUrl = `/api/routes/${routeId}/gpx`;

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

  useEffect(() => {
    if (!user) {
      setRidePlan(null);
      setBetaAccess(null);
      setContributorAccess(false);
      return;
    }
    let cancelled = false;
    async function loadAccessAndPlan() {
      try {
        const accessResponse = await fetch("/api/beta/application");
        if (!accessResponse.ok) throw new Error("Could not load beta access");
        const access = await accessResponse.json();
        if (cancelled) return;
        setBetaAccess(access.access === true);
        setContributorAccess(access.contributorAccess === true);
        if (access.access !== true) return;

        const planResponse = await fetch(`/api/routes/${routeId}/ride-plan`);
        if (!planResponse.ok) throw new Error("Could not load ride plan");
        const body = await planResponse.json();
        if (!cancelled) setRidePlan(body.plan ?? null);
      } catch {
        if (!cancelled) setRidePlanError("Ride planning is temporarily unavailable.");
      }
    }
    loadAccessAndPlan();
    return () => {
      cancelled = true;
    };
  }, [routeId, user]);

  const updateRidePlan = async (action: "plan" | "complete" | "cancel") => {
    if (ridePlanLoading) return;
    setRidePlanLoading(true);
    setRidePlanError("");
    try {
      const response = await fetch(`/api/routes/${routeId}/ride-plan`, {
        method: action === "cancel" ? "DELETE" : "POST",
        headers: action === "cancel" ? undefined : { "Content-Type": "application/json" },
        body: action === "cancel" ? undefined : JSON.stringify({
          action,
          confirm_exact_route: action === "complete" ? true : undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Ride plan update failed");
      setRidePlan(action === "cancel" ? null : body.plan);
    } catch (error) {
      setRidePlanError(error instanceof Error ? error.message : "Ride plan update failed");
    } finally {
      setRidePlanLoading(false);
    }
  };

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
      {user && betaAccess === true ? (
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
      ) : user && betaAccess === null ? (
        <div className="w-full flex items-center justify-center px-6 py-3.5 rounded-xl text-sm font-bold" style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
          Checking beta access…
        </div>
      ) : user ? (
        <Link
          href="/beta"
          className="btn-accent w-full flex items-center justify-center px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider"
        >
          Apply to download and plan
        </Link>
      ) : (
        <Link
          href={`/login?redirect=/routes/${routeId}`}
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
          Sign in to apply
        </Link>
      )}

      {/* Secondary actions */}
      <div className={`grid ${user && betaAccess === true ? "grid-cols-3" : "grid-cols-1"} gap-2`}>
        {user && betaAccess === true && (
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

      {user && betaAccess === true && (
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {ridePlan?.status === "planned" ? (
            <>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Ride planned</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Planned {new Date(ridePlan.planned_at).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--accent)" }}>
                  Exact route version saved
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateRidePlan("complete")}
                  disabled={ridePlanLoading}
                  className="min-h-[44px] rounded-lg px-3 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  I rode this exact loop
                </button>
                <button
                  type="button"
                  onClick={() => updateRidePlan("cancel")}
                  disabled={ridePlanLoading}
                  className="min-h-[44px] rounded-lg px-3 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                  style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  Cancel plan
                </button>
              </div>
            </>
          ) : ridePlan?.status === "completed" ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--success)" }}>Ride confirmed</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  You confirmed this exact loop
                  {ridePlan.completed_at
                    ? ` on ${new Date(ridePlan.completed_at).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}`
                    : ""}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateRidePlan("plan")}
                disabled={ridePlanLoading}
                className="min-h-[44px] rounded-lg px-4 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                style={{ background: "transparent", color: "var(--accent)", border: "1px solid rgba(200,255,0,0.3)" }}
              >
                Plan it again
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => updateRidePlan("plan")}
              disabled={ridePlanLoading}
              className="w-full min-h-[44px] rounded-lg px-4 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
              style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid rgba(200,255,0,0.3)" }}
            >
              Plan this ride
            </button>
          )}
          {ridePlanError && (
            <p className="text-xs mt-2" role="alert" style={{ color: "var(--danger)" }}>{ridePlanError}</p>
          )}
        </div>
      )}

      {/* Good looper nudge — only for approved contributors. */}
      {user && contributorAccess && (
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
