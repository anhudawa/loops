const configuredTileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim() || null;
const configuredAttribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim() || null;

/**
 * Community OpenStreetMap tiles are a development fallback only. Production
 * must use a contracted provider (or self-hosting) and its required credit.
 */
export const MAP_TILE_URL = configuredTileUrl
  ?? (process.env.NODE_ENV === "production"
    ? null
    : "https://tile.openstreetmap.org/{z}/{x}/{y}.png");

export const MAP_ATTRIBUTION = configuredAttribution
  ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

export const PRODUCTION_MAP_PROVIDER_CONFIGURED = Boolean(
  configuredTileUrl && configuredAttribution
);
