"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "loops-install-dismissed";
/** Number of browsing sessions seen (localStorage), counted once per tab
 *  session via SESSION_KEY (sessionStorage). */
const VISITS_KEY = "loops-visit-count";
const SESSION_KEY = "loops-visit-counted";

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(hone|od|ad)/.test(ua) && /WebKit/.test(ua) && !/(CriOS|FxiOS|OPiOS|EdgiOS)/.test(ua);
}

/** WhatsApp / Instagram / Facebook / Line in-app browsers can't add to the
 *  home screen, so the hint would be a dead end there. */
function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|\bLine\//i.test(navigator.userAgent);
}

/** Count this browsing session once and return the total (0 if storage is
 *  unavailable — then we never nag). */
function countVisit(): number {
  try {
    let visits = parseInt(localStorage.getItem(VISITS_KEY) ?? "0", 10) || 0;
    if (sessionStorage.getItem(SESSION_KEY) !== "1") {
      visits += 1;
      localStorage.setItem(VISITS_KEY, String(visits));
      sessionStorage.setItem(SESSION_KEY, "1");
    }
    return visits;
  } catch {
    return 0;
  }
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return true;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone === true)
  );
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default true to avoid flash

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // storage blocked: hide for this page view anyway
    }
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosHint(false);
  }, []);

  useEffect(() => {
    const visits = countVisit();
    // Eligible only from a visitor's second session on, never when already
    // installed, never inside an in-app browser, never once dismissed, and
    // never on a shared ride/route link (they came for one ride).
    const eligible =
      visits >= 2 &&
      !isStandalone() &&
      !isInAppBrowser() &&
      !/^\/(ride|routes|share)\//.test(window.location.pathname) &&
      !wasDismissed();
    if (!eligible) return;

    // Listen for beforeinstallprompt (Chrome/Edge/Samsung)
    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setDismissed(false);
    }
    window.addEventListener("beforeinstallprompt", handler);

    // iOS has no install event: show the hint shortly after load.
    const iosTimer = isIosSafari()
      ? setTimeout(() => {
          setDismissed(false);
          setShowIosHint(true);
        }, 800)
      : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    dismiss();
  }, [deferredPrompt, dismiss]);

  const visible = !dismissed && (deferredPrompt || showIosHint);
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: "var(--bg, #0a0a0a)",
        borderTop: "1px solid var(--border, #333)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        fontFamily: "var(--font-outfit, sans-serif)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "14px",
          color: "var(--text-muted, #a0a0a0)",
          flex: 1,
          lineHeight: 1.4,
        }}
      >
        {showIosHint
          ? "Tap Share → Add to Home Screen for one-tap voice route planning"
          : "Add LOOPS to your home screen for one-tap voice route planning"}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            style={{
              backgroundColor: "var(--accent, #22c55e)",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Install
          </button>
        )}

        <button
          onClick={dismiss}
          aria-label="Dismiss install banner"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted, #a0a0a0)",
            fontSize: "20px",
            cursor: "pointer",
            padding: "4px",
            lineHeight: 1,
          }}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
