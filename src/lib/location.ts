/**
 * Location without nagging. Pages never prompt on load: they use the
 * rider's position only if the browser has ALREADY granted it (or we have
 * a recent one cached), and ask only when the rider taps "Use my location".
 * Some phones (iOS Safari, in-app browsers) forget a "yes" between pages,
 * so a prompt-on-load asked twice around sign-in.
 */

export type LatLng = { lat: number; lng: number };

const CACHE_KEY = "loops:lastLocation";
const CACHE_MS = 10 * 60 * 1000;

function readCache(): LatLng | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LatLng & { at: number };
    if (Date.now() - v.at > CACHE_MS || typeof v.lat !== "number" || typeof v.lng !== "number") return null;
    return { lat: v.lat, lng: v.lng };
  } catch {
    return null;
  }
}

/** Remember a position the rider just shared (10 minutes). */
export function rememberLocation(p: LatLng) { writeCache(p); }

function writeCache(p: LatLng) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...p, at: Date.now() })); } catch { /* private mode */ }
}

function position(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeCache(p);
        resolve(p);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

/** The rider's position without ever showing a prompt: cache, or an already-granted permission. */
export async function locationIfAllowed(): Promise<LatLng | null> {
  const cached = readCache();
  if (cached) return cached;
  try {
    const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (perm?.state === "granted") return position();
  } catch {
    /* Permissions API missing: do not prompt */
  }
  return null;
}

/** Ask (shows the browser prompt if needed). Call only from a tap. */
export function requestLocation(): Promise<LatLng | null> {
  return position();
}
