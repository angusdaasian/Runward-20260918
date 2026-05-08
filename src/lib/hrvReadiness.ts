import type { TerraDailyHealthRow } from "@/hooks/use-terra-daily-health";
import type { Lang } from "@/lib/i18n";

export interface ReadinessResult {
  score: number;
  band: ReadinessBand;
  hrv7: number | null;
  baselineHrv: number | null;
  baselineSdHrv: number | null;
  deltaPct: number | null;
  rhr7: number | null;
  rhrBaseline: number | null;
  hrvCount7: number;
  todayHrv: number | null;
}

export type ReadinessBand = "primed" | "balanced" | "moderate" | "strained" | "overreached";

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Filter rows for a single provider, sorted ascending by date. */
export function selectProviderRows(
  rows: TerraDailyHealthRow[],
  provider: string,
): TerraDailyHealthRow[] {
  return rows
    .filter((r) => r.provider?.toUpperCase() === provider.toUpperCase())
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Last N HRV samples in chronological order for sparkline. */
export function getHrvSeries(
  rows: TerraDailyHealthRow[],
  days = 7,
): { date: string; hrv: number }[] {
  return rows
    .filter((r) => r.hrv != null)
    .slice(-days)
    .map((r) => ({ date: r.date, hrv: Number(r.hrv) }));
}

export function computeReadiness(rows: TerraDailyHealthRow[]): ReadinessResult {
  // rows expected ascending by date, single provider
  const hrvAll = rows.filter((r) => r.hrv != null).map((r) => Number(r.hrv));
  const last60 = hrvAll.slice(-60);
  const last7 = hrvAll.slice(-7);

  const rhrAll = rows.filter((r) => r.resting_hr != null).map((r) => Number(r.resting_hr));
  const rhr60 = rhrAll.slice(-60);
  const rhr7 = rhrAll.slice(-7);

  const todayHrv = hrvAll.length ? hrvAll[hrvAll.length - 1] : null;

  if (last7.length < 3 || last60.length < 5) {
    return {
      score: 50,
      band: "moderate",
      hrv7: last7.length ? Math.round(mean(last7)) : null,
      baselineHrv: last60.length ? Math.round(mean(last60)) : null,
      baselineSdHrv: last60.length > 1 ? stdev(last60) : null,
      deltaPct: null,
      rhr7: rhr7.length ? Math.round(mean(rhr7)) : null,
      rhrBaseline: rhr60.length ? Math.round(mean(rhr60)) : null,
      hrvCount7: last7.length,
      todayHrv,
    };
  }

  const lnBaseline = mean(last60.map((v) => Math.log(v)));
  const lnBaselineSd = Math.max(stdev(last60.map((v) => Math.log(v))), 0.05);
  const lnRecent = mean(last7.map((v) => Math.log(v)));
  const hrvZ = (lnRecent - lnBaseline) / lnBaselineSd;

  let composite = 0.75 * hrvZ;
  if (rhr60.length >= 5 && rhr7.length >= 3) {
    const rhrSd = Math.max(stdev(rhr60), 1);
    const rhrZ = (mean(rhr60) - mean(rhr7)) / rhrSd; // higher recent RHR -> negative
    composite += 0.25 * rhrZ;
  } else {
    composite = hrvZ; // hrv only
  }

  const score = Math.max(1, Math.min(99, Math.round(50 + composite * 15)));

  const baselineHrv = mean(last60);
  const hrv7Mean = mean(last7);
  const deltaPct = ((hrv7Mean - baselineHrv) / baselineHrv) * 100;

  return {
    score,
    band: scoreToBand(score),
    hrv7: Math.round(hrv7Mean),
    baselineHrv: Math.round(baselineHrv),
    baselineSdHrv: stdev(last60),
    deltaPct: Math.round(deltaPct * 10) / 10,
    rhr7: rhr7.length ? Math.round(mean(rhr7)) : null,
    rhrBaseline: rhr60.length ? Math.round(mean(rhr60)) : null,
    hrvCount7: last7.length,
    todayHrv,
  };
}

export function scoreToBand(score: number): ReadinessBand {
  if (score >= 80) return "primed";
  if (score >= 65) return "balanced";
  if (score >= 45) return "moderate";
  if (score >= 25) return "strained";
  return "overreached";
}

export function getBandMeta(band: ReadinessBand, lang: Lang) {
  const map: Record<ReadinessBand, { en: string; zh: string; color: string; advice: { en: string; zh: string } }> = {
    primed: {
      en: "Primed",
      zh: "狀態極佳",
      color: "text-emerald-500",
      advice: {
        en: "Well recovered — great day for a hard workout, intervals or a race effort.",
        zh: "恢復良好 — 適合高強度訓練、間歇或比賽配速。",
      },
    },
    balanced: {
      en: "Balanced",
      zh: "平衡",
      color: "text-sky-400",
      advice: {
        en: "Recovery is in line with your baseline — train as planned.",
        zh: "恢復狀態正常 — 按計劃訓練即可。",
      },
    },
    moderate: {
      en: "Moderate",
      zh: "中等",
      color: "text-amber-500",
      advice: {
        en: "Slightly below baseline — prefer easy or moderate aerobic work today.",
        zh: "略低於基線 — 建議今天輕鬆或中等強度有氧。",
      },
    },
    strained: {
      en: "Strained",
      zh: "疲勞",
      color: "text-orange-500",
      advice: {
        en: "Recovery is impaired — easy day, mobility, or active recovery only.",
        zh: "恢復不足 — 建議只做輕鬆、伸展或主動恢復。",
      },
    },
    overreached: {
      en: "Overreached",
      zh: "過度疲勞",
      color: "text-red-500",
      advice: {
        en: "Strong fatigue signal — take a rest day, prioritise sleep and nutrition.",
        zh: "強烈疲勞訊號 — 建議休息一天,注重睡眠與營養。",
      },
    },
  };
  const m = map[band];
  return { label: lang === "zh" ? m.zh : m.en, color: m.color, advice: lang === "zh" ? m.advice.zh : m.advice.en };
}
