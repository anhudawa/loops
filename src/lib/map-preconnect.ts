import { preconnect } from "react-dom";

/**
 * Warm the connections to the map tile servers while the page's code loads:
 * on the route and ride pages the largest paint is a map tile (~2.5 s on a
 * phone), and each tile host otherwise opens its TLS connection only when
 * Leaflet asks for the first tile. Server components call this in render.
 */
export function preconnectMapTiles(): void {
  for (const s of ["a", "b", "c"]) preconnect(`https://${s}.tile.openstreetmap.org`);
}
