/**
 * Intensity Zones
 *
 * Cycling training zones (Coggan 7-zone model), with:
 *  - a typical flat-road speed a trained rider sustains at each zone
 *  - terrain requirements for a segment to host that zone's intervals
 *
 * Used by the interval-routing pipeline to decide:
 *  1. how far the rider will travel during an interval ("2x20 threshold"
 *     at ~32 km/h → ~11 km per interval), and
 *  2. what a "suitable" stretch of road looks like for that zone.
 */

export type IntensityZone = "z1" | "z2" | "z3" | "z4" | "z5" | "z6" | "z7";

export interface TerrainRequirements {
  min_gradient_pct: number;        // negative allowed (descents acceptable)
  max_gradient_pct: number;        // positive = uphill
  max_gradient_variance: number;   // stdev of per-point gradients
  min_length_km_per_minute: number; // km needed per minute of interval
}

export interface ZoneProfile {
  zone: IntensityZone;
  name: string;
  aliases: string[];
  flat_speed_kmh: number;
  terrain: TerrainRequirements;
}

/**
 * The model is deliberately conservative — we are scoping routes for real
 * club riders, not WorldTour pros. If a rider wants a faster-than-default
 * pace they can adjust via future user-speed preferences.
 */
export const ZONES: Record<IntensityZone, ZoneProfile> = {
  z1: {
    zone: "z1",
    name: "Recovery",
    aliases: ["recovery", "z1", "zone 1", "easy spin"],
    flat_speed_kmh: 22,
    terrain: {
      min_gradient_pct: -10,
      max_gradient_pct: 3,
      max_gradient_variance: 5,
      min_length_km_per_minute: 0.35,
    },
  },
  z2: {
    zone: "z2",
    name: "Endurance",
    aliases: ["endurance", "z2", "zone 2", "base", "aerobic"],
    flat_speed_kmh: 25,
    terrain: {
      min_gradient_pct: -10,
      max_gradient_pct: 6,
      max_gradient_variance: 6,
      min_length_km_per_minute: 0.4,
    },
  },
  z3: {
    zone: "z3",
    name: "Tempo",
    aliases: ["tempo", "z3", "zone 3", "sweet spot", "sweetspot"],
    flat_speed_kmh: 28,
    terrain: {
      min_gradient_pct: -2,
      max_gradient_pct: 4,
      max_gradient_variance: 3,
      min_length_km_per_minute: 0.43,
    },
  },
  z4: {
    zone: "z4",
    name: "Threshold",
    aliases: ["threshold", "ftp", "z4", "zone 4", "lactate threshold", "lt"],
    flat_speed_kmh: 32,
    terrain: {
      // Sustained effort needs mostly flat or a steady gentle climb,
      // with no sharp descents that would have the rider coasting.
      min_gradient_pct: -1,
      max_gradient_pct: 3,
      max_gradient_variance: 2,
      min_length_km_per_minute: 0.45,
    },
  },
  z5: {
    zone: "z5",
    name: "VO2max",
    aliases: ["vo2", "vo2max", "vo2 max", "z5", "zone 5"],
    flat_speed_kmh: 30,
    terrain: {
      // Short, punchy efforts — tolerates more gradient (hill repeats)
      // but still wants the rider rolling, not coasting.
      min_gradient_pct: -1,
      max_gradient_pct: 7,
      max_gradient_variance: 3,
      min_length_km_per_minute: 0.4,
    },
  },
  z6: {
    zone: "z6",
    name: "Anaerobic",
    aliases: ["anaerobic", "z6", "zone 6"],
    flat_speed_kmh: 28,
    terrain: {
      min_gradient_pct: -2,
      max_gradient_pct: 8,
      max_gradient_variance: 4,
      min_length_km_per_minute: 0.35,
    },
  },
  z7: {
    zone: "z7",
    name: "Sprint",
    aliases: ["sprint", "sprints", "z7", "zone 7", "neuromuscular"],
    flat_speed_kmh: 38,
    terrain: {
      min_gradient_pct: -2,
      max_gradient_pct: 2,
      max_gradient_variance: 1,
      min_length_km_per_minute: 0.5,
    },
  },
};

/**
 * Try to identify a zone from a free-text intensity label.
 * Matches aliases case-insensitively. Returns null if no match.
 */
export function parseZone(text: string): IntensityZone | null {
  const normalized = text.toLowerCase();
  // Prefer longer aliases first so "vo2 max" wins over "z5"
  const all = Object.values(ZONES).flatMap((p) =>
    p.aliases.map((a) => ({ alias: a, zone: p.zone }))
  );
  all.sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, zone } of all) {
    if (normalized.includes(alias)) return zone;
  }
  return null;
}

/**
 * Estimated distance (km) covered by a rider during a single interval
 * of the given duration at the given zone, on flat terrain.
 */
export function intervalDistanceKm(
  zone: IntensityZone,
  durationMinutes: number
): number {
  const speed = ZONES[zone].flat_speed_kmh;
  return (durationMinutes / 60) * speed;
}

/**
 * Minimum segment length required to host a single interval of the given
 * duration at the given zone. Slightly longer than intervalDistanceKm to
 * leave room for error — a short segment that barely fits the interval
 * is a bad match.
 */
export function minSegmentLengthKm(
  zone: IntensityZone,
  durationMinutes: number
): number {
  const { min_length_km_per_minute } = ZONES[zone].terrain;
  return Math.max(
    intervalDistanceKm(zone, durationMinutes),
    durationMinutes * min_length_km_per_minute
  );
}
