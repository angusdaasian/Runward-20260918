import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Footprints, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EditWorkoutDialog, { EditableWorkout } from "@/components/training/EditWorkoutDialog";
import { notifyPlanChanged, subscribePlanChanged } from "@/lib/planEvents";
import { useSimpleMode } from "@/hooks/use-simple-mode";

interface Props {
  lang: Lang;
  /** Most-recent activity id (any source) — used to look up its analysis. */
  latestActivityId: string | null;
  /** Most-recent activity's start_date — used to compute expiry. */
  latestActivityDate: string | null;
}

interface CachedGenerated {
  suggestion: string;          // legacy fallback (single-language)
  suggestion_en?: string;
  suggestion_zh?: string;
  generatedAt: string; // ISO
  /** ISO date of the latest activity at the time of generation, or null if none. */
  basisActivityDate: string | null;
  workoutType?: string;
  simple?: boolean;
  cacheVersion?: number;
}

type WorkoutType =
  | "auto"
  | "recovery"
  | "easy"
  | "long"
  | "tempo"
  | "intervals"
  | "progressive"
  | "fartlek"
  | "hill"
  | "race_pace";

const WORKOUT_TYPE_LABELS: Record<WorkoutType, { en: string; zh: string }> = {
  auto: { en: "Coach's pick (recommended)", zh: "教練建議（推薦）" },
  recovery: { en: "Recovery run", zh: "恢復跑" },
  easy: { en: "Easy aerobic", zh: "輕鬆有氧" },
  long: { en: "Long run", zh: "長距離跑" },
  tempo: { en: "Tempo run", zh: "節奏跑" },
  intervals: { en: "Intervals", zh: "間歇" },
  progressive: { en: "Progressive run", zh: "漸進跑" },
  fartlek: { en: "Fartlek", zh: "法特萊克" },
  hill: { en: "Hill repeats", zh: "上坡重複" },
  race_pace: { en: "Race-pace workout", zh: "比賽配速訓練" },
};

const GENERATED_SUGGESTION_CACHE_VERSION = 3;

