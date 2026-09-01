import { describe, expect, it } from "vitest";
import { enforceAdjustedSchedule } from "../../supabase/functions/_shared/planDaySwaps";

const day = (date: string, type: string, extra: Record<string, unknown> = {}) => ({
  date,
  type,
  title: type,
  distance_km: type === "Rest" ? null : 10,
  ...extra,
});

describe("enforceAdjustedSchedule", () => {
  it("keeps a completed interval and converts the duplicate future interval to recovery", () => {
    const before = [{ week: 1, days: [day("2026-09-01", "Interval"), day("2026-09-02", "Interval")] }];
    const adjusted = structuredClone(before);
    const result = enforceAdjustedSchedule(before as never, adjusted as never, "2026-09-02");
    expect(result[0].days?.map((item) => item.type)).toEqual(["Interval", "Recovery"]);
  });

  it("removes stale interval sessions when the top-level workout becomes recovery", () => {
    const before = [{ week: 1, days: [day("2026-09-03", "Interval", { sessions: [{ type: "Interval", steps: [{ kind: "interval" }] }] })] }];
    const adjusted = [{ week: 1, days: [day("2026-09-03", "Recovery", { sessions: [{ type: "Interval", steps: [{ kind: "interval" }] }] })] }];
    const result = enforceAdjustedSchedule(before as never, adjusted as never, "2026-09-01");
    expect(result[0].days?.[0].type).toBe("Recovery");
    expect((result[0].days?.[0] as { sessions?: unknown }).sessions).toBeUndefined();
  });

  it("keeps only one future interval in a week", () => {
    const before = [{ week: 1, days: [day("2026-09-03", "Interval"), day("2026-09-04", "Easy Run"), day("2026-09-05", "Easy Run")] }];
    const adjusted = [{ week: 1, days: [day("2026-09-03", "Interval"), day("2026-09-04", "Easy Run"), day("2026-09-05", "Interval")] }];
    const result = enforceAdjustedSchedule(before as never, adjusted as never, "2026-09-01");
    expect(result[0].days?.filter((item) => item.type === "Interval")).toHaveLength(1);
  });

  it("adds a recovery buffer between adjacent hard workouts", () => {
    const before = [{ week: 1, days: [day("2026-09-03", "Interval"), day("2026-09-04", "Easy Run")] }];
    const adjusted = [{ week: 1, days: [day("2026-09-03", "Interval"), day("2026-09-04", "Tempo Run")] }];
    const result = enforceAdjustedSchedule(before as never, adjusted as never, "2026-09-01");
    expect(result[0].days?.map((item) => item.type)).toEqual(["Interval", "Recovery"]);
  });

  it("does not alter two completed past key sessions", () => {
    const before = [{ week: 1, days: [day("2026-08-30", "Interval"), day("2026-08-31", "Tempo Run")] }];
    const adjusted = structuredClone(before);
    const result = enforceAdjustedSchedule(before as never, adjusted as never, "2026-09-01");
    expect(result[0].days?.map((item) => item.type)).toEqual(["Interval", "Tempo Run"]);
  });
});