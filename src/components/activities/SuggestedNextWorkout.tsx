import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Footprints, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";

interface Props {
  lang: Lang;
  /** Most-recent activity id (any source) — used to look up its analysis. */
  latestActivityId: string | null;
  /** Most-recent activity's start_date — used to compute expiry. */
  latestActivityDate: string | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface CachedGenerated {
  suggestion: string;
  generatedAt: string; // ISO
  /** ISO date of the latest activity at the time of generation, or null if none. */
  basisActivityDate: string | null;
}

function readCachedGenerated(userId: string): CachedGenerated | null {
  try {
    const raw = localStorage.getItem(`generated_suggestion_${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCachedGenerated(userId: string, val: CachedGenerated) {
  try {
    localStorage.setItem(`generated_suggestion_${userId}`, JSON.stringify(val));
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
  const isZh = lang === "zh";

  const [analysisWorkout, setAnalysisWorkout] = useState<string | null>(null);
  const [analysisLoaded, setAnalysisLoaded] = useState(false);

  const [generated, setGenerated] = useState<CachedGenerated | null>(null);
  const [generating, setGenerating] = useState(false);
  const [declined, setDeclined] = useState(false);

  // Load cached generated suggestion
  useEffect(() => {
    if (!user) return;
    const cached = readCachedGenerated(user.id);
    setGenerated(cached);
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

  // Decide what to show:
  //   The suggestion is valid only on the calendar day AFTER the latest activity
  //   (in the user's local timezone). E.g. activity on 19/4 → show all of 20/4,
  //   hidden on 21/4 and beyond.
  const view = useMemo<
    | { kind: "loading" }
    | { kind: "analysis"; text: string }
    | { kind: "generated"; text: string }
    | { kind: "expired" }
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

    // Outside the valid window → hide entirely (no expired prompt either).
    if (!isDayAfterLatest) return { kind: "hidden" };

    // Within the valid window: prefer the AI analysis-derived suggestion.
    if (analysisWorkout) {
      return { kind: "analysis", text: analysisWorkout };
    }

    // Otherwise, show a cached generated suggestion if it matches the latest activity.
    if (generated) {
      const basis = generated.basisActivityDate ? new Date(generated.basisActivityDate).getTime() : null;
      const latestDateMs = new Date(latestActivityDate!).getTime();
      const stillCurrent = basis != null && Math.abs(latestDateMs - basis) < 1000;
      if (stillCurrent) {
        return { kind: "generated", text: generated.suggestion };
      }
    }

    // Within the window but nothing generated yet → offer to generate.
    return { kind: "expired" };
  }, [user, analysisLoaded, analysisWorkout, latestActivityDate, generated]);

  const handleGenerate = async () => {
    if (!user || generating) return;
    setGenerating(true);
    try {
      const idealTime = readIdealTime();
      const { data, error } = await supabase.functions.invoke("generate-suggested-workout", {
        body: { lang, idealTime },
      });
      if (error) throw error;
      const suggestion = (data as any)?.suggestion;
      if (!suggestion) throw new Error("Empty response");
      const cached: CachedGenerated = {
        suggestion,
        generatedAt: new Date().toISOString(),
        basisActivityDate: latestActivityDate,
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

  if (view.kind === "hidden") return null;

  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Footprints size={16} className="text-primary" />
        <h3 className="font-display font-bold text-foreground text-sm">
          {isZh ? "今日建議" : "Today's Suggestion"}
        </h3>
      </div>

      {view.kind === "loading" && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 size={14} className="animate-spin" />
          {isZh ? "載入中…" : "Loading…"}
        </div>
      )}

      {(view.kind === "analysis" || view.kind === "generated") && (
        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground text-sm [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-primary">
          <ReactMarkdown>{stripLeadingHeading(view.text)}</ReactMarkdown>
        </div>
      )}

      {view.kind === "expired" && !declined && (
        <div className="space-y-3">
          <p className="text-sm text-foreground/90 leading-relaxed">
            {isZh
              ? "請同步或上傳新的活動以取得下一次建議訓練。或者要我為你產生一個建議訓練嗎？"
              : "Please sync or upload a new activity to get the next suggested workout. Or do you want me to generate you a suggested workout?"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {generating && <Loader2 size={14} className="animate-spin" />}
              {isZh ? "好" : "Yes"}
            </button>
            <button
              onClick={() => setDeclined(true)}
              disabled={generating}
              className="flex-1 inline-flex items-center justify-center rounded-lg border border-border bg-background text-foreground text-sm font-medium px-4 py-2 hover:bg-accent transition-colors"
            >
              {isZh ? "不要" : "No"}
            </button>
          </div>
        </div>
      )}

      {view.kind === "expired" && declined && (
        <p className="text-sm text-muted-foreground italic">
          {isZh
            ? "好的。同步新活動後再回來看看吧！"
            : "Okay! Sync a new activity and check back."}
        </p>
      )}
    </div>
  );
};

export default SuggestedNextWorkout;
