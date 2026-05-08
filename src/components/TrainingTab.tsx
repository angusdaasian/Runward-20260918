import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Lang, t } from "@/lib/i18n";
import { getMainPaces, predictTime, formatTime, raceDistances } from "@/lib/vdot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePremium } from "@/contexts/PremiumContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus, isOnline } from "@/hooks/use-online-status";
import { getCached, setCached, CacheKeys } from "@/lib/offlineCache";
import {
  Loader2, Lock, ChevronLeft, ChevronRight, Plus, Calendar, Target, Trophy,
  Repeat, Route, HelpCircle, X, WifiOff, Sparkles
} from "lucide-react";
import WeeklyReviewModal from "@/components/training/WeeklyReviewModal";
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
type Distance = "5K" | "10K" | "HM" | "FM";

interface DayPlan {
  day: string; date: string; type: string; title: string;
  description: string; distance_km: number | null; pace: string | null; color: string;
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
];

const TYPE_LABELS: Record<string, { en: string; zh: string }> = {
  "Easy Run": { en: "Easy Run", zh: "輕鬆跑" }, "Easy": { en: "Easy Run", zh: "輕鬆跑" },
  "Tempo Run": { en: "Tempo Run", zh: "節奏跑" }, "Tempo": { en: "Tempo Run", zh: "節奏跑" },
  "Interval": { en: "Interval", zh: "間歇跑" },
  "Long Run": { en: "Long Run", zh: "長課" }, "Long": { en: "Long Run", zh: "長課" },
  "Recovery": { en: "Recovery Run", zh: "恢復跑" }, "Recovery Run": { en: "Recovery Run", zh: "恢復跑" },
  "Rest": { en: "Rest", zh: "休息" }, "Cross Training": { en: "Cross Training", zh: "交叉訓練" },
  "Race Pace": { en: "Race Pace", zh: "比賽配速" },
  "Progression Run": { en: "Progression Run", zh: "漸進跑" }, "Progression": { en: "Progression Run", zh: "漸進跑" },
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
];

const MIN_WEEKS: Record<Distance, number> = { "5K": 4, "10K": 4, HM: 6, FM: 8 };
const MIN_DAYS: Record<Distance, number> = { "5K": 2, "10K": 2, HM: 3, FM: 4 };

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
      case "Progression Run":
      case "Progression":
        if (distStr && paceStr) return `${distStr}漸進跑，配速約${paceStr}。由輕鬆開始，逐步加速至節奏或比賽配速。`;
        if (distStr) return `${distStr}漸進跑。由輕鬆開始，逐步加速至節奏或比賽配速。`;
        return "漸進跑。由輕鬆開始，逐步加速至節奏或比賽配速。";
      default:
        if (distStr && paceStr) return `${distStr}${typeZh}，配速約${paceStr}。`;
        if (distStr) return `${distStr}${typeZh}。`;
        return typeZh;
    }
  }

  // English: for rich types preserve original description
  const richTypes = ["Interval", "Cross Training", "Progression Run", "Race Pace", "Tempo Run"];
  if (richTypes.includes(day.type) && day.description) {
    return day.description;
  }

  if (paceStr && distStr) return `${distStr} at ${paceStr} pace`;
  if (distStr) return `${distStr} run`;
  return day.description;
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

