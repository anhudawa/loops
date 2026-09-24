/**
 * Browser push, client side. Offered only when the server has VAPID keys
 * (NEXT_PUBLIC_VAPID_PUBLIC_KEY) and the browser can do it — on iPhone that
 * means LOOPS was added to the Home Screen (iOS 16.4+).
 */
export function canOfferPush(): boolean {
  if (typeof window === "undefined") return false;
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  return Notification.permission !== "denied" && Notification.permission !== "granted";
}

function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe, send the subscription to the server. */
export async function enablePush(): Promise<boolean> {
  try {
    if (!canOfferPush() && Notification.permission !== "granted") return false;
    if ((await Notification.requestPermission()) !== "granted") return false;
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
    });
    const r = await fetch("/api/push/web", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    return r.ok;
  } catch {
    return false;
  }
}
