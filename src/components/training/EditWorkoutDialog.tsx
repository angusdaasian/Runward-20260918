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

const EditWorkoutDialog = ({
  open, onOpenChange, lang, workout, planContext, onSave, onDelete, title,
}: Props) => {
  const isZh = lang === "zh";
  const [distance, setDistance] = useState<string>(workout.distance_km != null ? String(workout.distance_km) : "");
  const [pace, setPace] = useState<string>(workout.pace ?? "");
  const [description, setDescription] = useState<string>(workout.description ?? "");
  const [validating, setValidating] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setDistance(workout.distance_km != null ? String(workout.distance_km) : "");
      setPace(workout.pace ?? "");
      setDescription(workout.description ?? "");
      setVerdict(null);
      setFeedback("");
      setNeedsConfirm(false);
    }
  }, [open, workout]);

  const buildEdited = (): EditableWorkout => ({
    ...workout,
    distance_km: distance ? Number(distance) : workout.distance_km,
    pace: pace || workout.pace,
    description: description || workout.description,
  });

  const isUnchanged = (): boolean => {
    const next = buildEdited();
    return (
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
      setVerdict(v ?? "ok");
      setFeedback(fb ?? "");
      if (v === "ok") {
        // Auto-save on green light
        await persist();
      } else {
        // caution / risky → require explicit second click
        setNeedsConfirm(true);
      }
    } catch (e) {
      console.error("[EditWorkoutDialog] validate error:", e);
      // Fallback: save without blocking on AI failure
      await persist();
    } finally {
      setValidating(false);
    }
  };

  const persist = async () => {
    try {
      await onSave(buildEdited());
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
          {workout.type && (
            <div className="flex items-center gap-2">
              {workout.color && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: workout.color }} />}
              <span className="font-medium text-foreground">{workout.title || workout.type}</span>
            </div>
          )}

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
