// Shared planned-workout title/description localizer so the Activity tab calendar
// and the Training/Programs tabs render the same text.
import type { Lang } from "@/lib/i18n";

export const PLAN_TYPE_LABELS: Record<string, { en: string; zh: string }> = {
  "Easy Run": { en: "Easy Run", zh: "輕鬆跑" }, "Easy": { en: "Easy Run", zh: "輕鬆跑" },
  "Tempo Run": { en: "Tempo Run", zh: "節奏跑" }, "Tempo": { en: "Tempo Run", zh: "節奏跑" },
  "Interval": { en: "Interval Run", zh: "間歇跑" },
  "Long Run": { en: "Long Run", zh: "長課" }, "Long": { en: "Long Run", zh: "長課" },
  "Recovery": { en: "Recovery Run", zh: "恢復跑" }, "Recovery Run": { en: "Recovery Run", zh: "恢復跑" },
  "Rest": { en: "Rest", zh: "休息" }, "Cross Training": { en: "Cross Training", zh: "交叉訓練" },
  "Race Pace": { en: "Race Pace", zh: "比賽配速" },
  "Race": { en: "Race", zh: "比賽" },
  "Progression Run": { en: "Progression Run", zh: "漸進跑" }, "Progression": { en: "Progression Run", zh: "漸進跑" },
  "Trail Run": { en: "Trail Run", zh: "越野跑" }, "Trail Race": { en: "Trail Race", zh: "越野賽" },
  "Warmup": { en: "Warmup", zh: "熱身" }, "Cooldown": { en: "Cooldown", zh: "緩和" },
};

export function localizePlanTitle(type: string, lang: Lang): string {
  return PLAN_TYPE_LABELS[type]?.[lang] || type;
}

export interface PlanDescriptionInput {
  type: string;
  distance_km?: number | null;
  pace?: string | null;
  description?: string | null;
  elevation_m?: number | null;
  eph?: number | null;
}

export function localizePlanDescription(day: PlanDescriptionInput, lang: Lang): string {
  const distStr = day.distance_km ? `${day.distance_km}km` : "";
  const paceStr = day.pace || "";

  if (lang === "zh") {
    const typeZh = PLAN_TYPE_LABELS[day.type]?.zh || day.type;
    switch (day.type) {
      case "Rest":
        return "全日休息恢復。";
      case "Easy Run":
      case "Easy":
        if (distStr && paceStr) return `${distStr}輕鬆跑，配速約${paceStr}。舒適對話配速，建立有氧基礎。`;
        if (distStr) return `${distStr}輕鬆跑。舒適對話配速，建立有氧基礎。`;
        return "輕鬆跑。舒適對話配速，建立有氧基礎。";
      case "Tempo Run":
      case "Tempo":
        if (distStr && paceStr) return `${distStr}節奏跑，配速約${paceStr}。以乳酸閾值配速持續舒適偏快的努力。`;
        if (distStr) return `${distStr}節奏跑。以乳酸閾值配速持續舒適偏快的努力。`;
        return "節奏跑。以乳酸閾值配速持續舒適偏快的努力。";
      case "Interval": {
        const repMatch = day.description?.match(/(\d+)\s*[mx×]\s*([\d.]+)\s*(m|km)/i);
        const restMatch = day.description?.match(/rest\s*([\d:]+)/i);
        if (repMatch) {
          const reps = repMatch[1];
          const dist = repMatch[2];
          const unit = repMatch[3].toLowerCase() === "km" ? "公里" : "米";
          const rest = restMatch ? `，組間休息${restMatch[1]}` : "";
          const paceInfo = paceStr ? `，配速約${paceStr}` : "";
          return `${reps}×${dist}${unit}${paceInfo}${rest}。高強度重複訓練以提升最大攝氧量。`;
        }
        if (distStr && paceStr) return `${distStr}間歇跑，配速約${paceStr}。高強度重複訓練以提升最大攝氧量。`;
        if (distStr) return `${distStr}間歇跑。高強度重複訓練以提升最大攝氧量。`;
        return "間歇跑。高強度重複訓練以提升最大攝氧量。";
      }
      case "Long Run":
      case "Long":
        if (distStr && paceStr) return `${distStr}長課，配速約${paceStr}。以輕鬆至中等配速進行長距離耐力訓練。`;
        if (distStr) return `${distStr}長課。以輕鬆至中等配速進行長距離耐力訓練。`;
        return "長課。以輕鬆至中等配速進行長距離耐力訓練。";
      case "Recovery":
      case "Recovery Run":
        if (distStr && paceStr) return `${distStr}恢復跑，配速約${paceStr}。非常輕鬆的短跑，作為積極恢復。`;
        if (distStr) return `${distStr}恢復跑。非常輕鬆的短跑，作為積極恢復。`;
        return "恢復跑。非常輕鬆的短跑，作為積極恢復。";
      case "Cross Training":
        return "30分鐘低強度交叉訓練（例如：游泳、單車），提高心肺功能。";
      case "Race Pace":
        if (distStr && paceStr) return `${distStr}比賽配速跑，配速${paceStr}。以目標比賽配速跑步，建立比賽日信心。`;
        if (distStr) return `${distStr}比賽配速跑。以目標比賽配速跑步，建立比賽日信心。`;
        return "比賽配速跑。以目標比賽配速跑步，建立比賽日信心。";
      case "Race":
        return day.description || `${distStr || ""}比賽日。`.trim();
      case "Progression Run":
      case "Progression":
        if (distStr && paceStr) return `${distStr}漸進跑，配速約${paceStr}。由輕鬆開始，逐步加速至節奏或比賽配速。`;
        if (distStr) return `${distStr}漸進跑。由輕鬆開始，逐步加速至節奏或比賽配速。`;
        return "漸進跑。由輕鬆開始，逐步加速至節奏或比賽配速。";
      case "Trail Run":
      case "Trail Race": {
        const ele = day.elevation_m;
        const eph = day.eph;
        const label = day.type === "Trail Race" ? "越野賽" : "越野跑";
        const parts: string[] = [];
        if (distStr) parts.push(distStr);
        if (typeof ele === "number" && ele > 0) parts.push(`爬升 ${Math.round(ele)} 米`);
        if (typeof eph === "number" && eph > 0) parts.push(`目標 EpH ${eph}`);
        const head = parts.length ? `${parts.join(" · ")} ${label}` : label;
        return `${head}。以 EpH（每小時努力分數 = 距離公里 + 爬升米/100）控制強度。`;
      }
      default:
        if (distStr && paceStr) return `${distStr}${typeZh}，配速約${paceStr}。`;
        if (distStr) return `${distStr}${typeZh}。`;
        return typeZh;
    }
  }

  // English: for rich types preserve original description if present
  const richTypes = ["Interval", "Cross Training", "Progression Run", "Race Pace", "Tempo Run", "Race"];
  if (richTypes.includes(day.type) && day.description) {
    return day.description;
  }
  if (paceStr && distStr) return `${distStr} at ${paceStr} pace`;
  if (distStr) return `${distStr} run`;
  return day.description || "";
}
