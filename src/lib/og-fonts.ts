/**
 * Inter for OG images. next/og ships only Noto Sans *regular*, so every
 * fontWeight rendered regular. Satori needs ttf/otf/woff (not woff2), so we
 * fetch @fontsource's .woff files from jsdelivr once per server instance.
 *
 * Fail-soft: if a required weight can't be fetched, return undefined and the
 * caller renders with next/og's default font (and we retry after a minute).
 */

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" };

const BASE = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.3.0/files";
const REQUIRED: Array<{ weight: OgFont["weight"]; subset: string }> = [
  { weight: 400, subset: "latin" },
  { weight: 700, subset: "latin" },
  { weight: 800, subset: "latin" },
];
// Extra glyphs (Ł, ő, ș …) for names outside Latin-1; nice to have.
const OPTIONAL: Array<{ weight: OgFont["weight"]; subset: string }> = [
  { weight: 400, subset: "latin-ext" },
  { weight: 800, subset: "latin-ext" },
];

const RETRY_MS = 60_000;
let cached: Promise<OgFont[] | undefined> | null = null;
let failedAt = 0;

async function fetchFont(weight: OgFont["weight"], subset: string): Promise<OgFont> {
  const res = await fetch(`${BASE}/inter-${subset}-${weight}-normal.woff`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`font ${subset}-${weight}: HTTP ${res.status}`);
  return { name: "Inter", data: await res.arrayBuffer(), weight, style: "normal" };
}

async function load(): Promise<OgFont[] | undefined> {
  try {
    const required = await Promise.all(REQUIRED.map((f) => fetchFont(f.weight, f.subset)));
    const optional = await Promise.allSettled(OPTIONAL.map((f) => fetchFont(f.weight, f.subset)));
    return [
      ...required,
      ...optional.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    ];
  } catch (err) {
    console.error("[og] Inter font load failed, using default font:", err);
    failedAt = Date.now();
    return undefined;
  }
}

/** Inter 400/700/800 for ImageResponse `fonts`, or undefined on failure. */
export function getOgFonts(): Promise<OgFont[] | undefined> {
  if (!cached || (failedAt && Date.now() - failedAt > RETRY_MS)) {
    failedAt = 0;
    cached = load();
  }
  return cached;
}
