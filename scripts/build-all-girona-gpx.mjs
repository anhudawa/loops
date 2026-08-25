/**
 * Build GPX files for Girona cycling routes using OSRM routing API.
 *
 * Calls the OSRM demo cycling router for each route, extracts GeoJSON
 * coordinates, and writes proper GPX files to src/data/girona-collection/.
 *
 * Run:
 *   node scripts/build-all-girona-gpx.mjs
 */

import "./legacy-route-materialization-disabled.mjs";

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "../src/data/girona-collection");

mkdirSync(OUTPUT_DIR, { recursive: true });

const OSRM_BASE = "http://router.project-osrm.org/route/v1/cycling";

// Waypoints defined as [lat, lng] — converted to lng,lat for OSRM
const ROUTES = [
  // ── ROAD ─────────────────────────────────────────────────────────────────
  {
    id: "els-angels",
    name: "Els Àngels Loop",
    description:
      "Popular Girona cycling loop featuring the classic climb to Santuari dels Àngels chapel where Salvador Dalí got married. Two climbs through woodland and medieval villages in the Gavarres mountains.",
    surface: "road",
    approxKm: 68,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [41.9500, 2.8700], // Santuari dels Àngels
      [41.9167, 2.9333], // Santa Pellaia
      [41.9794, 2.8214], // back to Girona
    ],
  },
  {
    id: "costa-brava-sant-grau",
    name: "Costa Brava via Sant Grau",
    description:
      "Classic Girona loop to the Costa Brava coastline through Sant Grau. Features a 6.3km climb to Sant Grau monastery, stunning coastal roads past crystal clear bays near Tossa de Mar, returning via quiet country lanes.",
    surface: "road",
    approxKm: 95,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [41.8286, 2.8928], // Llagostera
      [41.7186, 2.9311], // Tossa de Mar
      [41.7556, 2.8944], // Sant Grau
      [41.9794, 2.8214], // back to Girona
    ],
  },
  {
    id: "mare-de-deu-del-mont",
    name: "Mare de Déu del Mont Loop",
    description:
      "Challenging Girona loop centred on the notorious Mare de Déu del Mont climb — 18km averaging 5.4% with sections hitting 14%. Quiet rolling countryside, forest terrain, and panoramic summit views. Returns via Banyoles lake.",
    surface: "road",
    approxKm: 120,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [42.1186, 2.7643], // Banyoles
      [42.2369, 2.8111], // Cabanelles
      [42.2667, 2.7833], // Summit approach
      [41.9794, 2.8214], // back to Girona
    ],
  },
  {
    id: "sant-hilari-susqueda",
    name: "Sant Hilari & Susqueda Dam Loop",
    description:
      "Punchy Girona loop with 1,710m of climbing through quiet winding roads. Features a gradual 20km climb to Sant Hilari Sacalm, twisting forest descents, and the dramatic Susqueda dam and reservoir.",
    surface: "road",
    approxKm: 114,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [41.8764, 2.5075], // Sant Hilari Sacalm
      [41.9111, 2.5639], // Osor
      [41.9500, 2.5167], // Susqueda reservoir
      [41.9794, 2.8214], // back to Girona
    ],
  },
  {
    id: "coll-de-bracons",
    name: "Coll de Bracons Loop",
    description:
      "Epic Girona loop crossing the Pyrenean foothills via Besalú, Olot, and the demanding Coll de Bracons pass. Rolling volcanic landscape of the Garrotxa natural park.",
    surface: "road",
    approxKm: 105,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [42.1186, 2.7643], // Banyoles
      [42.2000, 2.6983], // Besalú
      [42.1764, 2.4903], // Olot
      [42.1400, 2.4500], // Joanetes (approach to col)
      [42.0817, 2.3950], // Coll de Bracons (summit)
      [41.9794, 2.8214], // back to Girona
    ],
  },
  {
    id: "turo-de-lhome",
    name: "Turó de l'Home Loop",
    description:
      "Girona's longest classic — a full day in the saddle climbing to the highest point in the Montseny massif. Remote forest roads, dramatic altitude gain, and the rewarding descent back through the Selva.",
    surface: "road",
    approxKm: 135,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [41.8628, 2.6644], // Santa Coloma de Farners
      [41.8500, 2.3833], // Viladrau
      [41.7750, 2.4361], // Turó de l'Home approach
      [41.9794, 2.8214], // back to Girona
    ],
  },

  // ── GRAVEL ────────────────────────────────────────────────────────────────
  {
    id: "via-verde-carrilet",
    name: "Via Verde del Carrilet",
    description:
      "The old Carrilet railway converted to a greenway — a smooth gravel track following the Ter valley from Girona to Olot through Anglès and Amer. Largely car-free, gently graded, perfect for exploring inland Catalonia.",
    surface: "gravel",
    approxKm: 55,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [41.9539, 2.6411], // Anglès
      [42.0003, 2.5997], // Amer
      [42.1764, 2.4903], // Olot
    ],
  },
  {
    id: "les-gavarres",
    name: "Les Gavarres Circuit",
    description:
      "A gravel loop through the cork oak forests and quiet backroads of the Gavarres massif. Links Girona to the medieval lanes of the Empordà lowlands via Cassà de la Selva and La Bisbal.",
    surface: "gravel",
    approxKm: 90,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [41.8883, 2.8644], // Cassà de la Selva
      [41.8417, 2.9750], // Romanyà de la Selva
      [41.9594, 3.0478], // La Bisbal d'Empordà
      [41.9794, 2.8214], // back to Girona
    ],
  },
  {
    id: "emporda-plain",
    name: "Empordà Plain Circuit",
    description:
      "A gravel exploration of the flat medieval heartland east of Girona. Meanders through Ullastret, Peratallada, Pals, and Torroella de Montgrí on farm tracks and quiet lanes with rice paddies and ruins.",
    surface: "gravel",
    approxKm: 88,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [42.0000, 3.0833], // Ullastret
      [41.9778, 3.0889], // Peratallada
      [41.9700, 3.1489], // Pals
      [42.0436, 3.1278], // Torroella de Montgrí
      [41.9794, 2.8214], // back to Girona
    ],
  },
  {
    id: "gravel-rocacorba",
    name: "Rocacorba Gravel",
    description:
      "The gravel variant of Girona's benchmark climb. Approaches Rocacorba via forest tracks and dirt roads through Camós before the famous summit, then descends to Banyoles lake for the return.",
    surface: "gravel",
    approxKm: 85,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [42.0833, 2.7833], // Camós
      [42.0580, 2.7300], // Rocacorba approach
      [42.0667, 2.7167], // Summit area
      [42.1186, 2.7643], // Banyoles
      [41.9794, 2.8214], // back to Girona
    ],
  },
  {
    id: "la-traka-100",
    name: "La Traka 100",
    description:
      "A 100km gravel epic linking Girona's most varied terrain — Banyoles lake, the volcanic Garrotxa via Santa Pau, Olot's old quarter, and the Ter valley greenway home through Anglès.",
    surface: "gravel",
    approxKm: 100,
    waypoints: [
      [41.9794, 2.8214], // Girona
      [42.1186, 2.7643], // Banyoles
      [42.1167, 2.7500], // Porqueres
      [42.1453, 2.5672], // Santa Pau
      [42.1764, 2.4903], // Olot
      [41.9539, 2.6411], // Anglès
      [41.9794, 2.8214], // back to Girona
    ],
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeDistance(coords) {
  // coords: [[lng, lat], ...]
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    total += haversine(lat1, lng1, lat2, lng2);
  }
  return Math.round(total * 10) / 10;
}

