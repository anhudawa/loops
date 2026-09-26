"use client";

import { useCallback, useEffect, useState } from "react";

interface TrafficReport {
  days: number;
  since: string | null;
  totals: { visitors: number; views: number; signups: number; rideVisitors: number; signedInVisitors: number };
  previous: { visitors: number; views: number; signups: number };
  today: { visitors: number; views: number };
  liveNow: number;
  daily: { day: string; visitors: number; views: number; signups: number }[];
  pages: { path: string; name: string | null; views: number; visitors: number }[];
  sources: { source: string; visitors: number }[];
  places: { country: string; city: string | null; visitors: number }[];
  devices: { device: string; visitors: number }[];
}

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const fmt = (n: number) => n.toLocaleString("en-IE");
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const countryName = (() => {
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(["en-IE"], { type: "region" }); } catch { /* old browser */ }
  return (code: string) => (code === "??" ? "Unknown" : names?.of(code) ?? code);
})();
const dayLabel = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};
const pageLabel = (p: { path: string; name: string | null }) => {
  if (p.name) return p.path.startsWith("/ride/") ? `Ride link · ${p.name}` : p.name;
  if (p.path === "/") return "Home";
  return p.path;
};

/**
 * /admin → Traffic: how many people visit, where they come from and what
 * they open. First-party, cookie-free counts (src/lib/traffic.ts).
 */
