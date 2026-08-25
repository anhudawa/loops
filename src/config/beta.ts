export const BETA_PRIVACY_VERSION = "2026-08-25";

export const BETA_SESSION_TYPES = [
  { value: "endurance", label: "Endurance / Zone 2" },
  { value: "tempo", label: "Tempo" },
  { value: "sweet_spot", label: "Sweet spot" },
  { value: "threshold", label: "Threshold" },
] as const;

export const BETA_RIDING_FREQUENCIES = [
  { value: "weekly", label: "About once a week" },
  { value: "two_to_three", label: "2–3 rides a week" },
  { value: "four_plus", label: "4+ rides a week" },
] as const;
