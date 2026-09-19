// ============================================================
// beehiiv.ts — newsletter subscription (dormant until keys set)
// ============================================================
//
// "Get the Saturday Spin" opt-in at signup subscribes the rider to the
// Roadman Cycling newsletter on Beehiiv. Like the Garmin integration, this
// stays fully dormant until BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID are set,
// so the checkbox and opt-in capture ship now and the actual sync switches on
// the moment the keys land. Never throws — a newsletter sync must not break
// signup.

export function isBeehiivEnabled(): boolean {
  return Boolean(process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID);
}

export async function subscribeToNewsletter(
  email: string,
  opts?: { source?: string | null }
): Promise<void> {
  if (!isBeehiivEnabled() || !email) return;
  try {
    const publicationId = process.env.BEEHIIV_PUBLICATION_ID!;
    await fetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.BEEHIIV_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          reactivate_existing: false,
          send_welcome_email: true,
          utm_source: "loops",
          utm_medium: "signup",
          referring_site: "loops.ie",
          custom_fields: opts?.source
            ? [{ name: "loops_signup_source", value: opts.source }]
            : undefined,
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
  } catch {
    // Swallow — the rider is already signed up; newsletter is best-effort.
  }
}
