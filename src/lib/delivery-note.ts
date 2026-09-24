// ============================================================
// delivery-note.ts — honest "what you asked vs what we served"
// ============================================================
//
// Honesty principle: when a generated loop comes out materially different from
// the request — noticeably shorter/longer, or hillier than a "flat"/"rolling"
// ask — say so plainly instead of presenting it as a clean match. Pure and
// unit-tested; the UI just renders the string.

export interface DeliveryRequest {
  distance_km: number;
  elevation_preference: string; // "flat" | "rolling" | "hilly" | "mountainous" | "any"
  /** Destination ride: the place sets the length, so say it that way. */
  destination?: string;
  /** false: the rider named no distance, so there is nothing to compare against. */
  distance_asked?: boolean;
  /** An interval session: repeats and laps add road, and the ride's own note says how much. */
  is_workout?: boolean;
}

export interface DeliveryActual {
  distance_km: number;
  elevation_gain_m: number;
}

// Per-km elevation ceiling for each preference (mirrors route-intent.ts).
const FLAT_CEILING_PER_KM: Record<string, number> = { flat: 5, rolling: 12 };

export function deliveryNote(
  req: DeliveryRequest | null | undefined,
  actual: DeliveryActual
): string | null {
  if (!req) return null;
  const notes: string[] = [];

  // Distance: flag a deviation over 12% AND at least 3 km (avoid nagging on
  // tiny differences that are within routing tolerance).
  const reqKm = req.distance_km;
  if (reqKm > 0 && !(req.destination && req.distance_asked === false)) {
    const diff = actual.distance_km - reqKm;
    if (Math.abs(diff) / reqKm > 0.12 && Math.abs(diff) >= 3 && req.is_workout) {
      notes.push(diff > 0
        ? `${Math.round(actual.distance_km)} km in all — the repeats of your efforts add road to the ${Math.round(reqKm)} km planned.`
        : `${Math.round(actual.distance_km)} km in all — shorter than the ${Math.round(reqKm)} km planned, to keep your efforts on their best stretch.`);
    } else if (Math.abs(diff) / reqKm > 0.12 && Math.abs(diff) >= 3 && req.destination) {
      notes.push(`${req.destination} and back is ${Math.round(actual.distance_km)} km — ${diff < 0 ? "shorter" : "longer"} than the ${Math.round(reqKm)} km you asked for.`);
    } else if (Math.abs(diff) / reqKm > 0.12 && Math.abs(diff) >= 3) {
      notes.push(
        diff < 0
          ? `Came out ${Math.round(-diff)} km shorter than the ${Math.round(reqKm)} km you asked for — the best loop we could route from here.`
          : `Came out ${Math.round(diff)} km longer than the ${Math.round(reqKm)} km you asked for.`
      );
    }
  }

  // Terrain: flag when a flat/rolling request came back meaningfully hillier
  // (15% over the preference's ceiling).
  const perKm = FLAT_CEILING_PER_KM[req.elevation_preference];
  if (perKm !== undefined && actual.distance_km > 0) {
    const ceiling = actual.distance_km * perKm;
    if (actual.elevation_gain_m > ceiling * 1.15) {
      notes.push(
        `Hillier than "${req.elevation_preference}" — ${Math.round(actual.elevation_gain_m)} m of climbing on the flattest quiet loop we could find here.`
      );
    }
  }

  return notes.length ? notes.join(" ") : null;
}
