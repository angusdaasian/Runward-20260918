import { useState, useEffect, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, ChevronLeft, ChevronRight, Plus, Calendar, Target, Trophy, Clock, Repeat, Route, Sparkles } from "lucide-react";
import { usePremium } from "@/contexts/PremiumContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { notifyPlanChanged, subscribePlanChanged } from "@/lib/planEvents";
import EditWorkoutDialog from "@/components/training/EditWorkoutDialog";
import { useActivities } from "@/hooks/use-activities";

type Goal = "race" | "distance" | "first5k" | "parkrun" | "general" | "postnatal" | "fitness" | "injury" | "postrace";
type Distance = "5K" | "10K" | "HM" | "FM";

interface DayPlan {
  day: string;
  date: string;
  type: string;
  title: string;
  description: string;
  distance_km: number | null;
  pace: string | null;
  color: string;
}

const RUN_TYPES = [
  { id: "Easy", emoji: "🟢", en: "Easy Run", zh: "輕鬆跑", color: "#22c55e" },
  { id: "Tempo", emoji: "🟡", en: "Tempo Run", zh: "節奏跑", color: "#eab308" },
  { id: "Interval", emoji: "🔴", en: "Interval", zh: "間歇跑", color: "#ef4444" },
  { id: "Long", emoji: "🔵", en: "Long Run", zh: "長跑", color: "#3b82f6" },
  { id: "Recovery", emoji: "⚪", en: "Recovery Run", zh: "恢復跑", color: "#94a3b8" },
];

// Map workout type strings to localized labels
const TYPE_LABELS: Record<string, { en: string; zh: string }> = {
  "Easy Run": { en: "Easy Run", zh: "輕鬆跑" },
  "Easy": { en: "Easy Run", zh: "輕鬆跑" },
  "Tempo Run": { en: "Tempo Run", zh: "節奏跑" },
  "Tempo": { en: "Tempo Run", zh: "節奏跑" },
  "Interval": { en: "Interval", zh: "間歇跑" },
  "Long Run": { en: "Long Run", zh: "長課" },
  "Long": { en: "Long Run", zh: "長課" },
  "Recovery": { en: "Recovery Run", zh: "恢復跑" },
  "Recovery Run": { en: "Recovery Run", zh: "恢復跑" },
  "Rest": { en: "Rest", zh: "休息" },
  "Cross Training": { en: "Cross Training", zh: "交叉訓練" },
  "Race Pace": { en: "Race Pace", zh: "比賽配速" },
  "Progression Run": { en: "Progression Run", zh: "漸進跑" },
  "Progression": { en: "Progression Run", zh: "漸進跑" },
  "Trail Run": { en: "Trail Run", zh: "越野跑" },
  "Trail Race": { en: "Trail Race", zh: "越野賽" },
  "Race": { en: "Race", zh: "比賽" },
};

function localizeTitle(type: string, lang: Lang): string {
  const label = TYPE_LABELS[type];
  return label ? label[lang] : type;
}

