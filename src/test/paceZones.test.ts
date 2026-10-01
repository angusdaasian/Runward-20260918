import { describe, expect, it } from "vitest";
import { computePaceZones } from "@/lib/paceZones";

const run = (daysAgo: number, bpm: number, paceSeconds: number) => ({
  sport_type: "Run",
  start_date: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  average_heartrate: bpm,
  average_speed: 1000 / paceSeconds,
});

describe("computePaceZones", () => {
  it("accumulates runs older than the initial 30-day backfill", () => {
    const zones = computePaceZones(
      [run(120, 125, 390), run(5, 165, 285)],
      { max_heartrate: 190, resting_heartrate: 50 },
    );

    expect(zones).not.toBeNull();
    expect(zones?.runCount).toBe(2);
  });
});