import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Sparkles, Target, ChevronDown, X, Calendar as CalendarIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActivities } from "@/hooks/use-activities";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";
import { notifyPlanChanged } from "@/lib/planEvents";
import { predictRaceFromActivities, typeLabel, RunType } from "@/lib/racePredictionHr";
import { estimateMaxHr, estimateRestingHr, isValidCustomZones, zoneBoundaries } from "@/lib/hrZones";
import WeeklyReviewModal from "@/components/training/WeeklyReviewModal";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_ZH: Record<string, string> = { Mon: "一", Tue: "二", Wed: "三", Thu: "四", Fri: "五", Sat: "六", Sun: "日" };

function parsePaceMin(p: string | null | undefined): number | null {
  if (!p) return null;
  const m = String(p).match(/(\d+):(\d{1,2})/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}
const FALLBACK_PACE_MIN: Record<string, number> = {
  Easy: 6, Recovery: 6.5, Long: 6, Tempo: 5, Interval: 4.5, Progression: 5.5, "Race Pace": 5,
};

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

interface Props {
  lang: Lang;
  plan: any;
  weekIdx: number;
  isPremium: boolean;
  onPlanUpdated: (next: any) => void;
}

export default function DesktopAiPlanControls({ lang, plan, weekIdx, isPremium, onPlanUpdated }: Props) {
  const zh = lang === "zh";
  const L = (en: string, z: string) => (zh ? z : en);
  const { user } = useAuth();
  const { activities: allActivities, userRaces } = useActivities();
  const queryClient = (window as any).__qc; // not used; we'll skip cache invalidation

  const planArr: any[] = Array.isArray(plan?.plan_data) ? plan.plan_data : [];
  const w0Days: any[] = planArr[0]?.days || [];
  const restDaysCurrent = w0Days.filter((d) => d.type === "Rest").map((d) => d.day).filter((d) => DAYS.includes(d as any));
  const longRunDayCurrent = (w0Days.find((d) => d.type === "Long Run")?.day) || "Sun";
  const daysPerWeekCurrent = Math.max(1, 7 - restDaysCurrent.length);
  const weeklyKmDerived = Math.max(
    10,
    Math.round(
      Math.max(0, ...planArr.map((w: any) => (w?.days || []).reduce((s: number, d: any) => s + (d?.distance_km || 0), 0))),
    ),
  );

  const targetTime = String(plan?.target_time ?? "");
  const distance = String(plan?.distance ?? "");

  // ── Editing state ──
  const [regenerating, setRegenerating] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [editingRuns, setEditingRuns] = useState(false);
  const [editingLong, setEditingLong] = useState(false);
  const [editingRest, setEditingRest] = useState(false);
  const [editingKm, setEditingKm] = useState(false);

  const tParts = targetTime.split(":");
  const [eh, setEh] = useState(tParts[0] || "00");
  const [em, setEm] = useState(tParts[1] || "00");
  const [es, setEs] = useState(tParts[2] || "00");
  useEffect(() => {
    const p = targetTime.split(":");
    setEh((p[0] || "00").padStart(2, "0"));
    setEm((p[1] || "00").padStart(2, "0"));
    setEs((p[2] || "00").padStart(2, "0"));
  }, [targetTime]);

  const [editRuns, setEditRuns] = useState(daysPerWeekCurrent);
  const [editLong, setEditLong] = useState(longRunDayCurrent);
  const [editRest, setEditRest] = useState<string[]>(restDaysCurrent);
  const [editKm, setEditKm] = useState<number>(weeklyKmDerived);
  useEffect(() => { setEditRuns(daysPerWeekCurrent); }, [daysPerWeekCurrent]);
  useEffect(() => { setEditLong(longRunDayCurrent); }, [longRunDayCurrent]);
  useEffect(() => { setEditRest(restDaysCurrent); }, [restDaysCurrent.join(",")]);
  useEffect(() => { setEditKm(weeklyKmDerived); }, [weeklyKmDerived]);

  const pad = (v: string) => String(Math.max(0, parseInt(v || "0", 10) || 0)).padStart(2, "0");
  const dayLabel = (d: string) => (zh ? DAY_ZH[d] || d : d);

  type Overrides = { targetTime?: string; daysPerWeek?: number; longRunDay?: string; restDays?: string[]; weeklyKm?: number };

  const regenerate = async (overrides: Overrides) => {
    if (!plan || !user) return;
    setRegenerating(true);
    try {
      const startDateDerived = planArr[0]?.startDate || w0Days[0]?.date || new Date().toISOString().slice(0, 10);
      const raceDateDerived = plan.race_date || "";
      const inclusiveWeeksToRace = raceDateDerived
        ? Math.ceil((new Date(raceDateDerived + "T00:00:00").getTime() - new Date(startDateDerived + "T00:00:00").getTime() + 86400000) / (7 * 86400000))
        : 0;
      const weeksDerived = Math.max(Number(plan.weeks) || 0, planArr.length || 0, inclusiveWeeksToRace || 0, 8);

      let restDaysFinal = overrides.restDays ?? restDaysCurrent;
      let daysPerWeekFinal = overrides.daysPerWeek ?? daysPerWeekCurrent;
      if (overrides.daysPerWeek !== undefined && overrides.restDays === undefined) {
        const desiredRest = 7 - daysPerWeekFinal;
        if (restDaysFinal.length > desiredRest) restDaysFinal = restDaysFinal.slice(0, desiredRest);
        else {
          const cand = ["Mon", "Fri", "Wed", "Tue", "Thu", "Sat", "Sun"];
          for (const d of cand) {
            if (restDaysFinal.length >= desiredRest) break;
            if (!restDaysFinal.includes(d)) restDaysFinal = [...restDaysFinal, d];
          }
        }
      } else if (overrides.restDays !== undefined && overrides.daysPerWeek === undefined) {
        daysPerWeekFinal = 7 - restDaysFinal.length;
      }
      const longRunDayFinal = overrides.longRunDay ?? longRunDayCurrent;
      if (restDaysFinal.includes(longRunDayFinal)) {
        restDaysFinal = restDaysFinal.filter((d) => d !== longRunDayFinal);
        daysPerWeekFinal = 7 - restDaysFinal.length;
      }
      const weeklyKmFinal = overrides.weeklyKm ?? weeklyKmDerived;
      const targetTimeFinal = overrides.targetTime ?? targetTime;

      // Snapshot races within plan window
      const { data: races } = await supabase
        .from("user_races" as any)
        .select("id,race_name,race_name_zh,race_date,category,priority")
        .eq("user_id", user.id)
        .gte("race_date", startDateDerived)
        .lte("race_date", raceDateDerived || "9999-12-31")
        .order("race_date", { ascending: true });
      const racesPayload = ((races as any[]) || []).map((r) => ({
        name: (zh && r.race_name_zh) || r.race_name,
        race_date: r.race_date,
        category: r.category || "",
        priority: r.priority || "none",
      }));

      const session = (await supabase.auth.getSession()).data.session;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-program`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          goal: plan.goal || "race",
          distance, targetTime: targetTimeFinal,
          raceDate: raceDateDerived, startDate: startDateDerived,
          weeks: weeksDerived,
          daysPerWeek: daysPerWeekFinal, weeklyKm: weeklyKmFinal,
          longRunDay: longRunDayFinal, restDays: restDaysFinal, lang,
          races: racesPayload,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to regenerate");
      }
      const result = await response.json();
      if (!Array.isArray(result.plan) || result.plan.length === 0) {
        throw new Error(zh ? "AI 未能生成有效訓練計劃" : "AI did not return a valid plan");
      }
      await supabase.from("training_plans" as any).delete().eq("user_id", user.id);
      const inserted: any = {
        user_id: user.id, goal: plan.goal || "race", distance, target_time: targetTimeFinal,
        race_date: raceDateDerived, weeks: weeksDerived, plan_data: result.plan,
        raw_output: result.raw || "",
      };
      const { data: saved } = await (supabase.from("training_plans" as any) as any).insert(inserted).select().single();
      onPlanUpdated(saved || inserted);
      notifyPlanChanged();
      toast.success(L("Plan updated", "計劃已更新"));
    } catch (e: any) {
      toast.error(e.message || L("Failed to regenerate", "重新生成失敗"));
    } finally {
      setRegenerating(false);
      setEditingTime(false); setEditingRuns(false); setEditingLong(false); setEditingRest(false); setEditingKm(false);
    }
  };

  // ── This-week progress ──
  const weekDays: any[] = planArr[weekIdx]?.days || [];
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
  let completedKm = 0, completedMin = 0;
  for (const a of (allActivities || []) as any[]) {
    if (!inWeek(a.start_date)) continue;
    completedKm += (Number(a.distance) || 0) / 1000;
    completedMin += (Number(a.moving_time) || 0) / 60;
  }
  const pct = (a: number, b: number) => Math.max(0, Math.min(100, b > 0 ? (a / b) * 100 : 0));

  // ── Race calendar ──
  const racesList = useMemo(() => {
    if (!Array.isArray(userRaces) || !weekStart || !weekEnd) return [] as any[];
    const planStart = planArr[0]?.days?.[0]?.date || weekStart;
    const planEnd = planArr[planArr.length - 1]?.days?.slice(-1)[0]?.date || weekEnd;
    return (userRaces as any[])
      .filter((r) => r?.race_date && r.race_date >= planStart && r.race_date <= planEnd)
      .sort((a, b) => a.race_date.localeCompare(b.race_date));
  }, [userRaces, planArr, weekStart, weekEnd]);

  const updateRacePriority = async (raceId: string, priority: string) => {
    if (!user) return;
    await (supabase.from("user_races" as any) as any).update({ priority }).eq("id", raceId).eq("user_id", user.id);
    await regenerate({});
  };
  const removeRace = async (raceId: string) => {
    if (!user) return;
    if (!window.confirm(L("Remove this race?", "移除此賽事？"))) return;
    await supabase.from("user_races" as any).delete().eq("id", raceId).eq("user_id", user.id);
    await regenerate({});
  };

  // ── HR bounds for race predictor ──
  const [hrBounds, setHrBounds] = useState<any>(null);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles" as any)
        .select("age, max_heartrate, resting_heartrate, custom_hr_zones")
        .eq("id", user.id).maybeSingle();
      const p: any = data || {};
      const max = estimateMaxHr(p.age, p.max_heartrate);
      const rest = estimateRestingHr(p.resting_heartrate);
      const custom = isValidCustomZones(p.custom_hr_zones) ? (p.custom_hr_zones as number[]) : null;
      const b = zoneBoundaries(max, rest, custom);
      setHrBounds({ ...b, max });
    })();
  }, [user]);

  const canPredict = !!plan?.target_time && typeof plan?.distance === "string" && ["5K", "10K", "HM", "FM"].includes(plan.distance);
  const racePrediction = useMemo(() => {
    if (!canPredict || !allActivities || allActivities.length === 0) return null;
    const hz = hrBounds ? { z1: hrBounds.z1, z2: hrBounds.z2, z3: hrBounds.z3, z4: hrBounds.z4, z5: hrBounds.z5 } : null;
    return predictRaceFromActivities(allActivities as any, hz, String(plan.distance), 30);
  }, [canPredict, allActivities, hrBounds, plan?.distance]);

  // ── HRV finetune ──
  const [hasRecovery, setHasRecovery] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user || !isPremium) { setHasRecovery(false); return; }
    (async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const [g, t] = await Promise.all([
        supabase.from("garmin_daily_health").select("resting_hr").eq("user_id", user.id).gte("date", since).gt("resting_hr", 0).limit(1),
        supabase.from("terra_daily_health").select("resting_hr,hrv").eq("user_id", user.id).gte("date", since).or("resting_hr.gt.0,hrv.gt.0").limit(1),
      ]);
      setHasRecovery(((g.data?.length ?? 0) + (t.data?.length ?? 0)) > 0);
    })();
  }, [user, isPremium]);

  const [finetuneOpen, setFinetuneOpen] = useState(false);
  const [finetuning, setFinetuning] = useState(false);
  const [finetuneResult, setFinetuneResult] = useState<any>(null);
  const [confirmingFinetune, setConfirmingFinetune] = useState(false);

  const runFinetune = async () => {
    if (!plan?.id) return;
    setFinetuning(true); setFinetuneOpen(true); setFinetuneResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("finetune-plan-week", {
        body: { plan_id: plan.id, week_index: weekIdx, action: "analyze", lang },
      });
      if (error) throw error;
      if (!(data as any)?.has_data) {
        toast.error(L("No HRV/RHR data available", "暫無 HRV/靜息心率資料"));
        setFinetuneOpen(false); return;
      }
      setFinetuneResult(data);
    } catch (e: any) {
      toast.error(e.message || L("Analysis failed", "分析失敗"));
      setFinetuneOpen(false);
    } finally { setFinetuning(false); }
  };
  const confirmFinetune = async () => {
    if (!plan?.id || !finetuneResult) return;
    setConfirmingFinetune(true);
    try {
      const { error } = await supabase.functions.invoke("finetune-plan-week", {
        body: { plan_id: plan.id, week_index: weekIdx, action: "confirm", adjusted_days: finetuneResult.adjusted_days },
      });
      if (error) throw error;
      const next = [...planArr];
      next[weekIdx] = { ...next[weekIdx], days: finetuneResult.adjusted_days };
      onPlanUpdated({ ...plan, plan_data: next });
      notifyPlanChanged();
      toast.success(L("This week's plan updated", "本週計劃已更新"));
      setFinetuneOpen(false); setFinetuneResult(null);
    } catch (e: any) {
      toast.error(e.message || L("Update failed", "更新失敗"));
    } finally { setConfirmingFinetune(false); }
  };

  // ── Weekly Review modal ──
  const [reviewOpen, setReviewOpen] = useState(false);

  const Updating = (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Loader2 size={12} className="animate-spin" />
      {L("Updating…", "更新中…")}
    </span>
  );

  const targetSec = parseTargetToSec(plan?.target_time);
  const typeOrder: RunType[] = ["recovery", "easy", "tempo", "threshold", "interval"];

  return (
    <div className="space-y-4">
      {/* Plan goals */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
            {L("Plan goals", "計劃目標")}
          </h3>
          <span className="text-xs text-muted-foreground">{distance}{plan?.weeks ? ` · ${plan.weeks} ${L("weeks", "週")}` : ""}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Target time */}
          <FieldCard label={L("Target time", "目標時間")} onEdit={() => setEditingTime(true)} editing={editingTime} disabled={regenerating}>
            {!editingTime ? (
              <p className="text-base font-semibold">{regenerating ? Updating : (targetTime || "—")}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <select className={selCls} value={eh} onChange={(e) => setEh(e.target.value)}>
                    {Array.from({ length: 10 }, (_, i) => String(i).padStart(2, "0")).map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <span>:</span>
                  <select className={selCls} value={em} onChange={(e) => setEm(e.target.value)}>
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <span>:</span>
                  <select className={selCls} value={es} onChange={(e) => setEs(e.target.value)}>
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <ApplyRow onApply={() => regenerate({ targetTime: `${pad(eh)}:${pad(em)}:${pad(es)}` })} onCancel={() => setEditingTime(false)} regenerating={regenerating} label={L("Regenerate", "重新生成")} />
              </div>
            )}
          </FieldCard>

          {/* Runs per week */}
          <FieldCard label={L("Runs / week", "每週跑步")} onEdit={() => setEditingRuns(true)} editing={editingRuns} disabled={regenerating}>
            {!editingRuns ? (
              <p className="text-base font-semibold">{regenerating ? Updating : `${daysPerWeekCurrent} ${L("days", "天")}`}</p>
            ) : (
              <div className="space-y-2">
                <select className={selCls} value={editRuns} onChange={(e) => setEditRuns(parseInt(e.target.value, 10))}>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} {L("days", "天")}</option>)}
                </select>
                <ApplyRow onApply={() => regenerate({ daysPerWeek: editRuns })} onCancel={() => setEditingRuns(false)} regenerating={regenerating} label={L("Apply", "套用")} />
              </div>
            )}
          </FieldCard>

          {/* Long run day */}
          <FieldCard label={L("Long run day", "長跑日")} onEdit={() => setEditingLong(true)} editing={editingLong} disabled={regenerating}>
            {!editingLong ? (
              <p className="text-base font-semibold">{regenerating ? Updating : dayLabel(longRunDayCurrent)}</p>
            ) : (
              <div className="space-y-2">
                <select className={selCls} value={editLong} onChange={(e) => setEditLong(e.target.value)}>
                  {DAYS.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                </select>
                <ApplyRow onApply={() => regenerate({ longRunDay: editLong })} onCancel={() => setEditingLong(false)} regenerating={regenerating} label={L("Apply", "套用")} />
              </div>
            )}
          </FieldCard>

          {/* Rest days */}
          <FieldCard label={L("Rest days", "休息日")} onEdit={() => setEditingRest(true)} editing={editingRest} disabled={regenerating}>
            {!editingRest ? (
              <p className="text-base font-semibold">{regenerating ? Updating : (restDaysCurrent.length ? restDaysCurrent.map(dayLabel).join(", ") : "—")}</p>
            ) : (
              <div className="space-y-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs">
                      {editRest.length ? editRest.map(dayLabel).join(", ") : L("Pick…", "選擇…")}
                      <ChevronDown size={12} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-2 w-56" align="start">
                    <div className="grid grid-cols-7 gap-1">
                      {DAYS.map((d) => {
                        const isLong = longRunDayCurrent === d;
                        const sel = editRest.includes(d);
                        return (
                          <button key={d} type="button" disabled={isLong}
                            onClick={() => setEditRest(sel ? editRest.filter((r) => r !== d) : [...editRest, d])}
                            className={`h-8 rounded text-[11px] font-medium border ${sel ? "bg-primary text-primary-foreground border-primary" : isLong ? "opacity-30 border-border" : "border-border hover:bg-accent"}`}>
                            {dayLabel(d)}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <ApplyRow onApply={() => regenerate({ restDays: [...editRest].sort((a, b) => DAYS.indexOf(a as any) - DAYS.indexOf(b as any)) })} onCancel={() => setEditingRest(false)} regenerating={regenerating} label={L("Apply", "套用")} />
              </div>
            )}
          </FieldCard>

          {/* Weekly mileage */}
          <FieldCard label={L("Peak weekly km", "每週里程")} onEdit={() => setEditingKm(true)} editing={editingKm} disabled={regenerating}>
            {!editingKm ? (
              <p className="text-base font-semibold">{regenerating ? Updating : `${weeklyKmDerived} km`}</p>
            ) : (
              <div className="space-y-2">
                <Input type="number" min={5} max={250} className="h-8 text-xs" value={editKm}
                  onChange={(e) => setEditKm(parseInt(e.target.value || "0", 10))} />
                <ApplyRow onApply={() => regenerate({ weeklyKm: editKm })} onCancel={() => setEditingKm(false)} regenerating={regenerating} label={L("Apply", "套用")} />
              </div>
            )}
          </FieldCard>
        </div>
      </Card>

      {/* This week progress */}
      <Card className="p-5">
        <h3 className="font-display font-semibold text-sm uppercase tracking-wider mb-3">
          {L("This week", "本週進度")}
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <ProgressBar label={L("Distance", "距離")} value={completedKm} target={plannedKm} unit="km" pct={pct(completedKm, plannedKm)} />
          <ProgressBar label={L("Time", "時間")} value={Math.round(completedMin)} target={Math.round(plannedMin)} unit="min" pct={pct(completedMin, plannedMin)} />
        </div>
      </Card>

      {/* Race calendar */}
      <Card className="p-5">
        <h3 className="font-display font-semibold text-sm uppercase tracking-wider mb-3 inline-flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-primary" />
          {L("Race calendar", "賽事行程")}
        </h3>
        {racesList.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">{L("No races in the plan window. Add races in My Races.", "計劃期間沒有賽事。請在「我的賽事」加入。")}</p>
        ) : (
          <div className="space-y-2">
            {racesList.map((r: any) => {
              const isGoal = r.priority === "A";
              return (
                <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-md border ${isGoal ? "border-primary bg-primary/5" : "border-border/50 bg-background"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold truncate">{(zh && r.race_name_zh) || r.race_name}</span>
                      {r.category && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.category}</span>}
                      {isGoal && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">{L("Goal", "目標")}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.race_date}</p>
                  </div>
                  <Select value={r.priority || "none"} onValueChange={(v) => updateRacePriority(r.id, v)} disabled={regenerating}>
                    <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="B">B</SelectItem>
                      <SelectItem value="C">C</SelectItem>
                      <SelectItem value="none">{L("None", "無")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={regenerating}
                    onClick={() => removeRace(r.id)} aria-label={L("Remove", "移除")}>
                    <X size={14} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Race predictor */}
      {canPredict && (
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Target size={18} /></div>
            <div className="flex-1">
              <h3 className="font-display font-semibold text-sm">{L("Current estimated race time", "目前預測比賽時間")}</h3>
              <p className="text-xs text-muted-foreground">{L("Based on your last 30 days of running", "根據過去 30 天跑步估算")}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-[11px] uppercase font-medium text-muted-foreground">{L("Program target", "計劃目標")}</div>
              <div className="mt-1 text-xl font-bold">{targetSec ? fmtSec(targetSec) : String(plan?.target_time || "—")}</div>
              <div className="text-[11px] text-muted-foreground">{distance}</div>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-[11px] uppercase font-medium text-muted-foreground">{L("Current estimate", "目前預測")}</div>
              <div className="mt-1 text-xl font-bold text-primary">{racePrediction ? fmtSec(racePrediction.predictedSec) : "--:--"}</div>
              <div className="text-[11px] text-muted-foreground">
                {racePrediction ? `${racePrediction.totalRuns} ${L("runs", "次跑步")}` : L("Not enough data", "資料不足")}
              </div>
            </div>
          </div>
          {racePrediction && (
            <div className="mt-3 rounded-lg border border-border bg-background p-3">
              <div className="text-[11px] uppercase font-medium text-muted-foreground mb-2">{L("Run types (30d)", "跑步類型分佈（30 天）")}</div>
              <div className="flex flex-wrap gap-2">
                {typeOrder.map((t) => {
                  const b = (racePrediction.byType as any)[t];
                  if (!b) return null;
                  const pm = Math.floor(b.avgPaceSecPerKm / 60), ps = Math.round(b.avgPaceSecPerKm % 60);
                  return (
                    <span key={t} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
                      <span className="font-semibold">{typeLabel(t, zh ? "zh" : "en")}</span>
                      <span className="text-muted-foreground">×{b.count}</span>
                      <span className="text-muted-foreground">{pm}:{String(ps).padStart(2, "0")}/km</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {racePrediction && targetSec && (() => {
            const delta = racePrediction.predictedSec - targetSec;
            const onTrack = delta <= 30, ahead = delta < -30;
            const diffSec = Math.abs(delta);
            const diffLabel = `${Math.floor(diffSec / 60)}:${String(Math.round(diffSec % 60)).padStart(2, "0")}`;
            const cls = ahead || onTrack ? "border-primary bg-primary/10 text-primary" : "border-destructive/40 bg-destructive/10 text-destructive";
            const txt = ahead ? L(`Ahead of target by ${diffLabel}`, `快過目標 ${diffLabel}`)
              : onTrack ? L("On track for the program target", "進度良好：正在達標")
              : L(`Behind target by ${diffLabel}`, `慢過目標 ${diffLabel}`);
            return <div className={`mt-3 rounded-lg border p-3 text-sm font-semibold ${cls}`}>{txt}</div>;
          })()}
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setReviewOpen(true)}>
          <Sparkles className="h-4 w-4 mr-2" />
          {L("Weekly review", "週訓練回顧")}
        </Button>
        <Button variant="outline" onClick={runFinetune} disabled={!hasRecovery || finetuning}>
          {finetuning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {L("Finetune week from HRV/RHR", "依恢復數據微調本週")}
        </Button>
        {!hasRecovery && (
          <span className="text-[11px] text-muted-foreground self-center">
            {L("Needs HRV or resting HR data", "需有 HRV 或靜息心率資料")}
          </span>
        )}
      </div>

      <WeeklyReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} lang={lang} planId={plan?.id ?? null} currentWeekIdx={weekIdx} />

      {/* Finetune dialog */}
      <Dialog open={finetuneOpen} onOpenChange={(o) => { if (!o && !finetuning && !confirmingFinetune) { setFinetuneOpen(false); setFinetuneResult(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              {L("Finetune Week from Recovery", "依恢復數據微調本週")}
            </DialogTitle>
          </DialogHeader>
          {finetuning || !finetuneResult ? (
            <div className="py-10 flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" size={20} />
              {L("AI is analyzing your HRV/RHR vs this week's plan…", "AI 正在分析你的 HRV/RHR 與本週計劃…")}
            </div>
          ) : (
            <div className="space-y-4">
              {finetuneResult.recovery && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/40 rounded-lg p-2"><div className="text-[10px] uppercase text-muted-foreground">HRV</div><div className="text-sm font-bold">{finetuneResult.recovery.avg_hrv ?? "—"}</div></div>
                  <div className="bg-muted/40 rounded-lg p-2"><div className="text-[10px] uppercase text-muted-foreground">RHR</div><div className="text-sm font-bold">{finetuneResult.recovery.avg_rhr ?? "—"}</div></div>
                  <div className="bg-muted/40 rounded-lg p-2"><div className="text-[10px] uppercase text-muted-foreground">{L("Sleep", "睡眠")}</div><div className="text-sm font-bold">{finetuneResult.recovery.avg_sleep ?? "—"}</div></div>
                </div>
              )}
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">{L("AI Recommendation", "AI 建議")}</div>
                <p className="text-sm whitespace-pre-line leading-relaxed">
                  {(zh ? finetuneResult.summary_zh : finetuneResult.summary_en) || finetuneResult.summary_en}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">{L("Proposed changes", "建議調整")}</div>
                {finetuneResult.adjusted_days.map((adj: any, i: number) => {
                  const orig = finetuneResult.original_days[i] || {};
                  const changed = adj.type !== orig.type
                    || (adj.distance_km ?? null) !== (orig.distance_km ?? null)
                    || (adj.pace ?? null) !== (orig.pace ?? null);
                  const d = adj.date ? new Date(adj.date + "T00:00:00") : null;
                  const label = d ? d.toLocaleDateString(zh ? "zh-HK" : "en", { weekday: "short", month: "short", day: "numeric" }) : `Day ${i + 1}`;
                  return (
                    <div key={i} className={`rounded-lg border p-2 text-xs ${changed ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{label}</span>
                        {changed && <span className="text-[10px] font-bold uppercase text-primary">{L("Adjusted", "已調整")}</span>}
                      </div>
                      {changed ? (
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <div className="text-muted-foreground line-through">{orig.type} {orig.distance_km ? `· ${orig.distance_km}km` : ""} {orig.pace ? `· ${orig.pace}` : ""}</div>
                          <div className="text-foreground font-medium">{adj.type} {adj.distance_km ? `· ${adj.distance_km}km` : ""} {adj.pace ? `· ${adj.pace}` : ""}</div>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-muted-foreground">{adj.type} {adj.distance_km ? `· ${adj.distance_km}km` : ""} {adj.pace ? `· ${adj.pace}` : ""}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setFinetuneOpen(false); setFinetuneResult(null); }} disabled={confirmingFinetune}>
                  {L("Cancel", "取消")}
                </Button>
                <Button className="flex-1" onClick={confirmFinetune} disabled={confirmingFinetune}>
                  {confirmingFinetune
                    ? <><Loader2 className="animate-spin mr-2" size={14} />{L("Updating…", "更新中…")}</>
                    : L("Confirm & Update Week", "確認更新本週")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const selCls = "h-8 w-full rounded border border-input bg-background px-2 text-xs";

function FieldCard({ label, children, editing, onEdit, disabled }: { label: string; children: React.ReactNode; editing: boolean; onEdit: () => void; disabled?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
        {!editing && (
          <button type="button" onClick={onEdit} disabled={disabled}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50">
            <Pencil size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ApplyRow({ onApply, onCancel, regenerating, label }: { onApply: () => void; onCancel: () => void; regenerating: boolean; label: string }) {
  return (
    <div className="flex gap-1">
      <Button size="sm" className="h-7 px-2 text-[11px] flex-1" onClick={onApply} disabled={regenerating}>
        {regenerating ? <Loader2 size={12} className="animate-spin" /> : label}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onCancel} disabled={regenerating}>
        Cancel
      </Button>
    </div>
  );
}

function ProgressBar({ label, value, target, unit, pct }: { label: string; value: number; target: number; unit: string; pct: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">
          {typeof value === "number" && unit === "km" ? value.toFixed(1) : value}
          <span className="text-xs text-muted-foreground font-normal"> / {typeof target === "number" && unit === "km" ? target.toFixed(1) : target} {unit}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
