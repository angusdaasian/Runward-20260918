import type { Lang } from "@/lib/i18n";
import type { ReadinessResult } from "@/lib/hrvReadiness";

/* ---------------- Descriptions (matches in-card info tooltips) ---------------- */

export const READINESS_INFO = {
  en:
    "Our 0–100 training-readiness score. Starts from physio recovery (HRV z-score, RHR z-score, sleep score, sleep debt vs your 60-day baseline) and then layers in training context: TSB (form), ACWR (acute:chronic load), and Foster monotony. This is intentionally different from the raw WHOOP Recovery / Oura Readiness / Garmin Body Battery number shown below — those are pure physio, ours adds the training-load lens your wearable doesn't see.",
  zh:
    "我們的 0–100 訓練準備度分數。先以生理恢復為基礎(HRV z 分數、靜息心率 z 分數、睡眠分數、相對於 60 天基線的睡眠負債),再疊加訓練脈絡:TSB(狀態)、ACWR(急:慢負荷)與 Foster 單一性。刻意有別於下方顯示的 WHOOP Recovery / Oura Readiness / Garmin Body Battery 等純生理數字 — 我們再加上穿戴裝置看不到的訓練負荷視角。",
};

export const INJURY_INFO = {
  en:
    "0–100 index that adds points for: ACWR > 1.3 or > 1.5, CTL ramp rate > 5 / 7 / 10 per week, Foster monotony > 2 or > 2.5, HRV decline (z < -1 or < -1.5), and sleep debt above 1 h or 1.7 h/night below need. <25 low, 25–59 moderate, ≥60 severe.",
  zh:
    "0–100 受傷風險指數,以下情況會加分:ACWR > 1.3 或 > 1.5、CTL 每週增長率 > 5 / 7 / 10、Foster 單一性 > 2 或 > 2.5、HRV 下降(z < -1 或 < -1.5),以及每晚睡眠負債高於 1 小時或 1.7 小時。<25 低,25–59 中等,≥60 嚴重。",
};

export const LOAD_INFO = {
  en:
    "ACWR (Acute:Chronic Workload Ratio) = mean load over last 7d / mean load over last 28d. Sweet spot 0.8–1.3. Foster monotony = mean(7d load) / SD(7d load); > 2 means too samey.",
  zh:
    "ACWR(急性:慢性負荷比)= 近 7 天平均負荷 / 近 28 天平均負荷。最佳區間 0.8–1.3。Foster 單一性 = 平均(7天負荷)/ 標準差(7天負荷);> 2 代表訓練太單調。",
};

export function tInfo(key: "readiness" | "injury" | "load", lang: Lang) {
  const m = key === "readiness" ? READINESS_INFO : key === "injury" ? INJURY_INFO : LOAD_INFO;
  return lang === "zh" ? m.zh : m.en;
}

/* ---------------- Injury risk (shared, spec-aligned) ---------------- */

export interface InjuryInput {
  acwr: number;
  monotony: number;
  acute: number;          // 7d total load
  tsb: number;
  ctlRampPerWeek: number; // CTL change per week (last 7d vs prior 7d)
  hrvZ: number | null;    // z-score (recent vs baseline) — negative is bad
  sleepDebtPerNightHours: number | null; // avg nightly debt vs target
  readinessScore: number | null;
}

export interface InjuryDriver {
  en: string;
  zh: string;
  weight: number;
}

export interface InjuryResult {
  score: number;
  drivers: InjuryDriver[];
}

