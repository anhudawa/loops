"use client";

import { useCallback, useState } from "react";

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
  request: () => Promise<[number, number] | null>;
}

export function useGeolocation(): GeolocationState {
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (): Promise<[number, number] | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available in this browser.");
      return null;
    }

    setLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setCoords(c);
          setLoading(false);
          resolve(c);
        },
        (err) => {
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

  return { coords, loading, error, request };
}
