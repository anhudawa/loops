import type { IntensityZone } from "./intensity";

export const WORKOUT_SESSION_TYPES = [
  "endurance",
  "tempo",
  "sweet_spot",
  "threshold",
  "vo2",
  "anaerobic",
  "sprint",
] as const;

export type WorkoutSessionType = (typeof WORKOUT_SESSION_TYPES)[number];

export const IRELAND_BETA_SESSION_TYPES: ReadonlySet<WorkoutSessionType> = new Set([
  "endurance",
  "tempo",
  "sweet_spot",
  "threshold",
]);

export function isWorkoutSessionType(value: unknown): value is WorkoutSessionType {
  return typeof value === "string" && WORKOUT_SESSION_TYPES.includes(value as WorkoutSessionType);
}

export function defaultSessionTypeForZone(zone: IntensityZone): WorkoutSessionType | null {
  if (zone === "z2") return "endurance";
  if (zone === "z3") return "tempo";
  if (zone === "z4") return "threshold";
  if (zone === "z5") return "vo2";
  if (zone === "z6") return "anaerobic";
  if (zone === "z7") return "sprint";
  return null;
}

export function zoneForSessionType(sessionType: WorkoutSessionType): IntensityZone {
  if (sessionType === "endurance") return "z2";
  if (sessionType === "tempo" || sessionType === "sweet_spot") return "z3";
  if (sessionType === "threshold") return "z4";
  if (sessionType === "vo2") return "z5";
  if (sessionType === "anaerobic") return "z6";
  return "z7";
}
