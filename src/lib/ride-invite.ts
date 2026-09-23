/**
 * Group-ride invites: the day, time and meeting point travel WITH the link
 * (/ride/<routeId>?t=2026-09-26T09:00&m=Clontarf%20Rd), so the WhatsApp
 * preview and the page say "Sat 26 Sep · 9:00 · Meet: Clontarf Rd".
 *
 * `t` is a wall-clock local time with no zone: it is what the organiser
 * typed, and it is shown back exactly as typed — never converted — so a
 * 9:00 ride reads 9:00 for everyone in the group, whatever their device or
 * the server's timezone.
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-26T09:00" → { y, mo, d, h, mi } or null when malformed. */
export function parseRideTime(t: string | null | undefined): { y: number; mo: number; d: number; h: number; mi: number } | null {
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1) return null; // 31 Feb etc.
  return { y, mo, d, h, mi };
}

/** "Sat 26 Sep · 9:00" (24-hour, as cyclists write it), or null. */
export function formatRideWhen(t: string | null | undefined): string | null {
  const p = parseRideTime(t);
  if (!p) return null;
  const dow = DAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()];
  return `${dow} ${p.d} ${MONTHS[p.mo - 1]} · ${p.h}:${String(p.mi).padStart(2, "0")}`;
}

/** Meeting point: trimmed, single line, capped. */
export function cleanMeet(m: string | null | undefined): string | null {
  if (!m) return null;
  const s = m.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return s || null;
}

/** Build the ride link for a route. */
export function rideUrl(origin: string, routeId: string, t: string | null, meet: string | null): string {
  const q = new URLSearchParams();
  if (parseRideTime(t)) q.set("t", t!.trim());
  const m = cleanMeet(meet);
  if (m) q.set("m", m);
  const qs = q.toString();
  return `${origin}/ride/${routeId}${qs ? `?${qs}` : ""}`;
}
