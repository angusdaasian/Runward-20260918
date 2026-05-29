/**
 * Classify a running activity into a run type (Easy / Tempo / Interval / Long / Recovery)
 * using heart-rate zones + distance. No per-second samples required —
 * just average_heartrate, max_heartrate, distance and moving time.
 */
import { estimateMaxHr, estimateRestingHr, zoneBoundaries } from "@/lib/hrZones";

export type RunType = "Easy" | "Tempo" | "Interval" | "Long" | "Recovery";

export interface RunActivity {
  distance: number;           // meters
  moving_time?: number;       // seconds
  elapsed_time?: number;
  sport_type?: string;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
}

export interface ClassifierContext {
  age?: number | null;
  profileMaxHr?: number | null;
  profileRestingHr?: number | null;
  customZones?: number[] | null;
}

const RUN_SPORT_RE = /run/i;
export function isRunSport(sport?: string): boolean {
  if (!sport) return true; // assume run when unknown
  return RUN_SPORT_RE.test(sport);
}

function zoneOf(bpm: number, b: ReturnType<typeof zoneBoundaries>): 1 | 2 | 3 | 4 | 5 {
  if (bpm >= b.z5) return 5;
  if (bpm >= b.z4) return 4;
  if (bpm >= b.z3) return 3;
  if (bpm >= b.z2) return 2;
  return 1;
}

export function classifyRun(
  act: RunActivity,
  ctx: ClassifierContext,
  longestKmInScope: number,
): RunType {
  const maxHr = estimateMaxHr(ctx.age, ctx.profileMaxHr);
  const restHr = estimateRestingHr(ctx.profileRestingHr);
  const b = zoneBoundaries(maxHr, restHr, ctx.customZones);

  const km = act.distance / 1000;
  const avg = typeof act.average_heartrate === "number" ? act.average_heartrate : null;
  const max = typeof act.max_heartrate === "number" ? act.max_heartrate : null;

  // No HR data — distance-only fallback.
  if (!avg || avg <= 30) {
    if (km >= Math.max(15, longestKmInScope * 0.75)) return "Long";
    if (km < 4) return "Recovery";
    return "Easy";
  }

  const avgZone = zoneOf(avg, b);
  const maxZone = max ? zoneOf(max, b) : avgZone;
  const spike = max && avg ? max - avg : 0;

  if (maxZone >= 5 || (maxZone === 4 && spike >= 25)) return "Interval";
  if (avgZone >= 4) return "Tempo";
  if (km >= Math.max(15, longestKmInScope * 0.75) && avgZone <= 3) return "Long";
  if (avgZone <= 1 || (km < 4 && avgZone <= 2)) return "Recovery";
  return "Easy";
}

export interface RunTypeSummaryItem {
  type: RunType;
  count: number;
  color: string;
}

const TYPE_COLORS: Record<RunType, string> = {
  Recovery: "#94A3B8",
  Easy: "#3B82F6",
  Long: "#8B5CF6",
  Tempo: "#F59E0B",
  Interval: "#EF4444",
};

export const RUN_TYPE_LABELS_EN: Record<RunType, string> = {
  Recovery: "Recovery",
  Easy: "Easy",
  Long: "Long",
  Tempo: "Tempo",
  Interval: "Interval",
};

export const RUN_TYPE_LABELS_ZH: Record<RunType, string> = {
  Recovery: "恢復跑",
  Easy: "輕鬆跑",
  Long: "長課",
  Tempo: "節奏跑",
  Interval: "間歇",
};

export function summarizeRunTypes(
  activities: RunActivity[],
  ctx: ClassifierContext,
): RunTypeSummaryItem[] {
  const runs = activities.filter((a) => isRunSport(a.sport_type) && a.distance > 0);
  if (runs.length === 0) return [];
  const longest = runs.reduce((m, r) => Math.max(m, r.distance / 1000), 0);

  const counts: Record<RunType, number> = { Recovery: 0, Easy: 0, Long: 0, Tempo: 0, Interval: 0 };
  for (const r of runs) {
    counts[classifyRun(r, ctx, longest)]++;
  }

  return (Object.keys(counts) as RunType[])
    .filter((t) => counts[t] > 0)
    .map((t) => ({ type: t, count: counts[t], color: TYPE_COLORS[t] }))
    .sort((a, b) => b.count - a.count);
}
