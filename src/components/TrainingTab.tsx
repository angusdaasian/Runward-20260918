import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Lang, t } from "@/lib/i18n";
import { getMainPaces, predictTime, formatTime, raceDistances } from "@/lib/vdot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { usePremium } from "@/contexts/PremiumContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus, isOnline } from "@/hooks/use-online-status";
import { getCached, setCached, CacheKeys } from "@/lib/offlineCache";
import { registerUnsavedChecker } from "@/lib/unsavedGuard";
import { notifyPlanChanged, subscribePlanChanged } from "@/lib/planEvents";
import { useActivities } from "@/hooks/use-activities";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Lock, ChevronLeft, ChevronRight, Plus, Calendar, Target, Trophy,
  Repeat, Route, HelpCircle, X, WifiOff, Sparkles, GripVertical, Save,
  ChevronDown, Pencil, Share2, Watch, Check
} from "lucide-react";
import { shareTrainingWeek } from "@/lib/sharePlanWeek";
import { estimateMaxHr, estimateRestingHr, zoneBoundaries, isValidCustomZones } from "@/lib/hrZones";
import { predictRaceFromActivities, typeLabel, type RunType } from "@/lib/racePredictionHr";
import { targetTimeFromPlan, type SuggestProfile, type SuggestActivity } from "@/lib/paceSuggest";
import { sessionDistanceKm, type WorkoutSession } from "@/lib/planTypes";
import { splitIntervalsInPlan } from "@/lib/splitIntervalSessions";
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import WeeklyReviewModal from "@/components/training/WeeklyReviewModal";
import EditWorkoutDialog from "@/components/training/EditWorkoutDialog";
import { useSimpleMode } from "@/hooks/use-simple-mode";
const CalculatorTab = lazy(() => import("@/components/CalculatorTab"));
import freePlan5k from "@/assets/free-plan-5k.jpg";
import freePlan10k from "@/assets/free-plan-10k.jpg";
import freePlanHm from "@/assets/free-plan-hm.jpg";
import freePlanFm from "@/assets/free-plan-fm.jpg";

const FREE_PLAN_IMAGES: Record<string, string> = {
  "5K": freePlan5k,
  "10K": freePlan10k,
  "HM": freePlanHm,
  "FM": freePlanFm,
};
const FREE_PLAN_LABELS: Record<string, { en: string; zh: string }> = {
  "5K": { en: "5K", zh: "5公里" },
  "10K": { en: "10K", zh: "10公里" },
  "HM": { en: "Half Marathon", zh: "半馬拉松" },
  "FM": { en: "Full Marathon", zh: "全馬拉松" },
};

// ─── Types ───
type Goal = "race" | "distance" | "first5k" | "parkrun" | "general" | "postnatal" | "fitness" | "injury" | "postrace";
type Distance = "5K" | "10K" | "HM" | "FM" | "TR" | "FT";

interface DayPlan {
  day: string; date: string; type: string; title: string;
  description: string; distance_km: number | null; pace: string | null; color: string;
  elevation_m?: number | null; eph?: number | null;
}
interface WeekPlan { week: number; startDate: string; days: DayPlan[]; }

// ─── Constants ───
const RUN_TYPES = [
  { id: "Easy", emoji: "🟢", en: "Easy Run", zh: "輕鬆跑", color: "#22c55e" },
  { id: "Tempo", emoji: "🟡", en: "Tempo Run", zh: "節奏跑", color: "#eab308" },
  { id: "Interval", emoji: "🔴", en: "Interval", zh: "間歇跑", color: "#ef4444" },
  { id: "Long", emoji: "🔵", en: "Long Run", zh: "長跑", color: "#3b82f6" },
  { id: "Recovery", emoji: "⚪", en: "Recovery Run", zh: "恢復跑", color: "#94a3b8" },
  { id: "Progression", emoji: "🟠", en: "Progression Run", zh: "漸進跑", color: "#f97316" },
  { id: "Cross Training", emoji: "🔷", en: "Cross Training", zh: "交叉訓練", color: "#06b6d4" },
  { id: "Trail Run", emoji: "⛰️", en: "Trail Run", zh: "越野跑", color: "#84cc16" },
  { id: "Trail Race", emoji: "🏔️", en: "Trail Race", zh: "越野賽", color: "#65a30d" },
];

const TYPE_LABELS: Record<string, { en: string; zh: string }> = {
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
};

const GOALS: { id: Goal; emoji: string; en: string; zh: string; desc_en: string; desc_zh: string }[] = [
  { id: "race", emoji: "🏁", en: "Race", zh: "比賽", desc_en: "Get your personalized training plan built around an upcoming race", desc_zh: "為即將到來的比賽制定個人化訓練計劃" },
  { id: "distance", emoji: "📏", en: "Run a specific distance", zh: "跑指定距離", desc_en: "Choose your distance, from 5k all the way up to an ultramarathon", desc_zh: "選擇你的距離，從5公里到超級馬拉松" },
  { id: "first5k", emoji: "🏃", en: "Run a first 5k", zh: "首次5公里", desc_en: "", desc_zh: "" },
  { id: "parkrun", emoji: "🌳", en: "parkrun Improvement Plan", zh: "parkrun 進步計劃", desc_en: "", desc_zh: "" },
  { id: "general", emoji: "💪", en: "General training", zh: "一般訓練", desc_en: "", desc_zh: "" },
  { id: "fitness", emoji: "🏋️", en: "Functional fitness", zh: "功能性體能", desc_en: "", desc_zh: "" },
  { id: "injury", emoji: "🩹", en: "Post-injury recovery", zh: "傷後恢復", desc_en: "", desc_zh: "" },
  { id: "postrace", emoji: "🔄", en: "Post-race recovery", zh: "賽後恢復", desc_en: "", desc_zh: "" },
];

const DISTANCES: { id: Distance; label: string }[] = [
  { id: "5K", label: "5K" }, { id: "10K", label: "10K" },
  { id: "HM", label: "Half Marathon" }, { id: "FM", label: "Full Marathon" },
  // Trail Race AI generation temporarily disabled (still has bugs)
  // { id: "TR", label: "Trail Race" },
];

const MIN_WEEKS: Record<Distance, number> = { "5K": 4, "10K": 4, HM: 6, FM: 8, TR: 10, FT: 4 };
const MIN_DAYS: Record<Distance, number> = { "5K": 2, "10K": 2, HM: 3, FM: 4, TR: 4, FT: 2 };

function localizeTitle(type: string, lang: Lang): string {
  return TYPE_LABELS[type]?.[lang] || type;
}

function localizeDescription(day: DayPlan, lang: Lang): string {
  const distStr = day.distance_km ? `${day.distance_km}km` : "";
  const paceStr = day.pace || "";

  if (lang === "zh") {
    const typeZh = TYPE_LABELS[day.type]?.zh || day.type;

    // Type-specific Chinese descriptions built from structured data
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
        // Try to extract rep info from description
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
        const ele = (day as any).elevation_m;
        const eph = (day as any).eph;
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

  // English: for rich types preserve original description
  const richTypes = ["Interval", "Cross Training", "Progression Run", "Race Pace", "Tempo Run", "Race"];
  if (richTypes.includes(day.type) && day.description) {
    return day.description;
  }

  if (paceStr && distStr) return `${distStr} at ${paceStr} pace`;
  if (distStr) return `${distStr} run`;
  return day.description;
}

// ─── HR zone helpers for plan workouts ───
type HrBounds = { z1: number; z2: number; z3: number; z4: number; z5: number; max: number };

/** Map a workout type to its target HR zone key (1..5) */
function zoneForType(type: string): 1 | 2 | 3 | 4 | 5 {
  switch (type) {
    case "Recovery":
    case "Recovery Run":
      return 1;
    case "Easy":
    case "Easy Run":
    case "Long":
    case "Long Run":
    case "Cross Training":
      return 2;
    case "Progression":
    case "Progression Run":
      return 3;
    case "Tempo":
    case "Tempo Run":
    case "Race Pace":
      return 4;
    case "Interval":
      return 5;
    default:
      return 2;
  }
}

/** Format an HR range string like "138-152 bpm" for a given zone using bounds. */
function hrRangeForZone(zone: 1 | 2 | 3 | 4 | 5, b: HrBounds | null): string | null {
  if (!b) return null;
  const lows = [b.z1, b.z2, b.z3, b.z4, b.z5];
  const lo = lows[zone - 1];
  const hi = zone === 5 ? b.max : lows[zone] - 1;
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return null;
  return `${lo}-${hi} bpm`;
}

const ZONE_LABEL: Record<1 | 2 | 3 | 4 | 5, { en: string; zh: string }> = {
  1: { en: "Z1 Recovery", zh: "Z1 恢復" },
  2: { en: "Z2 Easy", zh: "Z2 輕鬆" },
  3: { en: "Z3 Aerobic", zh: "Z3 有氧" },
  4: { en: "Z4 Threshold", zh: "Z4 乳酸閾" },
  5: { en: "Z5 Max", zh: "Z5 極限" },
};

/** Parse "800m x 8" / "5x1km" / "8x400m" rep notation from description. */
function parseIntervalReps(desc?: string | null): { reps: number; dist: number; unit: "m" | "km" } | null {
  if (!desc) return null;
  // 800m x 8  |  8 x 800m  |  5x1km  |  6 × 1.2km
  const m1 = desc.match(/(\d+(?:\.\d+)?)\s*(m|km)\s*[x×]\s*(\d+)/i);
  if (m1) return { reps: parseInt(m1[3]), dist: parseFloat(m1[1]), unit: m1[2].toLowerCase() as any };
  const m2 = desc.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|km)/i);
  if (m2) return { reps: parseInt(m2[1]), dist: parseFloat(m2[2]), unit: m2[3].toLowerCase() as any };
  return null;
}
function parseIntervalRest(desc?: string | null): string | null {
  if (!desc) return null;
  const m = desc.match(/rest\s*([\d:]+)/i) || desc.match(/休息\s*([\d:]+)/);
  return m ? m[1] : null;
}

/** Slow a pace string (e.g. "4:05/km") by a multiplier (>1 → slower). */
function adjustPace(pace: string | null | undefined, mult: number): string | null {
  if (!pace) return null;
  const m = pace.match(/(\d+):(\d+)/);
  if (!m) return pace;
  const sec = (parseInt(m[1]) * 60 + parseInt(m[2])) * mult;
  const mm = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  const unit = /\/(km|mi)\b/i.exec(pace)?.[1] || "km";
  return `${mm}:${String(ss).padStart(2, "0")}/${unit}`;
}

function suggestPace(type: string, targetTime: string, distance: string): { pace: string; description: string; descZh: string } {
  const parts = targetTime.split(":").map(Number);
  let totalSec = 0;
  if (parts.length === 3) totalSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) totalSec = parts[0] * 60 + parts[1];
  const distKm = distance === "5K" ? 5 : distance === "10K" ? 10 : distance === "HM" ? 21.1 : 42.195;
  const racePaceSec = totalSec / distKm;
  const fmt = (s: number) => { const m = Math.floor(s / 60); const sec = Math.round(s % 60); return `${m}:${sec.toString().padStart(2, "0")}`; };
  switch (type) {
    case "Easy": return { pace: `${fmt(racePaceSec * 1.2)}/km`, description: "Comfortable conversational pace", descZh: "舒適對話配速" };
    case "Tempo": return { pace: `${fmt(racePaceSec * 1.05)}/km`, description: "Comfortably hard, sustained effort", descZh: "舒適偏快的持續配速" };
    case "Interval": { const p = fmt(racePaceSec * 0.9); return { pace: `${p}/km`, description: `Suggested: 5x1km @ ${p} with 90s recovery`, descZh: `建議：5x1公里 @ ${p}，恢復90秒` }; }
    case "Long": return { pace: `${fmt(racePaceSec * 1.15)}/km`, description: "Steady long run pace", descZh: "穩定長跑配速" };
    case "Recovery": return { pace: `${fmt(racePaceSec * 1.3)}/km`, description: "Very easy, focus on recovery", descZh: "非常輕鬆，專注恢復" };
    case "Progression": return { pace: `${fmt(racePaceSec * 1.15)}→${fmt(racePaceSec * 1.0)}/km`, description: "Start easy and gradually build to race/tempo effort", descZh: "由輕鬆開始，逐步加速至比賽/節奏配速" };
    case "Cross Training": return { pace: "", description: "Non-running cardio (bike/swim/elliptical), easy-moderate effort", descZh: "非跑步有氧（單車/游泳/橢圓機），中低強度" };
    default: return { pace: `${fmt(racePaceSec * 1.15)}/km`, description: "Moderate pace", descZh: "中等配速" };
  }
}

// ─── Component ───
interface Props {
  score: number | null;
  setScore: (s: number | null) => void;
  lang: Lang;
  onLoginRequest?: () => void;
}

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_FROM_DATE = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const labelForDay = (day: any, i: number): string => {
  if (day?.date) {
    const dt = new Date(day.date + "T00:00:00");
    if (!isNaN(dt.getTime())) return WEEKDAY_FROM_DATE[dt.getDay()];
  }
  return DAY_LABELS[i] || (day?.day?.substring(0, 3).toUpperCase() ?? "");
};

