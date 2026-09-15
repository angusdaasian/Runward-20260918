import { describe, it, expect } from "vitest";
import { detectIntervals, roundRepDistance, formatRepDistance } from "@/lib/detectIntervals";

/** Build per-second distance samples from a list of {meters, secPerKm} phases. */
function buildSamples(phases: { meters: number; secPerKm: number }[]) {
  const dist: { t: number; d: number }[] = [];
  const hr: { t: number; bpm: number }[] = [];
  let t = 0;
  let d = 0;
  dist.push({ t, d });
  hr.push({ t, bpm: 120 });
  for (const p of phases) {
    const speed = 1000 / p.secPerKm; // m/s
    const secs = Math.round(p.meters / speed);
    const bpm = p.secPerKm < 350 ? 165 : 135;
    for (let i = 0; i < secs; i++) {
      t += 1;
      d += speed;
      dist.push({ t, d });
      hr.push({ t, bpm });
    }
  }
  return { dist, hr };
}

describe("detectIntervals", () => {
  it("detects an irregular 5k-4k-3k-2k-1k session", () => {
    const { dist, hr } = buildSamples([
      { meters: 5000, secPerKm: 280 },
      { meters: 120, secPerKm: 1550 },
      { meters: 4000, secPerKm: 280 },
      { meters: 110, secPerKm: 1780 },
      { meters: 3000, secPerKm: 272 },
      { meters: 230, secPerKm: 795 },
      { meters: 2000, secPerKm: 267 },
      { meters: 135, secPerKm: 1470 },
      { meters: 1000, secPerKm: 255 },
    ]);
    const res = detectIntervals(dist, hr);
    expect(res).not.toBeNull();
    const reps = res!.segments.filter((s) => s.kind === "rep");
    expect(reps.map((r) => r.roundedDistance)).toEqual([5000, 4000, 3000, 2000, 1000]);
    expect(res!.segments.filter((s) => s.kind === "rest")).toHaveLength(4);
    expect(reps[0].average_heartrate).toBeGreaterThan(150);
  });

  it("labels warm up and cool down", () => {
    const { dist, hr } = buildSamples([
      { meters: 1500, secPerKm: 380 },
      { meters: 1000, secPerKm: 250 },
      { meters: 200, secPerKm: 600 },
      { meters: 1000, secPerKm: 250 },
      { meters: 1200, secPerKm: 390 },
    ]);
    const res = detectIntervals(dist, hr);
    expect(res).not.toBeNull();
    expect(res!.segments[0].kind).toBe("warmup");
    expect(res!.segments[res!.segments.length - 1].kind).toBe("cooldown");
    expect(res!.repCount).toBe(2);
  });

  it("returns null for a steady easy run", () => {
    const { dist, hr } = buildSamples([{ meters: 10000, secPerKm: 330 }]);
    expect(detectIntervals(dist, hr)).toBeNull();
  });

  it("ignores short GPS blips inside a rep", () => {
    const { dist, hr } = buildSamples([
      { meters: 3000, secPerKm: 270 },
      { meters: 15, secPerKm: 900 }, // ~13s road crossing
      { meters: 2000, secPerKm: 270 },
      { meters: 200, secPerKm: 800 },
      { meters: 2000, secPerKm: 270 },
    ]);
    const res = detectIntervals(dist, hr);
    expect(res).not.toBeNull();
    expect(res!.repCount).toBe(2);
  });

  it("rounds rep distances", () => {
    expect(roundRepDistance(4987)).toBe(5000);
    expect(roundRepDistance(806)).toBe(800);
    expect(roundRepDistance(1350)).toBeUndefined();
    expect(formatRepDistance(5000)).toBe("5 km");
    expect(formatRepDistance(400)).toBe("400 m");
  });
});
