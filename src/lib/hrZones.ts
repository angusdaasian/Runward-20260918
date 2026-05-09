// HR Zones (5-zone model based on % of max HR)
// Z1 <60%, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 ≥90%

export type ZonePct = { z1: number; z2: number; z3: number; z4: number; z5: number };

export const ZONE_LABELS: Array<{ key: keyof ZonePct; label: string; labelZh: string; color: string }> = [
  { key: "z1", label: "Z1 Recovery", labelZh: "Z1 恢復", color: "#94A3B8" },
  { key: "z2", label: "Z2 Easy",     labelZh: "Z2 輕鬆", color: "#3B82F6" },
  { key: "z3", label: "Z3 Aerobic",  labelZh: "Z3 有氧", color: "#10B981" },
  { key: "z4", label: "Z4 Threshold",labelZh: "Z4 乳酸閾", color: "#F59E0B" },
  { key: "z5", label: "Z5 Max",      labelZh: "Z5 極限",  color: "#EF4444" },
];

export function estimateMaxHr(age?: number | null, fallbackActivityMaxHr?: number | null): number {
  if (age && age > 0 && age < 120) return Math.max(120, 220 - age);
  if (fallbackActivityMaxHr && fallbackActivityMaxHr > 130) return fallbackActivityMaxHr;
  return 190;
}

/** Bucket per-second HR samples into zone time-shares (0..100). */
export function computeZonePct(bpmSamples: Array<number | null | undefined>, maxHr: number): ZonePct | null {
  if (!bpmSamples?.length || maxHr <= 0) return null;
  const counts = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let total = 0;
  for (const v of bpmSamples) {
    if (typeof v !== "number" || !isFinite(v) || v <= 30) continue;
    const pct = v / maxHr;
    total++;
    if (pct < 0.6) counts.z1++;
    else if (pct < 0.7) counts.z2++;
    else if (pct < 0.8) counts.z3++;
    else if (pct < 0.9) counts.z4++;
    else counts.z5++;
  }
  if (total === 0) return null;
  return {
    z1: (counts.z1 / total) * 100,
    z2: (counts.z2 / total) * 100,
    z3: (counts.z3 / total) * 100,
    z4: (counts.z4 / total) * 100,
    z5: (counts.z5 / total) * 100,
  };
}

/** Combine multiple per-second sample arrays (weighted by sample count = seconds). */
export function combineZonePct(parts: Array<{ samples: Array<number | null | undefined>; maxHr: number }>): ZonePct | null {
  const acc = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let total = 0;
  for (const p of parts) {
    for (const v of p.samples) {
      if (typeof v !== "number" || !isFinite(v) || v <= 30) continue;
      const pct = v / p.maxHr;
      total++;
      if (pct < 0.6) acc.z1++;
      else if (pct < 0.7) acc.z2++;
      else if (pct < 0.8) acc.z3++;
      else if (pct < 0.9) acc.z4++;
      else acc.z5++;
    }
  }
  if (total === 0) return null;
  return {
    z1: (acc.z1 / total) * 100,
    z2: (acc.z2 / total) * 100,
    z3: (acc.z3 / total) * 100,
    z4: (acc.z4 / total) * 100,
    z5: (acc.z5 / total) * 100,
  };
}
