import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";

export interface EditableWorkout {
  type?: string | null;
  title?: string | null;
  distance_km?: number | null;
  pace?: string | null;
  description?: string | null;
  color?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  /** Initial workout (also treated as the "original" the AI compares against). */
  workout: EditableWorkout;
  /** Plain-text context for the validator (e.g. "free plan, week 3 long run day"). */
  planContext?: string | null;
  /** Called with the saved (possibly-edited) workout when user confirms. */
  onSave: (next: EditableWorkout) => void | Promise<void>;
  /** Optional delete handler (shows a destructive button). */
  onDelete?: () => void | Promise<void>;
  title?: string;
}

type Verdict = "ok" | "caution" | "risky";

const TYPE_OPTIONS: { id: string; en: string; zh: string; color: string; descEn: string; descZh: string }[] = [
  { id: "Easy Run", en: "Easy Run", zh: "輕鬆跑", color: "#22c55e",
    descEn: "Comfortable, conversational pace. Keep it relaxed and aerobic to build endurance without fatigue.",
    descZh: "輕鬆、可交談的配速，保持放鬆有氧，建立耐力而不過度疲勞。" },
  { id: "Tempo Run", en: "Tempo Run", zh: "節奏跑", color: "#eab308",
    descEn: "Sustained effort at a 'comfortably hard' pace to raise lactate threshold.",
    descZh: "在『稍辛苦但可持續』的配速維持一段時間，提升乳酸閾值。" },
  { id: "Interval", en: "Interval", zh: "間歇跑", color: "#ef4444",
    descEn: "Hard repeats with recovery jogs in between. Develops VO2max and speed.",
    descZh: "高強度重複跑，每組之間慢跑恢復。提升最大攝氧量及速度。" },
  { id: "Long Run", en: "Long Run", zh: "長跑", color: "#3b82f6",
    descEn: "Longer distance at an easy pace to build aerobic endurance and mental toughness.",
    descZh: "以輕鬆配速完成較長距離，建立有氧耐力與意志力。" },
  { id: "Recovery Run", en: "Recovery Run", zh: "恢復跑", color: "#94a3b8",
    descEn: "Very easy short run to promote blood flow and aid recovery between hard sessions.",
    descZh: "極輕鬆的短距離跑，促進血液循環，幫助高強度訓練之間的恢復。" },
  { id: "Progression Run", en: "Progression Run", zh: "漸進跑", color: "#f97316",
    descEn: "Start easy and gradually increase pace, finishing the last portion strong.",
    descZh: "由輕鬆開始，逐漸加快配速，最後段以較快速度完成。" },
  { id: "Cross Training", en: "Cross Training", zh: "交叉訓練", color: "#06b6d4",
    descEn: "Non-running aerobic activity (bike, swim, elliptical) to build fitness with low impact.",
    descZh: "非跑步的有氧活動（單車、游泳、橢圓機等），低衝擊地建立體能。" },
  { id: "Race Pace", en: "Race Pace", zh: "比賽配速", color: "#a855f7",
    descEn: "Run at your goal race pace to dial in effort and rhythm.",
    descZh: "以目標比賽配速跑，熟悉強度與節奏。" },
  { id: "Rest", en: "Rest", zh: "休息", color: "#64748b",
    descEn: "Full rest day. Let the body absorb training and rebuild.",
    descZh: "完全休息日，讓身體吸收訓練並修復。" },
];

const normalizeType = (t?: string | null): string => {
  if (!t) return "";
  const map: Record<string, string> = {
    Easy: "Easy Run",
    Tempo: "Tempo Run",
    Long: "Long Run",
    Recovery: "Recovery Run",
    Progression: "Progression Run",
  };
  return map[t] || t;
};

