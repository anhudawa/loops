import { describe, it, expect, beforeEach, vi } from "vitest";
import { locationIfAllowed, rememberLocation } from "../location";

function setup(permission: "granted" | "prompt" | "denied") {
  const getCurrentPosition = vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
    ok({ coords: { latitude: 53.36, longitude: -6.18 } }));
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition }, permissions: { query: async () => ({ state: permission }) } });
  return getCurrentPosition;
}

describe("locationIfAllowed", () => {
  beforeEach(() => vi.unstubAllGlobals());
  it("never prompts when permission has not been granted", async () => {
    const gcp = setup("prompt");
    expect(await locationIfAllowed()).toBeNull();
    expect(gcp).not.toHaveBeenCalled();
  });
  it("uses the position silently when already granted", async () => {
    const gcp = setup("granted");
    expect(await locationIfAllowed()).toEqual({ lat: 53.36, lng: -6.18 });
    expect(gcp).toHaveBeenCalledTimes(1);
  });
  it("uses a recent cached position without asking the browser", async () => {
    const gcp = setup("denied");
    rememberLocation({ lat: 41.98, lng: 2.82 });
    expect(await locationIfAllowed()).toEqual({ lat: 41.98, lng: 2.82 });
    expect(gcp).not.toHaveBeenCalled();
  });
});
