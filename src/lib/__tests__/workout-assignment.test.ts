import { describe, it, expect } from "vitest";
import { assignHumanAssessedWorkout, assignWorkout } from "../route-library";
import type { WorkoutSpec } from "../route-intent";
import type { IntervalSegment } from "../interval-segments";
import type { ApprovedSegmentAssessment } from "../db";
import type { WorkoutSessionType } from "../workout";

function seg(
  startIdx: number,
  endIdx: number,
  lengthKm: number,
  zones: IntervalSegment["suitable_zones"],
  avgGradient = 0
): IntervalSegment {
  return {
    start_index: startIdx,
    end_index: endIdx,
    length_km: lengthKm,
    avg_gradient_pct: avgGradient,
    max_gradient_pct: Math.abs(avgGradient) + 1,
    gradient_variance: 0.5,
    suitable_zones: zones,
  };
}

function workout(
  intervals: Array<{ count: number; duration_minutes: number; zone: WorkoutSpec["intervals"][number]["zone"] }>
): WorkoutSpec {
  const warmup = 15;
  const cooldown = 10;
  const intervalsTotal = intervals.reduce((sum, iv) => {
    const recovery = Math.round(iv.duration_minutes / 2);
    return sum + iv.count * iv.duration_minutes + Math.max(0, iv.count - 1) * recovery;
  }, 0);
  return {
    intervals: intervals.map((iv) => ({
      count: iv.count,
      duration_minutes: iv.duration_minutes,
      zone: iv.zone,
      recovery_minutes: Math.round(iv.duration_minutes / 2),
    })),
    warmup_minutes: warmup,
    cooldown_minutes: cooldown,
    total_minutes: warmup + intervalsTotal + cooldown,
  };
}

describe("assignWorkout", () => {
  it("fits a single 20-min threshold interval to a long flat segment", () => {
    const segments = [seg(0, 100, 12, ["z4", "z3"])]; // 12km flat
    const fit = assignWorkout(segments, workout([{ count: 1, duration_minutes: 20, zone: "z4" }]));
    expect(fit.fits).toBe(true);
    expect(fit.interval_segments).toHaveLength(1);
    expect(fit.interval_segments[0].segment.length_km).toBe(12);
  });

  it("needs distinct segments for multiple reps of the same interval", () => {
    // Only one z4-suitable segment — can't do 2 reps
    const segments = [seg(0, 100, 12, ["z4"])];
    const fit = assignWorkout(segments, workout([{ count: 2, duration_minutes: 20, zone: "z4" }]));
    expect(fit.fits).toBe(false);
  });

  it("assigns two reps to two distinct segments", () => {
    const segments = [
      seg(0, 100, 12, ["z4"]),
      seg(150, 250, 11, ["z4"]),
    ];
    const fit = assignWorkout(segments, workout([{ count: 2, duration_minutes: 20, zone: "z4" }]));
    expect(fit.fits).toBe(true);
    expect(fit.interval_segments).toHaveLength(2);
    expect(fit.interval_segments[0].segment.start_index).not.toBe(
      fit.interval_segments[1].segment.start_index
    );
  });

  it("rejects a workout when no segment matches the requested zone", () => {
    // All segments only support z3, not z4
    const segments = [seg(0, 100, 12, ["z3"]), seg(150, 250, 11, ["z3"])];
    const fit = assignWorkout(segments, workout([{ count: 2, duration_minutes: 20, zone: "z4" }]));
    expect(fit.fits).toBe(false);
  });

  it("rejects a workout where the segment is too short for the duration", () => {
    // 20 min at z4 needs ~10.7km; a 5km segment can't host it
    const segments = [seg(0, 50, 5, ["z4"]), seg(100, 150, 5, ["z4"])];
    const fit = assignWorkout(segments, workout([{ count: 1, duration_minutes: 20, zone: "z4" }]));
    expect(fit.fits).toBe(false);
  });

  it("handles mixed workout blocks (threshold then vo2)", () => {
    const segments = [
      seg(0, 100, 12, ["z4"]),                // threshold segment
      seg(150, 250, 12, ["z4"]),              // threshold segment 2
      seg(300, 320, 3, ["z5"]),               // vo2 segment
      seg(400, 420, 3, ["z5"]),               // vo2 segment 2
      seg(500, 520, 3, ["z5"]),               // vo2 segment 3
    ];
    const fit = assignWorkout(
      segments,
      workout([
        { count: 2, duration_minutes: 20, zone: "z4" },
        { count: 3, duration_minutes: 5, zone: "z5" },
      ])
    );
    expect(fit.fits).toBe(true);
    expect(fit.interval_segments).toHaveLength(5);
    expect(fit.interval_segments.filter((a) => a.interval_index === 0)).toHaveLength(2);
    expect(fit.interval_segments.filter((a) => a.interval_index === 1)).toHaveLength(3);
  });

  it("returns the candidate segments even when it fails", () => {
    const segments = [seg(0, 100, 12, ["z4"])]; // only one z4 segment
    const fit = assignWorkout(segments, workout([{ count: 2, duration_minutes: 20, zone: "z4" }]));
    expect(fit.fits).toBe(false);
    // Should still report what it found as candidates
    expect(fit.candidate_segments.length).toBeGreaterThan(0);
  });
});

