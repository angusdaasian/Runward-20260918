import { useEffect, useState } from "react";
import { Footprints, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";
import EditWorkoutDialog, { EditableWorkout } from "@/components/training/EditWorkoutDialog";
import { notifyPlanChanged, subscribePlanChanged } from "@/lib/planEvents";

interface Props {
  lang: Lang;
  /** Date (ISO) of the activity being viewed; we look for the next plan day after this. */
  activityDate: string;
  isPremium?: boolean;
  /** Notifies the parent whether a plan-driven next workout is being shown. */
  onResolved?: (hasNext: boolean) => void;
}

/**
 * Plan-aware "next workout" card shown inside an activity detail view.
 * - If the user has an active training plan, finds the next planned workout
 *   AFTER this activity's date and shows it.
 * - Premium users can edit it; AI validates the change via validate-workout-edit;
 *   plan_data is updated and other listeners (calendar, suggestions) are notified.
 *
 * Returns null when there's no plan or no upcoming planned workout.
 */
const PlanNextWorkoutCard = ({ lang, activityDate, isPremium }: Props) => {
  const { user } = useAuth();
  const isZh = lang === "zh";

  const [planRow, setPlanRow] = useState<any | null>(null);
  const [nextPlanned, setNextPlanned] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const loadPlan = async () => {
    if (!user) { setLoaded(true); return; }
    const { data } = await supabase
      .from("training_plans" as any)
      .select("id, goal, distance, target_time, plan_data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row: any = data;
    setPlanRow(row || null);

    if (row?.plan_data && Array.isArray(row.plan_data) && activityDate) {
      const a = new Date(activityDate);
      const actDay = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      let found: any = null;
      let weekIdx = -1, dayIdx = -1;
      outer: for (let wi = 0; wi < row.plan_data.length; wi++) {
        const wk = row.plan_data[wi];
        for (let di = 0; di < (wk?.days?.length || 0); di++) {
          const d = wk.days[di];
          if (!d?.date) continue;
          const dDate = new Date(d.date);
          const dDay = new Date(dDate.getFullYear(), dDate.getMonth(), dDate.getDate());
          if (dDay.getTime() > actDay.getTime() && (d.type ?? "") !== "Rest") {
            found = d; weekIdx = wi; dayIdx = di; break outer;
          }
        }
      }
      setNextPlanned(found ? { ...found, _weekIdx: weekIdx, _dayIdx: dayIdx } : null);
    } else {
      setNextPlanned(null);
    }
    setLoaded(true);
  };

  useEffect(() => {
    setLoaded(false);
    void loadPlan();
    const unsub = subscribePlanChanged(() => { void loadPlan(); });
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activityDate]);

  if (!loaded || !planRow || !nextPlanned) return null;

  const isFreePlan = (planRow?.goal ?? "") === "free";
  const planContext = `goal=${planRow?.goal ?? "?"}, distance=${planRow?.distance ?? "?"}, target=${planRow?.target_time ?? "?"}, week ${(nextPlanned._weekIdx ?? 0) + 1}, day type=${nextPlanned.type ?? "?"}`;
  const title = nextPlanned.title || nextPlanned.type || (isZh ? "下次訓練" : "Next Workout");

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(isZh ? "zh-HK" : "en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch { return iso; }
  };

  const persistEdit = async (next: EditableWorkout) => {
    try {
      const updated = JSON.parse(JSON.stringify(planRow.plan_data));
      const day = updated[nextPlanned._weekIdx]?.days?.[nextPlanned._dayIdx];
      if (!day) throw new Error("day not found");
      const newDistance = next.distance_km ?? day.distance_km;
      day.distance_km = newDistance;
      day.pace = next.pace ?? day.pace;
      day.description = next.description ?? day.description;
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
      toast.success(isZh ? "已更新訓練" : "Workout updated");
    } catch (e) {
      console.error("[PlanNextWorkoutCard] update plan day error:", e);
      toast.error(isZh ? "更新失敗" : "Update failed");
      throw e;
    }
  };

  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Footprints size={16} className="text-primary" />
          <h3 className="font-display font-bold text-foreground text-sm">
            {isZh ? "下次計劃訓練" : "Next Planned Workout"}
          </h3>
        </div>
        {isPremium && !isFreePlan && (
          <button
            type="button"
            className="text-xs flex items-center gap-1 text-primary hover:underline"
            onClick={() => setEditOpen(true)}
          >
            <Pencil size={12} /> {isZh ? "編輯" : "Edit"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {nextPlanned.color && (
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: nextPlanned.color }} />
          )}
          <span className="font-medium text-foreground text-sm">{title}</span>
          {nextPlanned.date && (
            <span className="text-xs text-muted-foreground">· {fmtDate(nextPlanned.date)}</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {nextPlanned.distance_km != null && (
            <div className="rounded-md bg-background/60 border border-border px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {isZh ? "距離" : "Distance"}
              </div>
              <div className="font-semibold text-foreground">{nextPlanned.distance_km} km</div>
            </div>
          )}
          {nextPlanned.pace && (
            <div className="rounded-md bg-background/60 border border-border px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {isZh ? "配速" : "Pace"}
              </div>
              <div className="font-semibold text-foreground">{nextPlanned.pace}</div>
            </div>
          )}
        </div>
        {nextPlanned.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{nextPlanned.description}</p>
        )}
        {isFreePlan && isPremium && (
          <p className="text-[11px] text-muted-foreground">
            {isZh ? "免費計劃不能在此編輯。" : "Free-plan workouts can't be edited here."}
          </p>
        )}
        {!isPremium && (
          <p className="text-[11px] text-muted-foreground">
            {isZh ? "升級 Premium 即可編輯計劃訓練。" : "Upgrade to Premium to edit planned workouts."}
          </p>
        )}
      </div>

      <EditWorkoutDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        lang={lang}
        workout={{
          type: nextPlanned.type,
          title: nextPlanned.title,
          distance_km: nextPlanned.distance_km ?? null,
          pace: nextPlanned.pace ?? null,
          description: nextPlanned.description ?? null,
          color: nextPlanned.color ?? null,
        }}
        planContext={planContext}
        onSave={persistEdit}
      />
    </div>
  );
};

export default PlanNextWorkoutCard;
