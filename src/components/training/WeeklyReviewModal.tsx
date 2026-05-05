import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  planId: string | null;
  currentWeekIdx: number;
  onUpgrade?: () => void;
}

interface Review {
  id: string;
  week_index: number;
  week_start: string;
  week_end: string;
  completion_pct: number;
  distance_score: number;
  hr_score: number;
  pace_score: number;
  recovery_score: number;
  overall_score: number;
  stats: {
    planned_km?: number;
    actual_km?: number;
    planned_runs?: number;
    completed_runs?: number;
    avg_hr?: number | null;
    avg_pace_sec_per_km?: number | null;
    avg_resting_hr?: number | null;
    avg_sleep_score?: number | null;
  };
  insights_en: string | null;
  insights_zh: string | null;
}

const fmtPace = (s?: number | null) => {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/km`;
};

const ScoreRing = ({ value, label }: { value: number; label: string }) => {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 80 ? "text-emerald-500" : pct >= 60 ? "text-amber-500" : "text-rose-500";
  return (
    <div className="flex flex-col items-center">
      <div className={`relative w-16 h-16 ${color}`}>
        <svg viewBox="0 0 36 36" className="w-full h-full">
          <path className="text-muted/40" stroke="currentColor" strokeWidth="3" fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          <path stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"
            strokeDasharray={`${pct}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{pct}</div>
      </div>
      <span className="text-[11px] text-muted-foreground mt-1">{label}</span>
    </div>
  );
};

const WeeklyReviewModal = ({ open, onClose, lang, planId, currentWeekIdx, onUpgrade }: Props) => {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!user || !planId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("weekly_plan_reviews" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("plan_id", planId)
        .order("week_index", { ascending: false });
      const list = (data as any as Review[]) ?? [];
      setReviews(list);
      // Show review for current week if exists, else most recent
      const i = list.findIndex((r) => r.week_index === currentWeekIdx);
      setActiveIdx(i >= 0 ? i : 0);
    } finally {
      setLoading(false);
    }
  }, [user, planId, currentWeekIdx]);

  useEffect(() => {
    if (open && isPremium) load();
  }, [open, isPremium, load]);

  const generate = async (weekIndex?: number) => {
    if (!planId) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-plan-review", {
        body: { plan_id: planId, week_index: weekIndex ?? currentWeekIdx },
      });
      if (error) throw error;
      if ((data as any)?.review) {
        await load();
        toast.success(lang === "zh" ? "回顧已生成" : "Review generated");
      }
    } catch (e: any) {
      toast.error(lang === "zh" ? "生成失敗" : "Failed to generate review");
    } finally {
      setGenerating(false);
    }
  };

  if (!isPremium) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock size={18} /> {lang === "zh" ? "週訓練回顧" : "Weekly Training Review"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {lang === "zh"
              ? "AI 生成的每週訓練分析、評分與建議。Premium 專享功能。"
              : "AI-generated weekly training analysis, scores, and insights. Premium feature."}
          </p>
          <Button onClick={() => { onClose(); onUpgrade?.(); }} className="w-full">
            {lang === "zh" ? "升級至 Premium" : "Upgrade to Premium"}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  const review = reviews[activeIdx];
  const insight = review ? (lang === "zh" ? review.insights_zh : review.insights_en) || review.insights_en : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            {lang === "zh" ? "週訓練回顧" : "Weekly Training Review"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : reviews.length === 0 ? (
          <div className="py-8 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              {lang === "zh"
                ? "尚未為此計劃生成回顧。每週一早上會自動分析上一週，或立即生成本週回顧。"
                : "No reviews yet for this plan. Auto-generated every Monday morning, or generate now."}
            </p>
            <Button onClick={() => generate()} disabled={generating} className="w-full">
              {generating
                ? <><Loader2 className="animate-spin mr-2" size={16} />{lang === "zh" ? "分析中…" : "Analyzing…"}</>
                : (lang === "zh" ? "立即生成回顧" : "Generate Review Now")}
            </Button>
          </div>
        ) : review ? (
          <div className="space-y-4">
            {/* Week selector */}
            {reviews.length > 1 && (
              <div className="flex items-center justify-between bg-muted/40 rounded-lg p-2">
                <button onClick={() => setActiveIdx(Math.min(reviews.length - 1, activeIdx + 1))}
                  disabled={activeIdx >= reviews.length - 1}
                  className="p-1 disabled:opacity-30"><ChevronLeft size={16} /></button>
                <span className="text-xs font-medium">
                  {lang === "zh" ? `第 ${review.week_index + 1} 週` : `Week ${review.week_index + 1}`}
                  <span className="text-muted-foreground ml-2">{review.week_start} → {review.week_end}</span>
                </span>
                <button onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
                  disabled={activeIdx === 0}
                  className="p-1 disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
            )}

            {/* Overall + completion */}
            <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <ScoreRing value={review.overall_score} label={lang === "zh" ? "總分" : "Overall"} />
              <div className="flex-1">
                <div className="text-2xl font-bold">{review.completion_pct}%</div>
                <div className="text-xs text-muted-foreground">{lang === "zh" ? "完成度" : "Completion"}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {review.stats.completed_runs}/{review.stats.planned_runs} {lang === "zh" ? "次訓練" : "runs"} · {review.stats.actual_km}/{review.stats.planned_km} km
                </div>
              </div>
            </div>

            {/* Sub-scores */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="grid grid-cols-4 gap-2">
                <ScoreRing value={review.distance_score} label={lang === "zh" ? "里程" : "Distance"} />
                <ScoreRing value={review.pace_score} label={lang === "zh" ? "配速" : "Pace"} />
                <ScoreRing value={review.hr_score} label={lang === "zh" ? "心率" : "HR"} />
                <ScoreRing value={review.recovery_score} label={lang === "zh" ? "恢復" : "Recovery"} />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-4 text-xs text-muted-foreground">
                <div>{lang === "zh" ? "平均配速" : "Avg pace"}: <span className="text-foreground font-medium">{fmtPace(review.stats.avg_pace_sec_per_km)}</span></div>
                <div>{lang === "zh" ? "平均心率" : "Avg HR"}: <span className="text-foreground font-medium">{review.stats.avg_hr ?? "—"}</span></div>
                <div>{lang === "zh" ? "靜息心率" : "Resting HR"}: <span className="text-foreground font-medium">{review.stats.avg_resting_hr ?? "—"}</span></div>
                <div>{lang === "zh" ? "睡眠分數" : "Sleep score"}: <span className="text-foreground font-medium">{review.stats.avg_sleep_score ?? "—"}</span></div>
              </div>
            </div>

            {/* Insight */}
            {insight && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <div className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
                  <Sparkles size={12} /> {lang === "zh" ? "AI 教練分析" : "AI Coach Insight"}
                </div>
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{insight}</p>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={() => generate(review.week_index)} disabled={generating} className="w-full">
              {generating
                ? <><Loader2 className="animate-spin mr-2" size={14} />{lang === "zh" ? "重新分析中…" : "Re-analyzing…"}</>
                : (lang === "zh" ? "重新生成此週" : "Regenerate this week")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default WeeklyReviewModal;
