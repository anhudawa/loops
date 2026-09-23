"use client";

import { useCallback, useState } from "react";
import { requestLocation, lastLocationBlocked } from "@/lib/location";

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

    // Straight from the tap: no await before the browser call (iOS).
    const c0 = await requestLocation();
    if (c0) {
      const c: [number, number] = [c0.lat, c0.lng];
      setCoords(c);
      setLoading(false);
      return c;
    }
    setBlocked(lastLocationBlocked);
    setError("Couldn't get your location. Turn it on, or name a starting point instead.");
    setLoading(false);
    return null;
  }, []);

  return { coords, loading, error, blocked, request };
}