function readCachedGenerated(userId: string): CachedGenerated | null {
  try {
    const key = `generated_suggestion_${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGenerated;
    if (parsed.cacheVersion !== GENERATED_SUGGESTION_CACHE_VERSION) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedGenerated(userId: string, val: CachedGenerated) {
  try {
    localStorage.setItem(`generated_suggestion_${userId}`, JSON.stringify({
      ...val,
      cacheVersion: GENERATED_SUGGESTION_CACHE_VERSION,
    }));
  } catch {
    // ignore
  }
}

function readIdealTime(): { distance?: string; seconds?: number } | null {
  try {
    const raw = localStorage.getItem("onboarding_ideal_time");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Strip a leading H1/H2 heading (e.g. "## 明日建議訓練" / "## Suggested Next Workout")
// from the AI markdown — the card already has its own header so showing the
// heading again is redundant (and contradicts when the card title is "Today's").
function stripLeadingHeading(md: string): string {
  return md.replace(/^\s*#{1,3}\s+.*\n+/, "");
}

const SuggestedNextWorkout = ({ lang, latestActivityId, latestActivityDate }: Props) => {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const isZh = lang === "zh";
  const [simple] = useSimpleMode();

  const [analysisWorkout, setAnalysisWorkout] = useState<string | null>(null);
  const [analysisLoaded, setAnalysisLoaded] = useState(false);

  const [generated, setGenerated] = useState<CachedGenerated | null>(null);
  const [generating, setGenerating] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [workoutType, setWorkoutType] = useState<WorkoutType>("auto");

  // Active plan + today's planned workout
  const [planRow, setPlanRow] = useState<any | null>(null);
  const [todayPlanned, setTodayPlanned] = useState<any | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Load cached generated suggestion
  useEffect(() => {
    if (!user) return;
    const cached = readCachedGenerated(user.id);
    setGenerated(cached);
  }, [user]);

  // Load active plan and find today's planned workout
  const loadPlan = async () => {
    if (!user) { setPlanLoaded(true); return; }
    const { data } = await supabase
      .from("training_plans" as any)
      .select("id, goal, distance, target_time, plan_data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row: any = data;
    setPlanRow(row || null);
    if (row?.plan_data && Array.isArray(row.plan_data)) {
      const d = new Date();
      const todayISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let found: any = null;
      let weekIdx = -1, dayIdx = -1;
      for (let wi = 0; wi < row.plan_data.length; wi++) {
        const wk = row.plan_data[wi];
        for (let di = 0; di < (wk?.days?.length || 0); di++) {
          if (wk.days[di]?.date === todayISO) { found = wk.days[di]; weekIdx = wi; dayIdx = di; break; }
        }
        if (found) break;
      }
      setTodayPlanned(found ? { ...found, _weekIdx: weekIdx, _dayIdx: dayIdx } : null);
    } else {
      setTodayPlanned(null);
    }
    setPlanLoaded(true);
  };

  useEffect(() => {
    setPlanLoaded(false);
    void loadPlan();
    const unsub = subscribePlanChanged(() => { void loadPlan(); });
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch the analysis-derived next-workout for the latest activity
  const fetchAnalysis = async () => {
    if (!user || !latestActivityId) {
      setAnalysisWorkout(null);
      setAnalysisLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from("activity_analyses")
      .select("next_workout_en, next_workout_zh")
      .eq("user_id", user.id)
      .eq("activity_id", latestActivityId)
      .maybeSingle();
    if (error) {
      console.error("[SuggestedNextWorkout] fetch error:", error);
      setAnalysisWorkout(null);
      setAnalysisLoaded(true);
      return;
    }
    const row = data as any;
    const primary = isZh ? row?.next_workout_zh : row?.next_workout_en;
    const fallback = isZh ? row?.next_workout_en : row?.next_workout_zh;
    setAnalysisWorkout(primary || fallback || null);
    setAnalysisLoaded(true);
  };

  useEffect(() => {
    let active = true;
    setAnalysisLoaded(false);
    (async () => {
      await fetchAnalysis();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, latestActivityId, isZh]);

  // Realtime: re-fetch when an analysis is inserted/updated for this activity
  useEffect(() => {
    if (!user || !latestActivityId) return;
    const channel = supabase
      .channel(`activity-analyses-${latestActivityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_analyses",
          filter: `activity_id=eq.${latestActivityId}`,
        },
        () => {
          void fetchAnalysis();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, latestActivityId, isZh]);

  // Reset the "no thanks" decline whenever the underlying activity changes
  useEffect(() => {
    setDeclined(false);
  }, [latestActivityId]);

  // Decide what to show.
  //   - If there's a fresh AI analysis for "the day after the latest activity" → show it.
  //   - Otherwise → always show the "pick a workout" prompt so the user can ask
  //     the coach for a custom run today (works even with no activities at all).
  const view = useMemo<
    | { kind: "loading" }
    | { kind: "analysis"; text: string }
    | { kind: "generated"; text: string }
    | { kind: "prompt" }
    | { kind: "hidden" }
  >(() => {
    if (!user) return { kind: "hidden" };
    if (!analysisLoaded) return { kind: "loading" };

    // Compute whether "today" (local) is the day immediately after the latest activity day.
    const isDayAfterLatest = (() => {
      if (!latestActivityDate) return false;
      const act = new Date(latestActivityDate);
      const actDay = new Date(act.getFullYear(), act.getMonth(), act.getDate());
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.round((today.getTime() - actDay.getTime()) / (24 * 60 * 60 * 1000));
      return diffDays === 1;
    })();

    // Prefer the AI analysis-derived suggestion when it's still fresh.
    if (isDayAfterLatest && analysisWorkout) {
      return { kind: "analysis", text: analysisWorkout };
    }

    // Show a cached generated suggestion if it matches the current "basis"
    // (latest activity date, including null=no activities).
    if (generated) {
      const sameBasis =
        (generated.basisActivityDate ?? null) === (latestActivityDate ?? null) ||
        (latestActivityDate &&
          generated.basisActivityDate &&
          Math.abs(new Date(latestActivityDate).getTime() - new Date(generated.basisActivityDate).getTime()) < 1000);
      const sameSimple = (!!generated.simple) === simple;
      if (sameBasis && sameSimple) {
        const text = (isZh ? generated.suggestion_zh : generated.suggestion_en) || generated.suggestion;
        return { kind: "generated", text };
      }
    }

    // Otherwise, always offer to generate a custom workout (even if no activities at all).
    return { kind: "prompt" };
  }, [user, analysisLoaded, analysisWorkout, latestActivityDate, generated, isZh, simple]);

  // Auto-translate cached suggestion when language changes if target lang is missing.
  useEffect(() => {
    if (!user || !generated || translating) return;
    const haveTarget = isZh ? !!generated.suggestion_zh : !!generated.suggestion_en;
    if (haveTarget) return;
    const source = (isZh ? generated.suggestion_en : generated.suggestion_zh) || generated.suggestion;
    if (!source) return;
    setTranslating(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("generate-suggested-workout", {
          body: { translate: true, existingSuggestion: source, targetLang: isZh ? "zh" : "en" },
        });
        if (error) throw error;
        const translated = (data as any)?.suggestion;
        if (!translated) return;
        const next: CachedGenerated = {
          ...generated,
          cacheVersion: GENERATED_SUGGESTION_CACHE_VERSION,
          suggestion_en: isZh ? generated.suggestion_en : translated,
          suggestion_zh: isZh ? translated : generated.suggestion_zh,
        };
        writeCachedGenerated(user.id, next);
        setGenerated(next);
      } catch (e) {
        console.error("[SuggestedNextWorkout] translate error:", e);
      } finally {
        setTranslating(false);
      }
    })();
  }, [user, isZh, generated, translating]);

  const handleGenerate = async () => {
    if (!user || generating) return;
    setGenerating(true);
    try {
      const idealTime = readIdealTime();
      const fmtLocal = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const todayDate = fmtLocal(new Date());
      const lastActivityDateStr = latestActivityDate ? fmtLocal(new Date(latestActivityDate)) : null;

      // Fetch today's weather (with hourly forecast) so the AI can advise the
      // best time to run. Uses the same city the WeatherWidget uses.
        let weather: any = null;
        try {
          const city = (localStorage.getItem("weather_city") || "Hong Kong").trim();
          const { data: weatherData, error: weatherError } = await supabase.functions.invoke("get-weather", {
            body: { city },
          });

          if (weatherError) {
            console.warn("[SuggestedNextWorkout] weather fetch failed:", weatherError);
          } else if (weatherData && !(weatherData as { error?: string }).error) {
            weather = weatherData;
          }
        } catch (e) {
          console.warn("[SuggestedNextWorkout] weather fetch failed:", e);
        }

      const { data, error } = await supabase.functions.invoke("generate-suggested-workout", {
        body: {
          lang,
          idealTime,
          todayDate,
          lastActivityDate: lastActivityDateStr,
          workoutType,
          workoutTypeLabel: WORKOUT_TYPE_LABELS[workoutType].en,
          weather,
          simple,
        },
      });
      if (error) throw error;
      const suggestion = (data as any)?.suggestion;
      const suggestion_en = (data as any)?.suggestion_en;
      const suggestion_zh = (data as any)?.suggestion_zh;
      if (!suggestion) throw new Error("Empty response");
      const cached: CachedGenerated = {
        suggestion,
        suggestion_en: suggestion_en || (isZh ? undefined : suggestion),
        suggestion_zh: suggestion_zh || (isZh ? suggestion : undefined),
        generatedAt: new Date().toISOString(),
        basisActivityDate: latestActivityDate,
        workoutType,
        simple,
        cacheVersion: GENERATED_SUGGESTION_CACHE_VERSION,
      };
      writeCachedGenerated(user.id, cached);
      setGenerated(cached);
      toast.success(isZh ? "已產生建議訓練" : "Suggested workout ready");
    } catch (e: any) {
      console.error("[SuggestedNextWorkout] generate error:", e);
      toast.error(isZh ? "產生失敗，請稍後再試" : "Could not generate. Try again later.");
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = () => {
    setGenerated(null);
    setDeclined(false);
  };

  if (view.kind === "hidden") return null;

  // Plan-aware overrides — only after the plan has loaded.
  const hasActivePlan = !!planRow;
  const isFreePlan = (planRow?.goal ?? "") === "free";
  const planTitle = todayPlanned
    ? (todayPlanned.title || todayPlanned.type || (isZh ? "今日訓練" : "Today's Workout"))
    : null;

  const persistTodayPlannedEdit = async (next: EditableWorkout) => {
    if (!planRow || !todayPlanned) return;
    try {
      const updated = JSON.parse(JSON.stringify(planRow.plan_data));
      const day = updated[todayPlanned._weekIdx]?.days?.[todayPlanned._dayIdx];
      if (!day) throw new Error("day not found");
      const newDistance = next.distance_km ?? day.distance_km;
      const nextType = next.type ?? day.type;
      const isTrail = nextType === "Trail Run" || nextType === "Trail Race";
      day.distance_km = newDistance;
      day.pace = isTrail ? null : (next.pace ?? day.pace);
      day.description = next.description ?? day.description;
      day.elevation_m = isTrail ? (next.elevation_m ?? day.elevation_m ?? null) : null;
      day.eph = isTrail ? (next.eph ?? day.eph ?? null) : null;
      if (next.type) day.type = next.type;
      if (next.title) day.title = next.title;
      if (next.color) day.color = next.color;
      // If the user converts a Rest day into an actual run, promote the type
      // so the program calendar (TrainingTab) renders it as a workout card,
      // not the "+ Add" placeholder.
      if (day.type === "Rest" && typeof newDistance === "number" && newDistance > 0) {
        day.type = "Easy";
        day.title = isZh ? "輕鬆跑" : "Easy Run";
        day.color = day.color || "#22c55e";
      }
      const { error } = await supabase
        .from("training_plans" as any)
        .update({ plan_data: updated } as any)
        .eq("id", planRow.id);
      if (error) throw error;
      notifyPlanChanged();
      await loadPlan();
      toast.success(isZh ? "已更新今日訓練" : "Today's workout updated");
    } catch (e) {
      console.error("[SuggestedNextWorkout] update plan day error:", e);
      toast.error(isZh ? "更新失敗" : "Update failed");
      throw e;
    }
  };

  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Footprints size={16} className="text-primary" />
        <h3 className="font-display font-bold text-foreground text-sm">
          {isZh ? "今日建議" : "Today's Suggestion"}
        </h3>
      </div>

      {/* Plan-aware view: when user is on a plan, show today's planned workout. */}
      {planLoaded && hasActivePlan && todayPlanned && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {todayPlanned.color && (
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: todayPlanned.color }} />
            )}
            <span className="font-medium text-foreground text-sm">{planTitle}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {todayPlanned.distance_km != null && (
              <div className="rounded-md bg-background/60 border border-border px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {isZh ? "距離" : "Distance"}
                </div>
                <div className="font-semibold text-foreground">{todayPlanned.distance_km} km</div>
              </div>
            )}
            {(todayPlanned.type === "Trail Run" || todayPlanned.type === "Trail Race") && todayPlanned.elevation_m != null && (
              <div className="rounded-md bg-background/60 border border-border px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {isZh ? "爬升" : "Elevation"}
                </div>
                <div className="font-semibold text-foreground">{Math.round(todayPlanned.elevation_m)} m</div>
              </div>
            )}
            {(todayPlanned.type === "Trail Run" || todayPlanned.type === "Trail Race") && todayPlanned.eph != null && (
              <div className="rounded-md bg-background/60 border border-border px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">EpH</div>
                <div className="font-semibold text-foreground">{todayPlanned.eph}</div>
              </div>
            )}
            {todayPlanned.pace && todayPlanned.type !== "Trail Run" && todayPlanned.type !== "Trail Race" && (
              <div className="rounded-md bg-background/60 border border-border px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {isZh ? "配速" : "Pace"}
                </div>
                <div className="font-semibold text-foreground">{todayPlanned.pace}</div>
              </div>
            )}
          </div>
          {todayPlanned.description && (
            <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
              {todayPlanned.description}
            </p>
          )}
          {isFreePlan && !isPremium ? (
            <p className="text-xs text-muted-foreground italic">
              {isZh
                ? "你正在使用免費訓練計劃。請依計劃執行，或升級為高級會員以調整訓練。"
                : "You're on a free fixed plan — follow the plan, or upgrade to Premium to adjust workouts."}
            </p>
          ) : (
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 underline-offset-2 hover:underline"
            >
              <Pencil size={12} />
              {isZh ? "調整今日訓練" : "Adjust today's workout"}
            </button>
          )}

          <EditWorkoutDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            lang={lang}
            workout={{
              type: todayPlanned.type,
              title: todayPlanned.title,
              distance_km: todayPlanned.distance_km ?? null,
              pace: todayPlanned.pace ?? null,
              description: todayPlanned.description ?? null,
              color: todayPlanned.color ?? null,
              elevation_m: todayPlanned.elevation_m ?? null,
              eph: todayPlanned.eph ?? null,
            }}
            planContext={`Active plan goal=${planRow?.goal}, distance=${planRow?.distance}, target=${planRow?.target_time}. Today's planned workout: ${planTitle}.`}
            onSave={persistTodayPlannedEdit}
          />
        </div>
      )}

      {/* Plan-aware: on a plan but today is a rest/empty day — show small note and skip AI generation. */}
      {planLoaded && hasActivePlan && !todayPlanned && (
        <p className="text-sm text-foreground/85 leading-relaxed">
          {isZh
            ? "今天是計劃中的休息日，請好好恢復。"
            : "Today is a scheduled rest day in your plan — focus on recovery."}
        </p>
      )}

      {/* Original analysis / generated / prompt views — only when NOT on an active plan. */}
      {(!planLoaded || !hasActivePlan) && (
        <>
          {view.kind === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <Loader2 size={14} className="animate-spin" />
              {isZh ? "載入中…" : "Loading…"}
            </div>
          )}

          {view.kind === "analysis" && (
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground text-sm [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-primary">
              <ReactMarkdown>{stripLeadingHeading(view.text)}</ReactMarkdown>
            </div>
          )}

          {view.kind === "generated" && (
            <div className="space-y-3">
              {translating && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" />
                  {isZh ? "翻譯中…" : "Translating…"}
                </div>
              )}
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground text-sm [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-primary">
                <ReactMarkdown>{stripLeadingHeading(view.text)}</ReactMarkdown>
              </div>
              <button
                onClick={handleRegenerate}
                className="text-xs font-medium text-primary hover:text-primary/80 underline-offset-2 hover:underline"
              >
                {isZh ? "選擇其他訓練類型" : "Pick a different workout"}
              </button>
            </div>
          )}

          {view.kind === "prompt" && !declined && (
            <div className="space-y-3">
              <p className="text-sm text-foreground/90 leading-relaxed">
                {isZh
                  ? "想要今天跑步嗎？選擇一種訓練類型，AI 教練會根據你的訓練計劃（或最近 7 天的表現）給你最適合的距離與配速。"
                  : "Want to run today? Pick a workout type and the AI coach will suggest the best distance and pace based on your plan (or your last 7 days)."}
              </p>
              <Select value={workoutType} onValueChange={(v) => setWorkoutType(v as WorkoutType)} disabled={generating}>
                <SelectTrigger className="w-full bg-background border-border text-sm">
                  <SelectValue placeholder={isZh ? "選擇訓練類型" : "Select workout type"} />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(WORKOUT_TYPE_LABELS) as WorkoutType[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {isZh ? WORKOUT_TYPE_LABELS[key].zh : WORKOUT_TYPE_LABELS[key].en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {generating && <Loader2 size={14} className="animate-spin" />}
                  {generating
                    ? isZh ? "產生中…" : "Generating…"
                    : isZh ? "產生建議訓練" : "Generate workout"}
                </button>
                <button
                  onClick={() => setDeclined(true)}
                  disabled={generating}
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-background text-foreground text-sm font-medium px-4 py-2 hover:bg-accent transition-colors"
                >
                  {isZh ? "不要" : "No thanks"}
                </button>
              </div>
            </div>
          )}

          {view.kind === "prompt" && declined && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground italic">
                {isZh ? "好的，今天好好休息！" : "Got it — enjoy your rest day!"}
              </p>
              <button
                onClick={() => setDeclined(false)}
                className="text-xs font-medium text-primary hover:text-primary/80 underline-offset-2 hover:underline"
              >
                {isZh ? "改變主意？" : "Changed your mind?"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SuggestedNextWorkout;
