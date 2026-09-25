"use client";

import { useState, useEffect, useRef, useId } from "react";
import { estimateRideMinutes, formatRideTime } from "@/lib/ride-time";
import { createPortal } from "react-dom";
import { formatRideWhen, cleanMeet, rideUrl, parseRideTime } from "@/lib/ride-invite";

interface ShareRideProps {
  route: {
    id: string;
    name: string;
    distance_km: number;
    elevation_gain_m: number;
    surface_type: string;
    county: string;
    country?: string;
    region?: string | null;
  };
  /** Opened from a group-ride link: start from that ride, not "tomorrow". */
  ride?: { t?: string | null; meet?: string | null } | null;
}

function getDefaultTime(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const d = String(tomorrow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T09:00`;
}

/**
 * The time to start the sheet from when forwarding a ride: the ride's own
 * time, or — when that day has been — the same weekday and time next time
 * round (last Saturday's 9:00 spin becomes this Saturday's).
 */
function forwardTime(t: string | null | undefined): string | null {
  const p = parseRideTime(t);
  if (!p) return null;
  const at = new Date(p.y, p.mo - 1, p.d, p.h, p.mi);
  const dayOver = new Date(p.y, p.mo - 1, p.d + 1).getTime() <= Date.now();
  if (!dayOver) return t!.trim();
  while (at.getTime() <= Date.now()) at.setDate(at.getDate() + 7);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(p.h)}:${pad(p.mi)}`;
}

const IG_ICON = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const WA_ICON = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export default function ShareRide({ route, ride }: ShareRideProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [startTime, setStartTime] = useState(() => forwardTime(ride?.t) ?? getDefaultTime());
  const [meetingPoint, setMeetingPoint] = useState(ride?.meet ?? "");
  const forwarding = !!(ride && (ride.t || ride.meet));
  const meetId = useId();
  const timeId = useId();

  const surface = route.surface_type.charAt(0).toUpperCase() + route.surface_type.slice(1);

  const when = formatRideWhen(startTime);

  // The sheet owns a history entry, so the phone's back button / gesture
  // closes it instead of leaving the page.
  const pushedEntry = useRef(false);
  const openSheet = () => {
    setOpen(true);
    try {
      window.history.pushState({ ...(window.history.state ?? {}), loopsSheet: 1 }, "");
      pushedEntry.current = true;
    } catch {
      pushedEntry.current = false;
    }
  };
  const closeSheet = () => {
    if (pushedEntry.current) {
      pushedEntry.current = false;
      window.history.back(); // popstate below closes the sheet
    }
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const onPop = () => {
      pushedEntry.current = false;
      setOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  // Esc closes the sheet; Tab stays inside it (a modal must not let focus
  // wander to the page behind).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeSheet(); return; }
      if (e.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>('[aria-labelledby="share-ride-title"]');
      if (!dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input, a[href], [tabindex]:not([tabindex='-1'])"));
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  // Always the public site, even inside the mobile app (whose origin is
  // not a shareable URL).
  const origin =
    typeof window !== "undefined" && /^https:\/\/(www\.)?loops\.ie$/.test(window.location.origin)
      ? window.location.origin
      : "https://www.loops.ie";
  // One message, used for both the preview and what is sent.
  const message = [
    `🚴 *${route.name}*`,
    `🕐 ${when ?? "Pick a day and time"}`,
    `📍 ${cleanMeet(meetingPoint) ?? "Meeting point TBC"}`,
    `📊 ${route.distance_km} km · ${route.elevation_gain_m} m climbing · ${surface} · ${formatRideTime(estimateRideMinutes({ distance_km: Number(route.distance_km), elevation_gain_m: Number(route.elevation_gain_m), discipline: "road" }), { style: "card" })} riding`,
    "",
    rideUrl(origin, route.id, startTime, meetingPoint), // last line → WhatsApp shows the ride preview card
  ].join("\n");

  const handleShare = () => {
    if (!when) return; // guarded in the UI too — never send "Invalid Date"
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
    closeSheet();
  };

  // Not everyone is on WhatsApp: the phone's own share sheet (iMessage,
  // Telegram, Signal…) or a plain copy of the same message.
  const copyMessage = async () => {
    if (!when) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this message:", message);
    }
  };
  // The ride link on its own (the Instagram story's Link sticker, a bio, a DM).
  const [linkCopied, setLinkCopied] = useState(false);
  const copyLink = async () => {
    if (!when) return;
    const link = rideUrl(origin, route.id, startTime, meetingPoint);
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      window.prompt("Copy the ride link:", link);
    }
  };

  // ── Instagram story: a 1080×1920 card ("Are you riding or are you
  // hiding?") shared as an image; the ride link is copied for the story's
  // Link sticker (Instagram lets only the rider add links). The image is
  // fetched ahead: iOS Safari refuses share() once a tap has waited on the
  // network.
  const storyUrl = (() => {
    const q = new URLSearchParams({ t: startTime });
    const m = cleanMeet(meetingPoint);
    if (m) q.set("m", m);
    return `/api/og/${route.id}/story?${q.toString()}`;
  })();
  const storyFile = useRef<{ url: string; file: File } | null>(null);
  const [storyNote, setStoryNote] = useState<string | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);
  useEffect(() => {
    if (!open || !when) return;
    let gone = false;
    const t = setTimeout(() => {
      fetch(storyUrl)
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => { if (b && !gone) storyFile.current = { url: storyUrl, file: new File([b], "loops-ride-story.png", { type: "image/png" }) }; })
        .catch(() => {});
    }, 400);
    return () => { gone = true; clearTimeout(t); };
  }, [open, when, storyUrl]);

  const shareStory = async () => {
    if (!when) return;
    const link = rideUrl(origin, route.id, startTime, meetingPoint);
    navigator.clipboard?.writeText(link).catch(() => {});
    setStoryBusy(true);
    try {
      let file = storyFile.current?.url === storyUrl ? storyFile.current.file : null;
      if (!file) {
        const b = await fetch(storyUrl).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
        if (!b) { setStoryNote("Couldn't make the story image — try again in a moment."); return; }
        file = new File([b], "loops-ride-story.png", { type: "image/png" });
      }
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          setStoryNote("Ride link copied — in Instagram, add the Link sticker and paste it. (Copy it again below if needed.)");
          return;
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return;
          /* share refused — save the image instead */
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setStoryNote("Story image saved and ride link copied — post the image to your Instagram Story and paste the link into a Link sticker.");
    } finally {
      setStoryBusy(false);
    }
  };

  const nativeShare = async () => {
    if (!when) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message });
        closeSheet();
        return;
      } catch (e) {
        // The rider closed the share sheet: nothing more to do.
        if ((e as Error)?.name === "AbortError") return;
        /* share failed — fall through to copy */
      }
    }
    await copyMessage();
  };

  const inputStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <>
      {/* Full-width trigger button */}
      <button
        onClick={openSheet}
        className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:brightness-110"
        style={{
          background: "linear-gradient(135deg, #25D366, #128C7E)",
          color: "#0a0a0a",
          boxShadow: "0 4px 20px rgba(37, 211, 102, 0.25)",
        }}
      >
        {WA_ICON}
        {forwarding ? "Forward this ride" : "Invite a Friend to Ride"}
      </button>

      {/* Modal */}
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeSheet}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-ride-title"
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl mx-0 sm:mx-4 max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with gradient */}
            <div className="px-6 pt-5 pb-4" style={{ background: "linear-gradient(135deg, rgba(37, 211, 102, 0.12), rgba(18, 140, 126, 0.08))" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#25D366" }}>
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                  <div>
                    <h3 id="share-ride-title" className="text-lg font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{forwarding ? "Forward this ride" : "Invite to Ride"}</h3>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{route.name} · {route.region || route.county}</p>
                  </div>
                </div>
                <button onClick={closeSheet} aria-label="Close" autoFocus className="hover:opacity-70 min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              {/* Fields */}
              <div className="space-y-4">
                <div>
                  <label htmlFor={meetId} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                    <span aria-hidden="true">📍</span> Meeting point
                  </label>
                  {/* No autofocus: on a phone it opens the keyboard over the sheet. */}
                  <input
                    id={meetId}
                    type="text"
                    value={meetingPoint}
                    onChange={(e) => setMeetingPoint(e.target.value)}
                    placeholder="e.g. the café by the start"
                    className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                    style={{ ...inputStyle, transition: "border-color 0.15s" }}
                  />
                </div>

                <div>
                  <label htmlFor={timeId} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                    <span aria-hidden="true">🕐</span> Start time
                    {/* The picker shows the phone's own date format (09/25/2026 on a
                        US-set phone): say the day the way the message will. */}
                    {when && <span className="normal-case tracking-normal font-bold" style={{ color: "var(--text-secondary)" }} data-testid="invite-when">· {when}</span>}
                  </label>
                  <input
                    id={timeId}
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                    style={{ ...inputStyle, colorScheme: "dark" }}
                  />
                </div>
              </div>

              {/* Message preview */}
              <div className="mt-5 rounded-xl p-4" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                <p className="text-[10px] uppercase tracking-wider font-bold mb-2.5" style={{ color: "var(--text-muted)" }}>Message preview</p>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: "var(--text-secondary)" }}>
                  {message.replace(/\*/g, "")}
                </p>
              </div>

              {/* Send button */}
              {!when && (
                <p className="text-xs mt-3" style={{ color: "#f5a524" }}>Pick a day and start time first.</p>
              )}
              <button
                onClick={handleShare}
                disabled={!when}
                className="w-full mt-5 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
                style={{
                  background: "linear-gradient(135deg, #25D366, #128C7E)",
                  color: "#0a0a0a",
                  boxShadow: "0 4px 20px rgba(37, 211, 102, 0.3)",
                }}
              >
                {WA_ICON}
                Send on WhatsApp
              </button>
              <button
                onClick={shareStory}
                disabled={!when || storyBusy}
                className="w-full mt-2 min-h-[48px] rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #c13584, #833ab4)", color: "#ffffff" }}
                data-testid="share-story"
              >
                {IG_ICON}
                {storyBusy ? "Making your story…" : "Share to Instagram Story"}
              </button>
              {storyNote && (
                <p className="text-xs mt-2 text-center" style={{ color: "var(--text-secondary)" }} role="status">{storyNote}</p>
              )}
              {/* The ride link, visible and one tap to copy — for the story's
                  Link sticker (or anywhere else). */}
              <button
                onClick={copyLink}
                disabled={!when}
                className="w-full mt-2 min-h-[48px] px-3 rounded-xl flex items-center gap-2 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: linkCopied ? "var(--accent-glow)" : "var(--bg)",
                  border: linkCopied ? "1px solid var(--accent)" : "1px solid var(--border)",
                }}
                aria-label="Copy ride link"
                data-testid="copy-ride-link"
              >
                <span className="flex-1 min-w-0 truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                  {rideUrl(origin, route.id, startTime, meetingPoint).replace(/^https:\/\//, "")}
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                  {linkCopied ? "Copied ✓" : "Copy ride link"}
                </span>
              </button>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={nativeShare}
                  disabled={!when}
                  className="min-h-[44px] rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  Share another way…
                </button>
                <button
                  onClick={copyMessage}
                  disabled={!when}
                  className="min-h-[44px] rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: copied ? "var(--accent-glow)" : "var(--bg)",
                    border: copied ? "1px solid var(--accent)" : "1px solid var(--border)",
                    color: copied ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  {copied ? "Copied!" : "Copy message"}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
