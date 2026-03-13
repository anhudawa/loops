"use client";

import { useEffect, useState, ReactNode } from "react";

export function CapacitorProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function init() {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      // Status bar
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
      } catch {
        // Not available on web
      }

      // Network monitoring
      try {
        const { Network } = await import("@capacitor/network");
        const status = await Network.getStatus();
        setOffline(!status.connected);

        const handle = await Network.addListener("networkStatusChange", (s) => {
          setOffline(!s.connected);
        });
        cleanup = () => handle.remove();
      } catch {
        // Not available
      }

      // Deep link handling
      try {
        const { App } = await import("@capacitor/app");
        App.addListener("appUrlOpen", ({ url }) => {
          if (url.includes("/api/auth/google/callback") || url.includes("/routes/")) {
            // Extract the path and navigate within the webview
            const urlObj = new URL(url);
            window.location.href = urlObj.pathname + urlObj.search;
          }
        });
      } catch {
        // Not available
      }

      // Push notifications
      try {
        const { initPushNotifications } = await import("@/lib/pushNotifications");
        await initPushNotifications();
      } catch {
        // Not available or permission denied
      }
    }

    init();
    return () => cleanup?.();
  }, []);

  return (
    <>
      {offline && (
        <div
          className="fixed top-0 left-0 right-0 z-[9999] text-center py-2 text-xs font-bold"
          style={{
            background: "var(--danger)",
            color: "#fff",
            paddingTop: "calc(var(--sat, 0px) + 8px)",
          }}
        >
          You&apos;re offline — some features may not work
        </div>
      )}
      {children}
    </>
  );
}
