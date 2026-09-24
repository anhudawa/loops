// ============================================================
// web-push.ts — browser push (dormant until VAPID keys are set)
// ============================================================
//
// Like Beehiiv and Garmin, this ships switched off: set
// NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (+ VAPID_SUBJECT,
// e.g. mailto:hello@loops.ie) in Vercel and riders who allow notifications
// get the "Did you ride it?" check-in as a push. iPhone: only when LOOPS
// is added to the Home Screen (iOS 16.4+); email covers everyone else.

import webpush from "web-push";

export function isWebPushEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure(): void {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@loops.ie",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export interface PushMessage { title: string; body: string; url: string; tag?: string }

/** Send to one subscription. "gone" = the browser dropped it (delete it). */
export async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  msg: PushMessage,
): Promise<"sent" | "gone" | "failed"> {
  if (!isWebPushEnabled()) return "failed";
  configure();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(msg), { TTL: 24 * 3600 });
    return "sent";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : "failed";
  }
}