const TrainingTab = ({ score, setScore, lang, onLoginRequest }: Props) => {
  const { isPremium } = usePremium();
  const { user } = useAuth();
  const { toast } = useToast();
  const { online } = useOnlineStatus();

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

  // Add/Edit workout
  const [addingDayIdx, setAddingDayIdx] = useState<number | null>(null);
  const [addRunType, setAddRunType] = useState<string | null>(null);
  const [addDistance, setAddDistance] = useState("");
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [editDistance, setEditDistance] = useState("");
  const [editPace, setEditPace] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Load existing plan (cache-then-network so it works offline)
  useEffect(() => {
    if (!user) return;

    const applyPlan = (p: any) => {
      if (!p) return;
      if (p.goal === "custom") {
        setCustomExistingPlan(p);
        setCustomPlan(p.plan_data || []);
        setCustomStep("calendar");
        const today = new Date().toISOString().split("T")[0];
        const idx = (p.plan_data || []).findIndex((w: WeekPlan) => w.days.some((d: DayPlan) => d.date >= today));
        setCustomWeekIdx(Math.max(0, idx));
      } else {
        setExistingPlan(p);
        setPlan(p.plan_data || []);
        setProgramStep("calendar");
        const today = new Date().toISOString().split("T")[0];
        const idx = (p.plan_data || []).findIndex((w: WeekPlan) => w.days.some((d: DayPlan) => d.date >= today));
        setCurrentWeekIdx(Math.max(0, idx));
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
    return Math.max(0, Math.floor((end - start) / (7 * 24 * 60 * 60 * 1000)));
  }, [raceDate, startDate]);

  const minWeeks = distance ? MIN_WEEKS[distance] : 4;
  const dateValid = weeksUntilRace >= minWeeks;

  const getPace = (timeSeconds: number, meters: number): string => {
    const pacePerKm = timeSeconds / (meters / 1000);
    const m = Math.floor(pacePerKm / 60);
    const s = Math.round(pacePerKm % 60);
    return `${m}:${s.toString().padStart(2, "0")} / km`;
  };

  // Keep restDays valid given daysPerWeek and longRunDay
  useEffect(() => {
    const max = 7 - daysPerWeek;
    setRestDays((prev) => prev.filter((d) => d !== longRunDay).slice(0, Math.max(0, max)));
  }, [daysPerWeek, longRunDay]);

  const handleGenerate = async () => {
    if (!distance || !targetTime || !raceDate || !startDate || !dateValid) return;
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
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-program`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ goal, distance, targetTime, raceDate, startDate, weeks: weeksUntilRace, daysPerWeek, weeklyKm, longRunDay, restDays, lang }),
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || "Failed to generate"); }
      const result = await response.json();
      const planData = result.plan || [];
      setPlan(planData);
      setCurrentWeekIdx(0);
      setProgramStep("calendar");
      if (user) {
        await supabase.from("training_plans" as any).delete().eq("user_id", user.id);
        const inserted: any = {
          user_id: user.id, goal: goal || "race", distance, target_time: targetTime,
          race_date: raceDate, weeks: weeksUntilRace, plan_data: planData, raw_output: result.raw || "",
        };
        const { data: saved } = await (supabase.from("training_plans" as any) as any).insert(inserted).select().single();
        const nextPlan = saved || inserted;
        setExistingPlan(nextPlan);
        setCached(CacheKeys.trainingPlan(user.id), nextPlan);
      }
    } catch (err: any) {
      console.error("Error generating program:", err);
      toast({ title: lang === "zh" ? "錯誤" : "Error", description: err.message || (lang === "zh" ? "生成訓練計劃時出錯" : "Failed to generate program"), variant: "destructive" });
    } finally { setLoading(false); }
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
    }
    setProgramStep("details"); setDistance(null); setTargetTime(""); setTargetHours(""); setTargetMinutes(""); setTargetSeconds(""); setRaceDate(""); setStartDate(""); setPlan([]); setExistingPlan(null);
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
      toast({ title: lang === "zh" ? "計劃已建立" : "Program Created" });
    }
  };

  const handleCancelCustomPlan = async () => {
    if (user && customExistingPlan) {
      await supabase.from("training_plans" as any).delete().eq("id", customExistingPlan.id);
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
      {/* Header */}
      <div className="flex items-start justify-between mb-4 px-5 pt-6">
        <h1 className="font-display text-3xl font-bold text-foreground">
          {t("training", lang)}
        </h1>
      </div>

      {/* Section toggle */}
      <div className="flex gap-1 bg-accent rounded-lg p-1 mb-4 mx-5">
        <button onClick={() => handleSectionSwitch("training")}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${section === "training" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
          {lang === "zh" ? "配速" : "Paces"}
        </button>
        <button onClick={() => handleSectionSwitch("free")}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${section === "free" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
          {lang === "zh" ? "免費" : "Free"}
        </button>
        <button onClick={() => handleSectionSwitch("program")}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1 ${section === "program" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
          {!isPremium && <Lock size={12} />}
          {lang === "zh" ? "AI" : "AI"}
        </button>
        <button onClick={() => handleSectionSwitch("custom")}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${section === "custom" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
          {lang === "zh" ? "自訂" : "Custom"}
        </button>
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
                      <button onClick={() => setCurrentWeekIdx(Math.max(0, currentWeekIdx - 1))} disabled={currentWeekIdx === 0} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <button onClick={() => setCurrentWeekIdx(Math.min(plan.length - 1, currentWeekIdx + 1))} disabled={currentWeekIdx === plan.length - 1} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                   <p className="text-xs text-muted-foreground">{lang === "zh" ? "總計" : "Total"}: {totalKm.toFixed(1)} km</p>
                </div>

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
                                  {day.pace && <span>{day.pace}</span>}
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
                    {(currentWeek.days || []).map((day: any, i: number) => (
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
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm text-foreground">{localizeTitle(day.type, lang)}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {day.pace && <span>{day.pace}</span>}
                                  {day.distance_km && <span>{day.distance_km} km</span>}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{localizeDescription(day, lang)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
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
                        <button key={d.id} onClick={() => { setDistance(d.id); setTargetTime(""); const md = MIN_DAYS[d.id]; if (daysPerWeek < md) setDaysPerWeek(md); const minKm = d.id === "FM" ? 45 : d.id === "HM" ? 25 : 15; if (weeklyKm < minKm) setWeeklyKm(minKm); }}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${distance === d.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-accent"}`}>
                          {d.id === "HM" ? (lang === "zh" ? "半馬" : "HM") : d.id === "FM" ? (lang === "zh" ? "全馬" : "FM") : d.id}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Target Time */}
                  {distance && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Trophy size={14} />{lang === "zh" ? "目標完成時間" : "Target Finish Time"}</label>
                      <div className="flex items-center gap-2">
                        {(distance === "HM" || distance === "FM") && (
                          <>
                            <Input type="number" min="0" max="9" placeholder={lang === "zh" ? "時" : "H"} value={targetHours}
                              onChange={(e) => { setTargetHours(e.target.value); setTargetTime(`${e.target.value || "0"}:${targetMinutes || "00"}:${targetSeconds || "00"}`); }} className="w-16 text-center" />
                            <span className="text-muted-foreground">:</span>
                          </>
                        )}
                        <Input type="number" min="0" max="59" placeholder={lang === "zh" ? "分" : "M"} value={targetMinutes}
                          onChange={(e) => { setTargetMinutes(e.target.value); const h = targetHours || "0"; const m = e.target.value || "00"; setTargetTime(distance === "HM" || distance === "FM" ? `${h}:${m}:${targetSeconds || "00"}` : `${m}:${targetSeconds || "00"}`); }} className="w-16 text-center" />
                        <span className="text-muted-foreground">:</span>
                        <Input type="number" min="0" max="59" placeholder={lang === "zh" ? "秒" : "S"} value={targetSeconds}
                          onChange={(e) => { setTargetSeconds(e.target.value); const h = targetHours || "0"; const m = targetMinutes || "00"; setTargetTime(distance === "HM" || distance === "FM" ? `${h}:${m}:${e.target.value || "00"}` : `${m}:${e.target.value || "00"}`); }} className="w-16 text-center" />
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
                  {distance && (
                    <div className="mb-5">
                      <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Route size={14} />{lang === "zh" ? "每週目標公里數" : "Preferred Weekly Km"}</label>
                      <select
                        value={weeklyKm}
                        onChange={(e) => setWeeklyKm(Number(e.target.value))}
                        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                      >
                        {Array.from({ length: Math.floor((200 - (distance === "FM" ? 45 : distance === "HM" ? 25 : 15)) / 5) + 1 }, (_, i) => {
                          const min = distance === "FM" ? 45 : distance === "HM" ? 25 : 15;
                          const val = min + i * 5;
                          return <option key={val} value={val}>{val} km</option>;
                        })}
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">{lang === "zh" ? "你每週大概想跑多少公里？" : "How many km would you prefer to run per week?"}</p>
                    </div>
                  )}

                  {/* Long Run Day */}
                  {distance && (
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
                  {distance && (
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

                  <div className="mb-5">
                    <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Calendar size={14} />{lang === "zh" ? "開始日期" : "Start Date"}</label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={new Date().toISOString().split("T")[0]} className="w-full" />
                    <p className="text-xs text-muted-foreground mt-1">{lang === "zh" ? "計劃從哪天開始？" : "When should the plan start?"}</p>
                  </div>

                  {/* Race Date */}
                  <div className="mb-5">
                    <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2"><Calendar size={14} />{lang === "zh" ? "比賽日期" : "Race Date"}</label>
                    <Input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} min={startDate ? new Date(new Date(startDate + "T00:00:00").getTime() + minWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] : new Date(Date.now() + minWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]} className="w-full" />
                    {raceDate && startDate && !dateValid && <p className="text-xs text-destructive mt-1">{lang === "zh" ? `開始日期與比賽之間至少需要 ${minWeeks} 週` : `At least ${minWeeks} weeks needed between start and race date`}</p>}
                    {raceDate && startDate && dateValid && <p className="text-xs text-muted-foreground mt-1">{weeksUntilRace} {lang === "zh" ? "週訓練計劃" : "weeks training plan"}</p>}
                  </div>

                  <Button onClick={handleGenerateClick} disabled={!distance || !targetTime || !raceDate || !startDate || !dateValid || loading || restDays.length !== 7 - daysPerWeek} className="w-full" size="lg">
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
                    <div className="bg-card border border-border rounded-xl p-3 mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="text-sm font-medium text-foreground">{formatDate(weekStart)} - {formatDate(weekEnd)}</span>
                          <span className="ml-2 bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 rounded-full">WEEK {currentWeek.week}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setCurrentWeekIdx(Math.max(0, currentWeekIdx - 1))} disabled={currentWeekIdx === 0} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronLeft size={16} /></button>
                          <button onClick={() => setCurrentWeekIdx(Math.min(plan.length - 1, currentWeekIdx + 1))} disabled={currentWeekIdx === plan.length - 1} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronRight size={16} /></button>
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
                                <button onClick={() => { setAddingDayIdx(i); setAddRunType(null); setAddDistance(""); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                  <Plus size={12} />{lang === "zh" ? "新增" : "Add"}
                                </button>
                              </div>
                            ) : (
                              <div className="flex-1 border-l-2 pl-3 py-2 cursor-pointer" style={{ borderColor: day.color || "hsl(var(--border))" }}
                                onClick={() => { setEditingDayIdx(i); setEditDistance(day.distance_km?.toString() || ""); setEditPace(day.pace || ""); setEditDescription(day.description || ""); }}>
                                <div className="bg-card border border-border rounded-lg p-3 hover:border-primary transition-colors">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm text-foreground">{localizeTitle(day.type, lang)}</span>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      {day.pace && <span>{day.pace}</span>}
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

                    <div className="flex items-center justify-center gap-1 mt-6">
                      {plan.map((_, i) => (
                        <button key={i} onClick={() => setCurrentWeekIdx(i)} className={`w-2 h-2 rounded-full transition-colors ${i === currentWeekIdx ? "bg-primary" : "bg-border"}`} />
                      ))}
                    </div>

                    {/* Weekly Review temporarily hidden for testing
                    <Button
                      variant="outline"
                      className="w-full mt-6 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => setShowWeeklyReview(true)}
                    >
                      <Sparkles size={14} className="mr-2" />
                      {lang === "zh" ? "週訓練回顧" : "Weekly Review"}
                    </Button>
                    */}

                    <Button variant="outline" className="w-full mt-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowCancelConfirm(true)}>
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
                            <button onClick={() => { setCustomAddingDayIdx(i); setCustomAddRunType(null); setCustomAddDistance(""); }}
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
                                  {day.pace && <span>{day.pace}</span>}
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

                {/* Weekly Review temporarily hidden for testing
                <Button
                  variant="outline"
                  className="w-full mt-6 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => setShowWeeklyReview(true)}
                >
                  <Sparkles size={14} className="mr-2" />
                  {lang === "zh" ? "週訓練回顧" : "Weekly Review"}
                </Button>
                */}

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
              {existingPlan && (
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
              <Button className="w-full" disabled={!addDistance || Number(addDistance) <= 0} onClick={() => {
                if (addingDayIdx === null || !addRunType || !addDistance) return;
                const rt = RUN_TYPES.find(r => r.id === addRunType)!;
                const paceInfo = existingPlan ? suggestPace(addRunType, existingPlan.target_time, existingPlan.distance) : { pace: "", description: "Custom workout", descZh: "自訂訓練" };
                const updatedPlan = [...plan]; const week = { ...updatedPlan[currentWeekIdx] }; const days = [...week.days];
                days[addingDayIdx] = { ...days[addingDayIdx], type: addRunType, title: lang === "zh" ? rt.zh : rt.en, description: lang === "zh" ? paceInfo.descZh : paceInfo.description, distance_km: Number(addDistance), pace: paceInfo.pace, color: rt.color };
                week.days = days; updatedPlan[currentWeekIdx] = week; setPlan(updatedPlan);
                if (user && existingPlan) supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", existingPlan.id).then(() => {});
                setAddingDayIdx(null);
                toast({ title: lang === "zh" ? "已新增訓練" : "Workout Added", description: `${lang === "zh" ? rt.zh : rt.en} - ${addDistance} km` });
              }}>{lang === "zh" ? "新增訓練" : "Add Workout"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editingDayIdx !== null} onOpenChange={(open) => { if (!open) setEditingDayIdx(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{lang === "zh" ? "編輯訓練" : "Edit Workout"}</DialogTitle></DialogHeader>
          {editingDayIdx !== null && plan[currentWeekIdx]?.days[editingDayIdx] && (() => {
            const day = plan[currentWeekIdx].days[editingDayIdx];
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: day.color }} /><span className="font-medium text-foreground">{localizeTitle(day.type, lang)}</span></div>
                <div><label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "距離 (公里)" : "Distance (km)"}</label><Input type="number" min="0.5" step="0.5" value={editDistance} onChange={(e) => setEditDistance(e.target.value)} className="w-full" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "配速 (例: 5:30/km)" : "Pace (e.g. 5:30/km)"}</label><Input type="text" placeholder="5:30/km" value={editPace} onChange={(e) => setEditPace(e.target.value)} className="w-full" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "描述" : "Description"}</label><textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></div>
                <Button className="w-full" onClick={() => {
                  if (editingDayIdx === null) return;
                  const updatedPlan = [...plan]; const week = { ...updatedPlan[currentWeekIdx] }; const days = [...week.days];
                  days[editingDayIdx] = { ...days[editingDayIdx], distance_km: editDistance ? Number(editDistance) : days[editingDayIdx].distance_km, pace: editPace || days[editingDayIdx].pace, description: editDescription };
                  week.days = days; updatedPlan[currentWeekIdx] = week; setPlan(updatedPlan);
                  if (user && existingPlan) supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", existingPlan.id).then(() => {});
                  setEditingDayIdx(null);
                  toast({ title: lang === "zh" ? "已更新訓練" : "Workout Updated" });
                }}>{lang === "zh" ? "儲存變更" : "Save Changes"}</Button>
                <Button variant="destructive" className="w-full" onClick={() => {
                  if (editingDayIdx === null) return;
                  const updatedPlan = [...plan]; const week = { ...updatedPlan[currentWeekIdx] }; const days = [...week.days];
                  days[editingDayIdx] = { ...days[editingDayIdx], type: "Rest", title: lang === "zh" ? "休息" : "Rest Day", description: lang === "zh" ? "全日休息恢復。" : "Full rest day for recovery.", distance_km: null, pace: null, color: "#607D8B" };
                  week.days = days; updatedPlan[currentWeekIdx] = week; setPlan(updatedPlan);
                  if (user && existingPlan) supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", existingPlan.id).then(() => {});
                  setEditingDayIdx(null);
                  toast({ title: lang === "zh" ? "已刪除訓練" : "Workout Deleted" });
                }}>{lang === "zh" ? "刪除訓練" : "Delete Workout"}</Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

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
              <Button className="w-full" disabled={!customAddDistance || Number(customAddDistance) <= 0} onClick={() => {
                if (customAddingDayIdx === null || !customAddRunType || !customAddDistance) return;
                const rt = RUN_TYPES.find(r => r.id === customAddRunType)!;
                const updatedPlan = [...customPlan]; const week = { ...updatedPlan[customWeekIdx] }; const days = [...week.days];
                days[customAddingDayIdx] = { ...days[customAddingDayIdx], type: customAddRunType, title: lang === "zh" ? rt.zh : rt.en, description: "", distance_km: Number(customAddDistance), pace: null, color: rt.color };
                week.days = days; updatedPlan[customWeekIdx] = week; setCustomPlan(updatedPlan);
                if (user && customExistingPlan) supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", customExistingPlan.id).then(() => {});
                setCustomAddingDayIdx(null);
                toast({ title: lang === "zh" ? "已新增訓練" : "Workout Added", description: `${lang === "zh" ? rt.zh : rt.en} - ${customAddDistance} km` });
              }}>{lang === "zh" ? "新增訓練" : "Add Workout"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Edit Workout Dialog */}
      <Dialog open={customEditingDayIdx !== null} onOpenChange={(open) => { if (!open) setCustomEditingDayIdx(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{lang === "zh" ? "編輯訓練" : "Edit Workout"}</DialogTitle></DialogHeader>
          {customEditingDayIdx !== null && customPlan[customWeekIdx]?.days[customEditingDayIdx] && (() => {
            const day = customPlan[customWeekIdx].days[customEditingDayIdx];
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: day.color }} /><span className="font-medium text-foreground">{localizeTitle(day.type, lang)}</span></div>
                <div><label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "距離 (公里)" : "Distance (km)"}</label><Input type="number" min="0.5" step="0.5" value={customEditDistance} onChange={(e) => setCustomEditDistance(e.target.value)} className="w-full" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "配速 (例: 5:30/km)" : "Pace (e.g. 5:30/km)"}</label><Input type="text" placeholder="5:30/km" value={customEditPace} onChange={(e) => setCustomEditPace(e.target.value)} className="w-full" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1 block">{lang === "zh" ? "描述" : "Description"}</label><textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y" value={customEditDescription} onChange={(e) => setCustomEditDescription(e.target.value)} /></div>
                <Button className="w-full" onClick={() => {
                  if (customEditingDayIdx === null) return;
                  const updatedPlan = [...customPlan]; const week = { ...updatedPlan[customWeekIdx] }; const days = [...week.days];
                  days[customEditingDayIdx] = { ...days[customEditingDayIdx], distance_km: customEditDistance ? Number(customEditDistance) : days[customEditingDayIdx].distance_km, pace: customEditPace || days[customEditingDayIdx].pace, description: customEditDescription };
                  week.days = days; updatedPlan[customWeekIdx] = week; setCustomPlan(updatedPlan);
                  if (user && customExistingPlan) supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", customExistingPlan.id).then(() => {});
                  setCustomEditingDayIdx(null);
                  toast({ title: lang === "zh" ? "已更新訓練" : "Workout Updated" });
                }}>{lang === "zh" ? "儲存變更" : "Save Changes"}</Button>
                <Button variant="destructive" className="w-full" onClick={() => {
                  if (customEditingDayIdx === null) return;
                  const updatedPlan = [...customPlan]; const week = { ...updatedPlan[customWeekIdx] }; const days = [...week.days];
                  days[customEditingDayIdx] = { ...days[customEditingDayIdx], type: "Rest", title: lang === "zh" ? "休息" : "Rest Day", description: "", distance_km: null, pace: null, color: "#607D8B" };
                  week.days = days; updatedPlan[customWeekIdx] = week; setCustomPlan(updatedPlan);
                  if (user && customExistingPlan) supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", customExistingPlan.id).then(() => {});
                  setCustomEditingDayIdx(null);
                  toast({ title: lang === "zh" ? "已刪除訓練" : "Workout Deleted" });
                }}>{lang === "zh" ? "刪除訓練" : "Delete Workout"}</Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <WeeklyReviewModal
        open={showWeeklyReview}
        onClose={() => setShowWeeklyReview(false)}
        lang={lang}
        planId={section === "custom" ? (customExistingPlan?.id ?? null) : (existingPlan?.id ?? null)}
        currentWeekIdx={section === "custom" ? customWeekIdx : currentWeekIdx}
      />
    </div>
  );
};

export default TrainingTab;