const EditWorkoutDialog = ({
  open, onOpenChange, lang, workout, planContext, onSave, onDelete, title,
}: Props) => {
  const isZh = lang === "zh";
  const [type, setType] = useState<string>(normalizeType(workout.type));
  const [distance, setDistance] = useState<string>(workout.distance_km != null ? String(workout.distance_km) : "");
  const [pace, setPace] = useState<string>(workout.pace ?? "");
  const [description, setDescription] = useState<string>(workout.description ?? "");
  const [validating, setValidating] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setType(normalizeType(workout.type));
      setDistance(workout.distance_km != null ? String(workout.distance_km) : "");
      setPace(workout.pace ?? "");
      setDescription(workout.description ?? "");
      setVerdict(null);
      setFeedback("");
      setNeedsConfirm(false);
    }
  }, [open, workout]);

  const buildEdited = (): EditableWorkout => {
    const opt = TYPE_OPTIONS.find((o) => o.id === type);
    return {
      ...workout,
      type: type || workout.type,
      title: type || workout.title,
      color: opt?.color ?? workout.color,
      distance_km: distance ? Number(distance) : workout.distance_km,
      pace: pace || workout.pace,
      description: description || workout.description,
    };
  };

  const isUnchanged = (): boolean => {
    const next = buildEdited();
    return (
      (next.type ?? "") === (normalizeType(workout.type) ?? "") &&
      (next.distance_km ?? null) === (workout.distance_km ?? null) &&
      (next.pace ?? "") === (workout.pace ?? "") &&
      (next.description ?? "") === (workout.description ?? "")
    );
  };

  const handleSaveClick = async () => {
    if (isUnchanged()) {
      onOpenChange(false);
      return;
    }
    // If we already validated and either ok or user confirmed, just save.
    if (verdict === "ok" || needsConfirm) {
      await persist();
      return;
    }
    // Run validation
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-workout-edit", {
        body: {
          lang,
          original: workout,
          edited: buildEdited(),
          planContext: planContext ?? null,
        },
      });
      if (error) throw error;
      const v = (data as any)?.verdict as Verdict | undefined;
      const fb = (data as any)?.feedback as string | undefined;
      const newDesc = (data as any)?.updatedDescription as string | undefined;
      if (newDesc && newDesc.trim()) {
        setDescription(newDesc.trim());
      }
      setVerdict(v ?? "caution");
      setFeedback(fb ?? "");
      if (v === "ok") {
        // Auto-save on green light, using AI-rewritten description if provided
        await persist(newDesc?.trim() || undefined);
      } else {
        // caution / risky → require explicit second click
        setNeedsConfirm(true);
      }
    } catch (e) {
      console.error("[EditWorkoutDialog] validate error:", e);
      toast.error(isZh ? "AI 教練檢查失敗，請再試一次" : "Coach check failed, please try again");
    } finally {
      setValidating(false);
    }
  };

  const persist = async (overrideDescription?: string) => {
    try {
      const next = buildEdited();
      if (overrideDescription) next.description = overrideDescription;
      await onSave(next);
      onOpenChange(false);
    } catch (e) {
      console.error("[EditWorkoutDialog] save error:", e);
      toast.error(isZh ? "儲存失敗" : "Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title ?? (isZh ? "編輯訓練" : "Edit Workout")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              {isZh ? "活動類型" : "Activity Type"}
            </label>
            <div className="flex items-center gap-2">
              {(() => {
                const opt = TYPE_OPTIONS.find((o) => o.id === type);
                return opt ? (
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                ) : null;
              })()}
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={type}
                onChange={(e) => { setType(e.target.value); setVerdict(null); setNeedsConfirm(false); }}
              >
                {!TYPE_OPTIONS.some((o) => o.id === type) && type && (
                  <option value={type}>{type}</option>
                )}
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{isZh ? o.zh : o.en}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              {isZh ? "距離 (公里)" : "Distance (km)"}
            </label>
            <Input
              type="number" min="0" step="0.5"
              value={distance}
              onChange={(e) => { setDistance(e.target.value); setVerdict(null); setNeedsConfirm(false); }}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              {isZh ? "配速 (例: 5:30/km)" : "Pace (e.g. 5:30/km)"}
            </label>
            <Input
              type="text" placeholder="5:30/km"
              value={pace}
              onChange={(e) => { setPace(e.target.value); setVerdict(null); setNeedsConfirm(false); }}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              {isZh ? "描述" : "Description"}
            </label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setVerdict(null); setNeedsConfirm(false); }}
            />
          </div>

          {/* Feedback panel */}
          {feedback && verdict && (
            <div
              className={`rounded-md p-3 text-sm flex items-start gap-2 border ${
                verdict === "ok"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-foreground"
                  : verdict === "caution"
                    ? "bg-amber-500/10 border-amber-500/30 text-foreground"
                    : "bg-destructive/10 border-destructive/30 text-foreground"
              }`}
            >
              {verdict === "ok" ? (
                <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
              ) : verdict === "caution" ? (
                <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
              )}
              <div className="space-y-1">
                <p className="font-medium">
                  {verdict === "ok"
                    ? isZh ? "教練：合理的調整" : "Coach: Looks reasonable"
                    : verdict === "caution"
                      ? isZh ? "教練：請留意" : "Coach: Heads up"
                      : isZh ? "教練：有受傷風險" : "Coach: This carries risk"}
                </p>
                <p className="text-muted-foreground">{feedback}</p>
              </div>
            </div>
          )}

          <Button className="w-full" disabled={validating} onClick={handleSaveClick}>
            {validating && <Loader2 size={14} className="animate-spin mr-2" />}
            {validating
              ? (isZh ? "AI 教練檢查中…" : "Coach checking…")
              : needsConfirm && verdict === "risky"
                ? (isZh ? "我了解風險，仍要儲存" : "I understand the risk — save anyway")
                : needsConfirm && verdict === "caution"
                  ? (isZh ? "明白了，儲存變更" : "Got it — save change")
                  : (isZh ? "儲存變更" : "Save Changes")}
          </Button>

          {onDelete && (
            <Button
              variant="destructive"
              className="w-full"
              disabled={validating}
              onClick={async () => { await onDelete(); onOpenChange(false); }}
            >
              {isZh ? "刪除訓練" : "Delete Workout"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditWorkoutDialog;
