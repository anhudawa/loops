import type { RouteSpec, WorkoutSpec } from "../src/lib/route-intent";
import type { WorkoutSessionType } from "../src/lib/workout";

export interface IrelandBetaCoverageCase {
  id: string;
  label: string;
  spec: RouteSpec;
}

type Anchor = {
  id: string;
  label: string;
  point: [number, number];
};

const anchors: Anchor[] = [
  { id: "dublin-centre", label: "Dublin city centre", point: [53.3498, -6.2603] },
  { id: "dun-laoghaire", label: "Dún Laoghaire", point: [53.2944, -6.1339] },
  { id: "tallaght", label: "Tallaght", point: [53.2878, -6.3411] },
  { id: "bray", label: "Bray", point: [53.2028, -6.0981] },
  { id: "enniskerry", label: "Enniskerry", point: [53.1927, -6.1707] },
  { id: "roundwood", label: "Roundwood", point: [53.0646, -6.2266] },
  { id: "laragh", label: "Laragh", point: [53.0109, -6.3005] },
  { id: "blessington", label: "Blessington", point: [53.1736, -6.5325] },
];

const distanceProfiles = [
  { id: "short", label: "40 km", distanceKm: 40, toleranceKm: 8, elevation: "rolling" as const },
  { id: "medium", label: "70 km", distanceKm: 70, toleranceKm: 10, elevation: "rolling" as const },
  { id: "long", label: "100 km", distanceKm: 100, toleranceKm: 15, elevation: "hilly" as const },
];

function baseSpec(
  point: [number, number],
  distanceKm: number,
  toleranceKm: number,
  elevation: RouteSpec["elevation_preference"]
): RouteSpec {
  return {
    distance_km: distanceKm,
    distance_tolerance_km: toleranceKm,
    elevation_preference: elevation,
    discipline: "road",
    start_point: point,
    end_point: point,
    is_loop: true,
    road_preferences: ["tertiary", "unclassified", "residential"],
    avoid: ["motorway", "trunk", "primary"],
    vibes: ["scenic", "quiet"],
    country: "Ireland",
    wind_strategy: "none",
  };
}

export const discoveryCoverageCases: IrelandBetaCoverageCase[] = anchors.flatMap((anchor) =>
  distanceProfiles.map((profile) => ({
    id: `${anchor.id}-${profile.id}`,
    label: `${anchor.label}, ${profile.label}`,
    spec: baseSpec(
      anchor.point,
      profile.distanceKm,
      profile.toleranceKm,
      profile.elevation
    ),
  }))
);

const workoutZones: Record<WorkoutSessionType, "z2" | "z3" | "z4"> = {
  endurance: "z2",
  tempo: "z3",
  sweet_spot: "z3",
  threshold: "z4",
  vo2: "z4",
  anaerobic: "z4",
  sprint: "z4",
};

function workoutSpec(
  sessionType: "endurance" | "tempo" | "sweet_spot" | "threshold",
  count: number,
  effortSeconds: number,
  recoverySeconds: number
): WorkoutSpec {
  const warmupMinutes = 15;
  const cooldownMinutes = 10;
  const intervalSeconds = count * effortSeconds + Math.max(0, count - 1) * recoverySeconds;
  return {
    intervals: [{
      count,
      duration_minutes: effortSeconds / 60,
      duration_seconds: effortSeconds,
      zone: workoutZones[sessionType],
      recovery_minutes: recoverySeconds / 60,
      recovery_seconds: recoverySeconds,
      session_type: sessionType,
    }],
    warmup_minutes: warmupMinutes,
    cooldown_minutes: cooldownMinutes,
    total_minutes: warmupMinutes + cooldownMinutes + intervalSeconds / 60,
  };
}

function workoutCase(
  id: string,
  label: string,
  anchor: Anchor,
  sessionType: "endurance" | "tempo" | "sweet_spot" | "threshold",
  count: number,
  effortSeconds: number,
  recoverySeconds: number,
  distanceKm: number
): IrelandBetaCoverageCase {
  const workout = workoutSpec(sessionType, count, effortSeconds, recoverySeconds);
  return {
    id,
    label,
    spec: {
      ...baseSpec(anchor.point, distanceKm, 12, sessionType === "endurance" ? "rolling" : "flat"),
      duration_minutes: workout.total_minutes,
      workout,
    },
  };
}

const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
const anchor = (id: string): Anchor => {
  const value = byId.get(id);
  if (!value) throw new Error(`Unknown Ireland beta anchor: ${id}`);
  return value;
};

export const workoutCoverageCases: IrelandBetaCoverageCase[] = [
  workoutCase("dublin-tempo-2x15", "Dublin 2 × 15 min tempo", anchor("dublin-centre"), "tempo", 2, 900, 300, 45),
  workoutCase("dun-laoghaire-threshold-2x20", "Dún Laoghaire 2 × 20 min threshold", anchor("dun-laoghaire"), "threshold", 2, 1200, 600, 55),
  workoutCase("tallaght-sweet-spot-3x12", "Tallaght 3 × 12 min sweet spot", anchor("tallaght"), "sweet_spot", 3, 720, 300, 55),
  workoutCase("bray-tempo-3x10", "Bray 3 × 10 min tempo", anchor("bray"), "tempo", 3, 600, 300, 50),
  workoutCase("enniskerry-threshold-2x15", "Enniskerry 2 × 15 min threshold", anchor("enniskerry"), "threshold", 2, 900, 480, 50),
  workoutCase("roundwood-endurance-1x60", "Roundwood 60 min endurance block", anchor("roundwood"), "endurance", 1, 3600, 0, 45),
  workoutCase("laragh-sweet-spot-2x20", "Laragh 2 × 20 min sweet spot", anchor("laragh"), "sweet_spot", 2, 1200, 600, 55),
  workoutCase("blessington-endurance-1x45", "Blessington 45 min endurance block", anchor("blessington"), "endurance", 1, 2700, 0, 40),
];
