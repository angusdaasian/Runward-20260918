// Translator: plan day -> Terra Planned Workout payload.
// Terra docs: https://docs.tryterra.co/health-and-fitness-api/managing-user-health-data/write-data
//
// Enum reference (verified against Terra data model docs):
//   step.type         0 = single step, 1 = repeat wrapper
//   duration_type     0 = TIME (seconds), 1 = DISTANCE_METERS (distance_meters), 9 = REPS (reps)
//   target_type       11 = PACE { speed_meters_per_second(_low|_high) }
//   intensity         1 = warmup, 2 = active, 4 = recovery, 5 = cooldown
//   metadata.type     1 = Running (PlannedWorkoutActivityType)
//
// Note: distance duration uses `distance_meters`, NOT `distance`.
// Pace target uses target_type 11 with speed_meters_per_second fields, NOT target_type 6.

export interface PlanDay {
  type?: string | null;
  title?: string | null;
  distance_km?: number | null;
  pace?: string | null;       // "5:30" mm:ss per km
  description?: string | null;
  date?: string | null;       // ISO YYYY-MM-DD
}

function paceSecPerKm(pace?: string | null): number | null {
  if (!pace) return null;
  const m = /^(\d+):(\d{1,2})$/.exec(pace.trim());
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return s > 0 ? s : null;
}

/** Build a pace-band target ±bandSec/km around base pace. target_type=11 (PACE). */
function paceTarget(basePace?: string | null, bandSec = 8) {
  const sec = paceSecPerKm(basePace);
  if (sec == null) return null;
  const low = 1000 / (sec + bandSec);             // slower bound (m/s)
  const high = 1000 / Math.max(sec - bandSec, 1); // faster bound
  return {
    target_type: 11,
    speed_meters_per_second: Number(((low + high) / 2).toFixed(3)),
    speed_meters_per_second_low: Number(low.toFixed(3)),
    speed_meters_per_second_high: Number(high.toFixed(3)),
  };
}

function distanceStep(meters: number, intensity: number, desc: string, target: any, order: number) {
  return {
    type: 0,
    order,
    intensity,
    description: desc,
    durations: [{ duration_type: 1, distance_meters: Math.max(50, Math.round(meters)) }],
    targets: target ? [target] : [],
  };
}

function timeStep(seconds: number, intensity: number, desc: string, target: any, order: number) {
  return {
    type: 0,
    order,
    intensity,
    description: desc,
    durations: [{ duration_type: 0, seconds: Math.max(10, Math.round(seconds)) }],
    targets: target ? [target] : [],
  };
}

function parseIntervals(desc?: string | null): { reps: number; distM: number } | null {
  if (!desc) return null;
  const m = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|km)\b/i.exec(desc);
  if (!m) return null;
  const reps = parseInt(m[1], 10);
  const val = parseFloat(m[2]);
  const distM = m[3].toLowerCase() === "km" ? val * 1000 : val;
  if (reps < 2 || reps > 30 || distM < 100 || distM > 10000) return null;
  return { reps, distM };
}

/** Build the full Terra planned-workout object (single workout) for one plan day. */
export function buildPlannedWorkout(
  day: PlanDay,
  opts: { provider: string; lang?: "en" | "zh" },
): { steps: any[]; metadata: Record<string, unknown> } | null {
  if (!day) return null;
  const type = (day.type ?? "").toString();
  if (type === "Rest") return null;
  const totalKm = Number(day.distance_km);
  if (!Number.isFinite(totalKm) || totalKm <= 0) return null;

  const lang = opts.lang ?? "en";
  const isTrail = type === "Trail Run" || type === "Trail Race";
  const easyPaceTarget = paceTarget(day.pace, 10);
  const tightPaceTarget = paceTarget(day.pace, 5);
  const mainTarget = isTrail ? null : (type === "Intervals" || type === "Tempo" ? tightPaceTarget : easyPaceTarget);

  const name = (day.title || type || (lang === "zh" ? "訓練" : "Workout")).slice(0, 60);
  const description = (day.description || name).split("\n")[0].slice(0, 200);
  const basePaceSec = paceSecPerKm(day.pace);
  const estimatedSec = basePaceSec ? Math.round(basePaceSec * totalKm) : Math.round(totalKm * 360);

  let steps: any[];
  let order = 0;

  if (type === "Intervals") {
    const parsed = parseIntervals(day.description);
    if (parsed) {
      const warmupM = 1000;
      const cooldownM = 1000;
      const restSec = 90;
      steps = [
        distanceStep(warmupM, 1, "Warm Up", easyPaceTarget, order++),
        {
          type: 1,
          order: order++,
          description: `Intervals ${parsed.reps}x${parsed.distM}m`,
          durations: [{ duration_type: 9, reps: parsed.reps }],
          steps: [
            distanceStep(parsed.distM, 2, "Work", tightPaceTarget, 0),
            timeStep(restSec, 4, "Recovery jog", easyPaceTarget, 1),
          ],
        },
        distanceStep(cooldownM, 5, "Cool Down", easyPaceTarget, order++),
      ];
    } else {
      steps = [distanceStep(totalKm * 1000, 2, type, mainTarget, order++)];
    }
  } else if (type === "Tempo" && totalKm > 4) {
    const warmupM = 1000;
    const cooldownM = 1000;
    const tempoM = Math.max(1000, totalKm * 1000 - warmupM - cooldownM);
    steps = [
      distanceStep(warmupM, 1, "Warm Up", easyPaceTarget, order++),
      distanceStep(tempoM, 2, "Tempo", tightPaceTarget, order++),
      distanceStep(cooldownM, 5, "Cool Down", easyPaceTarget, order++),
    ];
  } else {
    steps = [distanceStep(totalKm * 1000, 2, type || "Run", mainTarget, order++)];
  }

  const metadata: Record<string, unknown> = {
    type: 1, // Running
    name,
    description,
    provider: opts.provider,
    estimated_duration_seconds: estimatedSec,
    estimated_distance_meters: Math.round(totalKm * 1000),
  };
  if (day.date) metadata.planned_date = day.date;

  return { steps, metadata };
}
