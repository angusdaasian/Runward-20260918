// Translator: plan day -> Terra Planned Workout payload.
// Terra docs: https://docs.tryterra.co/health-and-fitness-api/managing-user-health-data/write-data
//
// Enum reference (verified against Terra data model docs):
//   step.type         0 = single step, 1 = repeat wrapper
//   duration_type     0 = TIME (seconds), 1 = DISTANCE_METERS (distance_meters), 9 = REPS (reps)
//   target_type       11 = PACE { speed_meters_per_second(_low|_high) }
//   intensity         1 = warmup, 2 = cooldown, 3 = recovery, 4 = interval, 5 = active
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
  const m = /^(\d+)\s*[:']\s*(\d{1,2})(?:\s*(?:\/\s*k(?:m)?|min\s*\/\s*k(?:m)?))?$/i.exec(pace.trim());
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return s > 0 ? s : null;
}

function normalizeType(type?: string | null): string {
  const t = (type ?? "").toString().trim().toLowerCase();
  if (t.includes("interval")) return "Intervals";
  if (t.includes("tempo")) return "Tempo";
  if (t.includes("recovery")) return "Recovery Run";
  if (t.includes("long")) return "Long Run";
  if (t.includes("trail")) return "Trail Run";
  if (t.includes("easy")) return "Easy Run";
  if (t === "rest") return "Rest";
  return type?.trim() || "Run";
}

function watchText(value: string | null | undefined, fallback: string): string {
  // Garmin/Coros both accept UTF-8 (incl. CJK) in workout names/descriptions.
  // Strip only control characters; keep ASCII printable + extended Unicode.
  const text = (value || "").replace(/[\x00-\x1F\x7F]/g, "").trim();
  return (text || fallback).slice(0, 60);
}

// Localized step labels.
const L = {
  en: { warmup: "Warm Up", cooldown: "Cool Down", work: "Work", recovery: "Recovery", tempo: "Tempo", easy: "Easy Run", long: "Long Run", recoveryRun: "Recovery Run", trail: "Trail Run", run: "Run", intervals: "Intervals" },
  zh: { warmup: "熱身", cooldown: "緩和", work: "主項", recovery: "恢復", tempo: "節奏跑", easy: "輕鬆跑", long: "長距離跑", recoveryRun: "恢復跑", trail: "越野跑", run: "跑步", intervals: "間歇跑" },
} as const;

function typeLabel(type: string, lang: "en" | "zh"): string {
  const d = L[lang];
  switch (type) {
    case "Intervals": return d.intervals;
    case "Tempo": return d.tempo;
    case "Easy Run": return d.easy;
    case "Long Run": return d.long;
    case "Recovery Run": return d.recoveryRun;
    case "Trail Run": return d.trail;
    default: return d.run;
  }
}

