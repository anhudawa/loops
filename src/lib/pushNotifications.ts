"use client";

import { isNativeApp } from "./capacitor";

export async function initPushNotifications() {
  if (!isNativeApp()) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return;

  await PushNotifications.register();

  PushNotifications.addListener("registration", async (token) => {
    const { getPlatform } = await import("./capacitor");
    try {
      await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.value,
          platform: getPlatform(),
        }),
      });
    } catch {
      // Silently fail — will retry on next app open
    }
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.error("Push registration failed:", error);
  });

  PushNotifications.addListener("pushNotificationReceived", () => {
    // Foreground notification — could show an in-app toast
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    // User tapped the notification — navigate to relevant page
    const data = action.notification.data;
    if (data?.url) {
      window.location.href = data.url;
    }
  });
}
