"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "loops-install-dismissed";

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(hone|od|ad)/.test(ua) && /WebKit/.test(ua) && !/(CriOS|FxiOS|OPiOS|EdgiOS)/.test(ua);
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

  // Check localStorage on mount
  useEffect(() => {
    if (isStandalone()) return; // already installed
    const wasDismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    if (wasDismissed) return;

    setDismissed(false);

    if (isIosSafari()) {
      setShowIosHint(true);
    }
  }, []);

  // Listen for beforeinstallprompt (Chrome/Edge/Samsung)
  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setDismissed(false);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    dismiss();
  }, [deferredPrompt]);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosHint(false);
  }

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