function paceLabel(pace?: string | null): string {
  const sec = paceSecPerKm(pace);
  if (sec == null) return "";
  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}/km`;
}

function stepDesc(label: string, pace?: string | null): string {
  const p = paceLabel(pace);
  return p ? `${label} @ ${p}` : label;
}

function canonicalWorkoutText(value?: string | null): string {
  return (value || "")
    .replace(/[\s@/:：,，.。()（）-]+/g, "")
    .trim()
    .toLowerCase();
}

function isOnlyWorkoutName(text: string, candidates: Array<string | null | undefined>): boolean {
  const normalized = canonicalWorkoutText(text);
  return !!normalized && candidates.some((candidate) => canonicalWorkoutText(candidate) === normalized);
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

function repeatOnce(step: any, description: string, order: number) {
  return {
    type: 1,
    order,
    description,
    durations: [{ duration_type: 9, reps: 1 }],
    steps: [{ ...step, order: 0 }],
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

function parseIntervals(desc?: string | null): { reps: number; distM: number; restSec: number } | null {
  if (!desc) return null;
  const repsFirst = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|km)\b/i.exec(desc);
  const distFirst = /(\d+(?:\.\d+)?)\s*(m|km)\s*[x×]\s*(\d+)\b/i.exec(desc);
  if (!repsFirst && !distFirst) return null;
  const reps = repsFirst ? parseInt(repsFirst[1], 10) : parseInt(distFirst![3], 10);
  const val = parseFloat(repsFirst ? repsFirst[2] : distFirst![1]);
  const unit = (repsFirst ? repsFirst[3] : distFirst![2]).toLowerCase();
  const distM = unit === "km" ? val * 1000 : val;
  if (reps < 2 || reps > 30 || distM < 100 || distM > 10000) return null;
  const rest = /rest\s+(\d+)(?::(\d{1,2}))?/i.exec(desc);
  const restSec = rest ? Number(rest[1]) * (rest[2] ? 60 : 1) + Number(rest[2] ?? 0) : 90;
  return { reps, distM, restSec: Math.max(15, Math.min(restSec, 600)) };
}

function formatRest(restSec: number): string {
  const mm = Math.floor(restSec / 60);
  const ss = String(restSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatIntervalDescription(parsed: { reps: number; distM: number; restSec: number }, pace: string | null | undefined, lang: "en" | "zh"): string {
  const dist = parsed.distM >= 1000 && parsed.distM % 1000 === 0 ? `${parsed.distM / 1000}km` : `${Math.round(parsed.distM)}m`;
  const p = paceLabel(pace);
  if (lang === "zh") {
    return `${dist} x ${parsed.reps}${p ? ` 以 ${p}` : ""}，組間恢復 ${formatRest(parsed.restSec)}`;
  }
  return `${dist} x ${parsed.reps}${p ? ` at ${p}` : ""}, rest ${formatRest(parsed.restSec)} between sets`;
}

/** Build the full Terra planned-workout object (single workout) for one plan day. */
export function buildPlannedWorkout(
  day: PlanDay,
  opts: { provider: string; lang?: "en" | "zh" },
): { steps: any[]; metadata: Record<string, unknown> } | null {
  if (!day) return null;
  const type = normalizeType(day.type);
  if (type === "Rest") return null;
  const totalKm = Number(day.distance_km);
  if (!Number.isFinite(totalKm) || totalKm <= 0) return null;

  const lang = opts.lang ?? "en";
  const isTrail = type === "Trail Run" || type === "Trail Race";
  const easyPaceTarget = paceTarget(day.pace, 10);
  const tightPaceTarget = paceTarget(day.pace, 5);
  const mainTarget = isTrail ? null : (type === "Intervals" || type === "Tempo" ? tightPaceTarget : easyPaceTarget);

  const d = L[lang];
  const localizedType = typeLabel(type, lang);
  const name = watchText(day.title, localizedType);
  const baseDesc = (day.description || "").split("\n")[0] || stepDesc(localizedType, day.pace);
  const description = watchText(baseDesc, stepDesc(localizedType, day.pace)).slice(0, 200);
  const basePaceSec = paceSecPerKm(day.pace);
  const estimatedSec = basePaceSec ? Math.round(basePaceSec * totalKm) : Math.round(totalKm * 360);

  const warmupDesc = stepDesc(d.warmup, day.pace);
  const cooldownDesc = stepDesc(d.cooldown, day.pace);

  let steps: any[];
  let order = 0;

  if (type === "Intervals") {
    const parsed = parseIntervals(day.description);
    if (parsed) {
      const warmupM = 1000;
      const cooldownM = 1000;
      const intervalSteps: any[] = [
        repeatOnce(distanceStep(warmupM, 1, warmupDesc, easyPaceTarget, 0), warmupDesc, order++),
      ];
      for (let i = 1; i <= parsed.reps; i++) {
        const workDesc = stepDesc(`${d.work} ${i}`, day.pace);
        intervalSteps.push(repeatOnce(distanceStep(parsed.distM, 4, workDesc, tightPaceTarget, 0), workDesc, order++));
        if (i < parsed.reps) {
          const recDesc = `${d.recovery} ${i}`;
          intervalSteps.push(repeatOnce(timeStep(parsed.restSec, 3, recDesc, easyPaceTarget, 0), recDesc, order++));
        }
      }
      intervalSteps.push(repeatOnce(distanceStep(cooldownM, 2, cooldownDesc, easyPaceTarget, 0), cooldownDesc, order++));
      steps = intervalSteps;
    } else {
      const dsc = stepDesc(localizedType, day.pace);
      steps = [repeatOnce(distanceStep(totalKm * 1000, 5, dsc, mainTarget, 0), dsc, order++)];
    }
  } else if (type === "Tempo" && totalKm > 4) {
    const warmupM = 1000;
    const cooldownM = 1000;
    const tempoM = Math.max(1000, totalKm * 1000 - warmupM - cooldownM);
    const tempoDesc = stepDesc(d.tempo, day.pace);
    steps = [
      repeatOnce(distanceStep(warmupM, 1, warmupDesc, easyPaceTarget, 0), warmupDesc, order++),
      repeatOnce(distanceStep(tempoM, 5, tempoDesc, tightPaceTarget, 0), tempoDesc, order++),
      repeatOnce(distanceStep(cooldownM, 2, cooldownDesc, easyPaceTarget, 0), cooldownDesc, order++),
    ];
  } else {
    const dsc = stepDesc(localizedType, day.pace);
    steps = [repeatOnce(distanceStep(totalKm * 1000, 5, dsc, mainTarget, 0), dsc, order++)];
  }

  const metadata: Record<string, unknown> = {
    type: 1, // Running
    name,
    description,
    provider: opts.provider,
    estimated_duration_seconds: estimatedSec,
    estimated_distance_meters: Math.round(totalKm * 1000),
    estimated_speed_meters_per_second: Number((Math.round(totalKm * 1000) / Math.max(estimatedSec, 1)).toFixed(3)),
    created_date: new Date().toISOString().slice(0, 10),
  };
  if (day.date) metadata.planned_date = day.date;

  return { steps, metadata };
}
