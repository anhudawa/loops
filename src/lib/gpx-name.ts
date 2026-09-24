/**
 * The name a GPX carries is the name the rider sees on the Garmin/Wahoo —
 * so it is the route's own title ("Clontarf – Raheny – Clontarf · 10.7 km"),
 * the same one Save suggests, never "LOOPS planned road route — 10.7 km".
 * Client-safe (no town list): the title itself comes from the server.
 */

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Put `name` on the GPX's metadata and track (waypoint names are left alone). */
export function renameGpx(gpx: string, name: string): string {
  const n = escapeXml(name.trim());
  if (!n) return gpx;
  return gpx
    .replace(/(<metadata>\s*<name>)[^<]*(<\/name>)/, `$1${n}$2`)
    .replace(/(<trk>\s*<name>)[^<]*(<\/name>)/, `$1${n}$2`);
}

/** "Clontarf – Raheny – Clontarf · 10.7 km" → "loops-clontarf-raheny-clontarf-10-7-km.gpx". */
export function gpxFileName(title: string, suffix = ""): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `loops-${slug || "route"}${suffix}.gpx`;
}

/**
 * The title's distance as the page shows it: "… · 11 km" → "… · 10.7 km"
 * (the planner's toolbar says 10.7 km). A title without one is unchanged.
 */
export function titleWithKm(title: string, km: string): string {
  return title.replace(/·\s*[\d.]+\s*km\s*$/, `· ${km} km`);
}