function localizeDescription(day: DayPlan, lang: Lang): string {
  const distStr = day.distance_km ? `${day.distance_km}km` : "";
  const paceStr = day.pace || "";

  if (day.type === "Rest") return lang === "zh" ? "休息日" : "Rest day";

  if (day.type === "Cross Training") {
    return lang === "zh"
      ? "30分鐘低強度交叉訓練（例如：游泳、單車），提高心肺功能。"
      : "30 min low-intensity cross training (e.g. swimming, cycling) to build cardio.";
  }

  // For Interval type, try to parse structured info from description and rebuild localized
  if (day.type === "Interval") {
    // Try to extract pattern like "Xkm warm-up + Ykm × N + Zkm recovery × N + Wkm cool-down"
    // or "5x1km @ pace with 90s recovery" etc.
    const repMatch = day.description?.match(/(\d+)\s*[x×]\s*([\d.]+)\s*k/i);
    const paceMatch = day.description?.match(/@\s*([\d:]+)/);
    const recoveryMatch = day.description?.match(/(\d+)\s*s?\s*(recovery|恢復|rest|慢跑)/i);

    if (repMatch) {
      const reps = repMatch[1];
      const repDist = repMatch[2];
      const paceVal = paceMatch ? paceMatch[1] : paceStr?.replace(/\/km/i, "") || "";
      const recoveryVal = recoveryMatch ? recoveryMatch[1] + "s" : "90s";

      if (lang === "zh") {
        return `${reps}×${repDist}公里 @ ${paceVal}，${recoveryVal}恢復`;
      }
      return `${reps}×${repDist}km @ ${paceVal} with ${recoveryVal} recovery`;
    }

    // Fallback for interval
    if (lang === "zh") {
      if (paceStr && distStr) return `${distStr}間歇跑，配速約${paceStr}。`;
      if (distStr) return `${distStr}間歇跑。`;
    } else {
      if (paceStr && distStr) return `${distStr} interval at ${paceStr} pace`;
      if (distStr) return `${distStr} interval`;
    }
  }

  if (lang === "zh") {
    const typeZh = TYPE_LABELS[day.type]?.zh || day.type;
    if (paceStr && distStr) return `${distStr}${typeZh}，配速約${paceStr}。`;
    if (distStr) return `${distStr}${typeZh}。`;
    // Fallback: try to translate common English description patterns
    const desc = day.description || "";
    if (/warm.?up|cool.?down|recovery|easy|tempo|long run/i.test(desc)) {
      const typeLabel = TYPE_LABELS[day.type]?.zh || typeZh;
      return `${typeLabel}訓練`;
    }
    return desc;
  }

  // English fallback
  if (paceStr && distStr) return `${distStr} at ${paceStr} pace`;
  if (distStr) return `${distStr} run`;
  // Ensure English: if description contains Chinese characters, generate English fallback
  const desc = day.description || "";
  if (/[\u4e00-\u9fff]/.test(desc)) {
    const typeEn = TYPE_LABELS[day.type]?.en || day.type;
    return distStr ? `${distStr} ${typeEn.toLowerCase()}` : typeEn;
  }
  return desc;
}

function suggestPace(type: string, targetTime: string, distance: string): { pace: string; description: string; descZh: string } {
  // Parse target time to seconds
  const parts = targetTime.split(":").map(Number);
  let totalSec = 0;
  if (parts.length === 3) totalSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) totalSec = parts[0] * 60 + parts[1];

  const distKm = distance === "5K" ? 5 : distance === "10K" ? 10 : distance === "HM" ? 21.1 : 42.195;
  const racePaceSec = totalSec / distKm; // sec per km

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  switch (type) {
    case "Easy":
      return { pace: `${fmt(racePaceSec * 1.2)}/km`, description: "Comfortable conversational pace", descZh: "舒適對話配速" };
    case "Tempo":
      return { pace: `${fmt(racePaceSec * 1.05)}/km`, description: "Comfortably hard, sustained effort", descZh: "舒適偏快的持續配速" };
    case "Interval": {
      const intervalPace = fmt(racePaceSec * 0.9);
      return { pace: `${intervalPace}/km`, description: `Suggested: 5x1km @ ${intervalPace} with 90s recovery`, descZh: `建議：5x1公里 @ ${intervalPace}，恢復90秒` };
    }
    case "Long":
      return { pace: `${fmt(racePaceSec * 1.15)}/km`, description: "Steady long run pace", descZh: "穩定長跑配速" };
    case "Recovery":
      return { pace: `${fmt(racePaceSec * 1.3)}/km`, description: "Very easy, focus on recovery", descZh: "非常輕鬆，專注恢復" };
    default:
      return { pace: `${fmt(racePaceSec * 1.15)}/km`, description: "Moderate pace", descZh: "中等配速" };
  }
}

interface WeekPlan {
  week: number;
  startDate: string;
  days: DayPlan[];
}

interface Props {
  lang: Lang;
  onLoginRequest?: () => void;
}

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
  { id: "5K", label: "5K" },
  { id: "10K", label: "10K" },
  { id: "HM", label: "Half Marathon" },
  { id: "FM", label: "Full Marathon" },
];

const MIN_WEEKS: Record<Distance, number> = { "5K": 4, "10K": 4, HM: 6, FM: 8 };
const MIN_DAYS: Record<Distance, number> = { "5K": 2, "10K": 2, HM: 3, FM: 4 };

