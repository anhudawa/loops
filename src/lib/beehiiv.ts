// ============================================================
// beehiiv.ts — newsletter + autoresponder (dormant until keys set)
// ============================================================
//
// "Get the Saturday Spin" opt-in at signup subscribes the rider to the
// Roadman Cycling newsletter on Beehiiv and, when BEEHIIV_AUTOMATION_ID is
// set, enrols them in that automation (the LOOPS welcome autoresponder).
// Fully dormant until BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID are set.
// Never throws — a newsletter sync must not break signup; failures are
// logged so a bad key shows up in the logs instead of vanishing.

const API = "https://api.beehiiv.com/v2";

export function isBeehiivEnabled(): boolean {
  return Boolean(process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID);
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.BEEHIIV_API_KEY}`, "Content-Type": "application/json" };
}

/** Automation(s) new LOOPS subscribers are enrolled in (comma-separated ids). */
function automationIds(): string[] {
  return (process.env.BEEHIIV_AUTOMATION_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function subscribeToNewsletter(
  email: string,
  opts?: { source?: string | null; medium?: string }
): Promise<{ ok: boolean; status?: number }> {
  if (!isBeehiivEnabled() || !email) return { ok: false };
  try {
    const publicationId = process.env.BEEHIIV_PUBLICATION_ID!;
    const automations = automationIds();
    const res = await fetch(`${API}/publications/${publicationId}/subscriptions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        email,
        reactivate_existing: false,
        send_welcome_email: true,
        utm_source: "loops",
        utm_medium: opts?.medium ?? "signup",
        referring_site: "loops.ie",
        ...(automations.length ? { automation_ids: automations } : {}),
        custom_fields: opts?.source
          ? [{ name: "loops_signup_source", value: opts.source }]
          : undefined,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[beehiiv] subscribe failed: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error("[beehiiv] subscribe failed:", e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

/** Admin: are the keys right? The publication's name, or the error. */
export async function beehiivStatus(): Promise<{ enabled: boolean; ok?: boolean; publication?: string; automations?: number; error?: string }> {
  if (!isBeehiivEnabled()) return { enabled: false, error: "BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID are not set in Vercel" };
  try {
    const res = await fetch(`${API}/publications/${process.env.BEEHIIV_PUBLICATION_ID}`, { headers: headers(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { enabled: true, ok: false, error: `Beehiiv answered HTTP ${res.status} — check the key and publication id` };
    const j = (await res.json()) as { data?: { name?: string } };
    return { enabled: true, ok: true, publication: j.data?.name, automations: automationIds().length };
  } catch (e) {
    return { enabled: true, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
