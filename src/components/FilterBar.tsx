"use client";

import DurationStrip from "./DurationStrip";
import DisciplineTabs from "./DisciplineTabs";
import RefineChips from "./RefineChips";

interface FilterBarProps {
  duration: string | null;
  discipline: string;
  difficulty: string;
  surface: string;
  region: string;
  verified: boolean;
  regions: string[];
  avgSpeedKmh: number;
  routeCount: number;
  onDurationChange: (d: string | null) => void;
  onDisciplineChange: (d: string) => void;
  onDifficultyChange: (v: string) => void;
  onSurfaceChange: (v: string) => void;
  onRegionChange: (v: string) => void;
  onVerifiedChange: (v: boolean) => void;
}

export default function FilterBar({
  duration,
  discipline,
  difficulty,
  surface,
  region,
  verified,
  regions,
  avgSpeedKmh,
  onDurationChange,
  onDisciplineChange,
  onDifficultyChange,
  onSurfaceChange,
  onRegionChange,
  onVerifiedChange,
}: FilterBarProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <DurationStrip
        selected={duration}
        onSelect={onDurationChange}
        avgSpeedKmh={avgSpeedKmh}
      />

      <DisciplineTabs
        selected={discipline}
        onSelect={onDisciplineChange}
      />

      <RefineChips
        difficulty={difficulty}
        surface={surface}
        region={region}
        verified={verified}
        regions={regions}
        onDifficultyChange={onDifficultyChange}
        onSurfaceChange={onSurfaceChange}
        onRegionChange={onRegionChange}
        onVerifiedChange={onVerifiedChange}
      />
    </div>
  );
}