export default function TrafficPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<TrafficReport | null>(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const load = useCallback(async (d: number) => {
    setError(false);
    try {
      const res = await fetch(`/api/admin/traffic?days=${d}`, { cache: "no-store" });
      const b = await res.json();
      if (!res.ok || !b?.data) throw new Error();
      setData(b.data);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => { void load(days); }, [days, load]);
  // Keep "on the site now" fresh while the page is open.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(days); }, 60_000);
    return () => clearInterval(t);
  }, [days, load]);

  const card = { background: "var(--bg-card)", border: "1px solid var(--border)" };
  const inset = { background: "var(--bg)", border: "1px solid var(--border)" };
  const rangeWord = days === 1 ? "today" : `last ${days} days`;
  const prevWord = days === 1 ? "yesterday" : `previous ${days} days`;

  const tiles = data ? [
    { label: "Visitors", help: `people, ${rangeWord}`, value: data.totals.visitors, prev: data.previous.visitors },
    { label: "Page views", help: `pages opened, ${rangeWord}`, value: data.totals.views, prev: data.previous.views },
    {
      label: "Sign-ups", value: data.totals.signups, prev: data.previous.signups,
      help: data.totals.visitors ? `${Math.round((data.totals.signups / data.totals.visitors) * 1000) / 10}% of visitors` : "new accounts",
    },
    { label: "Opened a ride link", help: "people, from shared rides", value: data.totals.rideVisitors, prev: null as number | null },
  ] : [];

  const maxDay = data ? Math.max(1, ...data.daily.map((d) => d.visitors)) : 1;
  const showChart = data && data.daily.length > 1;
  const hovered = data && hover !== null ? data.daily[hover] : null;

  const list = (title: string, rows: { key: string; label: string; sub?: string; value: number }[], unit = "people") => {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return (
      <div className="rounded-lg p-3 min-w-0" style={inset}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text)" }}>{title}</p>
        {rows.length === 0 ? (
          <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>Nothing yet.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.key} className="relative rounded px-2 py-1.5 overflow-hidden">
                <span aria-hidden="true" className="absolute inset-y-0 left-0 rounded" style={{ width: `${(r.value / max) * 100}%`, background: "var(--accent-glow)" }} />
                <span className="relative flex items-baseline justify-between gap-3 text-xs min-w-0">
                  <span className="min-w-0 truncate" style={{ color: "var(--text)" }} title={r.sub ?? r.label}>
                    {r.label}{r.sub && <span style={{ color: "var(--text-muted)" }}> · {r.sub}</span>}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums" style={{ color: "var(--text)" }} title={`${fmt(r.value)} ${unit}`}>{fmt(r.value)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-xl p-4 md:p-5 mb-6" style={card} aria-labelledby="traffic-title" data-testid="admin-traffic">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 id="traffic-title" className="text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--text)" }}>Traffic</h2>
          {data && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1" style={inset} title="Different people with a page open in the last 30 minutes">
              <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: data.liveNow ? "var(--accent)" : "var(--text-muted)" }} />
              {fmt(data.liveNow)} on the site now
            </span>
          )}
        </div>
        <div className="flex rounded-lg p-0.5" style={inset} role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => { setDays(r.days); setHover(null); }}
              aria-pressed={days === r.days}
              className="px-3 min-h-[36px] rounded-md text-xs font-bold"
              style={days === r.days ? { background: "var(--accent)", color: "#0a0a0a" } : { color: "var(--text-secondary)" }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && !data && <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>Traffic unavailable — the database could not be reached.</p>}
      {!data && !error && <div className="h-40 mt-4 rounded-lg animate-pulse" style={inset} aria-label="Loading traffic" />}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {tiles.map((t) => {
              const change = t.prev === null ? null : pct(t.value, t.prev);
              return (
                <div key={t.label} className="rounded-lg p-3" style={inset}>
                  <p className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--text)" }}>{fmt(t.value)}</p>
                  <p className="text-[11px] font-bold" style={{ color: "var(--text)" }}>{t.label}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{t.help}</p>
                  {t.prev !== null && (
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                      {fmt(t.prev)} {prevWord}
                      {change !== null && (
                        <span className="ml-1 font-bold" style={{ color: change >= 0 ? "var(--success)" : "var(--danger)" }}>
                          {change >= 0 ? "▲ +" : "▼ "}{change}%
                        </span>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {showChart && (
            <div className="rounded-lg p-3 mt-3" style={inset}>
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text)" }}>Visitors per day</p>
                <p className="text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }} aria-live="polite">
                  {hovered
                    ? <>{dayLabel(hovered.day)} · <strong style={{ color: "var(--text)" }}>{fmt(hovered.visitors)}</strong> visitors · {fmt(hovered.views)} views{hovered.signups ? ` · ${hovered.signups} sign-up${hovered.signups === 1 ? "" : "s"}` : ""}</>
                    : <>Today so far: <strong style={{ color: "var(--text)" }}>{fmt(data.today.visitors)}</strong> visitors · {fmt(data.today.views)} views</>}
                </p>
              </div>
              <div className="relative h-40 pl-8" onMouseLeave={() => setHover(null)}>
                {/* Recessive guides: the peak and half of it, labelled in the gutter */}
                {[1, 0.5].map((f) => (
                  <div key={f} className="absolute left-8 right-0 border-t border-dashed" style={{ bottom: `${f * 100}%`, borderColor: "var(--border)" }}>
                    <span className="absolute -left-8 w-7 -top-2 text-right text-[10px] tabular-nums leading-none" style={{ color: "var(--text-muted)" }}>{fmt(Math.round(maxDay * f))}</span>
                  </div>
                ))}
                <div className="absolute inset-0 left-8 flex items-end" style={{ gap: data.daily.length > 45 ? "1px" : "2px" }}>
                  {data.daily.map((d, i) => (
                    <button
                      key={d.day}
                      type="button"
                      className="flex-1 h-full flex items-end focus:outline-none"
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      aria-label={`${dayLabel(d.day)}: ${d.visitors} visitors, ${d.views} page views, ${d.signups} sign-ups`}
                    >
                      <span
                        className="block w-full"
                        style={{
                          height: d.visitors ? `${Math.max(2, (d.visitors / maxDay) * 100)}%` : "0",
                          background: "var(--accent)",
                          opacity: hover === null || hover === i ? 1 : 0.45,
                          borderRadius: "4px 4px 0 0",
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between mt-1 pl-8 text-[10px]" style={{ color: "var(--text-muted)" }}>
                <span>{dayLabel(data.daily[0].day)}</span>
                <span>{dayLabel(data.daily[data.daily.length - 1].day)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 min-w-0">
            {list("Top pages", data.pages.slice(0, 12).map((p) => ({ key: p.path, label: pageLabel(p), sub: `${fmt(p.views)} views`, value: p.visitors })))}
            <div className="grid grid-cols-1 gap-3 min-w-0">
              {list("Where visits come from", data.sources.map((s) => ({ key: s.source, label: s.source === "direct" ? "Direct / typed / app" : s.source, value: s.visitors })))}
              {list("Devices", data.devices.map((d) => ({ key: d.device, label: d.device[0].toUpperCase() + d.device.slice(1), value: d.visitors })))}
            </div>
            {list("Where visitors are", data.places.map((p) => ({ key: `${p.country}|${p.city}`, label: p.city ? `${p.city}, ${countryName(p.country)}` : countryName(p.country), value: p.visitors })))}
          </div>

          <p className="text-[10px] mt-3" style={{ color: "var(--text-muted)" }}>
            People are counted without cookies: a code made from the connection and browser, which changes every month and never stores the IP address.
            Bots, link previews and your own (admin) devices are left out. {fmt(data.totals.signedInVisitors)} riders browsed while signed in, {rangeWord}.
            {data.since ? ` Counting since ${new Date(data.since).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}.` : " Counting starts with the next visit."}
          </p>
        </>
      )}
    </section>
  );
}
