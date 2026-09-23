/**
 * The destination guides by slug and name only — small enough for client
 * code (the home feed's empty search state), which should not ship the full
 * guide text in src/content/destinations.ts. A unit test keeps the two in
 * step.
 */
export const DESTINATION_GUIDES: readonly { slug: string; name: string }[] = [
  { slug: "girona", name: "Girona" },
  { slug: "mallorca", name: "Mallorca" },
  { slug: "dublin", name: "Dublin" },
  { slug: "calpe", name: "Calpe" },
  { slug: "wicklow", name: "Wicklow" },
  { slug: "tenerife", name: "Tenerife" },
  { slug: "malaga", name: "Málaga / Costa del Sol" },
  { slug: "gran-canaria", name: "Gran Canaria" },
  { slug: "lanzarote", name: "Lanzarote" },
  { slug: "algarve", name: "Algarve" },
  { slug: "lucca", name: "Lucca / Tuscany" },
  { slug: "nice", name: "Nice / Côte d'Azur" },
];

const norm = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The guide a typed search names ("wicklow", "Tuscany", "cote d'azur",
 * "gran canaria"), or null. Whole names only — "nic" is not Nice.
 */
export function guideForSearch(query: string): { slug: string; name: string } | null {
  const q = norm(query);
  if (!q) return null;
  for (const g of DESTINATION_GUIDES) {
    const names = [g.slug.replace(/-/g, " "), ...g.name.split("/")].map(norm);
    if (names.includes(q)) return g;
  }
  return null;
}
