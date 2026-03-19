/**
 * Climb Detection
 *
 * Identifies significant ascents in a route's elevation profile and
 * classifies them using standard cycling categories.
 */

export interface Climb {
  startIndex: number;
  endIndex: number;
  elevationGainM: number;
  lengthKm: number;
  avgGradePct: number;
  category: "HC" | "Cat1" | "Cat2" | "Cat3" | "Cat4" | null;
}

export const CATEGORY_COLORS: Record<string, string> = {
  HC:   "#ff3355",
  Cat1: "#ff7700",
  Cat2: "#ffbb00",
  Cat3: "#3399ff",
  Cat4: "#00cc66",
};

/** Haversine distance in km between two [lat, lng] points. */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Classify a climb by elevation gain and average grade.
 * Returns null if below the minimum threshold for a categorised climb.
 */
function classifyClimb(gainM: number, lengthKm: number): Climb["category"] {
  const grade = lengthKm > 0 ? (gainM / (lengthKm * 1000)) * 100 : 0;
  const score = gainM * (grade / 5);

  if (gainM >= 500 && grade >= 6) return "HC";
  if (gainM >= 250 && grade >= 5) return "Cat1";
  if (gainM >= 150 && grade >= 4) return "Cat2";
  if (gainM >= 75 && grade >= 3) return "Cat3";
  if (gainM >= 30 && grade >= 2) return "Cat4";
  if (score > 0) return null; // below threshold

  return null;
}

/**
 * Detect significant climbs in a route.
 *
 * @param coords  Array of [lat, lng, elevation] points
 * @param minGainM Minimum elevation gain to register a climb (default: 30m)
 * @param smoothingWindow Moving-average window for smoothing elevation noise (default: 5)
 */
export function detectClimbs(
  coords: [number, number, number][],
  minGainM = 30,
  smoothingWindow = 5
): Climb[] {
  if (coords.length < 4) return [];

  // Smooth elevations to remove GPS noise
  const elevations: number[] = coords.map((c) => c[2]);
  const smoothed: number[] = elevations.map((_, i) => {
    const half = Math.floor(smoothingWindow / 2);
    const start = Math.max(0, i - half);
    const end = Math.min(elevations.length - 1, i + half);
    const slice = elevations.slice(start, end + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const climbs: Climb[] = [];
  let climbStart: number | null = null;
  let lastValleyIdx = 0;
  let lastValleyEle = smoothed[0];

  for (let i = 1; i < smoothed.length; i++) {
    const ascending = smoothed[i] > smoothed[i - 1];

    if (ascending && climbStart === null) {
      climbStart = i - 1;
    }

    if (!ascending && climbStart !== null) {
      // Segment ended — evaluate the climb
      const gain = smoothed[i - 1] - smoothed[climbStart];
      if (gain >= minGainM) {
        let lengthKm = 0;
        for (let j = climbStart + 1; j <= i - 1; j++) {
          lengthKm += haversine(
            [coords[j - 1][0], coords[j - 1][1]],
            [coords[j][0], coords[j][1]]
          );
        }
        const category = classifyClimb(gain, lengthKm);
        climbs.push({
          startIndex: climbStart,
          endIndex: i - 1,
          elevationGainM: Math.round(gain),
          lengthKm: Math.round(lengthKm * 10) / 10,
          avgGradePct: lengthKm > 0 ? Math.round((gain / (lengthKm * 1000)) * 1000) / 10 : 0,
          category,
        });
      }
      lastValleyIdx = i;
      lastValleyEle = smoothed[i];
      climbStart = null;
    }
  }

  // Handle climb that runs to the end
  if (climbStart !== null) {
    const endIdx = smoothed.length - 1;
    const gain = smoothed[endIdx] - smoothed[climbStart];
    if (gain >= minGainM) {
      let lengthKm = 0;
      for (let j = climbStart + 1; j <= endIdx; j++) {
        lengthKm += haversine(
          [coords[j - 1][0], coords[j - 1][1]],
          [coords[j][0], coords[j][1]]
        );
      }
      const category = classifyClimb(gain, lengthKm);
      climbs.push({
        startIndex: climbStart,
        endIndex: endIdx,
        elevationGainM: Math.round(gain),
        lengthKm: Math.round(lengthKm * 10) / 10,
        avgGradePct: lengthKm > 0 ? Math.round((gain / (lengthKm * 1000)) * 1000) / 10 : 0,
        category,
      });
    }
  }

  void lastValleyIdx;
  void lastValleyEle;

  // Sort by elevation gain descending, deduplicate overlapping climbs
  const deduped: Climb[] = [];
  const sorted = [...climbs].sort((a, b) => b.elevationGainM - a.elevationGainM);
  for (const climb of sorted) {
    const overlaps = deduped.some(
      (c) => climb.startIndex < c.endIndex && climb.endIndex > c.startIndex
    );
    if (!overlaps) deduped.push(climb);
  }

  return deduped.sort((a, b) => a.startIndex - b.startIndex);
}