// Render the structured details (paces, distance, HR, warmup/cooldown) for a workout
const WorkoutDetails = ({ day, lang, hrBounds }: { day: DayPlan; lang: Lang; hrBounds: HrBounds | null }) => {
  const isZh = lang === "zh";
  const paceFmt = (p?: string | null) => p ? (/\/(km|mi)\b/i.test(p) ? p : `${p}/km`) : null;

  // ── NEW: when day has structured sessions[], render them directly ──
  const sessions = Array.isArray((day as any).sessions) ? (day as any).sessions as any[] : null;
  if (sessions && sessions.length > 0) {
    return (
      <div className="mt-2 space-y-2">
        {sessions.map((sess, si) => {
          const sZone = zoneForType(sess.type);
          const sHr = hrRangeForZone(sZone, hrBounds);
          const sZoneLabel = ZONE_LABEL[sZone][isZh ? "zh" : "en"];
          const bg =
            sess.type === "Warmup" ? "bg-amber-500/10 border-amber-500/20" :
            sess.type === "Cooldown" ? "bg-sky-500/10 border-sky-500/20" :
            sess.type === "Interval" || sess.type === "Intervals" ? "bg-primary/5 border-primary/20" :
            "bg-muted/40";
          const label = sess.title || sess.type;
          const steps: any[] = Array.isArray(sess.steps) ? sess.steps : [];
          return (
            <div key={si} className={`rounded-md p-2 space-y-1 border ${bg}`}>
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-foreground">
                  {sess.time_of_day ? `[${sess.time_of_day}] ` : ""}{label}
                </div>
                {sess.distance_km != null && (
                  <div className="text-[10px] text-muted-foreground tabular-nums">{sess.distance_km} km</div>
                )}
              </div>
              {steps.length > 0 ? (
                <div className="space-y-0.5">
                  {steps.map((st, sti) => {
                    const stepLabel = st.kind === "warmup" ? (isZh ? "熱身" : "Warm-up") : st.kind === "cooldown" ? (isZh ? "緩和" : "Cool-down") : st.kind === "recovery" ? (isZh ? "恢復" : "Recovery") : st.kind === "interval" ? (isZh ? "間歇" : "Interval") : (isZh ? "主項" : "Main");
                    if (st.kind === "interval" && st.reps && st.distance_m) {
                      const rest = st.rest ? ` · ${isZh ? "休息" : "rest"} ${st.rest}` : "";
                      const pace = paceFmt(st.pace);
                      return (
                        <div key={sti} className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="text-foreground font-medium tabular-nums">{stepLabel}: {st.reps} × {st.distance_m}m{rest}</span>
                          {pace && <span className="text-muted-foreground tabular-nums">@ {pace}</span>}
                        </div>
                      );
                    }
                    const pace = paceFmt(st.pace);
                    const dist = st.distance_km != null ? `${st.distance_km} km` : (st.distance_m != null ? `${st.distance_m} m` : null);
                    return (
                      <div key={sti} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-foreground tabular-nums">{stepLabel}: {dist || (isZh ? "—" : "—")}</span>
                        {pace && <span className="text-muted-foreground tabular-nums">@ {pace}</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  {paceFmt(sess.pace) && <span className="text-muted-foreground tabular-nums">@ {paceFmt(sess.pace)}</span>}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
                <span>{isZh ? "心率" : "HR"}</span>
                <span className="tabular-nums">{sHr ? `${sZoneLabel} · ${sHr}` : sZoneLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Legacy single-day fallback (unchanged) ──
  const zone = zoneForType(day.type);
  const hr = hrRangeForZone(zone, hrBounds);
  const zoneLabel = ZONE_LABEL[zone][isZh ? "zh" : "en"];

  const isInterval = day.type === "Interval";
  const reps = isInterval ? parseIntervalReps(day.description) : null;
  const restStr = isInterval ? parseIntervalRest(day.description) : null;
  const easyHr = hrRangeForZone(2, hrBounds);
  const easyZoneLabel = ZONE_LABEL[2][isZh ? "zh" : "en"];
  const easyPace = adjustPace(day.pace, 1.4);

  // For intervals, allocate ~1.5km warmup + cooldown when total >= 5km, else 1km each.
  const wuCdKm = (day.distance_km ?? 0) >= 6 ? 1.5 : 1;
  const workKm = reps ? (reps.unit === "km" ? reps.dist * reps.reps : (reps.dist * reps.reps) / 1000) : null;

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground font-medium text-right tabular-nums">{value}</span>
    </div>
  );

  if (isInterval) {
    return (
      <div className="mt-2 space-y-2">
        <div className="rounded-md bg-muted/40 p-2 space-y-1">
          <div className="text-[11px] font-semibold text-foreground">{isZh ? "熱身" : "Warm-up"}</div>
          <Row label={isZh ? "距離" : "Distance"} value={`${wuCdKm} km`} />
          {easyPace && <Row label={isZh ? "配速" : "Pace"} value={easyPace} />}
          <Row label={isZh ? "心率" : "HR"} value={easyHr ? `${easyZoneLabel} · ${easyHr}` : easyZoneLabel} />
        </div>
        <div className="rounded-md bg-primary/5 border border-primary/20 p-2 space-y-1">
          <div className="text-[11px] font-semibold text-foreground">{isZh ? "主課表" : "Main Set"}</div>
          {reps ? (
            <Row label={isZh ? "組數" : "Reps"} value={`${reps.reps} × ${reps.dist}${reps.unit}${restStr ? ` · ${isZh ? "休息" : "rest"} ${restStr}` : ""}`} />
          ) : (
            day.distance_km != null && <Row label={isZh ? "距離" : "Distance"} value={`${day.distance_km} km`} />
          )}
          {paceFmt(day.pace) && <Row label={isZh ? "配速" : "Pace"} value={paceFmt(day.pace)!} />}
          <Row label={isZh ? "心率" : "HR"} value={hr ? `${zoneLabel} · ${hr}` : zoneLabel} />
        </div>
        <div className="rounded-md bg-muted/40 p-2 space-y-1">
          <div className="text-[11px] font-semibold text-foreground">{isZh ? "緩和" : "Cool-down"}</div>
          <Row label={isZh ? "距離" : "Distance"} value={`${wuCdKm} km`} />
          {easyPace && <Row label={isZh ? "配速" : "Pace"} value={easyPace} />}
          <Row label={isZh ? "心率" : "HR"} value={easyHr ? `${easyZoneLabel} · ${easyHr}` : easyZoneLabel} />
        </div>
      </div>
    );
  }

  const isTrail = day.type === "Trail Run" || day.type === "Trail Race";
  const ele = (day as any).elevation_m;
  const eph = (day as any).eph;

  return (
    <div className="mt-2 space-y-1">
      {day.distance_km != null && <Row label={isZh ? "距離" : "Distance"} value={`${day.distance_km} km`} />}
      {isTrail ? (
        <>
          {typeof ele === "number" && ele > 0 && (
            <Row label={isZh ? "爬升" : "Elevation"} value={`${Math.round(ele)} m`} />
          )}
          {typeof eph === "number" && eph > 0 && (
            <Row label="EpH" value={String(eph)} />
          )}
        </>
      ) : (
        paceFmt(day.pace) && <Row label={isZh ? "配速" : "Pace"} value={paceFmt(day.pace)!} />
      )}
      <Row label={isZh ? "心率" : "HR"} value={hr ? `${zoneLabel} · ${hr}` : zoneLabel} />
    </div>
  );
};

// Draggable + droppable day row for the AI calendar (long-press to swap)
const DraggableDay = ({
  id, idx, day, lang, isToday, dayNum, hrBounds,
  onEditClick, onAddClick, onAddAnotherClick,
  isPushed, isPushing, onPushDay, watchProvider,
}: {
  id: string;
  idx: number;
  day: DayPlan;
  lang: Lang;
  isToday: boolean;
  dayNum: number | string;
  hrBounds: HrBounds | null;
  onEditClick: () => void;
  onAddClick: () => void;
  onAddAnotherClick?: () => void;
  isPushed?: boolean;
  isPushing?: boolean;
  onPushDay?: (idx: number) => void;
  watchProvider?: string | null;
}) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging, transform } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const sessions = Array.isArray((day as any).sessions) ? ((day as any).sessions as WorkoutSession[]) : [];
  const sessionsCount = sessions.length;
  const [expanded, setExpanded] = useState(false);

  const setRefs = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setRefs} style={style} className={`flex items-stretch gap-2 rounded-lg ${isOver && !isDragging ? "ring-2 ring-primary bg-primary/5" : ""}`}>
      <div className="w-10 flex-shrink-0 flex flex-col items-center pt-3">
        <span className="text-[10px] font-medium text-muted-foreground uppercase">{labelForDay(day, idx)}</span>
        <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{dayNum}</span>
      </div>
      {day.type === "Rest" ? (
        <div className="flex-1 border-l-2 border-border pl-3 py-3 min-h-[48px] flex items-center gap-2">
          <button
            type="button"
            {...listeners}
            {...attributes}
            className="text-muted-foreground/60 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
            aria-label="Drag to swap"
          >
            <GripVertical size={14} />
          </button>
          <button onClick={onAddClick} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Plus size={12} />{lang === "zh" ? "新增" : "Add"}
          </button>
        </div>
      ) : (
        <div className="flex-1 border-l-2 pl-3 py-2" style={{ borderColor: day.color || "hsl(var(--border))" }}>
          <div className="bg-card border border-border rounded-lg p-3 hover:border-primary transition-colors">
            <div className="flex items-center gap-2">
              <button
                type="button"
                {...listeners}
                {...attributes}
                className="flex items-center text-muted-foreground/60 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none -my-1 px-0.5"
                aria-label="Drag to swap"
              >
                <GripVertical size={16} />
              </button>
              <div className="flex-1 min-w-0 flex items-center justify-between gap-2 select-none">
                <span className="font-medium text-sm text-foreground truncate">
                  {localizeTitle(day.type, lang)}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                aria-expanded={expanded}
                aria-label={lang === "zh" ? "展開" : "Expand"}
              >
                <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              {onPushDay && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onPushDay(idx); }}
                  disabled={isPushing}
                  className={`p-1 rounded hover:bg-accent disabled:opacity-50 ${isPushed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
                  aria-label={lang === "zh" ? "同步到手錶" : "Send to watch"}
                  title={isPushed
                    ? (lang === "zh" ? `已同步到 ${watchProvider ?? "手錶"}` : `Synced to ${watchProvider ?? "watch"}`)
                    : (lang === "zh" ? "同步到手錶" : "Send to watch")}
                >
                  {isPushing ? <Loader2 size={14} className="animate-spin" /> : isPushed ? <Check size={14} /> : <Watch size={14} />}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEditClick(); }}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                aria-label={lang === "zh" ? "編輯訓練" : "Edit workout"}
              >
                <Pencil size={14} />
              </button>
              {onAddAnotherClick && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAddAnotherClick(); }}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  aria-label={lang === "zh" ? "再新增訓練" : "Add another session"}
                  title={lang === "zh" ? "再新增同日訓練" : "Add another session same day"}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            {!expanded && sessionsCount > 1 && (
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {sessions.map((sess, si) => {
                  const label = localizeTitle(sess.type || "Run", lang);
                  const km = sessionDistanceKm(sess);
                  return (
                    <span key={sess.id || si} className="shrink-0 rounded-md border border-border bg-muted/40 px-2 py-1 text-[10px] text-foreground">
                      {sess.time_of_day ? `${sess.time_of_day} · ` : ""}{label}{km ? ` · ${km} km` : ""}
                    </span>
                  );
                })}
              </div>
            )}
            {expanded && <WorkoutDetails day={day} lang={lang} hrBounds={hrBounds} />}
          </div>
        </div>
      )}
    </div>
  );
};

// Calendar day list with long-press drag-to-swap (within a week)
const CalendarDayList = ({
  days, weekIdx, lang, hrBounds, onSwap, onAddClick, onEditClick, onAddAnotherClick,
  pushedSet, pushingIdx, onPushDay, watchProvider,
}: {
  days: DayPlan[];
  weekIdx: number;
  lang: Lang;
  hrBounds: HrBounds | null;
  onSwap: (fromIdx: number, toIdx: number) => void;
  onAddClick: (idx: number) => void;
  onEditClick: (idx: number, day: DayPlan) => void;
  onAddAnotherClick?: (idx: number, day: DayPlan) => void;
  pushedSet?: Set<number>;
  pushingIdx?: number | null;
  onPushDay?: (idx: number) => void;
  watchProvider?: string | null;
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );
  const todayStr = new Date().toISOString().split("T")[0];
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e: DragEndEvent) => {
        if (!e.over) return;
        const fromIdx = Number(String(e.active.id).split(":")[1]);
        const toIdx = Number(String(e.over.id).split(":")[1]);
        if (Number.isFinite(fromIdx) && Number.isFinite(toIdx) && fromIdx !== toIdx) {
          onSwap(fromIdx, toIdx);
        }
      }}
    >
      <div className="space-y-1">
        {days.map((day, i) => {
          const dateObj = day.date ? new Date(day.date + "T00:00:00") : null;
          const dayNum = dateObj ? dateObj.getDate() : "";
          const isToday = day.date === todayStr;
          return (
            <DraggableDay
              key={`${weekIdx}:${i}`}
              id={`day:${i}`}
              idx={i}
              day={day}
              lang={lang}
              isToday={isToday}
              dayNum={dayNum}
              hrBounds={hrBounds}
              onEditClick={() => onEditClick(i, day)}
              onAddClick={() => onAddClick(i)}
              onAddAnotherClick={onAddAnotherClick ? () => onAddAnotherClick(i, day) : undefined}
              isPushed={pushedSet?.has(i)}
              isPushing={pushingIdx === i}
              onPushDay={onPushDay}
              watchProvider={watchProvider}
            />
          );
        })}
      </div>
    </DndContext>
  );
};


// ─── Program Header (collapsible summary above the week card) ───
function parsePaceMin(p: string | null | undefined): number | null {
  if (!p) return null;
  const m = String(p).match(/(\d+):(\d{1,2})/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}
const FALLBACK_PACE_MIN: Record<string, number> = {
  Easy: 6.0, Recovery: 6.5, Long: 6.0, Tempo: 5.0,
  Interval: 4.5, Progression: 5.5, "Race Pace": 5.0,
};
function planDistanceLabel(distance: string, lang: Lang): string {
  const f = FREE_PLAN_LABELS[distance];
  if (f) return lang === "zh" ? f.zh : f.en;
  if (distance === "custom") return lang === "zh" ? "自訂" : "Custom";
  return distance;
}

interface RaceSchedItemUI { user_race_id: string; race_name: string; race_date: string; category: string; priority: string }
interface ProgramHeaderProps {
  lang: Lang;
  weeks: number;
  distance: string;
  targetTime: string;
  currentWeekIdx: number;
  weekDays: DayPlan[];
  activities: Array<{ start_date: string; distance: number; moving_time: number }>;
  daysPerWeek: number;
  longRunDay: string;
  restDays: string[];
  weeklyKm: number;
  onRegenerate?: (overrides: {
    targetTime?: string;
    daysPerWeek?: number;
    longRunDay?: string;
    restDays?: string[];
    weeklyKm?: number;
  }) => Promise<void> | void;
  regenerating?: boolean;
  races?: RaceSchedItemUI[];
  currentRaces?: RaceSchedItemUI[];
  racesDrift?: boolean;
  onUpdateRacePriority?: (raceId: string, priority: string) => Promise<void> | void;
  onRemoveRace?: (raceId: string) => Promise<void> | void;
  onRegenerateForRaces?: () => Promise<void> | void;
}
const DAY_LABELS_ALL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_LABELS_ZH: Record<string, string> = {
  Mon: "一", Tue: "二", Wed: "三", Thu: "四", Fri: "五", Sat: "六", Sun: "日",
};

interface RaceSchedulePanelProps {
  lang: Lang;
  races?: RaceSchedItemUI[];
  currentRaces?: RaceSchedItemUI[];
  racesDrift?: boolean;
  regenerating?: boolean;
  onUpdateRacePriority?: (raceId: string, priority: string) => Promise<void> | void;
  onRemoveRace?: (raceId: string) => Promise<void> | void;
  onRegenerateForRaces?: () => Promise<void> | void;
}
const RaceSchedulePanel: React.FC<RaceSchedulePanelProps> = ({
  lang, races, currentRaces, racesDrift, regenerating,
  onUpdateRacePriority, onRemoveRace, onRegenerateForRaces,
}) => {
  const [racesOpen, setRacesOpen] = useState(false);
  const L = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const list = (racesDrift ? currentRaces : races) || [];
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setRacesOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
          {L("Race Schedule", "賽事行程")}
          {racesDrift && (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              {L("Updated", "已更新")}
            </span>
          )}
        </span>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${racesOpen ? "rotate-180" : ""}`} />
      </button>
      {racesOpen && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {racesDrift && onRegenerateForRaces && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-[11px] text-foreground space-y-1.5">
              <p>{L("Your race goals changed in My Races. Regenerate the program to match the updated plan.", "您在「我的賽事」中更改了目標。請重新生成計劃以符合最新安排。")}</p>
              <button
                type="button"
                onClick={() => onRegenerateForRaces()}
                disabled={regenerating}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {regenerating ? <Loader2 size={11} className="animate-spin" /> : null}
                {L("Regenerate program", "重新生成計劃")}
              </button>
            </div>
          )}
          {list.length ? (
            list.map((r) => {
              const isGoal = r.priority === "A";
              return (
                <div key={r.user_race_id} className={`flex items-center gap-2 p-2 rounded-md border ${isGoal ? "border-primary bg-primary/5" : "border-border/50 bg-background"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-foreground truncate">{r.race_name}</span>
                      {r.category && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-muted text-muted-foreground">{r.category}</span>
                      )}
                      {isGoal && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                          {L("Goal", "目標")}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{r.race_date}</p>
                  </div>
                  {onUpdateRacePriority && !racesDrift && (
                    <select
                      className="h-7 rounded border border-input bg-background px-1 text-[11px] text-foreground"
                      value={r.priority || "none"}
                      onChange={(e) => onUpdateRacePriority(r.user_race_id, e.target.value)}
                      disabled={regenerating}
                      aria-label={L("Priority", "優先級")}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="none">{L("None", "無")}</option>
                    </select>
                  )}
                  {onRemoveRace && !racesDrift && (
                    <button
                      type="button"
                      onClick={() => onRemoveRace(r.user_race_id)}
                      disabled={regenerating}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50 p-1"
                      aria-label={L("Remove race", "移除賽事")}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-[11px] text-muted-foreground italic px-1 py-2">
              {L("No races on the calendar within this program window. Add races in My Races.", "計劃期間沒有任何賽事。請在「我的賽事」中加入。")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const ProgramHeader: React.FC<ProgramHeaderProps> = ({
  lang, weeks, distance, targetTime, currentWeekIdx, weekDays, activities,
  daysPerWeek, longRunDay, restDays, weeklyKm, onRegenerate, regenerating,
  races, currentRaces, racesDrift, onUpdateRacePriority, onRemoveRace, onRegenerateForRaces,
}) => {
  
  const [editingKm, setEditingKm] = useState(false);
  const [editKm, setEditKm] = useState<number>(weeklyKm);
  useEffect(() => { setEditKm(weeklyKm); }, [weeklyKm]);
  const handleSaveKm = async () => {
    if (editKm === weeklyKm) { setEditingKm(false); return; }
    if (onRegenerate) await onRegenerate({ weeklyKm: editKm });
    setEditingKm(false);
  };
  const [open, setOpen] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [editingRuns, setEditingRuns] = useState(false);
  const [editingLong, setEditingLong] = useState(false);
  const [editingRest, setEditingRest] = useState(false);

  const initialParts = (targetTime || "").split(":");
  const [eh, setEh] = useState(initialParts[0] || "00");
  const [em, setEm] = useState(initialParts[1] || "00");
  const [es, setEs] = useState(initialParts[2] || "00");
  useEffect(() => {
    const p = (targetTime || "").split(":");
    setEh((p[0] || "00").padStart(2, "0"));
    setEm((p[1] || "00").padStart(2, "0"));
    setEs((p[2] || "00").padStart(2, "0"));
  }, [targetTime]);

  const [editRuns, setEditRuns] = useState(daysPerWeek);
  const [editLong, setEditLong] = useState(longRunDay);
  const [editRest, setEditRest] = useState<string[]>(restDays);
  useEffect(() => { setEditRuns(daysPerWeek); }, [daysPerWeek]);
  useEffect(() => { setEditLong(longRunDay); }, [longRunDay]);
  useEffect(() => { setEditRest(restDays); }, [restDays.join(",")]);

  const pad = (v: string) => String(Math.max(0, parseInt(v || "0", 10) || 0)).padStart(2, "0");
  const L = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const dayLabel = (d: string) => (lang === "zh" ? DAY_LABELS_ZH[d] || d : d);

  const handleSaveTime = async () => {
    const next = `${pad(eh)}:${pad(em)}:${pad(es)}`;
    if (next === targetTime) { setEditingTime(false); return; }
    if (onRegenerate) await onRegenerate({ targetTime: next });
    setEditingTime(false);
  };
  const handleSaveRuns = async () => {
    if (editRuns === daysPerWeek) { setEditingRuns(false); return; }
    if (onRegenerate) await onRegenerate({ daysPerWeek: editRuns });
    setEditingRuns(false);
  };
  const handleSaveLong = async () => {
    if (editLong === longRunDay) { setEditingLong(false); return; }
    if (onRegenerate) await onRegenerate({ longRunDay: editLong });
    setEditingLong(false);
  };
  const handleSaveRest = async () => {
    const sorted = [...editRest].sort((a, b) => DAY_LABELS_ALL.indexOf(a as any) - DAY_LABELS_ALL.indexOf(b as any));
    const same = sorted.length === restDays.length && sorted.every((d, i) => d === restDays[i]);
    if (same) { setEditingRest(false); return; }
    if (onRegenerate) await onRegenerate({ restDays: sorted });
    setEditingRest(false);
  };

  const distLabel = planDistanceLabel(distance, lang);
  const title = lang === "zh"
    ? `${weeks} 週 ${distLabel} 計劃`
    : `${weeks}-week ${distLabel} program`;

  const plannedKm = weekDays.reduce((s, d) => s + (d.distance_km || 0), 0);
  const plannedMin = weekDays.reduce((s, d) => {
    const km = d.distance_km || 0;
    if (!km) return s;
    const pace = parsePaceMin(d.pace) ?? FALLBACK_PACE_MIN[d.type] ?? 5.5;
    return s + km * pace;
  }, 0);

  const weekStart = weekDays[0]?.date || "";
  const weekEnd = weekDays[weekDays.length - 1]?.date || "";
  const inWeek = (iso: string) => {
    const d = (iso || "").slice(0, 10);
    return d && d >= weekStart && d <= weekEnd;
  };
  let completedKm = 0;
  let completedMin = 0;
  for (const a of activities ?? []) {
    if (!inWeek(a.start_date)) continue;
    completedKm += (Number(a.distance) || 0) / 1000;
    completedMin += (Number(a.moving_time) || 0) / 60;
  }

  const pct = (a: number, b: number) => Math.max(0, Math.min(100, b > 0 ? (a / b) * 100 : 0));

  const selectClass = "h-7 w-full rounded border border-input bg-background px-1 text-xs text-foreground";
  const Updating = (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Loader2 size={12} className="animate-spin" />
      {L("Updating…", "更新中…")}
    </span>
  );

  return (
    <div className="bg-card border border-border rounded-xl mb-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-border/60">
          <div className="grid grid-cols-2 gap-2 pt-2.5">
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {L("Week", "週數")}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {currentWeekIdx + 1} / {weeks}
              </p>
            </div>

            {/* Target time */}
            <div className="rounded-lg bg-muted/40 p-2">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {L("Target time", "目標時間")}
                </p>
                {!editingTime && onRegenerate && (
                  <button type="button" onClick={() => setEditingTime(true)} disabled={regenerating}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                    aria-label={L("Edit target time", "編輯目標時間")}>
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {!editingTime ? (
                <p className="text-sm font-semibold text-foreground">
                  {regenerating ? Updating : (targetTime || "—")}
                </p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-center gap-1">
                    <select className={selectClass} value={eh} onChange={(e) => setEh(e.target.value)}>
                      {Array.from({ length: 10 }, (_, i) => String(i).padStart(2, "0")).map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                    <span className="text-xs">:</span>
                    <select className={selectClass} value={em} onChange={(e) => setEm(e.target.value)}>
                      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                    <span className="text-xs">:</span>
                    <select className={selectClass} value={es} onChange={(e) => setEs(e.target.value)}>
                      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 px-2 text-[10px] flex-1" onClick={handleSaveTime} disabled={regenerating}>
                      {L("Regenerate", "重新生成")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingTime(false)} disabled={regenerating}>
                      {L("Cancel", "取消")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Runs per week */}
            <div className="rounded-lg bg-muted/40 p-2">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {L("Runs / week", "每週跑步")}
                </p>
                {!editingRuns && onRegenerate && (
                  <button type="button" onClick={() => setEditingRuns(true)} disabled={regenerating}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {!editingRuns ? (
                <p className="text-sm font-semibold text-foreground">
                  {regenerating ? Updating : `${daysPerWeek} ${L("days", "天")}`}
                </p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  <select className={selectClass} value={editRuns} onChange={(e) => setEditRuns(parseInt(e.target.value, 10))}>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>{n} {L("days", "天")}</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 px-2 text-[10px] flex-1" onClick={handleSaveRuns} disabled={regenerating}>
                      {L("Apply", "套用")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingRuns(false)} disabled={regenerating}>
                      {L("Cancel", "取消")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Long run day */}
            <div className="rounded-lg bg-muted/40 p-2">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {L("Long run day", "長跑日")}
                </p>
                {!editingLong && onRegenerate && (
                  <button type="button" onClick={() => setEditingLong(true)} disabled={regenerating}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {!editingLong ? (
                <p className="text-sm font-semibold text-foreground">
                  {regenerating ? Updating : dayLabel(longRunDay)}
                </p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  <select className={selectClass} value={editLong} onChange={(e) => setEditLong(e.target.value)}>
                    {DAY_LABELS_ALL.map((d) => (
                      <option key={d} value={d}>{dayLabel(d)}</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 px-2 text-[10px] flex-1" onClick={handleSaveLong} disabled={regenerating}>
                      {L("Apply", "套用")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingLong(false)} disabled={regenerating}>
                      {L("Cancel", "取消")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Weekly mileage */}
            <div className="rounded-lg bg-muted/40 p-2">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {L("Weekly km", "每週公里")}
                </p>
                {!editingKm && onRegenerate && (
                  <button type="button" onClick={() => setEditingKm(true)} disabled={regenerating}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {!editingKm ? (
                <p className="text-sm font-semibold text-foreground">
                  {regenerating ? Updating : `${weeklyKm} km`}
                </p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  <select className={selectClass} value={editKm} onChange={(e) => setEditKm(parseInt(e.target.value, 10))}>
                    {Array.from({ length: 28 }, (_, i) => 10 + i * 5).map((n) => (
                      <option key={n} value={n}>{n} km</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 px-2 text-[10px] flex-1" onClick={handleSaveKm} disabled={regenerating}>
                      {L("Apply", "套用")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingKm(false)} disabled={regenerating}>
                      {L("Cancel", "取消")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Rest days */}
            <div className="rounded-lg bg-muted/40 p-2 col-span-2">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {L("Rest days", "休息日")}
                </p>
                {!editingRest && onRegenerate && (
                  <button type="button" onClick={() => setEditingRest(true)} disabled={regenerating}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {!editingRest ? (
                <p className="text-sm font-semibold text-foreground">
                  {regenerating ? Updating : (restDays.length ? restDays.map(dayLabel).join(", ") : "—")}
                </p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className={`${selectClass} text-left flex items-center justify-between`}>
                        <span className="truncate">
                          {editRest.length
                            ? editRest
                                .slice()
                                .sort((a, b) => DAY_LABELS_ALL.indexOf(a as any) - DAY_LABELS_ALL.indexOf(b as any))
                                .map(dayLabel)
                                .join(", ")
                            : L("Select days", "選擇日期")}
                        </span>
                        <ChevronDown size={12} className="text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-2">
                      <div className="space-y-1">
                        {DAY_LABELS_ALL.map((d) => {
                          const checked = editRest.includes(d);
                          return (
                            <label key={d} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent rounded px-1 py-0.5">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setEditRest((prev) => (v ? [...prev, d] : prev.filter((x) => x !== d)));
                                }}
                              />
                              <span>{dayLabel(d)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 px-2 text-[10px] flex-1" onClick={handleSaveRest} disabled={regenerating || editRest.length >= 7}>
                      {L("Apply", "套用")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingRest(false)} disabled={regenerating}>
                      {L("Cancel", "取消")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
            {(() => {
              const size = 76;
              const stroke = 9;
              const r = (size - stroke) / 2;
              const c = 2 * Math.PI * r;
              const ratio = Math.min(1, plannedKm > 0 ? completedKm / plannedKm : 0);
              return (
                <svg width={size} height={size} className="shrink-0 -rotate-90">
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke="hsl(var(--muted))"
                    strokeWidth={stroke}
                    fill="none"
                  />
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke="hsl(var(--primary))"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - ratio)}
                    fill="none"
                    className="transition-all"
                  />
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(90 ${size / 2} ${size / 2})`}
                    className="fill-foreground"
                    style={{ fontSize: 11, fontWeight: 700 }}
                  >
                    {Math.round(ratio * 100)}%
                  </text>
                </svg>
              );
            })()}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {L("This week — distance", "本週距離")}
              </p>
              <p className="text-base font-semibold text-foreground leading-tight">
                {completedKm.toFixed(1)}
                <span className="text-xs text-muted-foreground font-normal">
                  {" "}/ {plannedKm.toFixed(1)} km
                </span>
              </p>
            </div>
          </div>

          {/* Race Schedule moved out of ProgramHeader — see <RaceSchedulePanel /> below the header */}

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-muted-foreground">
                {L("This week — time", "本週時間")}
              </span>
              <span className="text-xs font-medium text-foreground">
                {Math.round(completedMin)} / {Math.round(plannedMin)} min
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pct(completedMin, plannedMin)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TrainingTab = ({ score, setScore, lang, onLoginRequest }: Props) => {
  const { isPremium } = usePremium();
  const [simpleMode] = useSimpleMode();
  const { user } = useAuth();
  const { toast } = useToast();
  const { online } = useOnlineStatus();
  const { activities: allActivities, userRaces } = useActivities();
  const queryClient = useQueryClient();

  // Paces view
  const [view, setView] = useState<"paces" | "equivalent">("paces");
  const [showPacesResult, setShowPacesResult] = useState(false);
  const [showScoreLevels, setShowScoreLevels] = useState(false);
  const activeScore = score ?? null;
  const mainPaces = activeScore ? getMainPaces(activeScore) : [];

  // Program section
  const [section, setSection] = useState<"training" | "free" | "program" | "custom">("training");
  const [showPlanConflict, setShowPlanConflict] = useState(false);
  const [pendingSection, setPendingSection] = useState<"free" | "program" | "custom" | null>(null);

  // Custom program state
  const [customStep, setCustomStep] = useState<"setup" | "calendar">("setup");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [customPlan, setCustomPlan] = useState<WeekPlan[]>([]);
  const [customWeekIdx, setCustomWeekIdx] = useState(0);
  const [customExistingPlan, setCustomExistingPlan] = useState<any>(null);
  const [showCustomCancelConfirm, setShowCustomCancelConfirm] = useState(false);
  const [customAddingDayIdx, setCustomAddingDayIdx] = useState<number | null>(null);
  const [customAddRunType, setCustomAddRunType] = useState<string | null>(null);
  const [customAddDistance, setCustomAddDistance] = useState("");
  const [customAddElevation, setCustomAddElevation] = useState("");
  const [customAddEph, setCustomAddEph] = useState("");
  const [customEditingDayIdx, setCustomEditingDayIdx] = useState<number | null>(null);
  const [customEditDistance, setCustomEditDistance] = useState("");
  const [customEditPace, setCustomEditPace] = useState("");
  const [customEditDescription, setCustomEditDescription] = useState("");

  // Free plans state
  const [freePlans, setFreePlans] = useState<any[]>([]);
  const [freeDistance, setFreeDistance] = useState<Distance>("5K");
  const [selectedFreePlan, setSelectedFreePlan] = useState<any>(null);
  const [freeWeekIdx, setFreeWeekIdx] = useState(0);
  const [loadingFree, setLoadingFree] = useState(false);
  const [freeExpanded, setFreeExpanded] = useState<Record<string, boolean>>({});
  const [showAddToCalendar, setShowAddToCalendar] = useState(false);
  const [calendarStartDate, setCalendarStartDate] = useState("");
  const [addingToCalendar, setAddingToCalendar] = useState(false);

  // Program questionnaire state
  const [programStep, setProgramStep] = useState<"details" | "calendar">("details");
  const [goal] = useState<Goal>("race");
  const [distance, setDistance] = useState<Distance | null>(null);
  const [targetTime, setTargetTime] = useState("");
  const [targetHours, setTargetHours] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("");
  const [targetSeconds, setTargetSeconds] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [weeklyKm, setWeeklyKm] = useState<number>(30);
  const [longRunDay, setLongRunDay] = useState<string>("Sun");
  const [restDays, setRestDays] = useState<string[]>(["Mon"]);
  const [trailDistanceKm, setTrailDistanceKm] = useState<string>("");
  const [trailElevationM, setTrailElevationM] = useState<string>("");
  const [trailTargetEph, setTrailTargetEph] = useState<string>("");
  const [raceOptions, setRaceOptions] = useState<{ id: string; name: string; name_zh: string | null; race_date: string; city: string; country: string }[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");
  const [customRaceName, setCustomRaceName] = useState<string>("");
  const [raceSearch, setRaceSearch] = useState<string>("");
  const [showRaceDropdown, setShowRaceDropdown] = useState<boolean>(false);

  // Calendar state
  const [plan, setPlan] = useState<WeekPlan[]>([]);
  const [currentWeekIdx, setCurrentWeekIdx] = useState(0);
  const [existingPlan, setExistingPlan] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const [planDirty, setPlanDirty] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);

  // ─── Recovery-based plan finetuning ───
  const [hasRecoveryData, setHasRecoveryData] = useState<boolean | null>(null);
  const [finetuneOpen, setFinetuneOpen] = useState(false);
  const [finetuning, setFinetuning] = useState(false);
  const [finetuneResult, setFinetuneResult] = useState<{
    summary_en: string;
    summary_zh: string;
    adjusted_days: any[];
    original_days: any[];
    recovery?: { avg_rhr: number | null; avg_hrv: number | null; avg_sleep: number | null; sample_days: number };
  } | null>(null);
  const [confirmingFinetune, setConfirmingFinetune] = useState(false);

  useEffect(() => {
    if (!user || !isPremium) { setHasRecoveryData(false); return; }
    (async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const [g, t] = await Promise.all([
        supabase.from("garmin_daily_health").select("resting_hr").eq("user_id", user.id).gte("date", since).gt("resting_hr", 0).limit(1),
        supabase.from("terra_daily_health").select("resting_hr,hrv").eq("user_id", user.id).gte("date", since).or("resting_hr.gt.0,hrv.gt.0").limit(1),
      ]);
      setHasRecoveryData(((g.data?.length ?? 0) + (t.data?.length ?? 0)) > 0);
    })();
  }, [user, isPremium]);

  const runFinetune = async () => {
    if (!existingPlan?.id) return;
    setFinetuning(true);
    setFinetuneOpen(true);
    setFinetuneResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("finetune-plan-week", {
        body: { plan_id: existingPlan.id, week_index: currentWeekIdx, action: "analyze", lang },
      });
      if (error) throw error;
      if (!data?.has_data) {
        toast({ title: lang === "zh" ? "暫無 HRV/RHR 資料" : "No HRV/RHR data available", variant: "destructive" });
        setFinetuneOpen(false);
        return;
      }
      setFinetuneResult(data);
    } catch (e: any) {
      toast({ title: lang === "zh" ? "分析失敗" : "Analysis failed", description: e.message, variant: "destructive" });
      setFinetuneOpen(false);
    } finally {
      setFinetuning(false);
    }
  };

  const confirmFinetune = async () => {
    if (!existingPlan?.id || !finetuneResult) return;
    setConfirmingFinetune(true);
    try {
      const { error } = await supabase.functions.invoke("finetune-plan-week", {
        body: { plan_id: existingPlan.id, week_index: currentWeekIdx, action: "confirm", adjusted_days: finetuneResult.adjusted_days },
      });
      if (error) throw error;
      const newPlan = [...plan];
      newPlan[currentWeekIdx] = { ...newPlan[currentWeekIdx], days: finetuneResult.adjusted_days };
      setPlan(newPlan);
      setExistingPlan({ ...existingPlan, plan_data: newPlan });
      notifyPlanChanged();
      toast({ title: lang === "zh" ? "本週計劃已更新" : "This week's plan updated" });
      setFinetuneOpen(false);
      setFinetuneResult(null);
    } catch (e: any) {
      toast({ title: lang === "zh" ? "更新失敗" : "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setConfirmingFinetune(false);
    }
  };

  // ─── Watch sync (Terra planned workouts → Garmin/Coros) ───
  const [watchProvider, setWatchProvider] = useState<string | null>(null);
  const [pushedSet, setPushedSet] = useState<Set<number>>(new Set());
  const [pushingIdx, setPushingIdx] = useState<number | null>(null);
  const [pushingWeek, setPushingWeek] = useState(false);
  useEffect(() => {
    if (!user) { setWatchProvider(null); return; }
    (async () => {
      const { data } = await supabase
        .from("terra_connections")
        .select("provider")
        .eq("user_id", user.id)
        .eq("active", true)
        .in("provider", ["GARMIN", "COROS"]);
      setWatchProvider(data && data.length > 0 ? data[0].provider : null);
    })();
  }, [user]);
  useEffect(() => {
    if (!user || !existingPlan?.id) { setPushedSet(new Set()); return; }
    (async () => {
      const { data } = await supabase
        .from("pushed_workouts" as any)
        .select("day_index")
        .eq("user_id", user.id)
        .eq("plan_id", existingPlan.id)
        .eq("week", currentWeekIdx);
      setPushedSet(new Set(((data as any[]) || []).map((r) => r.day_index)));
    })();
  }, [user, existingPlan?.id, currentWeekIdx]);
  const pushDayToWatch = async (dayIdx: number) => {
    if (!existingPlan?.id) return;
    if (!isPremium) { toast({ title: lang === "zh" ? "Premium 功能" : "Premium feature" }); return; }
    if (!watchProvider) {
      toast({ title: lang === "zh" ? "請先連接 Garmin 或 Coros" : "Connect Garmin or Coros first", variant: "destructive" });
      return;
    }
    setPushingIdx(dayIdx);
    try {
      const { data, error } = await supabase.functions.invoke("terra-push-workout", {
        body: { plan_id: existingPlan.id, week: currentWeekIdx, day_index: dayIdx, lang },
      });
      if (error) throw error;
      if (!(data as any)?.ok) {
        const msg = lang === "zh" ? (data as any)?.message_zh : (data as any)?.message_en;
        toast({ title: msg || (lang === "zh" ? "同步失敗" : "Sync failed"), variant: "destructive" });
      } else {
        setPushedSet((prev) => new Set(prev).add(dayIdx));
        toast({ title: lang === "zh" ? `已同步到 ${(data as any).provider}` : `Sent to ${(data as any).provider}` });
      }
    } catch (e) {
      toast({ title: lang === "zh" ? "同步失敗" : "Sync failed", variant: "destructive" });
    } finally {
      setPushingIdx(null);
    }
  };

  // Silently re-push a day if it was already pushed to the watch.
  // The terra-push-workout function deletes the prior workout before sending the new one,
  // so this won't create duplicates.
  const repushIfPushed = async (dayIdx: number) => {
    if (!existingPlan?.id || !user || !watchProvider || !isPremium) return;
    if (!pushedSet.has(dayIdx)) return;
    try {
      const { data } = await supabase.functions.invoke("terra-push-workout", {
        body: { plan_id: existingPlan.id, week: currentWeekIdx, day_index: dayIdx, lang },
      });
      const d = data as any;
      if (d?.ok) {
        // still pushed (now with updated content) – keep in set
      } else if (d?.code === "not_pushable") {
        // day became Rest – removed from watch
        setPushedSet((prev) => { const n = new Set(prev); n.delete(dayIdx); return n; });
      }
    } catch (e) {
      console.warn("[repushIfPushed] failed:", e);
    }
  };
  const pushWeekToWatch = async () => {
    if (!existingPlan?.id) return;
    if (!isPremium) { toast({ title: lang === "zh" ? "Premium 功能" : "Premium feature" }); return; }
    if (!watchProvider) {
      toast({ title: lang === "zh" ? "請先連接 Garmin 或 Coros" : "Connect Garmin or Coros first", variant: "destructive" });
      return;
    }
    setPushingWeek(true);
    try {
      const { data, error } = await supabase.functions.invoke("terra-push-week", {
        body: { plan_id: existingPlan.id, week: currentWeekIdx, lang },
      });
      if (error) throw error;
      const d = data as any;
      const msg = lang === "zh" ? d?.message_zh : d?.message_en;
      toast({ title: msg || (d?.ok ? "Done" : "Failed"), variant: d?.ok ? "default" : "destructive" });
      if (d?.ok) {
        const w = (existingPlan.plan_data?.[currentWeekIdx]?.days || []) as any[];
        const next = new Set<number>();
        w.forEach((day, i) => { if (day?.type !== "Rest" && day?.distance_km) next.add(i); });
        setPushedSet(next);
      }
    } catch (e) {
      toast({ title: lang === "zh" ? "同步失敗" : "Sync failed", variant: "destructive" });
    } finally {
      setPushingWeek(false);
    }
  };

  // Add/Edit workout
  const [addingDayIdx, setAddingDayIdx] = useState<number | null>(null);
  const [addRunType, setAddRunType] = useState<string | null>(null);
  const [addDistance, setAddDistance] = useState("");
  const [addElevation, setAddElevation] = useState("");
  const [addEph, setAddEph] = useState("");
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [editAppendNew, setEditAppendNew] = useState(false);
  const [customEditAppendNew, setCustomEditAppendNew] = useState(false);
  const [editDistance, setEditDistance] = useState("");
  const [editPace, setEditPace] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // ─── Race Time Predictor (deterministic, HR-zone + VDOT based) ───
  const parseTargetToSec = (t: string | null | undefined): number | null => {
    if (!t) return null;
    const parts = t.split(":").map((x) => parseInt(x, 10));
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  };
  const fmtSec = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };

  const canPredictRaceTime = !!existingPlan?.target_time && typeof existingPlan?.distance === "string" && ["5K", "10K", "HM", "FM"].includes(existingPlan.distance);





  // User HR profile → zone bounds for showing HR ranges in the plan
  const [hrBounds, setHrBounds] = useState<HrBounds | null>(null);
  const [suggestProfile, setSuggestProfile] = useState<SuggestProfile | null>(null);
  useEffect(() => {
    if (!user) { setHrBounds(null); setSuggestProfile(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles" as any)
          .select("age, max_heartrate, resting_heartrate, custom_hr_zones")
          .eq("id", user.id)
          .maybeSingle();
        const p: any = data || {};
        const max = estimateMaxHr(p.age, p.max_heartrate);
        const rest = estimateRestingHr(p.resting_heartrate);
        const custom = isValidCustomZones(p.custom_hr_zones) ? (p.custom_hr_zones as number[]) : null;
        const b = zoneBoundaries(max, rest, custom);
        if (!cancelled) {
          setHrBounds({ ...b, max });
          setSuggestProfile({ age: p.age ?? null, max_hr: p.max_heartrate ?? null, resting_hr: p.resting_heartrate ?? null, custom_zones: custom });
        }
      } catch {
        if (!cancelled) { setHrBounds(null); setSuggestProfile(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Recent runs (last 30 days) for pace suggestion.
  const recentRunActivities = useMemo<SuggestActivity[]>(() => {
    if (!allActivities) return [];
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    return (allActivities as any[])
      .filter((a) => a && (!a.sport_type || /run/i.test(a.sport_type)))
      .filter((a) => a.start_date ? Date.parse(a.start_date) >= cutoff : true)
      .map((a) => ({
        distance: Number(a.distance) || 0,
        moving_time: a.moving_time ?? null,
        elapsed_time: a.elapsed_time ?? null,
        sport_type: a.sport_type ?? null,
        start_date: a.start_date ?? null,
        average_heartrate: a.average_heartrate ?? null,
      }));
  }, [allActivities]);

  const aiTargetTime = useMemo(() => targetTimeFromPlan(existingPlan?.distance ?? null, existingPlan?.target_time ?? null), [existingPlan?.distance, existingPlan?.target_time]);

  // Deterministic HR + VDOT race prediction over last 30 days.
  const racePrediction = useMemo(() => {
    if (!canPredictRaceTime || !existingPlan) return null;
    if (!allActivities || allActivities.length === 0) return null;
    const hrZones = hrBounds
      ? { z1: hrBounds.z1, z2: hrBounds.z2, z3: hrBounds.z3, z4: hrBounds.z4, z5: hrBounds.z5 }
      : null;
    return predictRaceFromActivities(
      allActivities as any,
      hrZones,
      String(existingPlan.distance),
      30,
    );
  }, [canPredictRaceTime, existingPlan, allActivities, hrBounds]);



  // Load existing plan (cache-then-network so it works offline)
  useEffect(() => {
    if (!user) return;

    let initializedWeekIdx = false;
    const applyPlan = (p: any) => {
      if (!p) return;
      const normalized = splitIntervalsInPlan(p.plan_data || [], { lang });
      const planData = normalized.plan || p.plan_data || [];
      const nextPlanObj = normalized.changed > 0 ? { ...p, plan_data: planData } : p;
      if (normalized.changed > 0 && online) {
        supabase.from("training_plans" as any).update({ plan_data: planData } as any).eq("id", p.id).then(() => notifyPlanChanged());
      }
      if (p.goal === "custom") {
        setCustomExistingPlan(nextPlanObj);
        setCustomPlan(planData);
        setCustomStep("calendar");
        if (!initializedWeekIdx) {
          const today = new Date().toISOString().split("T")[0];
          const idx = planData.findIndex((w: WeekPlan) => w.days.some((d: DayPlan) => d.date >= today));
          setCustomWeekIdx(Math.max(0, idx));
          initializedWeekIdx = true;
        }
      } else {
        setExistingPlan(nextPlanObj);
        setPlan(planData);
        setProgramStep("calendar");
        if (!initializedWeekIdx) {
          const today = new Date().toISOString().split("T")[0];
          const idx = planData.findIndex((w: WeekPlan) => w.days.some((d: DayPlan) => d.date >= today));
          setCurrentWeekIdx(Math.max(0, idx));
          initializedWeekIdx = true;
        }
      }
    };

    // 1) Hydrate from cache so the calendar is visible offline.
    const cached = getCached<any>(CacheKeys.trainingPlan(user.id));
    if (cached) applyPlan(cached.value);

    // 2) Refresh from network when online.
    if (!online) return;
    const load = async () => {
      try {
        const { data } = await supabase.from("training_plans" as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
        if (data && (data as any[]).length > 0) {
          const p = (data as any[])[0];
          applyPlan(p);
          setCached(CacheKeys.trainingPlan(user.id), p);
        }
      } catch {
        // Network failed — keep cached plan on screen.
      }
    };
    load();
    const unsub = subscribePlanChanged(() => { void load(); });
    return () => { unsub(); };
  }, [user, online]);


  // Load free plans for selected distance (cache-then-network)
  useEffect(() => {
    const cacheKey = CacheKeys.freePlans(freeDistance);
    const cached = getCached<any[]>(cacheKey);
    if (cached) {
      setFreePlans(cached.value || []);
      setSelectedFreePlan(null);
      setFreeWeekIdx(0);
      setLoadingFree(false);
    } else {
      setLoadingFree(true);
    }
    if (!online) {
      setLoadingFree(false);
      return;
    }
    const loadFree = async () => {
      try {
        const { data } = await supabase.from("free_training_plans" as any).select("*").eq("distance", freeDistance).order("target_time");
        const list = (data as any[]) || [];
        setFreePlans(list);
        setSelectedFreePlan(null);
        setFreeWeekIdx(0);
        setCached(cacheKey, list);
      } catch {
        // Keep cached value
      } finally {
        setLoadingFree(false);
      }
    };
    loadFree();
  }, [freeDistance, online]);

  const weeksUntilRace = useMemo(() => {
    if (!raceDate || !startDate) return 0;
    const start = new Date(startDate + "T00:00:00").getTime();
    const end = new Date(raceDate + "T00:00:00").getTime();
    return Math.max(0, Math.ceil((end - start + 24 * 60 * 60 * 1000) / (7 * 24 * 60 * 60 * 1000)));
  }, [raceDate, startDate]);

  const minWeeks = distance ? MIN_WEEKS[distance] : 4;
  const dateValid = weeksUntilRace >= minWeeks;

  const getPace = (timeSeconds: number, meters: number): string => {
    const pacePerKm = timeSeconds / (meters / 1000);
    const m = Math.floor(pacePerKm / 60);
    const s = Math.round(pacePerKm % 60);
    return `${m}:${s.toString().padStart(2, "0")} / km`;
  };

  // Register unsaved-changes guard for plan edits
  useEffect(() => registerUnsavedChecker(() => planDirty), [planDirty]);

  // Warn on browser close/refresh while plan is dirty
  useEffect(() => {
    if (!planDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [planDirty]);

  // Swap two days' workouts (within the current week) — preserves date & day label
  const swapDays = (weekIdx: number, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setPlan((prev) => {
      const next = prev.map((w) => ({ ...w, days: w.days.slice() }));
      const week = next[weekIdx];
      if (!week) return prev;
      const a = week.days[fromIdx];
      const b = week.days[toIdx];
      if (!a || !b) return prev;
      // Swap workout content (everything except date & day label)
      const swap = (x: DayPlan, y: DayPlan): DayPlan => ({
        day: x.day,
        date: x.date,
        type: y.type,
        title: y.title,
        description: y.description,
        distance_km: y.distance_km,
        pace: y.pace,
        color: y.color,
        elevation_m: y.elevation_m ?? null,
        eph: y.eph ?? null,
      });
      week.days[fromIdx] = swap(a, b);
      week.days[toIdx] = swap(b, a);
      return next;
    });
    setPlanDirty(true);
    // Auto re-push affected days if previously pushed
    void repushIfPushed(fromIdx);
    void repushIfPushed(toIdx);
  };

  const savePlanEdits = async () => {
    if (!user || !existingPlan?.id) return;
    setSavingPlan(true);
    try {
      const { error } = await supabase
        .from("training_plans" as any)
        .update({ plan_data: plan as any })
        .eq("id", existingPlan.id);
      if (error) throw error;
      setExistingPlan({ ...existingPlan, plan_data: plan });
      setPlanDirty(false);
      notifyPlanChanged();
      toast({
        title: lang === "zh" ? "已儲存" : "Saved",
        description: lang === "zh" ? "訓練計劃已更新" : "Your training plan has been updated",
      });
    } catch (err: any) {
      toast({
        title: lang === "zh" ? "儲存失敗" : "Save failed",
        description: err.message || (lang === "zh" ? "請稍後再試" : "Please try again"),
        variant: "destructive",
      });
    } finally {
      setSavingPlan(false);
    }
  };

  // Keep restDays valid given daysPerWeek and longRunDay
  useEffect(() => {
    const max = 7 - daysPerWeek;
    setRestDays((prev) => prev.filter((d) => d !== longRunDay).slice(0, Math.max(0, max)));
  }, [daysPerWeek, longRunDay]);

  // Load upcoming races for optional race picker
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("races")
          .select("id,name,name_zh,race_date,city,country")
          .gte("race_date", new Date().toISOString().split("T")[0])
          .order("race_date", { ascending: true })
          .limit(500);
        if (!cancelled && data) {
          // Dedupe by name + date (multiple categories share a race)
          const seen = new Set<string>();
          const unique: any[] = [];
          for (const r of data as any[]) {
            const key = `${r.name}__${r.race_date}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(r);
          }
          setRaceOptions(unique);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedRace = useMemo(
    () => raceOptions.find((r) => r.id === selectedRaceId) || null,
    [raceOptions, selectedRaceId]
  );
  const computedTrailRaceEph = useMemo(() => {
    const km = Number(trailDistanceKm);
    const ele = Number(trailElevationM);
    const parts = targetTime.split(":").map(Number);
    const hours = parts.length === 3 ? (parts[0] || 0) + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600 : 0;
    if (!km || !isFinite(km) || !isFinite(ele) || hours <= 0) return null;
    return Math.round(((km + ele / 100) / hours) * 10) / 10;
  }, [trailDistanceKm, trailElevationM, targetTime]);
  const resolvedRaceName = selectedRace
    ? (lang === "zh" && selectedRace.name_zh ? selectedRace.name_zh : selectedRace.name)
    : (customRaceName.trim() || null);

  const filteredRaces = useMemo(() => {
    const q = raceSearch.trim().toLowerCase();
    const list = q
      ? raceOptions.filter((r) =>
          r.name.toLowerCase().includes(q) ||
          (r.name_zh || "").toLowerCase().includes(q) ||
          (r.city || "").toLowerCase().includes(q) ||
          (r.country || "").toLowerCase().includes(q)
        )
      : raceOptions;
    return list.slice(0, 30);
  }, [raceOptions, raceSearch]);

  // ─── Race-aware program helpers ───
  type RaceSchedItem = { user_race_id: string; race_name: string; race_date: string; category: string; priority: string };
  const distanceForCategory = (cat: string): number | null => {
    const c = (cat || "").toUpperCase();
    if (c === "5K") return 5;
    if (c === "10K") return 10;
    if (c === "HM" || c === "HALF" || c === "HALF MARATHON") return 21.1;
    if (c === "FM" || c === "FULL" || c === "MARATHON") return 42.2;
    return null;
  };
  const buildRaceSnapshot = (windowStart: string, windowEnd: string): RaceSchedItem[] => {
    if (!Array.isArray(userRaces)) return [];
    return (userRaces as any[])
      .filter((r) => r?.race_date && r.race_date >= windowStart && r.race_date <= windowEnd)
      .map((r) => ({
        user_race_id: r.id,
        race_name: (lang === "zh" && r.race_name_zh) || r.race_name,
        race_date: r.race_date,
        category: r.category || "",
        priority: r.priority || "none",
      }))
      .sort((a, b) => a.race_date.localeCompare(b.race_date));
  };
  const racesPayloadFromSnapshot = (snap: RaceSchedItem[]) =>
    snap.map((r) => ({ name: r.race_name, race_date: r.race_date, category: r.category, priority: r.priority }));
  const normalizeRacePriority = (priority: unknown) => ["A", "B", "C"].includes(String(priority)) ? String(priority) : "none";
  const racesEqual = (a: RaceSchedItem[], b: RaceSchedItem[]) => {
    // Compare only fields that affect plan generation. Ignore user_race_id (older
    // snapshots may not have stored it) and race_name (changes with language).
    const norm = (arr: RaceSchedItem[]) =>
      [...arr]
        .map((r) => `${r.race_date}|${(r.category || "").toUpperCase()}|${normalizeRacePriority(r.priority)}`)
        .sort();
    const na = norm(a), nb = norm(b);
    if (na.length !== nb.length) return false;
    for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) return false;
    return true;
  };
  const ensurePlanMatchesRaceSchedule = (planData: WeekPlan[], raceSchedule: RaceSchedItem[]): WeekPlan[] => {
    if (!Array.isArray(planData) || !Array.isArray(raceSchedule) || raceSchedule.length === 0) return planData;
    let changed = false;
    const raceByDate = new Map(raceSchedule.filter((r) => r.race_date).map((r) => [r.race_date, r]));
    const nextPlan = planData.map((week) => ({ ...week, days: (week.days || []).map((day) => ({ ...day })) }));

    for (let wi = 0; wi < nextPlan.length; wi++) {
      const days = nextPlan[wi].days || [];
      for (let di = 0; di < days.length; di++) {
        const race = raceByDate.get(days[di]?.date);
        if (!race) continue;
        const distanceKm = distanceForCategory(race.category) ?? days[di].distance_km ?? null;
        const priority = normalizeRacePriority(race.priority).toUpperCase();
        const title = race.race_name || (lang === "zh" ? "比賽日" : "Race Day");
        const isTrailPlanRace = String(race.category || "").toUpperCase() === "TR" || days[di]?.type === "Trail Race";
        const description = lang === "zh"
          ? `${title}（${priority === "NONE" ? "未設定" : priority} 優先級）。此日已按你的賽事行程安排為${isTrailPlanRace ? "越野賽" : "比賽"}。`
          : `${title} (${priority === "NONE" ? "unprioritized" : `${priority}-priority`} ${isTrailPlanRace ? "trail race" : "race"}). Scheduled from your race calendar.`;
        const trailRaceDistance = isTrailPlanRace ? (days[di].distance_km ?? distanceKm) : distanceKm;
        const patchedDay: DayPlan = {
          ...days[di],
          type: isTrailPlanRace ? "Trail Race" : "Race",
          title: isTrailPlanRace ? (lang === "zh" ? "越野賽日" : "Trail Race Day") : title,
          description,
          distance_km: trailRaceDistance,
          pace: isTrailPlanRace ? null : days[di].pace,
          color: isTrailPlanRace ? "#65A30D" : "#E91E63",
          elevation_m: isTrailPlanRace ? (days[di].elevation_m ?? null) : null,
          eph: isTrailPlanRace ? (days[di].eph ?? null) : null,
        };
        if (JSON.stringify(days[di]) !== JSON.stringify(patchedDay)) {
          days[di] = patchedDay;
          changed = true;
        }
        if (di + 1 < days.length && days[di + 1]?.type !== "Rest" && days[di + 1]?.type !== "Recovery") {
          days[di + 1] = { ...days[di + 1], type: "Recovery", title: lang === "zh" ? "賽後恢復" : "Post-race Recovery", description: lang === "zh" ? "非常輕鬆的賽後恢復跑。" : "Very easy post-race recovery run.", color: "#9C27B0" };
          changed = true;
        }
      }
    }
    return changed ? nextPlan : planData;
  };

  const handleGenerate = async () => {
    const isFitness = distance === "FT";
    if (!distance) return;
    if (!isFitness && (!targetTime || !raceDate || !startDate || !dateValid)) return;
    if (!isOnline()) {
      toast({
        title: lang === "zh" ? "離線中" : "You're offline",
        description: lang === "zh" ? "需要連線才能生成訓練計劃" : "Connect to the internet to generate a training plan",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      // Make sure the picked target race is the A-priority race in user_races so My Races stays in sync.
      if (!isFitness && user && resolvedRaceName) {
        try {
          const matching = (userRaces as any[] | undefined)?.find(
            (r) => r?.race_date === raceDate && (r.race_name === resolvedRaceName || r.race_name_zh === resolvedRaceName),
          );
          if (matching) {
            if (matching.priority !== "A") {
              await (supabase.from("user_races" as any) as any).update({ priority: "A" }).eq("id", matching.id).eq("user_id", user.id);
            }
          } else {
            await (supabase.from("user_races" as any) as any).insert({
              user_id: user.id,
              race_name: resolvedRaceName,
              race_date: raceDate,
              category: distance,
              city: selectedRace?.city || null,
              country: selectedRace?.country || null,
              source: selectedRace ? "races" : "manual",
              source_race_id: selectedRace?.id || null,
              priority: "A",
            });
          }
          await queryClient.invalidateQueries({ queryKey: ["user-races"] });
        } catch (e) { console.warn("user_races sync failed", e); }
      }

      // Refresh races snapshot for the plan window (skip for fitness mode)
      const freshRaces = await (async () => {
        if (isFitness || !user) return [] as any[];
        const { data } = await supabase
          .from("user_races" as any)
          .select("id,race_name,race_name_zh,race_date,category,priority")
          .eq("user_id", user.id)
          .gte("race_date", startDate)
          .lte("race_date", raceDate)
          .order("race_date", { ascending: true });
        return (data as any[]) || [];
      })();
      const snapshot: RaceSchedItem[] = freshRaces.map((r: any) => ({
        user_race_id: r.id,
        race_name: (lang === "zh" && r.race_name_zh) || r.race_name,
        race_date: r.race_date,
        category: r.category || "",
        priority: r.priority || "none",
      }));

      // For fitness mode, default to today as start. Plan is ONGOING (no end date) —
      // we generate a rolling 4-week block that the user can regenerate to extend.
      const todayIso = new Date().toISOString().split("T")[0];
      const fitnessStart = isFitness ? todayIso : startDate;
      const fitnessWeeks = isFitness ? 4 : weeksUntilRace;
      const effectiveGoal = isFitness ? "fitness" : goal;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-program`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ goal: effectiveGoal, distance, targetTime: isFitness ? "" : targetTime, raceDate: isFitness ? "" : raceDate, startDate: fitnessStart, weeks: fitnessWeeks, daysPerWeek, weeklyKm: isFitness ? null : weeklyKm, longRunDay: isFitness ? null : longRunDay, restDays: isFitness ? [] : restDays, raceName: isFitness ? null : resolvedRaceName, raceCity: selectedRace?.city || null, raceCountry: selectedRace?.country || null, lang, races: racesPayloadFromSnapshot(snapshot), trailDistanceKm: distance === "TR" ? Number(trailDistanceKm) || null : null, trailElevationM: distance === "TR" ? Number(trailElevationM) || 0 : null, trailTargetEph: distance === "TR" ? Number(trailTargetEph) || null : null }),
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || "Failed to generate"); }
      const result = await response.json();
      if (!Array.isArray(result.plan) || result.plan.length === 0) {
        throw new Error(lang === "zh" ? "AI 未能生成有效訓練計劃，請再試一次。" : "AI did not return a valid training plan. Please try again.");
      }
      const planData = ensurePlanMatchesRaceSchedule(result.plan || [], snapshot);
      setPlan(planData);
      setCurrentWeekIdx(0);
      setProgramStep("calendar");
      if (user) {
        await supabase.from("training_plans" as any).delete().eq("user_id", user.id);
        const lastDayDate = (planData[planData.length - 1]?.days?.slice(-1)?.[0]?.date) || fitnessStart;
        const inserted: any = {
          user_id: user.id, goal: effectiveGoal || "race", distance, target_time: isFitness ? "" : targetTime,
          race_date: isFitness ? null : raceDate, weeks: fitnessWeeks, plan_data: planData, raw_output: result.raw || "",
          race_schedule: snapshot,
        };
        const { data: saved } = await (supabase.from("training_plans" as any) as any).insert(inserted).select().single();
        const nextPlan = saved || inserted;
        setExistingPlan(nextPlan);
        setCached(CacheKeys.trainingPlan(user.id), nextPlan);
        notifyPlanChanged();
      }
    } catch (err: any) {
      console.error("Error generating program:", err);
      toast({ title: lang === "zh" ? "錯誤" : "Error", description: err.message || (lang === "zh" ? "生成訓練計劃時出錯" : "Failed to generate program"), variant: "destructive" });
    } finally { setLoading(false); }
  };

  const [regeneratingTime, setRegeneratingTime] = useState(false);
  type RegenOverrides = {
    targetTime?: string;
    daysPerWeek?: number;
    longRunDay?: string;
    restDays?: string[];
    weeklyKm?: number;
  };
  const handleRegeneratePlan = async (overrides: RegenOverrides = {}) => {
    if (!existingPlan || !user) return;
    if (!isOnline()) {
      toast({
        title: lang === "zh" ? "離線中" : "You're offline",
        description: lang === "zh" ? "需要連線才能更新計劃" : "Connect to the internet to update your plan",
        variant: "destructive",
      });
      return;
    }
    const planArr: WeekPlan[] = Array.isArray(existingPlan.plan_data) ? existingPlan.plan_data : [];
    const w0 = planArr[0];
    const w0Days = (w0?.days || []) as DayPlan[];
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const restDaysCurrent = w0Days.filter((d) => d.type === "Rest").map((d) => d.day).filter((d) => dayLabels.includes(d));
    const longRunDayCurrent = (w0Days.find((d) => d.type === "Long Run")?.day) || "Sun";
    const daysPerWeekCurrent = Math.max(1, 7 - restDaysCurrent.length);
    // Use the PEAK week's mileage as the target weekly volume so regeneration
    // remembers the user's chosen weekly km (week 1 is usually a low base week).
    const weeklyKmDerived = Math.max(
      10,
      Math.round(
        Math.max(
          0,
          ...planArr.map((w) =>
            ((w?.days as DayPlan[] | undefined) || []).reduce((s, d) => s + (d.distance_km || 0), 0),
          ),
        ),
      ),
    );
    const weeklyKmFinal = overrides.weeklyKm ?? weeklyKmDerived;
    const startDateDerived = w0?.startDate || w0Days[0]?.date || new Date().toISOString().slice(0, 10);
    const raceDateDerived = existingPlan.race_date || "";
    const inclusiveWeeksToRace = raceDateDerived
      ? Math.ceil((new Date(raceDateDerived + "T00:00:00").getTime() - new Date(startDateDerived + "T00:00:00").getTime() + 24 * 60 * 60 * 1000) / (7 * 24 * 60 * 60 * 1000))
      : 0;
    const weeksDerived = Math.max(Number(existingPlan.weeks) || 0, planArr.length || 0, inclusiveWeeksToRace || 0, 8);
    const distanceDerived = existingPlan.distance || "";
    const goalDerived = existingPlan.goal || "race";
    const targetTimeFinal = overrides.targetTime ?? String(existingPlan.target_time ?? "");
    const trailRaceDay = planArr.flatMap((w) => w?.days || []).find((d: DayPlan) => d.type === "Trail Race") as DayPlan | undefined;
    const trailRunDay = planArr.flatMap((w) => w?.days || []).find((d: DayPlan) => d.type === "Trail Run") as DayPlan | undefined;
    const trailDistanceFinal = distanceDerived === "TR" ? (trailRaceDay?.distance_km ?? (Number(trailDistanceKm) || null)) : null;
    const trailElevationFinal = distanceDerived === "TR" ? (trailRaceDay?.elevation_m ?? trailRunDay?.elevation_m ?? (Number(trailElevationM) || null)) : null;
    const trailEphFinal = distanceDerived === "TR" ? (trailRaceDay?.eph ?? (Number(trailTargetEph) || null)) : null;

    let restDaysFinal = overrides.restDays ?? restDaysCurrent;
    let daysPerWeekFinal = overrides.daysPerWeek ?? daysPerWeekCurrent;
    // Reconcile runs/week with rest days when one but not both is overridden.
    if (overrides.daysPerWeek !== undefined && overrides.restDays === undefined) {
      const desiredRest = 7 - daysPerWeekFinal;
      if (restDaysFinal.length !== desiredRest) {
        if (restDaysFinal.length > desiredRest) {
          restDaysFinal = restDaysFinal.slice(0, desiredRest);
        } else {
          const candidates = ["Mon", "Fri", "Wed", "Tue", "Thu", "Sat", "Sun"];
          for (const d of candidates) {
            if (restDaysFinal.length >= desiredRest) break;
            if (!restDaysFinal.includes(d)) restDaysFinal = [...restDaysFinal, d];
          }
        }
      }
    } else if (overrides.restDays !== undefined && overrides.daysPerWeek === undefined) {
      daysPerWeekFinal = 7 - restDaysFinal.length;
    }
    const longRunDayFinal = overrides.longRunDay ?? longRunDayCurrent;
    // Long run day must not collide with rest days
    if (restDaysFinal.includes(longRunDayFinal)) {
      restDaysFinal = restDaysFinal.filter((d) => d !== longRunDayFinal);
      daysPerWeekFinal = 7 - restDaysFinal.length;
    }

    setRegeneratingTime(true);
    try {
      // Pull the freshest race schedule for the plan window from user_races
      const freshRaces = await (async () => {
        if (!user) return [] as any[];
        const { data } = await supabase
          .from("user_races" as any)
          .select("id,race_name,race_name_zh,race_date,category,priority")
          .eq("user_id", user.id)
          .gte("race_date", startDateDerived)
          .lte("race_date", raceDateDerived || "9999-12-31")
          .order("race_date", { ascending: true });
        return (data as any[]) || [];
      })();
      const snapshot: RaceSchedItem[] = freshRaces.map((r: any) => ({
        user_race_id: r.id,
        race_name: (lang === "zh" && r.race_name_zh) || r.race_name,
        race_date: r.race_date,
        category: r.category || "",
        priority: r.priority || "none",
      }));

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-program`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          goal: goalDerived, distance: distanceDerived, targetTime: targetTimeFinal,
          raceDate: raceDateDerived, startDate: startDateDerived, weeks: weeksDerived,
          daysPerWeek: daysPerWeekFinal, weeklyKm: weeklyKmFinal,
          longRunDay: longRunDayFinal, restDays: restDaysFinal, lang,
          races: racesPayloadFromSnapshot(snapshot),
          trailDistanceKm: trailDistanceFinal,
          trailElevationM: trailElevationFinal,
          trailTargetEph: trailEphFinal,
        }),
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || "Failed to regenerate"); }
      const result = await response.json();
      if (!Array.isArray(result.plan) || result.plan.length === 0) {
        throw new Error(lang === "zh" ? "AI 未能生成有效訓練計劃，現有計劃已保留。" : "AI did not return a valid training plan. Your existing plan was kept.");
      }
      const planData = ensurePlanMatchesRaceSchedule(result.plan || [], snapshot);
      setPlan(planData);
      setCurrentWeekIdx(0);
      await supabase.from("training_plans" as any).delete().eq("user_id", user.id);
      const inserted: any = {
        user_id: user.id, goal: goalDerived, distance: distanceDerived, target_time: targetTimeFinal,
        race_date: raceDateDerived, weeks: weeksDerived, plan_data: planData, raw_output: result.raw || "",
        race_schedule: snapshot,
      };
      const { data: saved } = await (supabase.from("training_plans" as any) as any).insert(inserted).select().single();
      const nextPlan = saved || inserted;
      setExistingPlan(nextPlan);
      setCached(CacheKeys.trainingPlan(user.id), nextPlan);
      notifyPlanChanged();
      toast({
        title: lang === "zh" ? "計劃已更新" : "Plan updated",
        description: lang === "zh" ? "已根據新設定調整訓練" : "Workouts adjusted for the new settings",
      });
    } catch (err: any) {
      console.error("Error regenerating program:", err);
      toast({ title: lang === "zh" ? "錯誤" : "Error", description: err.message || (lang === "zh" ? "更新計劃時出錯" : "Failed to update plan"), variant: "destructive" });
    } finally {
      setRegeneratingTime(false);
    }
  };

  const handleNewPlan = async () => {
    if (!isOnline()) {
      toast({
        title: lang === "zh" ? "離線中" : "You're offline",
        description: lang === "zh" ? "需要連線才能修改計劃" : "Connect to the internet to edit your plan",
        variant: "destructive",
      });
      return;
    }
    // Delete from DB so it's removed from the activity calendar
    if (user && existingPlan) {
      await supabase.from("training_plans" as any).delete().eq("id", existingPlan.id);
      // Clear cached copy so the calendar reflects the deletion next load.
      const { clearCached } = await import("@/lib/offlineCache");
      clearCached(CacheKeys.trainingPlan(user.id));
      notifyPlanChanged();
    }
    setProgramStep("details"); setDistance(null); setTargetTime(""); setTargetHours(""); setTargetMinutes(""); setTargetSeconds(""); setRaceDate(""); setStartDate(""); setPlan([]); setExistingPlan(null); setPlanDirty(false); setTrailDistanceKm(""); setTrailElevationM("");
  };


  // Section switch — allow free browsing, no conflict checks here
  const hasAnyPlan = !!(existingPlan || customExistingPlan);
  const handleSectionSwitch = (target: "training" | "free" | "program" | "custom") => {
    setSection(target);
  };

  const handleConflictCancel = async () => {
    const targetSection = pendingSection;
    // Cancel whichever plan is active
    if (customExistingPlan) {
      await handleCancelCustomPlan();
    } else if (existingPlan) {
      await handleNewPlan();
    }
    setShowPlanConflict(false);
    setPendingSection(null);
    if (targetSection === "free") {
      // After cancelling, open add-to-calendar for the free plan
      setShowAddToCalendar(true);
      setCalendarStartDate("");
    } else if (targetSection === "custom") {
      // After cancelling, create the custom plan
      setTimeout(() => handleCreateCustomPlan(), 100);
    } else if (targetSection === "program") {
      // After cancelling, proceed with AI plan generation
      setTimeout(() => handleGenerate(), 100);
    } else if (targetSection) {
      setSection(targetSection);
    }
  };

  const handleGenerateClick = () => {
    if (hasAnyPlan) {
      setPendingSection("program");
      setShowPlanConflict(true);
      return;
    }
    handleGenerate();
  };

  // Create custom plan skeleton
  const handleCreateCustomPlan = async () => {
    if (!customStartDate || !customEndDate || !user) return;
    const start = new Date(customStartDate + "T00:00:00");
    const end = new Date(customEndDate + "T00:00:00");
    if (end <= start) return;

    // Adjust start to Monday
    const dayOfWeek = start.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(start.getDate() + mondayOffset);

    const weeks: WeekPlan[] = [];
    let weekNum = 1;
    const cursor = new Date(start);
    while (cursor <= end) {
      const days: DayPlan[] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        days.push({ day: DAY_LABELS[d], date: dateStr, type: "Rest", title: lang === "zh" ? "休息" : "Rest Day", description: "", distance_km: null, pace: null, color: "#607D8B" });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push({ week: weekNum, startDate: days[0].date, days });
      weekNum++;
    }

    // Delete existing plans
    await supabase.from("training_plans" as any).delete().eq("user_id", user.id);

    const { data } = await (supabase.from("training_plans" as any) as any).insert({
      user_id: user.id, goal: "custom", distance: "custom", target_time: "00:00:00",
      race_date: customEndDate, weeks: weeks.length, plan_data: weeks, raw_output: "",
    }).select().single();

    if (data) {
      setCustomExistingPlan(data);
      setCustomPlan(weeks);
      setCustomWeekIdx(0);
      setCustomStep("calendar");
      setExistingPlan(null);
      setPlan([]);
      setCached(CacheKeys.trainingPlan(user.id), data);
      notifyPlanChanged();
      toast({ title: lang === "zh" ? "計劃已建立" : "Program Created" });
    }
  };

  const handleCancelCustomPlan = async () => {
    if (user && customExistingPlan) {
      await supabase.from("training_plans" as any).delete().eq("id", customExistingPlan.id);
      notifyPlanChanged();
    }
    setCustomExistingPlan(null);
    setCustomPlan([]);
    setCustomStep("setup");
    setCustomStartDate("");
    setCustomEndDate("");
    setShowCustomCancelConfirm(false);
  };

  const handleAddFreePlanToCalendar = async () => {
    if (!user || !selectedFreePlan || !calendarStartDate) return;
    setAddingToCalendar(true);
    try {
      const startDate = new Date(calendarStartDate + "T00:00:00");
      const planData = selectedFreePlan.plan_data || [];
      const mappedPlan: WeekPlan[] = planData.map((week: any, weekIdx: number) => {
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + weekIdx * 7);
        // Adjust to Monday
        const dayOfWeek = weekStart.getDay();
        const mondayOffset = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : -(dayOfWeek - 1));
        weekStart.setDate(weekStart.getDate() + mondayOffset);

        const days = (week.days || []).map((day: any, dayIdx: number) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + dayIdx);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return { ...day, date: dateStr };
        });
        return { week: week.week || weekIdx + 1, startDate: days[0]?.date || "", days };
      });

      // Delete all existing plans so calendar is clean
      await supabase.from("training_plans" as any).delete().eq("user_id", user.id);

      const lastWeek = mappedPlan[mappedPlan.length - 1];
      const lastDay = lastWeek?.days?.[lastWeek.days.length - 1];
      const raceDateStr = lastDay?.date || calendarStartDate;

      const { data: insertedData } = await (supabase.from("training_plans" as any) as any).insert({
        user_id: user.id,
        goal: "free",
        distance: freeDistance,
        target_time: selectedFreePlan.target_time,
        race_date: raceDateStr,
        weeks: selectedFreePlan.weeks || mappedPlan.length,
        plan_data: mappedPlan,
        raw_output: "",
      }).select().single();

      // Update state to show active free plan
      setExistingPlan(insertedData || {
        user_id: user.id, goal: "free", distance: freeDistance,
        target_time: selectedFreePlan.target_time, plan_data: mappedPlan,
      });
      setPlan(mappedPlan);
      setSelectedFreePlan(null);
      const today = new Date().toISOString().split("T")[0];
      const idx = mappedPlan.findIndex((w: WeekPlan) => w.days.some((d: DayPlan) => d.date >= today));
      setCurrentWeekIdx(Math.max(0, idx));

      notifyPlanChanged();
      toast({ title: lang === "zh" ? "已加入日曆" : "Added to Calendar", description: lang === "zh" ? "計劃已加入活動日曆" : "Plan added to your activity calendar" });
      setShowAddToCalendar(false);
      setCalendarStartDate("");
    } catch (err: any) {
      toast({ title: lang === "zh" ? "錯誤" : "Error", description: err.message, variant: "destructive" });
    } finally {
      setAddingToCalendar(false);
    }
  };


  return (
    <div className="pb-8 max-w-lg mx-auto">
      {/* Section toggle (underline style) */}
      <div className="flex w-full border-b border-border mb-4 px-5 pt-6">
        {([
          { id: "training", label: lang === "zh" ? "配速" : "Paces" },
          { id: "free", label: lang === "zh" ? "免費" : "Free" },
          { id: "program", label: "AI", showLock: !isPremium },
          ...(simpleMode ? [] : [{ id: "custom" as const, label: lang === "zh" ? "自訂" : "Custom" }]),
        ] as const).map((s) => (
          <button
            key={s.id}
            onClick={() => handleSectionSwitch(s.id as any)}
            className={`flex-1 flex items-center justify-center gap-1 pb-3 pt-2 -mb-px border-b-2 text-base font-semibold transition-colors ${
              section === s.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {(s as any).showLock && <Lock size={12} />}
            {s.label}
          </button>
        ))}
      </div>

      {/* ═══════════ SECTION: PACES (Calculator + Paces) ═══════════ */}
      {section === "training" && (
        <div className="relative overflow-hidden">
          {/* Calculator view */}
          <div
            className={`transition-transform duration-300 ease-in-out ${
              showPacesResult && activeScore ? "-translate-x-full" : "translate-x-0"
            }`}
          >
            <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>}>
              <CalculatorTab score={score} setScore={setScore} lang={lang} onCalculated={() => setShowPacesResult(true)} />
            </Suspense>
          </div>

          {/* Paces result view — slides in from right */}
          <div
            className={`absolute inset-0 transition-transform duration-300 ease-in-out overflow-y-auto ${
              showPacesResult && activeScore ? "translate-x-0" : "translate-x-full"
            }`}
            style={{ minHeight: '60vh' }}
          >
            <div className="px-5 pt-4 pb-8 max-w-lg mx-auto">
              {/* Back button */}
              <button
                onClick={() => setShowPacesResult(false)}
                className="flex items-center gap-1 text-sm text-muted-foreground mb-4"
              >
                <ChevronLeft size={18} />
                {lang === "zh" ? "返回計算器" : "Back to Calculator"}
              </button>

              {/* Score + Level Badge */}
              {activeScore && (() => {
                const SCORE_LEVELS = [
                  { min: 65, en: "Elite", zh: "精英", bgColor: "bg-gradient-to-r from-yellow-400 to-amber-500", textColor: "text-yellow-900", range: "65+" },
                  { min: 55, en: "Expert", zh: "專家", bgColor: "bg-gradient-to-r from-purple-400 to-violet-500", textColor: "text-purple-900", range: "55–64" },
                  { min: 45, en: "Advanced", zh: "優秀", bgColor: "bg-gradient-to-r from-blue-400 to-cyan-500", textColor: "text-blue-900", range: "45–54" },
                  { min: 35, en: "Intermediate", zh: "中級", bgColor: "bg-gradient-to-r from-green-400 to-emerald-500", textColor: "text-green-900", range: "35–44" },
                  { min: 25, en: "Beginner", zh: "初學者", bgColor: "bg-gradient-to-r from-teal-300 to-teal-400", textColor: "text-teal-900", range: "25–34" },
                  { min: 0, en: "Starter", zh: "入門", bgColor: "bg-gradient-to-r from-slate-300 to-slate-400", textColor: "text-slate-700", range: "< 25" },
                ];
                const currentLevel = SCORE_LEVELS.find(l => activeScore >= l.min) || SCORE_LEVELS[SCORE_LEVELS.length - 1];

                return (
                  <>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-14 h-14 rounded-full bg-score-bg border border-border flex flex-col items-center justify-center">
                        <span className="text-[8px] font-bold text-score-label uppercase leading-none">
                          {lang === "zh" ? "分數" : "SCORE"}
                        </span>
                        <span className="text-lg font-display font-bold text-score-text leading-tight">{activeScore}</span>
                      </div>
                      <div>
                        <h2 className="font-display text-2xl font-bold text-foreground">
                          {lang === "zh" ? "訓練配速" : "Training Paces"}
                        </h2>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${currentLevel.bgColor} ${currentLevel.textColor}`}>
                            {lang === "zh" ? currentLevel.zh : currentLevel.en}
                          </span>
                          <button onClick={() => setShowScoreLevels(!showScoreLevels)} className="text-muted-foreground hover:text-foreground transition-colors">
                            <HelpCircle size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Score Levels Popup */}
                    {showScoreLevels && (
                      <div className="mb-4 bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-foreground">{lang === "zh" ? "跑步分數等級" : "Score Levels"}</span>
                          <button onClick={() => setShowScoreLevels(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                        </div>
                        <div className="space-y-1.5">
                          {SCORE_LEVELS.map((level) => (
                            <div
                              key={level.en}
                              className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${
                                currentLevel.en === level.en ? "ring-2 ring-primary" : ""
                              } ${level.bgColor}`}
                            >
                              <span className={`font-semibold text-xs ${level.textColor}`}>
                                {lang === "zh" ? level.zh : level.en}
                              </span>
                              <span className={`text-xs ${level.textColor}`}>{level.range}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Paces / Equivalent toggle */}
                    <div className="flex gap-1 bg-muted rounded-lg p-1 mb-4">
                      <button onClick={() => setView("paces")} className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${view === "paces" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                        {t("trainingPaces", lang)}
                      </button>
                      <button onClick={() => setView("equivalent")} className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${view === "equivalent" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                        {t("predictedTimes", lang)}
                      </button>
                    </div>

                    {view === "paces" && mainPaces.length > 0 && (
                      <div>
                        <div className="grid grid-cols-4 gap-2 pb-2 border-b border-border mb-1">
                          <span className="text-sm font-semibold text-foreground">{t("paceType", lang)}</span>
                          <span className="text-sm font-semibold text-foreground text-center">1 Mi</span>
                          <span className="text-sm font-semibold text-foreground text-center">1 Km</span>
                          <span className="text-sm font-semibold text-foreground text-center">400M</span>
                        </div>
                        {mainPaces.map((p) => (
                          <div key={p.name} className="grid grid-cols-4 gap-2 py-2.5 border-b border-border/50">
                            <span className="text-sm font-semibold text-primary">{lang === "zh" ? p.nameZh : p.name}</span>
                            <span className="text-sm text-foreground text-center">{p.milePace}</span>
                            <span className="text-sm text-foreground text-center">{p.kmPace}</span>
                            <span className="text-sm text-foreground text-center">{p.lapPace}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {view === "equivalent" && (
                      <div>
                        <div className="grid grid-cols-3 gap-2 pb-2 border-b border-border mb-1">
                          <span className="text-sm font-semibold text-foreground">{lang === "zh" ? "賽事" : "Race"}</span>
                          <span className="text-sm font-semibold text-foreground text-center">{t("time", lang)}</span>
                          <span className="text-sm font-semibold text-foreground text-right">{lang === "zh" ? "配速" : "Pace"}</span>
                        </div>
                        {raceDistances.map((race) => {
                          const time = predictTime(activeScore, race.meters);
                          return (
                            <div key={race.name} className="grid grid-cols-3 gap-2 py-3 border-b border-border/50">
                              <span className="text-sm text-foreground">{lang === "zh" ? race.nameZh : race.name}</span>
                              <span className="text-sm text-foreground text-center font-medium">{formatTime(time)}</span>
                              <span className="text-sm text-muted-foreground text-right">{getPace(time, race.meters)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ SECTION: FREE PROGRAMS ═══════════ */}
      {section === "free" && (
        <div className="px-5">
          {/* Show active free plan calendar if user has one */}
          {existingPlan && existingPlan.goal === "free" && plan.length > 0 ? (() => {
            const currentWeek = plan[currentWeekIdx];
            if (!currentWeek) return null;
            const totalKm = currentWeek.days.reduce((sum: number, d: any) => sum + (d.distance_km || 0), 0);
            const weekStart = currentWeek.days[0]?.date || "";
            const weekEnd = currentWeek.days[currentWeek.days.length - 1]?.date || "";
            const fmtDate = (dateStr: string) => {
              if (!dateStr) return "";
              const d = new Date(dateStr + "T00:00:00");
              return `${d.getDate()} ${d.toLocaleString(lang === "zh" ? "zh-HK" : "en", { month: "short" })}`;
            };
            return (
              <>
                <button onClick={() => setShowCancelConfirm(true)} className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                  <ChevronLeft size={16} />{lang === "zh" ? "返回計劃列表" : "Back to plans"}
                </button>
                <h2 className="font-display text-xl font-bold text-foreground mb-1">
                  {lang === "zh" ? "免費訓練計劃" : "Free Training Plan"}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {existingPlan.distance} — {existingPlan.target_time}
                </p>

                <div className="bg-card border border-border rounded-xl p-3 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-sm font-medium text-foreground">{fmtDate(weekStart)} - {fmtDate(weekEnd)}</span>
                      <span className="ml-2 bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                        {lang === "zh" ? "第" : "WEEK "}{currentWeek.week}{lang === "zh" ? "週" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => shareTrainingWeek({ weekIndex: currentWeekIdx, days: currentWeek.days as any, lang })}
                        className="p-1 rounded hover:bg-accent text-muted-foreground"
                        title={lang === "zh" ? "分享本週" : "Share week"}
                      >
                        <Share2 size={16} />
                      </button>
                      <button onClick={() => setCurrentWeekIdx(Math.max(0, currentWeekIdx - 1))} disabled={currentWeekIdx === 0} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <button onClick={() => setCurrentWeekIdx(Math.min(plan.length - 1, currentWeekIdx + 1))} disabled={currentWeekIdx === plan.length - 1} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                   <p className="text-xs text-muted-foreground">{lang === "zh" ? "總計" : "Total"}: {totalKm.toFixed(1)} km</p>
                </div>

                {isPremium ? (
                  <>
                    <CalendarDayList
                      days={currentWeek.days}
                      weekIdx={currentWeekIdx}
                      lang={lang}
                      hrBounds={hrBounds}
                      onSwap={(from, to) => swapDays(currentWeekIdx, from, to)}
                      onAddClick={(i) => { setAddingDayIdx(i); setAddRunType(null); setAddDistance(""); setAddElevation(""); setAddEph(""); }}
                      onEditClick={(i, day) => { setEditAppendNew(false); setEditingDayIdx(i); setEditDistance(day.distance_km?.toString() || ""); setEditPace(day.pace || ""); setEditDescription(day.description || ""); }}
                      onAddAnotherClick={(i) => { setEditAppendNew(true); setEditingDayIdx(i); }}
                    />
                    {planDirty && (
                      <Button onClick={savePlanEdits} disabled={savingPlan} className="w-full mt-4" size="lg">
                        {savingPlan ? (
                          <><Loader2 className="animate-spin mr-2" size={16} />{lang === "zh" ? "儲存中…" : "Saving…"}</>
                        ) : (
                          <><Save size={16} className="mr-2" />{lang === "zh" ? "儲存變更" : "Save Changes"}</>
                        )}
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="space-y-1">
                    {currentWeek.days.map((day: any, i: number) => {
                      const dateObj = day.date ? new Date(day.date + "T00:00:00") : null;
                      const dayNum = dateObj ? dateObj.getDate() : "";
                      const isToday = day.date === new Date().toISOString().split("T")[0];
                      return (
                        <div key={i} className="flex items-stretch gap-2">
                          <div className="w-10 flex-shrink-0 flex flex-col items-center pt-3">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">{labelForDay(day, i)}</span>
                            <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{dayNum}</span>
                          </div>
                          {day.type === "Rest" ? (
                            <div className="flex-1 border-l-2 border-border pl-3 py-3 min-h-[48px] flex items-center">
                              <span className="text-xs text-muted-foreground">{lang === "zh" ? "休息" : "Rest"}</span>
                            </div>
                          ) : (
                            <div className="flex-1 border-l-2 pl-3 py-2" style={{ borderColor: day.color || "hsl(var(--border))" }}>
                              <div className="bg-card border border-border rounded-lg p-3">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-sm text-foreground">{localizeTitle(day.type, lang)}</span>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {(day.type === "Trail Run" || day.type === "Trail Race") ? (
                                      <>
                                        {day.eph > 0 && <span>EpH {day.eph}</span>}
                                        {day.elevation_m > 0 && <span>+{Math.round(day.elevation_m)}m</span>}
                                      </>
                                    ) : (
                                      day.pace && <span>{/\/(km|mi)\b/i.test(day.pace) ? day.pace : `${day.pace}/km`}</span>
                                    )}
                                    {day.distance_km && <span>{day.distance_km} km</span>}
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{localizeDescription(day, lang)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-center gap-1 mt-6">
                  {plan.map((_: any, i: number) => (
                    <button key={i} onClick={() => setCurrentWeekIdx(i)} className={`w-2 h-2 rounded-full transition-colors ${i === currentWeekIdx ? "bg-primary" : "bg-border"}`} />
                  ))}
                </div>

                <Button variant="outline" className="w-full mt-6 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowCancelConfirm(true)}>
                  {lang === "zh" ? "取消計劃" : "Cancel Plan"}
                </Button>
              </>
            );
          })() : (
          <>
          <h2 className="font-display text-xl font-bold text-foreground mb-1">
            {lang === "zh" ? "免費訓練計劃" : "Free Training Plans"}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            {lang === "zh" ? "適合所有人的通用訓練計劃" : "Generic plans available for everyone"}
          </p>

          {/* Distance selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            {(["5K", "10K", "HM", "FM"] as Distance[]).map((d) => (
              <button key={d} onClick={() => setFreeDistance(d)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${freeDistance === d ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-accent"}`}>
                {d === "HM" ? (lang === "zh" ? "半馬" : "HM") : d === "FM" ? (lang === "zh" ? "全馬" : "FM") : d}
              </button>
            ))}
          </div>

          {/* Category image */}
          <div className="rounded-xl overflow-hidden mb-4">
            <img
              src={FREE_PLAN_IMAGES[freeDistance]}
              alt={`${FREE_PLAN_LABELS[freeDistance]?.[lang === "zh" ? "zh" : "en"]} training`}
              className="w-full h-36 object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              width={1024}
              height={512}
            />
            <div className="bg-card border border-border border-t-0 rounded-b-xl px-4 py-2">
              <h3 className="font-display font-bold text-foreground">
                {lang === "zh" ? FREE_PLAN_LABELS[freeDistance].zh : FREE_PLAN_LABELS[freeDistance].en}
              </h3>
              <p className="text-xs text-muted-foreground">
                {freeDistance === "5K" ? (lang === "zh" ? "3次/週 · 15-30公里/週" : "3 runs/wk · 15-30 km/wk") :
                 freeDistance === "10K" ? (lang === "zh" ? "3-4次/週 · 15-40公里/週" : "3-4 runs/wk · 15-40 km/wk") :
                 freeDistance === "HM" ? (lang === "zh" ? "3-4次/週 · 25-55公里/週" : "3-4 runs/wk · 25-55 km/wk") :
                 (lang === "zh" ? "4-5次/週 · 40-60公里/週" : "4-5 runs/wk · 40-60 km/wk")}
              </p>
            </div>
          </div>

          {loadingFree ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>
          ) : !selectedFreePlan ? (
            /* Plan selection list */
            <div className="space-y-2">
              {freePlans.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {lang === "zh" ? "此距離的計劃正在生成中，請稍後再試" : "Plans for this distance are being generated, please check back later"}
                </p>
              ) : freePlans.map((fp: any) => (
                <button key={fp.id} onClick={() => { setSelectedFreePlan(fp); setFreeWeekIdx(0); }}
                  className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-3 text-left hover:border-primary transition-colors">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Target size={18} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-foreground block">
                      {freeDistance === "HM" ? (lang === "zh" ? "半馬" : "Half Marathon") : freeDistance === "FM" ? (lang === "zh" ? "全馬" : "Full Marathon") : freeDistance} — {fp.target_time}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fp.weeks} {lang === "zh" ? "週" : "weeks"} · {fp.days_per_week} {lang === "zh" ? "天/週" : "days/wk"} · {fp.weekly_km_min}-{fp.weekly_km_max} km/{lang === "zh" ? "週" : "wk"}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : (
            /* Free plan calendar view */
            (() => {
              const planData = selectedFreePlan.plan_data || [];
              const currentWeek = planData[freeWeekIdx];
              if (!currentWeek) return (
                <div className="text-center py-8">
                  <p className="text-muted-foreground text-sm">{lang === "zh" ? "計劃數據不可用" : "Plan data unavailable"}</p>
                  <Button variant="outline" className="mt-4" onClick={() => setSelectedFreePlan(null)}>
                    <ChevronLeft size={14} className="mr-1" />{lang === "zh" ? "返回" : "Back"}
                  </Button>
                </div>
              );
              const totalKm = (currentWeek.days || []).reduce((sum: number, d: any) => sum + (d.distance_km || 0), 0);
              return (
                <>
                  <button onClick={() => setSelectedFreePlan(null)} className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                    <ChevronLeft size={16} />{lang === "zh" ? "返回" : "Back to plans"}
                  </button>
                  <div className="bg-card border border-border rounded-xl p-3 mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          {freeDistance === "HM" ? (lang === "zh" ? "半馬" : "HM") : freeDistance === "FM" ? (lang === "zh" ? "全馬" : "FM") : freeDistance} — {selectedFreePlan.target_time}
                        </span>
                        <span className="ml-2 bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                          {lang === "zh" ? "第" : "WEEK "}{currentWeek.week}{lang === "zh" ? "週" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setFreeWeekIdx(Math.max(0, freeWeekIdx - 1))} disabled={freeWeekIdx === 0} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronLeft size={16} /></button>
                        <button onClick={() => setFreeWeekIdx(Math.min(planData.length - 1, freeWeekIdx + 1))} disabled={freeWeekIdx === planData.length - 1} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronRight size={16} /></button>
                      </div>
                    </div>
                     <p className="text-xs text-muted-foreground">{lang === "zh" ? "總計" : "Total"}: {totalKm.toFixed(1)} km</p>
                  </div>

                  <div className="space-y-1">
                    {(currentWeek.days || []).map((day: any, i: number) => {
                      const key = `${freeWeekIdx}-${i}`;
                      const isExpanded = !!freeExpanded[key];
                      return (
                        <div key={i} className="flex items-stretch gap-2">
                          <div className="w-10 flex-shrink-0 flex flex-col items-center pt-3">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">{labelForDay(day, i)}</span>
                          </div>
                          {day.type === "Rest" ? (
                            <div className="flex-1 border-l-2 border-border pl-3 py-3 min-h-[48px] flex items-center">
                              <span className="text-xs text-muted-foreground">{lang === "zh" ? "休息" : "Rest"}</span>
                            </div>
                          ) : (
                            <div className="flex-1 border-l-2 pl-3 py-2" style={{ borderColor: day.color || "hsl(var(--border))" }}>
                              <div className="bg-card border border-border rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                  <span className="flex-1 font-medium text-sm text-foreground truncate">{localizeTitle(day.type, lang)}</span>
                                  <button
                                    type="button"
                                    onClick={() => setFreeExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                    aria-expanded={isExpanded}
                                    aria-label={lang === "zh" ? "展開" : "Expand"}
                                  >
                                    <ChevronDown size={16} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                  </button>
                                </div>
                                {isExpanded && <WorkoutDetails day={day} lang={lang} hrBounds={hrBounds} />}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add to Calendar button */}
                   {user && (
                     <Button
                       className="w-full mt-4"
                       variant="outline"
                       onClick={() => {
                         if (hasAnyPlan) {
                           setPendingSection("free");
                           setShowPlanConflict(true);
                         } else {
                           setShowAddToCalendar(true);
                           setCalendarStartDate("");
                         }
                       }}
                     >
                       <Calendar size={14} className="mr-2" />
                       {lang === "zh" ? "加入日曆" : "Add to Calendar"}
                     </Button>
                  )}

                  <div className="flex items-center justify-center gap-1 mt-4">
                    {planData.map((_: any, i: number) => (
                      <button key={i} onClick={() => setFreeWeekIdx(i)} className={`w-2 h-2 rounded-full transition-colors ${i === freeWeekIdx ? "bg-primary" : "bg-border"}`} />
                    ))}
                  </div>
                </>
              );
            })()
          )}
          </>
          )}
        </div>
      )}

      {/* ═══════════ SECTION: AI PROGRAM (PREMIUM) ═══════════ */}
      {section === "program" && (
        <div className="px-5">
          {!isPremium ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Lock size={48} className="text-muted-foreground mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                {lang === "zh" ? "高級功能" : "Premium Feature"}
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-6">
                {lang === "zh" ? "升級至高級版以使用 AI 訓練計劃生成器" : "Upgrade to Premium to access AI Training Plan Generator"}
              </p>
              {!user ? (
                <Button onClick={onLoginRequest}>{lang === "zh" ? "登入 / 註冊" : "Sign In / Sign Up"}</Button>
              ) : (
                <p className="text-xs text-muted-foreground">{lang === "zh" ? "前往「更多」分頁升級" : "Go to the More tab to upgrade"}</p>
              )}
            </div>
          ) : (
            <>
              {/* Details */}
              {programStep === "details" && (
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground mb-5">{lang === "zh" ? "訓練詳情" : "Training Details"}</h2>

                  {/* Distance */}
                  <div className="mb-5">
                    <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Target size={14} />{lang === "zh" ? "比賽距離" : "Race Distance"}</label>
                    <div className="flex flex-wrap gap-2">
                      {DISTANCES.map((d) => (
                        <button key={d.id} onClick={() => { setDistance(d.id); setTargetTime(""); const md = MIN_DAYS[d.id]; if (daysPerWeek < md) setDaysPerWeek(md); const minKm = d.id === "FM" ? 45 : d.id === "HM" ? 25 : d.id === "TR" ? 30 : 15; if (weeklyKm < minKm) setWeeklyKm(minKm); }}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${distance === d.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-accent"}`}>
                          {d.id === "HM" ? (lang === "zh" ? "半馬" : "HM") : d.id === "FM" ? (lang === "zh" ? "全馬" : "FM") : d.id === "TR" ? (lang === "zh" ? "越野賽" : "Trail Race") : d.id}
                        </button>
                      ))}
                      {simpleMode && (
                        <button
                          onClick={() => { setDistance("FT" as Distance); setTargetTime(""); setRaceDate(""); setStartDate(""); if (daysPerWeek < 2) setDaysPerWeek(3); }}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${distance === "FT" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-accent"}`}
                        >
                          {lang === "zh" ? "強身健體" : "Fitness"}
                        </button>
                      )}
                    </div>
                    {distance === "FT" && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {lang === "zh" ? "持續的休閒跑步計劃，沒有比賽目標。AI 會根據你的入門資料與最近一週表現安排輕鬆訓練。" : "Ongoing casual running plan with no race goal. AI will set easy paces from your onboarding PB and last 7 days of activity."}
                      </p>
                    )}
                  </div>

                  {/* Trail Race custom km + elevation */}
                  {distance === "TR" && (
                    <div className="mb-5 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-semibold text-foreground mb-2 block">{lang === "zh" ? "賽事距離 (公里)" : "Race Distance (km)"}</label>
                        <Input type="number" min="5" step="0.1" placeholder="50" value={trailDistanceKm} onChange={(e) => setTrailDistanceKm(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-foreground mb-2 block">{lang === "zh" ? "累計爬升 (米)" : "Total Elevation (m)"}</label>
                        <Input type="number" min="0" step="50" placeholder="2000" value={trailElevationM} onChange={(e) => setTrailElevationM(e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-sm font-semibold text-foreground mb-2 block">{lang === "zh" ? "目標 EpH（選填）" : "Target EpH (optional)"}</label>
                        <Input type="number" min="0" step="0.1" placeholder={computedTrailRaceEph ? String(computedTrailRaceEph) : "8"} value={trailTargetEph} onChange={(e) => setTrailTargetEph(e.target.value)} />
                        {computedTrailRaceEph && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {lang === "zh" ? `按距離、爬升及目標時間估算：EpH ${computedTrailRaceEph}` : `Estimated from distance, elevation, and target time: EpH ${computedTrailRaceEph}`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Target Time */}
                  {distance && distance !== "FT" && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Trophy size={14} />{lang === "zh" ? "目標完成時間" : "Target Finish Time"}</label>
                      <div className="flex items-center gap-2">
                        {(distance === "HM" || distance === "FM" || distance === "TR") && (
                          <>
                            <Input type="number" min="0" max="9" placeholder={lang === "zh" ? "時" : "H"} value={targetHours}
                              onChange={(e) => { setTargetHours(e.target.value); setTargetTime(`${e.target.value || "0"}:${targetMinutes || "00"}:${targetSeconds || "00"}`); }} className="w-16 text-center" />
                            <span className="text-muted-foreground">:</span>
                          </>
                        )}
                        <Input type="number" min="0" max="59" placeholder={lang === "zh" ? "分" : "M"} value={targetMinutes}
                          onChange={(e) => { setTargetMinutes(e.target.value); const h = targetHours || "0"; const m = e.target.value || "00"; setTargetTime(distance === "HM" || distance === "FM" || distance === "TR" ? `${h}:${m}:${targetSeconds || "00"}` : `${m}:${targetSeconds || "00"}`); }} className="w-16 text-center" />
                        <span className="text-muted-foreground">:</span>
                        <Input type="number" min="0" max="59" placeholder={lang === "zh" ? "秒" : "S"} value={targetSeconds}
                          onChange={(e) => { setTargetSeconds(e.target.value); const h = targetHours || "0"; const m = targetMinutes || "00"; setTargetTime(distance === "HM" || distance === "FM" || distance === "TR" ? `${h}:${m}:${e.target.value || "00"}` : `${m}:${e.target.value || "00"}`); }} className="w-16 text-center" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{lang === "zh" ? "輸入你的目標完成時間" : "Enter your target finish time"}</p>
                    </div>
                  )}

                  {/* Days per week */}
                  {distance && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Repeat size={14} />{lang === "zh" ? "每週跑步天數" : "Running Days per Week"}</label>
                      <div className="flex gap-2">
                        {[2, 3, 4, 5, 6, 7].map((d) => {
                          const minD = MIN_DAYS[distance!]; const disabled = d < minD;
                          return (
                            <button key={d} onClick={() => !disabled && setDaysPerWeek(d)} disabled={disabled}
                              className={`w-10 h-10 rounded-full text-sm font-medium transition-colors border ${daysPerWeek === d ? "bg-primary text-primary-foreground border-primary" : disabled ? "bg-muted text-muted-foreground border-border opacity-40 cursor-not-allowed" : "bg-card text-foreground border-border hover:bg-accent"}`}>{d}</button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {lang === "zh" ? `${distance === "FM" ? "全馬最少4天" : distance === "HM" ? "半馬最少3天" : "最少2天"}` : `Min. ${MIN_DAYS[distance!]} days for ${distance === "FM" ? "Full Marathon" : distance === "HM" ? "Half Marathon" : distance}`}
                      </p>
                    </div>
                  )}

                  {/* Weekly km */}
                  {distance && distance !== "FT" && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Route size={14} />{lang === "zh" ? "每週目標公里數" : "Preferred Weekly Km"}</label>
                      <select
                        value={weeklyKm}
                        onChange={(e) => setWeeklyKm(Number(e.target.value))}
                        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                      >
                        {Array.from({ length: Math.floor((200 - (distance === "FM" ? 45 : distance === "HM" ? 25 : distance === "TR" ? 30 : 15)) / 5) + 1 }, (_, i) => {
                          const min = distance === "FM" ? 45 : distance === "HM" ? 25 : distance === "TR" ? 30 : 15;
                          const val = min + i * 5;
                          return <option key={val} value={val}>{val} km</option>;
                        })}
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">{lang === "zh" ? "你每週大概想跑多少公里？" : "How many km would you prefer to run per week?"}</p>
                    </div>
                  )}

                  {/* Long Run Day */}
                  {distance && distance !== "FT" && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Route size={14} />{lang === "zh" ? "長跑日" : "Long Run Day"}</label>
                      <div className="flex flex-wrap gap-2">
                        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => {
                          const labelZh: Record<string,string> = {Mon:"一",Tue:"二",Wed:"三",Thu:"四",Fri:"五",Sat:"六",Sun:"日"};
                          const isRest = restDays.includes(d);
                          return (
                            <button key={d} onClick={() => { setLongRunDay(d); setRestDays(restDays.filter(r => r !== d)); }}
                              className={`w-12 h-10 rounded-full text-sm font-medium transition-colors border ${longRunDay === d ? "bg-primary text-primary-foreground border-primary" : isRest ? "bg-muted text-muted-foreground border-border opacity-40" : "bg-card text-foreground border-border hover:bg-accent"}`}>
                              {lang === "zh" ? labelZh[d] : d}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{lang === "zh" ? "選擇你想做長跑的日子" : "Pick the day you'd like to do your long run"}</p>
                    </div>
                  )}

                  {/* Rest Days */}
                  {distance && distance !== "FT" && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
                        <Calendar size={14} />{lang === "zh" ? "休息日" : "Rest Day(s)"}
                        <span className="text-xs font-normal text-muted-foreground">({restDays.length}/{7 - daysPerWeek})</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => {
                          const labelZh: Record<string,string> = {Mon:"一",Tue:"二",Wed:"三",Thu:"四",Fri:"五",Sat:"六",Sun:"日"};
                          const isLong = longRunDay === d;
                          const selected = restDays.includes(d);
                          const maxRest = 7 - daysPerWeek;
                          const atMax = !selected && restDays.length >= maxRest;
                          const disabled = isLong || atMax;
                          return (
                            <button key={d} disabled={disabled}
                              onClick={() => { if (disabled) return; setRestDays(selected ? restDays.filter(r => r !== d) : [...restDays, d]); }}
                              className={`w-12 h-10 rounded-full text-sm font-medium transition-colors border ${selected ? "bg-primary text-primary-foreground border-primary" : disabled ? "bg-muted text-muted-foreground border-border opacity-40 cursor-not-allowed" : "bg-card text-foreground border-border hover:bg-accent"}`}>
                              {lang === "zh" ? labelZh[d] : d}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{lang === "zh" ? `根據每週 ${daysPerWeek} 天訓練，請選擇 ${7 - daysPerWeek} 個休息日` : `Pick ${7 - daysPerWeek} rest day${7 - daysPerWeek === 1 ? "" : "s"} based on ${daysPerWeek} training days/week`}</p>
                    </div>
                  )}

                  {distance !== "FT" && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Calendar size={14} />{lang === "zh" ? "開始日期" : "Start Date"}</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        className="block w-full min-w-0 box-border appearance-none h-12 rounded-md border border-border bg-card px-3 py-3 text-sm text-foreground"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{lang === "zh" ? "計劃從哪天開始？" : "When should the plan start?"}</p>
                    </div>
                  )}

                  {/* Race Date */}
                  {distance !== "FT" && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Calendar size={14} />{lang === "zh" ? "比賽日期" : "Race Date"}</label>
                      <input
                        type="date"
                        value={raceDate}
                        onChange={(e) => setRaceDate(e.target.value)}
                        min={startDate ? new Date(new Date(startDate + "T00:00:00").getTime() + minWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] : new Date(Date.now() + minWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
                        className="block w-full min-w-0 box-border appearance-none h-12 rounded-md border border-border bg-card px-3 py-3 text-sm text-foreground"
                      />
                      {raceDate && startDate && !dateValid && <p className="text-xs text-destructive mt-1">{lang === "zh" ? `開始日期與比賽之間至少需要 ${minWeeks} 週` : `At least ${minWeeks} weeks needed between start and race date`}</p>}
                      {raceDate && startDate && dateValid && <p className="text-xs text-muted-foreground mt-1">{weeksUntilRace} {lang === "zh" ? "週訓練計劃" : "weeks training plan"}</p>}
                    </div>
                  )}

                  {/* Optional: Race Selector */}
                  {distance !== "FT" && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
                        <Trophy size={14} />
                        {lang === "zh" ? "選擇賽事" : "Select Race"}
                        <span className="text-xs font-normal text-muted-foreground">({lang === "zh" ? "選填" : "optional"})</span>
                      </label>

                      {selectedRace ? (
                        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground truncate">
                              {lang === "zh" && selectedRace.name_zh ? selectedRace.name_zh : selectedRace.name}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {selectedRace.race_date} · {selectedRace.city}{selectedRace.country ? `, ${selectedRace.country}` : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSelectedRaceId(""); setRaceSearch(""); }}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Clear race"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="text"
                            value={raceSearch}
                            onChange={(e) => { setRaceSearch(e.target.value); setShowRaceDropdown(true); }}
                            onFocus={() => setShowRaceDropdown(true)}
                            onBlur={() => setTimeout(() => setShowRaceDropdown(false), 150)}
                            placeholder={lang === "zh" ? "搜尋賽事名稱…" : "Search race name…"}
                            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                          />
                          {showRaceDropdown && filteredRaces.length > 0 && (
                            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                              {filteredRaces.map((r) => (
                                <button
                                  type="button"
                                  key={r.id}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setSelectedRaceId(r.id);
                                    setRaceSearch("");
                                    setCustomRaceName("");
                                    setShowRaceDropdown(false);
                                    if (!raceDate) setRaceDate(r.race_date);
                                  }}
                                  className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                                >
                                  <div className="font-medium truncate">{lang === "zh" && r.name_zh ? r.name_zh : r.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{r.race_date} · {r.city}{r.country ? `, ${r.country}` : ""}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {!selectedRace && (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={customRaceName}
                            onChange={(e) => setCustomRaceName(e.target.value)}
                            placeholder={lang === "zh" ? "找不到？輸入賽事名稱" : "Can't find it? Enter race name"}
                            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                          />
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {lang === "zh" ? "AI 將根據您的目標賽事個人化訓練計劃。" : "The AI will personalize the plan around your target race."}
                      </p>
                    </div>
                  )}

                  <Button onClick={handleGenerateClick} disabled={distance === "FT" ? (!distance || loading) : (!distance || !targetTime || !raceDate || !startDate || !dateValid || loading || restDays.length !== 7 - daysPerWeek)} className="w-full" size="lg">
                    {loading ? (<><Loader2 className="animate-spin mr-2" size={18} />{lang === "zh" ? "生成中，請耐心等候，最多需要一分鐘" : "Generating. Please be patient, it can take up to a minute"}</>) : (lang === "zh" ? "生成訓練計劃" : "Generate Training Plan")}
                  </Button>
                </div>
              )}

              {/* Calendar */}
              {programStep === "calendar" && (() => {
                const currentWeek = plan[currentWeekIdx];
                if (!currentWeek) return (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">{lang === "zh" ? "沒有訓練計劃" : "No training plan"}</p>
                    <Button onClick={handleNewPlan} className="mt-4">{lang === "zh" ? "建立新計劃" : "Create New Plan"}</Button>
                  </div>
                );
                const totalKm = currentWeek.days.reduce((sum, d) => sum + (d.distance_km || 0), 0);
                const weekStart = currentWeek.days[0]?.date || "";
                const weekEnd = currentWeek.days[currentWeek.days.length - 1]?.date || "";
                const formatDate = (dateStr: string) => {
                  if (!dateStr) return "";
                  const d = new Date(dateStr + "T00:00:00");
                  return `${d.getDate()} ${d.toLocaleString(lang === "zh" ? "zh-HK" : "en", { month: "short" })}`;
                };

                return (
                  <>
                    {(() => {
                      if (!existingPlan) return null;
                      const planArr = Array.isArray(existingPlan.plan_data) ? existingPlan.plan_data : [];
                      const w0Days = (planArr[0]?.days || []) as DayPlan[];
                      const dl = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
                      const restDaysCur = w0Days.filter((d:any)=>d.type==="Rest").map((d:any)=>d.day).filter((d:string)=>dl.includes(d));
                      const longRunCur = (w0Days.find((d:any)=>d.type==="Long Run") as any)?.day || "Sun";
                      const dpwCur = Math.max(1, 7 - restDaysCur.length);
                      // Use peak week's mileage so the displayed weekly km matches what regen will use.
                      const weeklyKmCur = Math.max(
                        1,
                        Math.round(
                          Math.max(
                            0,
                            ...planArr.map((w:any) =>
                              ((w?.days as any[]) || []).reduce((s:number, d:any) => s + (d.distance_km || 0), 0),
                            ),
                          ),
                        ),
                      );
                      const planStartIso = (planArr[0]?.startDate || w0Days[0]?.date || "") as string;
                      const planEndIso = (existingPlan.race_date as string) || ((planArr[planArr.length-1]?.days as any[])?.slice(-1)?.[0]?.date) || planStartIso;
                      const currentSnap = buildRaceSnapshot(planStartIso, planEndIso);
                      const savedSnap: RaceSchedItem[] = Array.isArray(existingPlan.race_schedule) ? (existingPlan.race_schedule as any) : [];
                      const racesDrift = !racesEqual(currentSnap, savedSnap);

                      // Goal race date = A-priority race in saved snapshot, else existingPlan.race_date.
                      const goalRaceDate =
                        (savedSnap.find((r) => r.priority === "A")?.race_date) ||
                        (existingPlan.race_date as string) || "";
                      const goalWeekIdx = goalRaceDate
                        ? plan.findIndex((w:any) => Array.isArray(w.days) && w.days.some((d:any) => d.date === goalRaceDate))
                        : -1;

                      return (
                        <>
                          <ProgramHeader
                            lang={lang}
                            weeks={Number(existingPlan.weeks) || plan.length}
                            distance={String(existingPlan.distance ?? "")}
                            targetTime={String(existingPlan.target_time ?? "")}
                            currentWeekIdx={currentWeekIdx}
                            weekDays={currentWeek.days}
                            activities={allActivities as any}
                            daysPerWeek={dpwCur}
                            weeklyKm={weeklyKmCur}
                            longRunDay={longRunCur}
                            restDays={restDaysCur}
                            onRegenerate={handleRegeneratePlan}
                            regenerating={regeneratingTime}
                          />
                          {existingPlan.goal !== "fitness" && existingPlan.distance !== "FT" && (
                            <RaceSchedulePanel
                              lang={lang}
                              races={savedSnap as any}
                              currentRaces={currentSnap as any}
                              racesDrift={racesDrift}
                              regenerating={regeneratingTime}
                              onUpdateRacePriority={async (raceId, priority) => {
                                if (!user) return;
                                await (supabase.from("user_races" as any) as any).update({ priority }).eq("id", raceId).eq("user_id", user.id);
                                await queryClient.invalidateQueries({ queryKey: ["user-races"] });
                                await handleRegeneratePlan({});
                              }}
                              onRemoveRace={async (raceId) => {
                                if (!user) return;
                                await supabase.from("user_races" as any).delete().eq("id", raceId).eq("user_id", user.id);
                                await queryClient.invalidateQueries({ queryKey: ["user-races"] });
                                await handleRegeneratePlan({});
                              }}
                              onRegenerateForRaces={() => handleRegeneratePlan({})}
                            />
                          )}
                           {!simpleMode && (
                           <Button
                             variant="outline"
                             className="w-full mb-4 border-primary/30 text-primary hover:bg-primary/10"
                             onClick={() => setShowWeeklyReview(true)}
                           >
                             <Sparkles size={14} className="mr-2" />
                             {lang === "zh" ? "週訓練回顧" : "Weekly Review"}
                           </Button>
                           )}

                           {/* ─── Race Time Predictor (HR-zone + VDOT, deterministic) ─── */}
                           {canPredictRaceTime && (() => {
                             const targetSec = parseTargetToSec(existingPlan.target_time);
                             const predictedSec = racePrediction?.predictedSec ?? null;
                             const predictedLabel = predictedSec != null ? fmtSec(predictedSec) : "--:--";
                             const typeOrder: RunType[] = ["recovery", "easy", "tempo", "threshold", "interval"];
                              return (
                                <details className="bg-card border border-border rounded-xl mb-4 shadow-sm group">
                                  <summary className="flex items-center gap-3 p-4 cursor-pointer list-none select-none">
                                    <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                                      <Target size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h2 className="text-base font-bold text-foreground leading-tight">
                                        {lang === "zh" ? "目前預測比賽時間" : "Current Estimated Race Time"}
                                      </h2>
                                      <div className="text-xs text-muted-foreground mt-0.5">
                                        <span className="font-semibold text-primary">{predictedLabel}</span>
                                        <span className="mx-1">·</span>
                                        <span>{lang === "zh" ? "根據過去 30 天跑步估算" : "Based on your last 30 days of running"}</span>
                                      </div>
                                    </div>
                                    <ChevronDown size={18} className="text-muted-foreground transition-transform group-open:rotate-180 flex-shrink-0" />
                                  </summary>
                                  <div className="px-4 pb-4">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-border bg-background p-3">
                                      <div className="text-[11px] font-medium uppercase text-muted-foreground">{lang === "zh" ? "計劃目標" : "Program target"}</div>
                                      <div className="mt-1 text-xl font-bold text-foreground">{targetSec ? fmtSec(targetSec) : String(existingPlan.target_time)}</div>
                                      <div className="text-[11px] text-muted-foreground">{String(existingPlan.distance)}</div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-background p-3">
                                      <div className="text-[11px] font-medium uppercase text-muted-foreground">{lang === "zh" ? "目前預測" : "Current estimate"}</div>
                                      <div className="mt-1 text-xl font-bold text-primary">{predictedLabel}</div>
                                      <div className="text-[11px] text-muted-foreground">
                                        {racePrediction
                                          ? (lang === "zh"
                                              ? `${racePrediction.totalRuns} 次跑步`
                                              : `${racePrediction.totalRuns} runs`)
                                          : (lang === "zh" ? "需要更多跑步資料" : "Not enough run data yet")}
                                      </div>
                                    </div>
                                  </div>

                                  {racePrediction && (
                                    <div className="mt-3 rounded-lg border border-border bg-background p-3">
                                      <div className="text-[11px] font-medium uppercase text-muted-foreground mb-2">
                                        {lang === "zh" ? "跑步類型分佈（30 天）" : "Run types (30d)"}
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {typeOrder.map((t) => {
                                          const b = racePrediction.byType[t];
                                          if (!b) return null;
                                          const paceMin = Math.floor(b.avgPaceSecPerKm / 60);
                                          const paceSec = Math.round(b.avgPaceSecPerKm % 60);
                                          return (
                                            <span key={t} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground">
                                              <span className="font-semibold">{typeLabel(t, lang === "zh" ? "zh" : "en")}</span>
                                              <span className="text-muted-foreground">×{b.count}</span>
                                              <span className="text-muted-foreground">{paceMin}:{String(paceSec).padStart(2, "0")}/km</span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {racePrediction && targetSec && (() => {
                                    const delta = racePrediction.predictedSec - targetSec;
                                    const onTrack = delta <= 30;
                                    const ahead = delta < -30;
                                    const diffSec = Math.abs(delta);
                                    const diffLabel = `${Math.floor(diffSec / 60)}:${String(Math.round(diffSec % 60)).padStart(2, "0")}`;
                                    const statusClass = ahead || onTrack ? "border-primary bg-primary/10 text-primary" : "border-destructive/40 bg-destructive/10 text-destructive";
                                    const statusText = ahead
                                      ? (lang === "zh" ? `快過目標 ${diffLabel}` : `Ahead of target by ${diffLabel}`)
                                      : onTrack
                                      ? (lang === "zh" ? "進度良好：正在達標" : "On track for the program target")
                                      : (lang === "zh" ? `慢過目標 ${diffLabel}` : `Behind target by ${diffLabel}`);
                                    return (
                                      <div className={`mt-3 rounded-lg border p-3 ${statusClass}`}>
                                        <div className="text-sm font-bold">{statusText}</div>
                                      </div>
                                    );
                                  })()}
                                  </div>
                                </details>
                              );
                            })()}


                           <div className={`bg-card border rounded-xl p-3 mb-4 ${goalWeekIdx === currentWeekIdx ? "border-primary ring-1 ring-primary/40" : "border-border"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground">{formatDate(weekStart)} - {formatDate(weekEnd)}</span>
                                <span className="bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 rounded-full">WEEK {currentWeek.week}</span>
                                {goalWeekIdx === currentWeekIdx && (
                                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                                    {lang === "zh" ? "目標賽事週" : "Goal Race Week"}
                                  </span>
                                )}
                                {watchProvider && isPremium && (
                                  <button
                                    type="button"
                                    onClick={pushWeekToWatch}
                                    disabled={pushingWeek}
                                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                                  >
                                    {pushingWeek ? <Loader2 size={12} className="animate-spin" /> : <Watch size={12} />}
                                    {lang === "zh" ? `推送到 ${watchProvider}` : `Push to ${watchProvider}`}
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => shareTrainingWeek({ weekIndex: currentWeekIdx, days: currentWeek.days as any, lang })}
                                  className="p-1 rounded hover:bg-accent text-muted-foreground"
                                  title={lang === "zh" ? "分享本週" : "Share week"}
                                >
                                  <Share2 size={16} />
                                </button>
                                <button onClick={() => setCurrentWeekIdx(Math.max(0, currentWeekIdx - 1))} disabled={currentWeekIdx === 0} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronLeft size={16} /></button>
                                <button onClick={() => setCurrentWeekIdx(Math.min(plan.length - 1, currentWeekIdx + 1))} disabled={currentWeekIdx === plan.length - 1} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronRight size={16} /></button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground">{lang === "zh" ? "總計" : "Total"}: {totalKm.toFixed(1)} km</p>
                            </div>

                          </div>

                          {/* Finetune based on HRV/RHR */}
                          {!simpleMode && (
                          <div className="mb-4 flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={runFinetune}
                              disabled={!hasRecoveryData || finetuning}
                              className="gap-1.5"
                            >
                              {finetuning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                              {lang === "zh" ? "依恢復數據微調本週" : "Finetune week from recovery"}
                            </Button>
                            <span className="text-[11px] text-muted-foreground">
                              {hasRecoveryData
                                ? (lang === "zh" ? "使用最近 14 天的 HRV/靜息心率" : "Uses your last 14 days of HRV/RHR")
                                : (lang === "zh" ? "需有 HRV 或靜息心率資料" : "Only if HRV/RHR data is available")}
                            </span>
                          </div>
                          )}




                          <CalendarDayList
                            days={currentWeek.days}
                            weekIdx={currentWeekIdx}
                            lang={lang}
                            hrBounds={hrBounds}
                            onSwap={(from, to) => swapDays(currentWeekIdx, from, to)}
                            onAddClick={(i) => { setAddingDayIdx(i); setAddRunType(null); setAddDistance(""); setAddElevation(""); setAddEph(""); }}
                            onEditClick={(i, day) => { setEditAppendNew(false); setEditingDayIdx(i); setEditDistance(day.distance_km?.toString() || ""); setEditPace(day.pace || ""); setEditDescription(day.description || ""); }}
                            onAddAnotherClick={(i) => { setEditAppendNew(true); setEditingDayIdx(i); }}
                            pushedSet={pushedSet}
                            pushingIdx={pushingIdx}
                            onPushDay={isPremium && watchProvider ? pushDayToWatch : undefined}
                            watchProvider={watchProvider}
                          />


                          <div className="flex items-center justify-center gap-1 mt-6">
                            {plan.map((_, i) => (
                              <button
                                key={i}
                                onClick={() => setCurrentWeekIdx(i)}
                                className={`rounded-full transition-colors ${i === currentWeekIdx ? "bg-primary w-3 h-3" : i === goalWeekIdx ? "bg-primary/50 w-2 h-2 ring-1 ring-primary" : "bg-border w-2 h-2"}`}
                                aria-label={i === goalWeekIdx ? (lang === "zh" ? "目標賽事週" : "Goal race week") : undefined}
                              />
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    {planDirty && (
                      <Button onClick={savePlanEdits} disabled={savingPlan} className="w-full mt-4" size="lg">
                        {savingPlan ? (
                          <><Loader2 className="animate-spin mr-2" size={16} />{lang === "zh" ? "儲存中…" : "Saving…"}</>
                        ) : (
                          <><Save size={16} className="mr-2" />{lang === "zh" ? "儲存變更" : "Save Changes"}</>
                        )}
                      </Button>
                    )}

                    <Button variant="outline" className="w-full mt-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { if (planDirty && !window.confirm(lang === "zh" ? "您有未儲存的變更，仍要取消計劃嗎？" : "You have unsaved changes. Cancel the plan anyway?")) return; setShowCancelConfirm(true); }}>
                      {lang === "zh" ? "取消計劃" : "Cancel Plan"}
                    </Button>
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ═══════════ SECTION: CUSTOM PROGRAM ═══════════ */}
      {section === "custom" && (
        <div className="px-5">
          {!user ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-muted-foreground mb-4">{lang === "zh" ? "請先登入" : "Please sign in first"}</p>
              <Button onClick={onLoginRequest}>{lang === "zh" ? "登入 / 註冊" : "Sign In / Sign Up"}</Button>
            </div>
          ) : customStep === "setup" ? (
            <div>
              <h2 className="font-display text-xl font-bold text-foreground mb-1">
                {lang === "zh" ? "自訂訓練計劃" : "Custom Training Program"}
              </h2>
              <p className="text-xs text-muted-foreground mb-5">
                {lang === "zh" ? "建立你自己的訓練計劃，自由安排每天的訓練" : "Create your own program and schedule workouts freely"}
              </p>

              <div className="mb-5">
                <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
                  <Calendar size={14} />{lang === "zh" ? "開始日期" : "Start Date"}
                </label>
                <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} min={new Date().toISOString().split("T")[0]} className="w-full" />
              </div>

              <div className="mb-5">
                <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
                  <Calendar size={14} />{lang === "zh" ? "結束日期" : "End Date"}
                </label>
                <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)}
                  min={customStartDate ? new Date(new Date(customStartDate + "T00:00:00").getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
                  className="w-full" />
                {customStartDate && customEndDate && (() => {
                  const weeks = Math.max(0, Math.floor((new Date(customEndDate + "T00:00:00").getTime() - new Date(customStartDate + "T00:00:00").getTime()) / (7 * 24 * 60 * 60 * 1000)));
                  return <p className="text-xs text-muted-foreground mt-1">{weeks} {lang === "zh" ? "週訓練計劃" : "weeks program"}</p>;
                })()}
              </div>

              <Button onClick={() => {
                if (hasAnyPlan) {
                  setPendingSection("custom");
                  setShowPlanConflict(true);
                } else {
                  handleCreateCustomPlan();
                }
              }} disabled={!customStartDate || !customEndDate} className="w-full" size="lg">
                {lang === "zh" ? "建立計劃" : "Create Program"}
              </Button>
            </div>
          ) : (() => {
            const currentWeek = customPlan[customWeekIdx];
            if (!currentWeek) return (
              <div className="text-center py-12">
                <p className="text-muted-foreground">{lang === "zh" ? "沒有訓練計劃" : "No training plan"}</p>
                <Button onClick={handleCancelCustomPlan} className="mt-4">{lang === "zh" ? "建立新計劃" : "Create New Plan"}</Button>
              </div>
            );
            const totalKm = currentWeek.days.reduce((sum, d) => sum + (d.distance_km || 0), 0);
            const weekStart = currentWeek.days[0]?.date || "";
            const weekEnd = currentWeek.days[currentWeek.days.length - 1]?.date || "";
            const fmtDate = (dateStr: string) => {
              if (!dateStr) return "";
              const d = new Date(dateStr + "T00:00:00");
              return `${d.getDate()} ${d.toLocaleString(lang === "zh" ? "zh-HK" : "en", { month: "short" })}`;
            };
            return (
              <>
                <div className="bg-card border border-border rounded-xl p-3 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-sm font-medium text-foreground">{fmtDate(weekStart)} - {fmtDate(weekEnd)}</span>
                      <span className="ml-2 bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                        {lang === "zh" ? "第" : "WEEK "}{currentWeek.week}{lang === "zh" ? "週" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCustomWeekIdx(Math.max(0, customWeekIdx - 1))} disabled={customWeekIdx === 0} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <button onClick={() => setCustomWeekIdx(Math.min(customPlan.length - 1, customWeekIdx + 1))} disabled={customWeekIdx === customPlan.length - 1} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{lang === "zh" ? "總計" : "Total"}: {totalKm.toFixed(1)} km</p>
                </div>

                <div className="space-y-1">
                  {currentWeek.days.map((day, i) => {
                    const dateObj = day.date ? new Date(day.date + "T00:00:00") : null;
                    const dayNum = dateObj ? dateObj.getDate() : "";
                    const isToday = day.date === new Date().toISOString().split("T")[0];
                    return (
                      <div key={i} className="flex items-stretch gap-2">
                        <div className="w-10 flex-shrink-0 flex flex-col items-center pt-3">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">{labelForDay(day, i)}</span>
                          <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{dayNum}</span>
                        </div>
                        {day.type === "Rest" ? (
                          <div className="flex-1 border-l-2 border-border pl-3 py-3 min-h-[48px] flex items-center">
                            <button onClick={() => { setCustomAddingDayIdx(i); setCustomAddRunType(null); setCustomAddDistance(""); setCustomAddElevation(""); setCustomAddEph(""); }}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <Plus size={12} />{lang === "zh" ? "新增" : "Add"}
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1 border-l-2 pl-3 py-2 cursor-pointer" style={{ borderColor: day.color || "hsl(var(--border))" }}
                            onClick={() => { setCustomEditingDayIdx(i); setCustomEditDistance(day.distance_km?.toString() || ""); setCustomEditPace(day.pace || ""); setCustomEditDescription(day.description || ""); }}>
                            <div className="bg-card border border-border rounded-lg p-3 hover:border-primary transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm text-foreground">{localizeTitle(day.type, lang)}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {(day.type === "Trail Run" || day.type === "Trail Race") ? (
                                    <>
                                      {day.eph > 0 && <span>EpH {day.eph}</span>}
                                      {day.elevation_m > 0 && <span>+{Math.round(day.elevation_m)}m</span>}
                                    </>
                                  ) : (
                                    day.pace && <span>{day.pace}</span>
                                  )}
                                  {day.distance_km && <span>{day.distance_km} km</span>}
                                </div>
                              </div>
                              {day.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{day.description}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-center gap-1 mt-6">
                  {customPlan.map((_, i) => (
                    <button key={i} onClick={() => setCustomWeekIdx(i)} className={`w-2 h-2 rounded-full transition-colors ${i === customWeekIdx ? "bg-primary" : "bg-border"}`} />
                  ))}
                </div>

                {!simpleMode && (
                <Button
                  variant="outline"
                  className="w-full mt-6 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => setShowWeeklyReview(true)}
                >
                  <Sparkles size={14} className="mr-2" />
                  {lang === "zh" ? "週訓練回顧" : "Weekly Review"}
                </Button>
                )}

                <Button variant="outline" className="w-full mt-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowCustomCancelConfirm(true)}>
                  {lang === "zh" ? "取消計劃" : "Cancel Plan"}
                </Button>
              </>
            );
          })()}
        </div>
      )}

      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{lang === "zh" ? "取消訓練計劃？" : "Cancel Training Plan?"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{lang === "zh" ? "確定要取消此訓練計劃嗎？此操作無法撤銷。" : "Are you sure you want to cancel this training plan? This action cannot be undone."}</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCancelConfirm(false)}>{lang === "zh" ? "返回" : "Keep Plan"}</Button>
            <Button variant="destructive" className="flex-1" onClick={() => { setShowCancelConfirm(false); handleNewPlan(); }}>{lang === "zh" ? "確認取消" : "Yes, Cancel"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addingDayIdx !== null} onOpenChange={(open) => { if (!open) setAddingDayIdx(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{lang === "zh" ? "新增訓練" : "Add Workout"}</DialogTitle></DialogHeader>
          {!addRunType ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{lang === "zh" ? "選擇跑步類型" : "Select run type"}</p>
              {RUN_TYPES.map((rt) => (
                <button key={rt.id} onClick={() => setAddRunType(rt.id)} className="w-full bg-card border border-border rounded-lg p-3 flex items-center gap-3 text-left hover:border-primary transition-colors">
                  <span>{rt.emoji}</span><span className="font-medium text-sm text-foreground">{lang === "zh" ? rt.zh : rt.en}</span><ChevronRight size={14} className="text-muted-foreground ml-auto" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <button onClick={() => setAddRunType(null)} className="flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft size={14} />{lang === "zh" ? "返回" : "Back"}</button>
              <div className="flex items-center gap-2">
                <span>{RUN_TYPES.find(r => r.id === addRunType)?.emoji}</span>
                <span className="font-medium text-foreground">{lang === "zh" ? RUN_TYPES.find(r => r.id === addRunType)?.zh : RUN_TYPES.find(r => r.id === addRunType)?.en}</span>
              </div>
              {existingPlan && addRunType !== "Trail Run" && addRunType !== "Trail Race" && (
                <div className="bg-accent/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-foreground mb-1">{lang === "zh" ? "建議配速" : "Suggested Pace"}</p>
                  <p className="text-sm font-bold text-primary">{suggestPace(addRunType, existingPlan.target_time, existingPlan.distance).pace}</p>
                  <p className="text-xs text-muted-foreground mt-1">{lang === "zh" ? suggestPace(addRunType, existingPlan.target_time, existingPlan.distance).descZh : suggestPace(addRunType, existingPlan.target_time, existingPlan.distance).description}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "距離 (公里)" : "Distance (km)"}</label>
                <Input type="number" min="0.5" step="0.5" placeholder="e.g. 8" value={addDistance} onChange={(e) => setAddDistance(e.target.value)} className="w-full" />
              </div>
              {(addRunType === "Trail Run" || addRunType === "Trail Race") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "爬升 (米)" : "Elevation (m)"}</label>
                    <Input type="number" min="0" step="10" placeholder="e.g. 500" value={addElevation} onChange={(e) => setAddElevation(e.target.value)} className="w-full" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">EpH</label>
                    <Input type="number" min="0" step="0.1" placeholder="e.g. 8" value={addEph} onChange={(e) => setAddEph(e.target.value)} className="w-full" />
                  </div>
                </div>
              )}
              <Button className="w-full" disabled={!addDistance || Number(addDistance) <= 0 || ((addRunType === "Trail Run" || addRunType === "Trail Race") && (!addElevation || !addEph))} onClick={() => {
                if (addingDayIdx === null || !addRunType || !addDistance) return;
                const rt = RUN_TYPES.find(r => r.id === addRunType)!;
                const paceInfo = existingPlan ? suggestPace(addRunType, existingPlan.target_time, existingPlan.distance) : { pace: "", description: "Custom workout", descZh: "自訂訓練" };
                const updatedPlan = [...plan]; const week = { ...updatedPlan[currentWeekIdx] }; const days = [...week.days];
                const isTrail = addRunType === "Trail Run" || addRunType === "Trail Race";
                const trailDesc = lang === "zh" ? `${addDistance}km · 爬升 ${Math.round(Number(addElevation) || 0)}m · 目標 EpH ${addEph}。以 EpH 控制越野強度。` : `${addDistance}km · ${Math.round(Number(addElevation) || 0)}m ascent · target EpH ${addEph}. Use EpH to control trail effort.`;
                days[addingDayIdx] = { ...days[addingDayIdx], type: addRunType, title: lang === "zh" ? rt.zh : rt.en, description: isTrail ? trailDesc : (lang === "zh" ? paceInfo.descZh : paceInfo.description), distance_km: Number(addDistance), pace: isTrail ? null : paceInfo.pace, color: rt.color, elevation_m: isTrail ? Number(addElevation) || null : null, eph: isTrail ? Number(addEph) || null : null };
                week.days = days; updatedPlan[currentWeekIdx] = week; setPlan(updatedPlan);
                if (user && existingPlan) supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", existingPlan.id).then(() => { notifyPlanChanged(); });
                setAddingDayIdx(null);
                toast({ title: lang === "zh" ? "已新增訓練" : "Workout Added", description: `${lang === "zh" ? rt.zh : rt.en} - ${addDistance} km` });
              }}>{lang === "zh" ? "新增訓練" : "Add Workout"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editingDayIdx !== null && plan[currentWeekIdx]?.days[editingDayIdx] && (
        <EditWorkoutDialog
          open={editingDayIdx !== null}
          onOpenChange={(o) => { if (!o) { setEditingDayIdx(null); setEditAppendNew(false); } }}
          lang={lang}
          workout={{
            type: plan[currentWeekIdx].days[editingDayIdx].type,
            title: localizeTitle(plan[currentWeekIdx].days[editingDayIdx].type, lang),
            distance_km: plan[currentWeekIdx].days[editingDayIdx].distance_km ?? null,
            pace: plan[currentWeekIdx].days[editingDayIdx].pace ?? "",
            description: plan[currentWeekIdx].days[editingDayIdx].description ?? "",
            color: plan[currentWeekIdx].days[editingDayIdx].color,
            elevation_m: plan[currentWeekIdx].days[editingDayIdx].elevation_m ?? null,
            eph: plan[currentWeekIdx].days[editingDayIdx].eph ?? null,
            sessions: (plan[currentWeekIdx].days[editingDayIdx] as any).sessions,
          }}
          multiSession
          appendNewSession={editAppendNew}
          recentActivities={recentRunActivities}
          profile={suggestProfile}
          targetTime={aiTargetTime}
          planContext={existingPlan ? `Plan: ${existingPlan.goal} ${existingPlan.distance ?? ""} target ${existingPlan.target_time ?? ""}, week ${currentWeekIdx + 1}` : null}
          onSave={async (next) => {
            if (editingDayIdx === null) return;
            const updatedPlan = [...plan]; const week = { ...updatedPlan[currentWeekIdx] }; const days = [...week.days];
            const nextType = next.type ?? days[editingDayIdx].type;
            const isTrail = nextType === "Trail Run" || nextType === "Trail Race";
            days[editingDayIdx] = {
              ...days[editingDayIdx],
              type: nextType,
              title: next.title ?? days[editingDayIdx].title,
              color: next.color ?? days[editingDayIdx].color,
              distance_km: next.distance_km ?? days[editingDayIdx].distance_km,
              pace: isTrail ? null : (next.pace || days[editingDayIdx].pace),
              description: next.description ?? days[editingDayIdx].description,
              elevation_m: isTrail ? (next.elevation_m ?? days[editingDayIdx].elevation_m ?? null) : null,
              eph: isTrail ? (next.eph ?? days[editingDayIdx].eph ?? null) : null,
              sessions: next.sessions,
            } as any;
            week.days = days; updatedPlan[currentWeekIdx] = week; setPlan(updatedPlan);
            if (user && existingPlan) await supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", existingPlan.id);
            notifyPlanChanged();
            toast({ title: lang === "zh" ? "已更新訓練" : "Workout Updated" });
            void repushIfPushed(editingDayIdx);
          }}
          onDelete={async () => {
            if (editingDayIdx === null) return;
            const updatedPlan = [...plan]; const week = { ...updatedPlan[currentWeekIdx] }; const days = [...week.days];
            days[editingDayIdx] = { ...days[editingDayIdx], type: "Rest", title: lang === "zh" ? "休息" : "Rest Day", description: lang === "zh" ? "全日休息恢復。" : "Full rest day for recovery.", distance_km: null, pace: null, color: "#607D8B", elevation_m: null, eph: null };
            week.days = days; updatedPlan[currentWeekIdx] = week; setPlan(updatedPlan);
            if (user && existingPlan) await supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", existingPlan.id);
            notifyPlanChanged();
            toast({ title: lang === "zh" ? "已刪除訓練" : "Workout Deleted" });
            // Day is now Rest — delete from watch if previously pushed
            void repushIfPushed(editingDayIdx);
          }}
        />
      )}

      {/* Add to Calendar Dialog */}
      <Dialog open={showAddToCalendar} onOpenChange={setShowAddToCalendar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{lang === "zh" ? "加入日曆" : "Add to Calendar"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {lang === "zh"
                ? "選擇訓練開始日期，計劃將從該週一開始排程。"
                : "Pick a start date. The plan will be scheduled starting from that Monday."}
            </p>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                {lang === "zh" ? "開始日期" : "Start Date"}
              </label>
              <Input
                type="date"
                value={calendarStartDate}
                onChange={(e) => setCalendarStartDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full"
              />
            </div>
            <Button
              className="w-full"
              disabled={!calendarStartDate || addingToCalendar}
              onClick={handleAddFreePlanToCalendar}
            >
              {addingToCalendar ? (
                <><Loader2 className="animate-spin mr-2" size={16} />{lang === "zh" ? "加入中..." : "Adding..."}</>
              ) : (
                <>{lang === "zh" ? "確認加入" : "Confirm"}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan Conflict Dialog */}
      <Dialog open={showPlanConflict} onOpenChange={setShowPlanConflict}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{lang === "zh" ? "已有訓練計劃" : "Active Plan Exists"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {lang === "zh"
              ? "你目前有一個訓練計劃。要取消現有計劃並繼續嗎？此操作無法撤銷。"
              : "You currently have an active training plan. Would you like to cancel it and continue? This cannot be undone."}
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setShowPlanConflict(false); setPendingSection(null); }}>
              {lang === "zh" ? "保留計劃" : "Keep Plan"}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleConflictCancel}>
              {lang === "zh" ? "取消計劃" : "Cancel Plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Cancel Confirm Dialog */}
      <Dialog open={showCustomCancelConfirm} onOpenChange={setShowCustomCancelConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{lang === "zh" ? "取消自訂計劃？" : "Cancel Custom Plan?"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{lang === "zh" ? "確定要取消此訓練計劃嗎？此操作無法撤銷。" : "Are you sure you want to cancel this plan? This action cannot be undone."}</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCustomCancelConfirm(false)}>{lang === "zh" ? "返回" : "Keep Plan"}</Button>
            <Button variant="destructive" className="flex-1" onClick={handleCancelCustomPlan}>{lang === "zh" ? "確認取消" : "Yes, Cancel"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Add Workout Dialog */}
      <Dialog open={customAddingDayIdx !== null} onOpenChange={(open) => { if (!open) setCustomAddingDayIdx(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{lang === "zh" ? "新增訓練" : "Add Workout"}</DialogTitle></DialogHeader>
          {!customAddRunType ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{lang === "zh" ? "選擇跑步類型" : "Select run type"}</p>
              {RUN_TYPES.map((rt) => (
                <button key={rt.id} onClick={() => setCustomAddRunType(rt.id)} className="w-full bg-card border border-border rounded-lg p-3 flex items-center gap-3 text-left hover:border-primary transition-colors">
                  <span>{rt.emoji}</span><span className="font-medium text-sm text-foreground">{lang === "zh" ? rt.zh : rt.en}</span><ChevronRight size={14} className="text-muted-foreground ml-auto" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <button onClick={() => setCustomAddRunType(null)} className="flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft size={14} />{lang === "zh" ? "返回" : "Back"}</button>
              <div className="flex items-center gap-2">
                <span>{RUN_TYPES.find(r => r.id === customAddRunType)?.emoji}</span>
                <span className="font-medium text-foreground">{lang === "zh" ? RUN_TYPES.find(r => r.id === customAddRunType)?.zh : RUN_TYPES.find(r => r.id === customAddRunType)?.en}</span>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "距離 (公里)" : "Distance (km)"}</label>
                <Input type="number" min="0.5" step="0.5" placeholder="e.g. 8" value={customAddDistance} onChange={(e) => setCustomAddDistance(e.target.value)} className="w-full" />
              </div>
              {(customAddRunType === "Trail Run" || customAddRunType === "Trail Race") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "爬升 (米)" : "Elevation (m)"}</label>
                    <Input type="number" min="0" step="10" placeholder="e.g. 500" value={customAddElevation} onChange={(e) => setCustomAddElevation(e.target.value)} className="w-full" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">EpH</label>
                    <Input type="number" min="0" step="0.1" placeholder="e.g. 8" value={customAddEph} onChange={(e) => setCustomAddEph(e.target.value)} className="w-full" />
                  </div>
                </div>
              )}
              <Button className="w-full" disabled={!customAddDistance || Number(customAddDistance) <= 0 || ((customAddRunType === "Trail Run" || customAddRunType === "Trail Race") && (!customAddElevation || !customAddEph))} onClick={() => {
                if (customAddingDayIdx === null || !customAddRunType || !customAddDistance) return;
                const rt = RUN_TYPES.find(r => r.id === customAddRunType)!;
                const updatedPlan = [...customPlan]; const week = { ...updatedPlan[customWeekIdx] }; const days = [...week.days];
                const isTrail = customAddRunType === "Trail Run" || customAddRunType === "Trail Race";
                const trailDesc = lang === "zh" ? `${customAddDistance}km · 爬升 ${Math.round(Number(customAddElevation) || 0)}m · 目標 EpH ${customAddEph}。以 EpH 控制越野強度。` : `${customAddDistance}km · ${Math.round(Number(customAddElevation) || 0)}m ascent · target EpH ${customAddEph}. Use EpH to control trail effort.`;
                days[customAddingDayIdx] = { ...days[customAddingDayIdx], type: customAddRunType, title: lang === "zh" ? rt.zh : rt.en, description: isTrail ? trailDesc : "", distance_km: Number(customAddDistance), pace: null, color: rt.color, elevation_m: isTrail ? Number(customAddElevation) || null : null, eph: isTrail ? Number(customAddEph) || null : null };
                week.days = days; updatedPlan[customWeekIdx] = week; setCustomPlan(updatedPlan);
                if (user && customExistingPlan) supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", customExistingPlan.id).then(() => { notifyPlanChanged(); });
                setCustomAddingDayIdx(null);
                toast({ title: lang === "zh" ? "已新增訓練" : "Workout Added", description: `${lang === "zh" ? rt.zh : rt.en} - ${customAddDistance} km` });
              }}>{lang === "zh" ? "新增訓練" : "Add Workout"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Edit Workout Dialog (validated) */}
      {customEditingDayIdx !== null && customPlan[customWeekIdx]?.days[customEditingDayIdx] && (
        <EditWorkoutDialog
          open={customEditingDayIdx !== null}
          onOpenChange={(o) => { if (!o) { setCustomEditingDayIdx(null); setCustomEditAppendNew(false); } }}
          lang={lang}
          workout={{
            type: customPlan[customWeekIdx].days[customEditingDayIdx].type,
            title: localizeTitle(customPlan[customWeekIdx].days[customEditingDayIdx].type, lang),
            distance_km: customPlan[customWeekIdx].days[customEditingDayIdx].distance_km ?? null,
            pace: customPlan[customWeekIdx].days[customEditingDayIdx].pace ?? "",
            description: customPlan[customWeekIdx].days[customEditingDayIdx].description ?? "",
            color: customPlan[customWeekIdx].days[customEditingDayIdx].color,
            elevation_m: customPlan[customWeekIdx].days[customEditingDayIdx].elevation_m ?? null,
            eph: customPlan[customWeekIdx].days[customEditingDayIdx].eph ?? null,
            sessions: (customPlan[customWeekIdx].days[customEditingDayIdx] as any).sessions,
          }}
          multiSession
          appendNewSession={customEditAppendNew}
          recentActivities={recentRunActivities}
          profile={suggestProfile}
          targetTime={null}
          planContext={customExistingPlan ? `Custom plan, week ${customWeekIdx + 1}` : null}
          onSave={async (next) => {
            if (customEditingDayIdx === null) return;
            const updatedPlan = [...customPlan]; const week = { ...updatedPlan[customWeekIdx] }; const days = [...week.days];
            const nextType = next.type ?? days[customEditingDayIdx].type;
            const isTrail = nextType === "Trail Run" || nextType === "Trail Race";
            days[customEditingDayIdx] = {
              ...days[customEditingDayIdx],
              type: nextType,
              title: next.title ?? days[customEditingDayIdx].title,
              color: next.color ?? days[customEditingDayIdx].color,
              distance_km: next.distance_km ?? days[customEditingDayIdx].distance_km,
              pace: isTrail ? null : (next.pace || days[customEditingDayIdx].pace),
              description: next.description ?? days[customEditingDayIdx].description,
              elevation_m: isTrail ? (next.elevation_m ?? days[customEditingDayIdx].elevation_m ?? null) : null,
              eph: isTrail ? (next.eph ?? days[customEditingDayIdx].eph ?? null) : null,
              sessions: next.sessions,
            } as any;
            week.days = days; updatedPlan[customWeekIdx] = week; setCustomPlan(updatedPlan);
            if (user && customExistingPlan) await supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", customExistingPlan.id);
            notifyPlanChanged();
            toast({ title: lang === "zh" ? "已更新訓練" : "Workout Updated" });
          }}
          onDelete={async () => {
            if (customEditingDayIdx === null) return;
            const updatedPlan = [...customPlan]; const week = { ...updatedPlan[customWeekIdx] }; const days = [...week.days];
            days[customEditingDayIdx] = { ...days[customEditingDayIdx], type: "Rest", title: lang === "zh" ? "休息" : "Rest Day", description: "", distance_km: null, pace: null, color: "#607D8B", elevation_m: null, eph: null };
            week.days = days; updatedPlan[customWeekIdx] = week; setCustomPlan(updatedPlan);
            if (user && customExistingPlan) await supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", customExistingPlan.id);
            notifyPlanChanged();
            toast({ title: lang === "zh" ? "已刪除訓練" : "Workout Deleted" });
          }}
        />
      )}

      <WeeklyReviewModal
        open={showWeeklyReview}
        onClose={() => setShowWeeklyReview(false)}
        lang={lang}
        planId={section === "custom" ? (customExistingPlan?.id ?? null) : (existingPlan?.id ?? null)}
        currentWeekIdx={section === "custom" ? customWeekIdx : currentWeekIdx}
      />

      {/* Finetune week dialog */}
      <Dialog open={finetuneOpen} onOpenChange={(o) => { if (!o && !finetuning && !confirmingFinetune) { setFinetuneOpen(false); setFinetuneResult(null); } }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              {lang === "zh" ? "依恢復數據微調本週" : "Finetune Week from Recovery"}
            </DialogTitle>
          </DialogHeader>

          {finetuning || !finetuneResult ? (
            <div className="py-10 flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" size={20} />
              {lang === "zh" ? "AI 正在分析你的 HRV/RHR 與本週計劃…" : "AI is analyzing your HRV/RHR vs this week's plan…"}
            </div>
          ) : (
            <div className="space-y-4">
              {finetuneResult.recovery && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/40 rounded-lg p-2">
                    <div className="text-[10px] text-muted-foreground uppercase">HRV</div>
                    <div className="text-sm font-bold">{finetuneResult.recovery.avg_hrv ?? "—"}</div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <div className="text-[10px] text-muted-foreground uppercase">RHR</div>
                    <div className="text-sm font-bold">{finetuneResult.recovery.avg_rhr ?? "—"}</div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <div className="text-[10px] text-muted-foreground uppercase">{lang === "zh" ? "睡眠" : "Sleep"}</div>
                    <div className="text-sm font-bold">{finetuneResult.recovery.avg_sleep ?? "—"}</div>
                  </div>
                </div>
              )}

              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">{lang === "zh" ? "AI 建議" : "AI Recommendation"}</div>
                <p className="text-sm whitespace-pre-line leading-relaxed">
                  {(lang === "zh" ? finetuneResult.summary_zh : finetuneResult.summary_en) || finetuneResult.summary_en}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">{lang === "zh" ? "建議調整" : "Proposed changes"}</div>
                {finetuneResult.adjusted_days.map((adj: any, i: number) => {
                  const orig = finetuneResult.original_days[i] || {};
                  const changed =
                    adj.type !== orig.type ||
                    (adj.distance_km ?? null) !== (orig.distance_km ?? null) ||
                    (adj.pace ?? null) !== (orig.pace ?? null);
                  const d = adj.date ? new Date(adj.date + "T00:00:00") : null;
                  const label = d ? d.toLocaleDateString(lang === "zh" ? "zh-HK" : "en", { weekday: "short", month: "short", day: "numeric" }) : `Day ${i + 1}`;
                  return (
                    <div key={i} className={`rounded-lg border p-2 text-xs ${changed ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{label}</span>
                        {changed && <span className="text-[10px] font-bold uppercase text-primary">{lang === "zh" ? "已調整" : "Adjusted"}</span>}
                      </div>
                      {changed ? (
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <div className="text-muted-foreground line-through">
                            {orig.type} {orig.distance_km ? `· ${orig.distance_km}km` : ""} {orig.pace ? `· ${orig.pace}` : ""}
                          </div>
                          <div className="text-foreground font-medium">
                            {adj.type} {adj.distance_km ? `· ${adj.distance_km}km` : ""} {adj.pace ? `· ${adj.pace}` : ""}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-muted-foreground">
                          {adj.type} {adj.distance_km ? `· ${adj.distance_km}km` : ""} {adj.pace ? `· ${adj.pace}` : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setFinetuneOpen(false); setFinetuneResult(null); }} disabled={confirmingFinetune}>
                  {lang === "zh" ? "取消" : "Cancel"}
                </Button>
                <Button className="flex-1" onClick={confirmFinetune} disabled={confirmingFinetune}>
                  {confirmingFinetune
                    ? <><Loader2 className="animate-spin mr-2" size={14} />{lang === "zh" ? "更新中…" : "Updating…"}</>
                    : (lang === "zh" ? "確認更新本週" : "Confirm & Update Week")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>

  );
};

export default TrainingTab;