export function computeInjuryRisk(input: InjuryInput): InjuryResult {
  let score = 0;
  const drivers: InjuryDriver[] = [];

  // ACWR — tiered (>1.3 minor, >1.5 major)
  if (input.acwr > 1.5) {
    const w = Math.min(30, 15 + (input.acwr - 1.5) * 50);
    score += w;
    drivers.push({ en: "ACWR spike (>1.5)", zh: "ACWR 急升(>1.5)", weight: w });
  } else if (input.acwr > 1.3) {
    const w = 10 + (input.acwr - 1.3) * 40; // 10–18
    score += w;
    drivers.push({ en: "ACWR elevated (>1.3)", zh: "ACWR 偏高(>1.3)", weight: w });
  } else if (input.acwr > 0 && input.acwr < 0.5 && input.acute > 0) {
    score += 8;
    drivers.push({ en: "Detraining", zh: "訓練不足", weight: 8 });
  }

  // CTL ramp rate >5/7/10 per week
  if (input.ctlRampPerWeek > 10) {
    score += 20;
    drivers.push({ en: "CTL ramp >10/wk", zh: "CTL 週增 >10", weight: 20 });
  } else if (input.ctlRampPerWeek > 7) {
    score += 12;
    drivers.push({ en: "CTL ramp >7/wk", zh: "CTL 週增 >7", weight: 12 });
  } else if (input.ctlRampPerWeek > 5) {
    score += 6;
    drivers.push({ en: "CTL ramp >5/wk", zh: "CTL 週增 >5", weight: 6 });
  }

  // Foster monotony >2 / >2.5
  if (input.monotony > 2.5) {
    score += 15;
    drivers.push({ en: "Monotony >2.5", zh: "單一性 >2.5", weight: 15 });
  } else if (input.monotony > 2) {
    score += 8;
    drivers.push({ en: "Monotony >2", zh: "單一性 >2", weight: 8 });
  }

  // HRV decline (z < -1 or < -1.5)
  if (input.hrvZ != null) {
    if (input.hrvZ < -1.5) {
      score += 18;
      drivers.push({ en: "HRV decline (z<-1.5)", zh: "HRV 下降(z<-1.5)", weight: 18 });
    } else if (input.hrvZ < -1) {
      score += 10;
      drivers.push({ en: "HRV decline (z<-1)", zh: "HRV 下降(z<-1)", weight: 10 });
    }
  }

  // Sleep debt per night >1h / >1.7h
  if (input.sleepDebtPerNightHours != null) {
    if (input.sleepDebtPerNightHours > 1.7) {
      score += 18;
      drivers.push({ en: "Sleep debt >1.7h/night", zh: "每晚睡眠負債 >1.7h", weight: 18 });
    } else if (input.sleepDebtPerNightHours > 1) {
      score += 10;
      drivers.push({ en: "Sleep debt >1h/night", zh: "每晚睡眠負債 >1h", weight: 10 });
    }
  }

  // Deep fatigue from TSB
  if (input.tsb < -25) {
    score += 12;
    drivers.push({ en: "Deep fatigue (TSB<-25)", zh: "深度疲勞(TSB<-25)", weight: 12 });
  } else if (input.tsb < -15) {
    score += 6;
    drivers.push({ en: "Fatigued (TSB<-15)", zh: "疲勞(TSB<-15)", weight: 6 });
  }

  // Cross-check: low readiness
  if (input.readinessScore != null && input.readinessScore < 35) {
    score += 8;
    drivers.push({ en: "Low readiness", zh: "準備度低", weight: 8 });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  drivers.sort((a, b) => b.weight - a.weight);
  return { score, drivers };
}

/** Spec-aligned banding: <25 low, 25–59 moderate, ≥60 severe. */
export function injuryBand(score: number, lang: Lang) {
  if (score < 25) return { label: lang === "zh" ? "低" : "Low", color: "text-emerald-600" };
  if (score < 60) return { label: lang === "zh" ? "中等" : "Moderate", color: "text-amber-500" };
  return { label: lang === "zh" ? "嚴重" : "Severe", color: "text-rose-600" };
}

/* ---------------- Training Readiness with training-load context ---------------- */

export interface ReadinessContext {
  tsb: number;
  acwr: number;
  monotony: number;
  sleepDebtPerNightHours: number | null;
  sleepScore: number | null; // 0-100 if available
}

/**
 * Layers training context on top of physio readiness score.
 * Physio side (HRV/RHR) already encoded in `physio.score`. We add sleep,
 * then nudge for TSB / ACWR / monotony per the description.
 */
export function computeTrainingReadiness(
  physio: ReadinessResult | null,
  ctx: ReadinessContext,
): { score: number; band: "primed" | "balanced" | "moderate" | "strained" | "overreached" } {
  let base = physio?.score ?? 50;

  // Sleep score layer (if provider supplies a 0-100 sleep score)
  if (ctx.sleepScore != null) {
    base = base * 0.75 + ctx.sleepScore * 0.25;
  }

  // Sleep debt layer
  if (ctx.sleepDebtPerNightHours != null) {
    if (ctx.sleepDebtPerNightHours > 1.7) base -= 10;
    else if (ctx.sleepDebtPerNightHours > 1) base -= 5;
  }

  // TSB (form) layer
  if (ctx.tsb < -25) base -= 10;
  else if (ctx.tsb < -15) base -= 5;
  else if (ctx.tsb > 15) base += 3;

  // ACWR layer
  if (ctx.acwr > 1.5) base -= 8;
  else if (ctx.acwr > 1.3) base -= 4;
  else if (ctx.acwr > 0 && ctx.acwr < 0.5) base -= 3;

  // Monotony layer
  if (ctx.monotony > 2.5) base -= 6;
  else if (ctx.monotony > 2) base -= 3;

  const score = Math.max(1, Math.min(99, Math.round(base)));
  const band: "primed" | "balanced" | "moderate" | "strained" | "overreached" =
    score >= 80 ? "primed"
      : score >= 65 ? "balanced"
        : score >= 45 ? "moderate"
          : score >= 25 ? "strained"
            : "overreached";
  return { score, band };
}
