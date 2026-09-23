"use client";

import { useCallback, useState } from "react";
import { locationIfAllowed, rememberLocation } from "@/lib/location";

/**
 * On-demand browser geolocation. The rider taps "use my location" (or
 * dictates a request without naming a place) and we capture [lat, lng] to
 * send as the route start point — the "I'm here now, give me a ride" path.
 *
 * Permission is only requested when `request()` is called, never on mount.
 */

export interface GeolocationState {
  coords: [number, number] | null;
  loading: boolean;
  error: string | null;
  /** The browser has blocked location for this site: it will not prompt again. */
  blocked: boolean;
  request: () => Promise<[number, number] | null>;
}

export function useGeolocation(): GeolocationState {
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const request = useCallback(async (): Promise<[number, number] | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available in this browser.");
      return null;
    }

    setLoading(true);
    setError(null);
    setBlocked(false);

    // Already allowed or recently known: no prompt at all.
    const known = await locationIfAllowed();
    if (known) {
      const c: [number, number] = [known.lat, known.lng];
      setCoords(c);
      setLoading(false);
      return c;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          rememberLocation({ lat: c[0], lng: c[1] });
          setCoords(c);
          setLoading(false);
          resolve(c);
        },
        (err) => {
          setBlocked(err.code === err.PERMISSION_DENIED);
          setError(
            err.code === err.PERMISSION_DENIED
              ? "Location access was blocked. Name a starting point instead."
              : "Couldn't get your location. Name a starting point instead."
          );
          setLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    });
  }, []);

  return { coords, loading, error, blocked, request };
}