function assessment(
  id: string,
  sessionType: WorkoutSessionType,
  startIndex: number,
  minSeconds: number,
  maxSeconds: number
): ApprovedSegmentAssessment {
  return {
    id,
    route_id: "route-1",
    route_version_id: "version-1",
    assessor_name: "Aoife Rider",
    assessed_at: "2026-08-01",
    start_index: startIndex,
    end_index: startIndex + 100,
    direction: "forward",
    session_type: sessionType,
    min_effort_seconds: minSeconds,
    max_effort_seconds: maxSeconds,
    length_km: 10,
    avg_gradient_pct: 1.5,
    max_gradient_pct: 3,
    gradient_variance: 0.5,
    surface_rating: "good",
    traffic_rating: "low",
    sightlines_rating: "clear",
    junction_count: 0,
    entry_notes: "Enter after the bridge.",
    recovery_notes: "Recover on the next quiet lane.",
    runout_notes: "Clear run-out before the junction.",
    hazards_notes: null,
  };
}

describe("assignHumanAssessedWorkout", () => {
  it("matches a threshold effort only inside the human-approved duration range", () => {
    const fit = assignHumanAssessedWorkout(
      [assessment("a1", "threshold", 0, 600, 1200)],
      workout([{ count: 1, duration_minutes: 20, zone: "z4" }])
    );
    expect(fit.fits).toBe(true);
    expect(fit.interval_segments[0].segment.assessment_id).toBe("a1");
    expect(fit.interval_segments[0].segment.assessor_name).toBe("Aoife Rider");
  });

  it("keeps tempo and sweet spot as different human claims even though both are z3", () => {
    const sweetSpotWorkout = workout([{ count: 1, duration_minutes: 12, zone: "z3" }]);
    sweetSpotWorkout.intervals[0].session_type = "sweet_spot";
    sweetSpotWorkout.intervals[0].duration_seconds = 720;

    expect(
      assignHumanAssessedWorkout(
        [assessment("tempo-only", "tempo", 0, 300, 1200)],
        sweetSpotWorkout
      ).fits
    ).toBe(false);
    expect(
      assignHumanAssessedWorkout(
        [assessment("sweet", "sweet_spot", 0, 600, 900)],
        sweetSpotWorkout
      ).fits
    ).toBe(true);
  });

  it("supports effort precision in seconds", () => {
    const secondsWorkout = workout([{ count: 1, duration_minutes: 1.5, zone: "z3" }]);
    secondsWorkout.intervals[0].session_type = "tempo";
    secondsWorkout.intervals[0].duration_seconds = 90;
    expect(
      assignHumanAssessedWorkout(
        [assessment("short-tempo", "tempo", 0, 60, 120)],
        secondsWorkout
      ).fits
    ).toBe(true);
  });

  it("declines VO2, anaerobic and sprint during the Ireland beta", () => {
    const vo2Workout = workout([{ count: 1, duration_minutes: 5, zone: "z5" }]);
    vo2Workout.intervals[0].session_type = "vo2";
    expect(
      assignHumanAssessedWorkout(
        [assessment("vo2", "vo2", 0, 180, 360)],
        vo2Workout
      ).fits
    ).toBe(false);
  });
});