function buildGpx(route, coords) {
  // coords: [[lng, lat], ...] from OSRM GeoJSON
  const now = new Date().toISOString();
  const trkpts = coords
    .map(([lng, lat]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="loops.ie"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(route.name)}</name>
    <desc>${escapeXml(route.description)}</desc>
    <author><name>loops.ie</name></author>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>${escapeXml(route.name)}</name>
    <type>${route.surface}</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function buildRoute(route) {
  // Convert [lat, lng] waypoints to OSRM "lng,lat" coordinate pairs
  const coordStr = route.waypoints
    .map(([lat, lng]) => `${lng},${lat}`)
    .join(";");

  const url = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson&steps=false`;
  console.log(`\n[${route.id}] Fetching OSRM route...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM HTTP ${res.status} for ${route.id}`);
  }

  const json = await res.json();

  if (json.code !== "Ok" || !json.routes || json.routes.length === 0) {
    throw new Error(`OSRM error for ${route.id}: ${json.code} — ${json.message || "no routes returned"}`);
  }

  const osrmRoute = json.routes[0];
  const coords = osrmRoute.geometry.coordinates; // [[lng, lat], ...]
  const distanceKm = computeDistance(coords);
  const osrmDistanceKm = Math.round((osrmRoute.distance / 1000) * 10) / 10;
  const durationMin = Math.round(osrmRoute.duration / 60);

  console.log(`  Points: ${coords.length}`);
  console.log(`  OSRM distance: ${osrmDistanceKm} km (computed haversine: ${distanceKm} km)`);
  console.log(`  Approx ride time: ${durationMin} min`);
  console.log(`  Expected: ~${route.approxKm} km`);

  const gpx = buildGpx(route, coords);
  const filename = `${route.id}.gpx`;
  const filepath = join(OUTPUT_DIR, filename);
  writeFileSync(filepath, gpx, "utf8");
  console.log(`  ✓ Written: src/data/girona-collection/${filename}`);

  return { id: route.id, name: route.name, distanceKm: osrmDistanceKm, points: coords.length };
}

async function main() {
  console.log(`Building GPX files for ${ROUTES.length} Girona routes...`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  const results = [];
  const errors = [];

  for (let i = 0; i < ROUTES.length; i++) {
    const route = ROUTES[i];
    try {
      const result = await buildRoute(route);
      results.push(result);
    } catch (err) {
      console.error(`  ✗ FAILED: ${route.id} — ${err.message}`);
      errors.push({ id: route.id, error: err.message });
    }

    // 1-second delay between calls to be polite to the OSRM demo server
    if (i < ROUTES.length - 1) {
      await sleep(1000);
    }
  }

  console.log("\n\n══════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("══════════════════════════════════════════");
  console.log(`✓ Success: ${results.length}/${ROUTES.length}`);
  if (errors.length > 0) {
    console.log(`✗ Failed:  ${errors.length}/${ROUTES.length}`);
    errors.forEach((e) => console.log(`  - ${e.id}: ${e.error}`));
  }

  if (results.length > 0) {
    console.log("\nBuilt routes:");
    results.forEach((r) =>
      console.log(`  ${r.id.padEnd(24)} ${r.distanceKm.toString().padStart(6)} km  (${r.points} pts)`)
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