const ProgramsTab = ({ lang, onLoginRequest }: Props) => {
  const { isPremium } = usePremium();
  const { user } = useAuth();
  const { toast } = useToast();
  const { activities } = useActivities();
  const [predicting, setPredicting] = useState(false);
  const [predictionRationale, setPredictionRationale] = useState<string | null>(null);

  // Questionnaire state
  const [step, setStep] = useState<"goal" | "details" | "calendar">("goal");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [distance, setDistance] = useState<Distance | null>(null);
  const [targetTime, setTargetTime] = useState("");
  const [targetHours, setTargetHours] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("");
  const [targetSeconds, setTargetSeconds] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [weeklyKm, setWeeklyKm] = useState<number>(30);
  const [longRunDay, setLongRunDay] = useState<string>("Sun");
  const [restDays, setRestDays] = useState<string[]>(["Mon"]);

  // Calendar state
  const [plan, setPlan] = useState<WeekPlan[]>([]);
  const [currentWeekIdx, setCurrentWeekIdx] = useState(0);
  const [existingPlan, setExistingPlan] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Add workout state
  const [addingDayIdx, setAddingDayIdx] = useState<number | null>(null);
  const [addRunType, setAddRunType] = useState<string | null>(null);
  const [addDistance, setAddDistance] = useState("");

  // Edit workout state
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [editDistance, setEditDistance] = useState("");
  const [editPace, setEditPace] = useState("");

  // Load existing plan on mount
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("training_plans" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && (data as any[]).length > 0) {
        const p = (data as any[])[0];
        setExistingPlan(p);
        setPlan(p.plan_data || []);
        setStep("calendar");
        // Find current week
        const today = new Date().toISOString().split("T")[0];
        const idx = (p.plan_data || []).findIndex((w: WeekPlan) =>
          w.days.some((d: DayPlan) => d.date >= today)
        );
        setCurrentWeekIdx(Math.max(0, idx));
      }
    };
    load();
    const unsub = subscribePlanChanged(() => { void load(); });
    return () => { unsub(); };
  }, [user]);

  // Keep restDays valid: never include longRunDay, never exceed 7 - daysPerWeek
  useEffect(() => {
    const max = 7 - daysPerWeek;
    setRestDays((prev) => {
      const filtered = prev.filter((d) => d !== longRunDay);
      return filtered.slice(0, Math.max(0, max));
    });
  }, [daysPerWeek, longRunDay]);

  const weeksUntilRace = useMemo(() => {
    if (!raceDate) return 0;
    const diff = new Date(raceDate).getTime() - new Date().getTime();
    return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
  }, [raceDate]);

  const minWeeks = distance ? MIN_WEEKS[distance] : 4;
  const dateValid = weeksUntilRace >= minWeeks;

  const handleGoalSelect = (g: Goal) => {
    setGoal(g);
    if (g === "race" || g === "distance" || g === "parkrun") {
      setStep("details");
    } else {
      // For simpler goals, set defaults and go to details
      setDistance("5K");
      setStep("details");
    }
  };

  const handlePredictTarget = async () => {
    if (!distance || predicting) return;
    setPredicting(true);
    setPredictionRationale(null);
    try {
      const { data, error } = await supabase.functions.invoke("predict-race-time", {
        body: {
          distance,
          raceDate: raceDate || null,
          lang,
          activities: (activities || []).slice(0, 30).map((a: any) => ({
            start_date: a.start_date,
            sport_type: a.sport_type,
            distance: a.distance,
            moving_time: a.moving_time,
            elapsed_time: a.elapsed_time,
            average_heartrate: a.average_heartrate,
            total_elevation_gain: a.total_elevation_gain,
          })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error === "no_recent_runs") {
        toast({
          title: lang === "zh" ? "沒有最近的跑步紀錄" : "No recent runs found",
          description: lang === "zh" ? "同步跑步活動後再試。" : "Sync some running activities and try again.",
          variant: "destructive",
        });
        return;
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      const h = String((data as any).hours ?? 0);
      const m = String((data as any).minutes ?? 0).padStart(2, "0");
      const s = String((data as any).seconds ?? 0).padStart(2, "0");
      setTargetHours(h);
      setTargetMinutes(m);
      setTargetSeconds(s);
      setTargetTime(distance === "HM" || distance === "FM" ? `${h}:${m}:${s}` : `${m}:${s}`);
      setPredictionRationale((data as any).rationale || null);
    } catch (e: any) {
      toast({
        title: lang === "zh" ? "預測失敗" : "Prediction failed",
        description: e?.message || (lang === "zh" ? "請稍後再試" : "Please try again later"),
        variant: "destructive",
      });
    } finally {
      setPredicting(false);
    }
  };


  const handleGenerate = async () => {
    if (!distance || !targetTime || !raceDate || !dateValid) return;
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
        body: JSON.stringify({
          goal: goal,
          distance,
          targetTime,
          raceDate,
          weeks: weeksUntilRace,
          daysPerWeek,
          weeklyKm,
          longRunDay,
          restDays,
          lang,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate");
      }

      const result = await response.json();
      const planData = result.plan || [];
      setPlan(planData);
      setCurrentWeekIdx(0);
      setStep("calendar");

      // Save to DB
      if (user) {
        // Delete old plan
        if (existingPlan) {
          await supabase.from("training_plans" as any).delete().eq("id", existingPlan.id);
        }
        const { data: inserted } = await (supabase.from("training_plans" as any) as any).insert({
          user_id: user.id,
          goal: goal || "race",
          distance,
          target_time: targetTime,
          race_date: raceDate,
          weeks: weeksUntilRace,
          plan_data: planData,
          raw_output: result.raw || "",
        }).select().single();
        if (inserted) setExistingPlan(inserted);
        notifyPlanChanged();
      }
    } catch (err: any) {
      console.error("Error generating program:", err);
      toast({
        title: lang === "zh" ? "錯誤" : "Error",
        description: err.message || (lang === "zh" ? "生成訓練計劃時出錯" : "Failed to generate program"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNewPlan = () => {
    setStep("goal");
    setGoal(null);
    setDistance(null);
    setTargetTime("");
    setTargetHours("");
    setTargetMinutes("");
    setTargetSeconds("");
    setRaceDate("");
    setPlan([]);
    setExistingPlan(null);
  };

  // Premium gate
  if (!isPremium) {
    return (
      <div className="px-5 pt-6 pb-8 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh]">
        <Lock size={48} className="text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">
          {lang === "zh" ? "高級功能" : "Premium Feature"}
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {lang === "zh" ? "升級至高級版以使用 AI 訓練計劃生成器" : "Upgrade to Premium to access AI Training Plan Generator"}
        </p>
        {!user ? (
          <Button onClick={onLoginRequest}>
            {lang === "zh" ? "登入 / 註冊" : "Sign In / Sign Up"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "前往「更多」分頁升級" : "Go to the More tab to upgrade"}
          </p>
        )}
      </div>
    );
  }

  // Step 1: Goal selection
  if (step === "goal") {
    return (
      <div className="px-5 pt-6 pb-8 max-w-lg mx-auto">
        <h1 className="font-display text-2xl font-bold text-foreground mb-1">
          {lang === "zh" ? "你的目標是什麼？" : "What is your goal?"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {lang === "zh" ? "選擇一個最適合你的目標" : "Pick a goal that you think suits you best"}
        </p>

        <div className="space-y-2">
          {GOALS.map((g) => (
            <button
              key={g.id}
              onClick={() => handleGoalSelect(g.id)}
              className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-3 text-left hover:border-primary transition-colors"
            >
              <span className="text-xl">{g.emoji}</span>
              <div>
                <span className="font-medium text-foreground block">
                  {lang === "zh" ? g.zh : g.en}
                </span>
                {(g.desc_en || g.desc_zh) && (
                  <span className="text-xs text-muted-foreground">
                    {lang === "zh" ? g.desc_zh : g.desc_en}
                  </span>
                )}
              </div>
              <ChevronRight size={16} className="text-muted-foreground ml-auto" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: Details (distance, target, date)
  if (step === "details") {
    return (
      <div className="px-5 pt-6 pb-8 max-w-lg mx-auto">
        <button onClick={() => setStep("goal")} className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
          <ChevronLeft size={16} />
          {lang === "zh" ? "返回" : "Back"}
        </button>

        <h1 className="font-display text-2xl font-bold text-foreground mb-6">
          {lang === "zh" ? "訓練詳情" : "Training Details"}
        </h1>

        {/* Distance */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
            <Target size={14} />
            {lang === "zh" ? "比賽距離" : "Race Distance"}
          </label>
          <div className="flex flex-wrap gap-2">
            {DISTANCES.map((d) => (
              <button
                key={d.id}
                onClick={() => { setDistance(d.id); setTargetTime(""); const md = MIN_DAYS[d.id]; if (daysPerWeek < md) setDaysPerWeek(md); }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                  distance === d.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-accent"
                }`}
              >
                {d.id === "HM" ? (lang === "zh" ? "半馬" : "HM") : d.id === "FM" ? (lang === "zh" ? "全馬" : "FM") : d.id}
              </button>
            ))}
          </div>
        </div>

        {/* Target Time */}
        {distance && (
          <div className="mb-5">
            <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
              <Trophy size={14} />
              {lang === "zh" ? "目標完成時間" : "Target Finish Time"}
            </label>
            <div className="flex items-center gap-2">
              {(distance === "HM" || distance === "FM") && (
                <>
                  <Input
                    type="number"
                    min="0"
                    max="9"
                    placeholder={lang === "zh" ? "時" : "H"}
                    value={targetHours}
                    onChange={(e) => {
                      setTargetHours(e.target.value);
                      const h = e.target.value || "0";
                      setTargetTime(`${h}:${targetMinutes || "00"}:${targetSeconds || "00"}`);
                    }}
                    className="w-16 text-center"
                  />
                  <span className="text-muted-foreground">:</span>
                </>
              )}
              <Input
                type="number"
                min="0"
                max="59"
                placeholder={lang === "zh" ? "分" : "M"}
                value={targetMinutes}
                onChange={(e) => {
                  setTargetMinutes(e.target.value);
                  const h = targetHours || "0";
                  const m = e.target.value || "00";
                  setTargetTime(distance === "HM" || distance === "FM" ? `${h}:${m}:${targetSeconds || "00"}` : `${m}:${targetSeconds || "00"}`);
                }}
                className="w-16 text-center"
              />
              <span className="text-muted-foreground">:</span>
              <Input
                type="number"
                min="0"
                max="59"
                placeholder={lang === "zh" ? "秒" : "S"}
                value={targetSeconds}
                onChange={(e) => {
                  setTargetSeconds(e.target.value);
                  const h = targetHours || "0";
                  const m = targetMinutes || "00";
                  setTargetTime(distance === "HM" || distance === "FM" ? `${h}:${m}:${e.target.value || "00"}` : `${m}:${e.target.value || "00"}`);
                }}
                className="w-16 text-center"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "zh" ? "輸入你的目標完成時間" : "Enter your target finish time"}
            </p>
          </div>
        )}

        {/* Days per week */}
        {distance && (
          <div className="mb-5">
            <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
              <Repeat size={14} />
              {lang === "zh" ? "每週跑步天數" : "Running Days per Week"}
            </label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6, 7].map((d) => {
                const minD = MIN_DAYS[distance!];
                const disabled = d < minD;
                return (
                  <button
                    key={d}
                    onClick={() => !disabled && setDaysPerWeek(d)}
                    disabled={disabled}
                    className={`w-10 h-10 rounded-full text-sm font-medium transition-colors border ${
                      daysPerWeek === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : disabled
                        ? "bg-muted text-muted-foreground border-border opacity-40 cursor-not-allowed"
                        : "bg-card text-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "zh"
                ? `${distance === "FM" ? "全馬最少4天" : distance === "HM" ? "半馬最少3天" : "最少2天"}`
                : `Min. ${MIN_DAYS[distance!]} days for ${distance === "FM" ? "Full Marathon" : distance === "HM" ? "Half Marathon" : distance}`}
            </p>
          </div>
        )}

        {/* Long Run Day */}
        {distance && (
          <div className="mb-5">
            <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
              <Route size={14} />
              {lang === "zh" ? "長跑日" : "Long Run Day"}
            </label>
            <div className="flex flex-wrap gap-2">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => {
                const labelZh: Record<string,string> = {Mon:"一",Tue:"二",Wed:"三",Thu:"四",Fri:"五",Sat:"六",Sun:"日"};
                const isRest = restDays.includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => { setLongRunDay(d); setRestDays(restDays.filter(r => r !== d)); }}
                    className={`w-12 h-10 rounded-full text-sm font-medium transition-colors border ${
                      longRunDay === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : isRest
                        ? "bg-muted text-muted-foreground border-border opacity-40"
                        : "bg-card text-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {lang === "zh" ? labelZh[d] : d}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "zh" ? "選擇你想做長跑的日子" : "Pick the day you'd like to do your long run"}
            </p>
          </div>
        )}

        {/* Rest Days */}
        {distance && (
          <div className="mb-5">
            <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
              <Calendar size={14} />
              {lang === "zh" ? "休息日" : "Rest Day(s)"}
              <span className="text-xs font-normal text-muted-foreground">
                ({restDays.length}/{7 - daysPerWeek})
              </span>
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
                  <button
                    key={d}
                    onClick={() => {
                      if (disabled) return;
                      setRestDays(selected ? restDays.filter(r => r !== d) : [...restDays, d]);
                    }}
                    disabled={disabled}
                    className={`w-12 h-10 rounded-full text-sm font-medium transition-colors border ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : disabled
                        ? "bg-muted text-muted-foreground border-border opacity-40 cursor-not-allowed"
                        : "bg-card text-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {lang === "zh" ? labelZh[d] : d}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "zh"
                ? `根據每週 ${daysPerWeek} 天訓練，請選擇 ${7 - daysPerWeek} 個休息日`
                : `Pick ${7 - daysPerWeek} rest day${7 - daysPerWeek === 1 ? "" : "s"} based on ${daysPerWeek} training days/week`}
            </p>
          </div>
        )}

        {/* Weekly km preference */}
        {distance && (
          <div className="mb-5">
            <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
              <Route size={14} />
              {lang === "zh" ? "每週目標公里數" : "Preferred Weekly Km"}
            </label>
            <Input
              type="number"
              min="10"
              max="200"
              value={weeklyKm}
              onChange={(e) => setWeeklyKm(Math.max(10, Number(e.target.value) || 10))}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "zh" ? "你每週大概想跑多少公里？" : "How many km would you prefer to run per week?"}
            </p>
          </div>
        )}

        {/* Race Date */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
            <Calendar size={14} />
            {lang === "zh" ? "比賽日期" : "Race Date"}
          </label>
          <Input
            type="date"
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            min={new Date(Date.now() + minWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
            className="w-full"
          />
          {raceDate && !dateValid && (
            <p className="text-xs text-destructive mt-1">
              {lang === "zh"
                ? `距離比賽至少需要 ${minWeeks} 週`
                : `At least ${minWeeks} weeks needed for this distance`}
            </p>
          )}
          {raceDate && dateValid && (
            <p className="text-xs text-muted-foreground mt-1">
              {weeksUntilRace} {lang === "zh" ? "週訓練計劃" : "weeks training plan"}
            </p>
          )}
        </div>

        {/* Generate */}
        <Button
          onClick={handleGenerate}
          disabled={!distance || !targetTime || !raceDate || !dateValid || loading || restDays.length !== 7 - daysPerWeek}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2" size={18} />
              {lang === "zh" ? "生成中，請耐心等候，最多需要一分鐘" : "Generating. Please be patient, it can take up to a minute"}
            </>
          ) : (
            <>
              {lang === "zh" ? "生成訓練計劃" : "Generate Training Plan"}
            </>
          )}
        </Button>
      </div>
    );
  }

  // Step 3: Calendar view
  const currentWeek = plan[currentWeekIdx];
  if (!currentWeek) {
    return (
      <div className="px-5 pt-6 pb-8 max-w-lg mx-auto text-center">
        <p className="text-muted-foreground">{lang === "zh" ? "沒有訓練計劃" : "No training plan"}</p>
        <Button onClick={handleNewPlan} className="mt-4">
          {lang === "zh" ? "建立新計劃" : "Create New Plan"}
        </Button>
      </div>
    );
  }

  const totalKm = currentWeek.days.reduce((sum, d) => sum + (d.distance_km || 0), 0);
  const weekStart = currentWeek.days[0]?.date || "";
  const weekEnd = currentWeek.days[currentWeek.days.length - 1]?.date || "";

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getDate()} ${d.toLocaleString(lang === "zh" ? "zh-HK" : "en", { month: "short" })}`;
  };

  const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  return (
    <div className="px-5 pt-6 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="w-8" />
        <h1 className="font-display text-lg font-bold text-foreground">
          {lang === "zh" ? "訓練日曆" : "Training Calendar"}
        </h1>
        <div className="w-8" />
      </div>

      {/* Week navigation */}
      <div className="bg-card border border-border rounded-xl p-3 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div>
            <span className="text-sm font-medium text-foreground">
              {formatDate(weekStart)} - {formatDate(weekEnd)}
            </span>
            <span className="ml-2 bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
              WEEK {currentWeek.week}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentWeekIdx(Math.max(0, currentWeekIdx - 1))}
              disabled={currentWeekIdx === 0}
              className="p-1 rounded hover:bg-accent disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentWeekIdx(Math.min(plan.length - 1, currentWeekIdx + 1))}
              disabled={currentWeekIdx === plan.length - 1}
              className="p-1 rounded hover:bg-accent disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Total: {totalKm.toFixed(1)} km
        </p>
      </div>

      {/* Day list */}
      <div className="space-y-1">
        {currentWeek.days.map((day, i) => {
          const dateObj = day.date ? new Date(day.date + "T00:00:00") : null;
          const dayNum = dateObj ? dateObj.getDate() : "";
          const isToday = day.date === new Date().toISOString().split("T")[0];

          return (
            <div key={i} className="flex items-stretch gap-2">
              {/* Day label + date */}
              <div className="w-10 flex-shrink-0 flex flex-col items-center pt-3">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  {DAY_LABELS[i] || day.day?.substring(0, 3).toUpperCase()}
                </span>
                <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                  {dayNum}
                </span>
              </div>

              {/* Workout card */}
              {day.type === "Rest" ? (
                <div className="flex-1 border-l-2 border-border pl-3 py-3 min-h-[48px] flex items-center">
                  <button
                    onClick={() => { setAddingDayIdx(i); setAddRunType(null); setAddDistance(""); }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus size={12} />
                    {lang === "zh" ? "新增" : "Add"}
                  </button>
                </div>
              ) : (
                <div
                  className="flex-1 border-l-2 pl-3 py-2 cursor-pointer"
                  style={{ borderColor: day.color || "hsl(var(--border))" }}
                  onClick={() => {
                    setEditingDayIdx(i);
                    setEditDistance(day.distance_km?.toString() || "");
                    setEditPace(day.pace || "");
                  }}
                >
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

      {/* Week dots */}
      <div className="flex items-center justify-center gap-1 mt-6">
        {plan.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentWeekIdx(i)}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentWeekIdx ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>

      {/* Cancel Plan */}
      <Button
        variant="outline"
        className="w-full mt-6 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={() => setShowCancelConfirm(true)}
      >
        {lang === "zh" ? "取消計劃" : "Cancel Plan"}
      </Button>

      {/* Cancel confirmation dialog */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{lang === "zh" ? "取消訓練計劃？" : "Cancel Training Plan?"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {lang === "zh"
              ? "確定要取消此訓練計劃嗎？此操作無法撤銷。"
              : "Are you sure you want to cancel this training plan? This action cannot be undone."}
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCancelConfirm(false)}>
              {lang === "zh" ? "返回" : "Keep Plan"}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={() => { setShowCancelConfirm(false); handleNewPlan(); }}>
              {lang === "zh" ? "確認取消" : "Yes, Cancel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add workout dialog */}
      <Dialog open={addingDayIdx !== null} onOpenChange={(open) => { if (!open) setAddingDayIdx(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{lang === "zh" ? "新增訓練" : "Add Workout"}</DialogTitle>
          </DialogHeader>

          {!addRunType ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{lang === "zh" ? "選擇跑步類型" : "Select run type"}</p>
              {RUN_TYPES.map((rt) => (
                <button
                  key={rt.id}
                  onClick={() => setAddRunType(rt.id)}
                  className="w-full bg-card border border-border rounded-lg p-3 flex items-center gap-3 text-left hover:border-primary transition-colors"
                >
                  <span>{rt.emoji}</span>
                  <span className="font-medium text-sm text-foreground">{lang === "zh" ? rt.zh : rt.en}</span>
                  <ChevronRight size={14} className="text-muted-foreground ml-auto" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <button onClick={() => setAddRunType(null)} className="flex items-center gap-1 text-sm text-muted-foreground">
                <ChevronLeft size={14} />
                {lang === "zh" ? "返回" : "Back"}
              </button>

              <div className="flex items-center gap-2">
                <span>{RUN_TYPES.find(r => r.id === addRunType)?.emoji}</span>
                <span className="font-medium text-foreground">{lang === "zh" ? RUN_TYPES.find(r => r.id === addRunType)?.zh : RUN_TYPES.find(r => r.id === addRunType)?.en}</span>
              </div>

              {/* Suggested pace */}
              {existingPlan && (
                <div className="bg-accent/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-foreground mb-1">{lang === "zh" ? "建議配速" : "Suggested Pace"}</p>
                  <p className="text-sm font-bold text-primary">
                    {suggestPace(addRunType, existingPlan.target_time, existingPlan.distance).pace}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lang === "zh"
                      ? suggestPace(addRunType, existingPlan.target_time, existingPlan.distance).descZh
                      : suggestPace(addRunType, existingPlan.target_time, existingPlan.distance).description}
                  </p>
                </div>
              )}

              {/* Distance */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  {lang === "zh" ? "距離 (公里)" : "Distance (km)"}
                </label>
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  placeholder="e.g. 8"
                  value={addDistance}
                  onChange={(e) => setAddDistance(e.target.value)}
                  className="w-full"
                />
              </div>

              <Button
                className="w-full"
                disabled={!addDistance || Number(addDistance) <= 0}
                onClick={() => {
                  if (addingDayIdx === null || !addRunType || !addDistance) return;
                  const rt = RUN_TYPES.find(r => r.id === addRunType)!;
                  const paceInfo = existingPlan
                    ? suggestPace(addRunType, existingPlan.target_time, existingPlan.distance)
                    : { pace: "", description: "Custom workout", descZh: "自訂訓練" };

                  const updatedPlan = [...plan];
                  const week = { ...updatedPlan[currentWeekIdx] };
                  const days = [...week.days];
                  days[addingDayIdx] = {
                    ...days[addingDayIdx],
                    type: addRunType,
                    title: lang === "zh" ? rt.zh : rt.en,
                    description: lang === "zh" ? paceInfo.descZh : paceInfo.description,
                    distance_km: Number(addDistance),
                    pace: paceInfo.pace,
                    color: rt.color,
                  };
                  week.days = days;
                  updatedPlan[currentWeekIdx] = week;
                  setPlan(updatedPlan);

                  // Save to DB
                  if (user && existingPlan) {
                    supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", existingPlan.id).then(() => { notifyPlanChanged(); });
                  }

                  setAddingDayIdx(null);
                  toast({
                    title: lang === "zh" ? "已新增訓練" : "Workout Added",
                    description: `${lang === "zh" ? rt.zh : rt.en} - ${addDistance} km`,
                  });
                }}
              >
                {lang === "zh" ? "新增訓練" : "Add Workout"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Edit workout dialog (validated) */}
      {editingDayIdx !== null && currentWeek?.days[editingDayIdx] && (
        <EditWorkoutDialog
          open={editingDayIdx !== null}
          onOpenChange={(o) => { if (!o) setEditingDayIdx(null); }}
          lang={lang}
          workout={{
            type: currentWeek.days[editingDayIdx].type,
            title: localizeTitle(currentWeek.days[editingDayIdx].type, lang),
            distance_km: currentWeek.days[editingDayIdx].distance_km ?? null,
            pace: currentWeek.days[editingDayIdx].pace ?? "",
            description: currentWeek.days[editingDayIdx].description ?? "",
            color: currentWeek.days[editingDayIdx].color,
          }}
          planContext={existingPlan ? `Program: ${existingPlan.goal} ${existingPlan.distance ?? ""} target ${existingPlan.target_time ?? ""}, week ${currentWeekIdx + 1}` : null}
          onSave={async (next) => {
            if (editingDayIdx === null) return;
            const updatedPlan = [...plan];
            const week = { ...updatedPlan[currentWeekIdx] };
            const days = [...week.days];
            days[editingDayIdx] = {
              ...days[editingDayIdx],
              type: next.type ?? days[editingDayIdx].type,
              title: next.title ?? days[editingDayIdx].title,
              color: next.color ?? days[editingDayIdx].color,
              distance_km: next.distance_km ?? days[editingDayIdx].distance_km,
              pace: next.pace || days[editingDayIdx].pace,
              description: next.description ?? days[editingDayIdx].description,
            };
            week.days = days;
            updatedPlan[currentWeekIdx] = week;
            setPlan(updatedPlan);
            if (user && existingPlan) {
              await supabase.from("training_plans" as any).update({ plan_data: updatedPlan } as any).eq("id", existingPlan.id);
            }
            notifyPlanChanged();
            toast({ title: lang === "zh" ? "已更新訓練" : "Workout Updated" });
          }}
        />
      )}
    </div>
  );
};

export default ProgramsTab;
