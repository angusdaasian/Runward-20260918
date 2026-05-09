// HR Zones using the Karvonen %HRR method.
// %HRR = (HR - HRrest) / (HRmax - HRrest)
// Z1 50–60%, Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 ≥90%
// (Anything below 50% HRR is also bucketed into Z1.)

export type ZonePct = { z1: number; z2: number; z3: number; z4: number; z5: number };

export const ZONE_LABELS: Array<{ key: keyof ZonePct; label: string; labelZh: string; color: string }> = [
  { key: "z1", label: "Z1 Recovery",  labelZh: "Z1 恢復",   color: "#94A3B8" },
  { key: "z2", label: "Z2 Easy",      labelZh: "Z2 輕鬆",   color: "#3B82F6" },
  { key: "z3", label: "Z3 Aerobic",   labelZh: "Z3 有氧",   color: "#10B981" },
  { key: "z4", label: "Z4 Threshold", labelZh: "Z4 乳酸閾", color: "#F59E0B" },
  { key: "z5", label: "Z5 Max",       labelZh: "Z5 極限",   color: "#EF4444" },
];

/** Resolve max HR. Priority: explicit profile value > 210 - age > 190. */
export function estimateMaxHr(age?: number | null, profileMaxHr?: number | null): number {
  if (profileMaxHr && profileMaxHr > 100 && profileMaxHr < 230) return profileMaxHr;
  if (age && age > 0 && age < 120) return Math.max(120, 210 - age);
  return 190;
}

/** Resolve resting HR. Priority: explicit profile value > 60 (typical adult). */
export function estimateRestingHr(profileRestingHr?: number | null): number {
  if (profileRestingHr && profileRestingHr >= 30 && profileRestingHr <= 110) return profileRestingHr;
  return 60;
}

/** Validate a custom-zones array: must be 5 ascending integers in plausible bpm range. */
export function isValidCustomZones(z: unknown): z is number[] {
  if (!Array.isArray(z) || z.length !== 5) return false;
  for (let i = 0; i < 5; i++) {
    const v = z[i];
    if (typeof v !== "number" || !isFinite(v) || v < 30 || v > 230) return false;
    if (i > 0 && v <= z[i - 1]) return false;
  }
  return true;
}

/** Bucket a HR (bpm) using explicit zone lower-bounds (Z1..Z5). */
function customZone(bpm: number, lowers: number[]): keyof ZonePct | null {
  if (!isFinite(bpm) || bpm <= 30) return null;
  if (bpm >= lowers[4]) return "z5";
  if (bpm >= lowers[3]) return "z4";
  if (bpm >= lowers[2]) return "z3";
  if (bpm >= lowers[1]) return "z2";
  if (bpm >= lowers[0]) return "z1";
  return "z1"; // anything below Z1 lower bucketed into Z1
}

/** Bucket a HR (bpm) into a zone using %HRR. */
function hrrZone(bpm: number, maxHr: number, restHr: number): keyof ZonePct | null {
  if (!isFinite(bpm) || bpm <= 30) return null;
  const reserve = maxHr - restHr;
  if (reserve <= 0) return null;
  const pct = (bpm - restHr) / reserve;
  if (pct < 0.6) return "z1";
  if (pct < 0.7) return "z2";
  if (pct < 0.8) return "z3";
  if (pct < 0.9) return "z4";
  return "z5";
}

function bucket(bpm: number, maxHr: number, restHr: number, custom?: number[] | null): keyof ZonePct | null {
  if (custom && isValidCustomZones(custom)) return customZone(bpm, custom);
  return hrrZone(bpm, maxHr, restHr);
}

/** Returns lower bound bpm for each zone (Z1..Z5). Honors custom zones if provided. */
export function zoneBoundaries(maxHr: number, restHr: number, custom?: number[] | null): { z1: number; z2: number; z3: number; z4: number; z5: number } {
  if (custom && isValidCustomZones(custom)) {
    return { z1: custom[0], z2: custom[1], z3: custom[2], z4: custom[3], z5: custom[4] };
  }
  const reserve = Math.max(1, maxHr - restHr);
  const at = (p: number) => Math.round(restHr + p * reserve);
  return { z1: at(0.5), z2: at(0.6), z3: at(0.7), z4: at(0.8), z5: at(0.9) };
}

/** Bucket per-second HR samples into zone time-shares (0..100). */
export function computeZonePct(bpmSamples: Array<number | null | undefined>, maxHr: number, restHr: number, custom?: number[] | null): ZonePct | null {
  if (!bpmSamples?.length) return null;
  if (!(custom && isValidCustomZones(custom)) && maxHr <= restHr) return null;
  const counts = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let total = 0;
  for (const v of bpmSamples) {
    if (typeof v !== "number") continue;
    const z = bucket(v, maxHr, restHr, custom);
    if (!z) continue;
    counts[z]++;
    total++;
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
export function combineZonePct(parts: Array<{ samples: Array<number | null | undefined>; maxHr: number; restHr: number; custom?: number[] | null }>): ZonePct | null {
  const acc = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let total = 0;
  for (const p of parts) {
    if (!(p.custom && isValidCustomZones(p.custom)) && p.maxHr <= p.restHr) continue;
    for (const v of p.samples) {
      if (typeof v !== "number") continue;
      const z = bucket(v, p.maxHr, p.restHr, p.custom);
      if (!z) continue;
      acc[z]++;
      total++;
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
