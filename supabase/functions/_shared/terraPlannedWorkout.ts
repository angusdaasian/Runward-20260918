// Translator: plan day -> Terra Planned Workout payload.
// Terra docs: https://docs.tryterra.co/health-and-fitness-api/managing-user-health-data/write-data
//
// Enum reference (from Terra examples):
//   step.type        0 = single step, 1 = repeat wrapper
//   duration_type    0 = time(seconds), 1 = distance(meters), 9 = reps (for repeat wrappers)
//   target_type      6 = pace band (m/s low/high)
//   intensity        1 = warmup, 2 = active, 4 = recovery, 5 = cooldown
//
// We push pace-band targets (per user choice). HR/power omitted.

export interface PlanDay {
  type?: string | null;       // "Easy" | "Long" | "Tempo" | "Intervals" | "Recovery" | "Race" | "Trail Run" | "Trail Race" | "Rest"
  title?: string | null;
  distance_km?: number | null;
  pace?: string | null;       // "5:30" mm:ss per km
  description?: string | null;
  date?: string | null;
}

/** Convert "mm:ss" per km -> meters/second. */
function paceToMps(pace?: string | null): number | null {
  if (!pace) return null;
  const m = /^(\d+):(\d{1,2})$/.exec(pace.trim());
  if (!m) return null;
  const secPerKm = Number(m[1]) * 60 + Number(m[2]);
  if (secPerKm <= 0) return null;
  return 1000 / secPerKm;
}

/** Build a pace-band target ±bandSec/km around base pace. */
function paceTarget(basePace?: string | null, bandSec = 8) {
  if (!basePace) return null;
  const m = /^(\d+):(\d{1,2})$/.exec(basePace.trim());
  if (!m) return null;
  const secPerKm = Number(m[1]) * 60 + Number(m[2]);
  const low = 1000 / (secPerKm + bandSec);   // slower pace = lower m/s
  const high = 1000 / Math.max(secPerKm - bandSec, 1);
  return {
    target_type: 6,
    pace_low: Number(low.toFixed(3)),
    pace_high: Number(high.toFixed(3)),
    pace: Number(((low + high) / 2).toFixed(3)),
  };
}

function distanceStep(meters: number, intensity: number, desc: string, target: any) {
  return {
    type: 0,
    order: 0,
    intensity,
    description: desc,
    durations: [{ duration_type: 1, distance: Math.max(50, Math.round(meters)) }],
    targets: target ? [target] : [],
  };
}

function timeStep(seconds: number, intensity: number, desc: string, target: any) {
  return {
    type: 0,
    order: 0,
    intensity,
    description: desc,
    durations: [{ duration_type: 0, seconds: Math.max(10, Math.round(seconds)) }],
    targets: target ? [target] : [],
  };
}

/** Parse "6 x 800m" / "8x400" / "5×1km" from a description. Returns {reps, dist_m} or null. */
function parseIntervals(desc?: string | null): { reps: number; distM: number } | null {
  if (!desc) return null;
  const re = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|km)\b/i;
  const m = re.exec(desc);
  if (!m) return null;
  const reps = parseInt(m[1], 10);
  const val = parseFloat(m[2]);
  const distM = m[3].toLowerCase() === "km" ? val * 1000 : val;
  if (reps < 2 || reps > 30 || distM < 100 || distM > 10000) return null;
  return { reps, distM };
}

/** Build the Terra steps[] for a single plan day. Returns null if not pushable. */
export function buildPlannedWorkout(day: PlanDay, lang: "en" | "zh" = "en"): {
  name: string;
  description: string;
  steps: any[];
} | null {
  if (!day) return null;
  const type = (day.type ?? "").toString();
  if (type === "Rest") return null;
  const totalKm = Number(day.distance_km);
  if (!Number.isFinite(totalKm) || totalKm <= 0) return null;

  const isTrail = type === "Trail Run" || type === "Trail Race";
  const easyPaceTarget = paceTarget(day.pace, 10);
  const tightPaceTarget = paceTarget(day.pace, 5);
  const mainTarget = isTrail ? null : (type === "Intervals" || type === "Tempo" ? tightPaceTarget : easyPaceTarget);

  const name = (day.title || type || (lang === "zh" ? "訓練" : "Workout")).slice(0, 60);
  const description = (day.description || name).split("\n")[0].slice(0, 200);

  // INTERVALS
  if (type === "Intervals") {
    const parsed = parseIntervals(day.description);
    if (parsed) {
      const warmupM = 1000;
      const cooldownM = 1000;
      const restSec = 90;
      const workTarget = tightPaceTarget;
      const recoveryTarget = easyPaceTarget;
      return {
        name, description,
        steps: [
          distanceStep(warmupM, 1, "Warm Up", easyPaceTarget),
          {
            type: 1,
            order: 1,
            description: `Intervals ${parsed.reps}x${parsed.distM}m`,
            durations: [{ duration_type: 9, reps: parsed.reps }],
            steps: [
              distanceStep(parsed.distM, 2, "Work", workTarget),
              timeStep(restSec, 4, "Recovery jog", recoveryTarget),
            ],
          },
          distanceStep(cooldownM, 5, "Cool Down", easyPaceTarget),
        ],
      };
    }
    // Fallback: single distance block
  }

  // TEMPO — warmup + tempo + cooldown
  if (type === "Tempo" && totalKm > 4) {
    const warmupM = 1000;
    const cooldownM = 1000;
    const tempoM = Math.max(1000, totalKm * 1000 - warmupM - cooldownM);
    return {
      name, description,
      steps: [
        distanceStep(warmupM, 1, "Warm Up", easyPaceTarget),
        distanceStep(tempoM, 2, "Tempo", tightPaceTarget),
        distanceStep(cooldownM, 5, "Cool Down", easyPaceTarget),
      ],
    };
  }

  // EASY / LONG / RECOVERY / RACE / TRAIL — single distance block
  return {
    name, description,
    steps: [distanceStep(totalKm * 1000, 2, type || "Run", mainTarget)],
  };
}
