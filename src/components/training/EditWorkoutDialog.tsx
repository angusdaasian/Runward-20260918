import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, Info, Plus, X, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";
import type { WorkoutSession, WorkoutStep, WorkoutStepKind, HrTarget } from "@/lib/planTypes";
import { genSessionId, summarizeDay } from "@/lib/planTypes";
import { suggestPaceAndHr, type SuggestActivity, type SuggestProfile } from "@/lib/paceSuggest";
import { splitIntervalDay } from "@/lib/splitIntervalSessions";

export interface EditableWorkout {
  type?: string | null;
  title?: string | null;
  distance_km?: number | null;
  pace?: string | null;
  description?: string | null;
  color?: string | null;
  elevation_m?: number | null;
  eph?: number | null;
  /** Optional multi-session day. When present, overrides the legacy single-workout fields. */
  sessions?: WorkoutSession[];
  hr_target?: HrTarget | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  workout: EditableWorkout;
  planContext?: string | null;
  onSave: (next: EditableWorkout) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  title?: string;
  /** Enable multi-session + warmup/cooldown + auto-suggest (AI plan + Custom only). */
  multiSession?: boolean;
  /** When true, open with one extra empty session appended (for "Add another" from calendar). */
  appendNewSession?: boolean;
  /** Recent runs for auto-suggest (last 30 days). */
  recentActivities?: SuggestActivity[] | null;
  /** Profile for HR zones. */
  profile?: SuggestProfile | null;
  /** Plan target race time, used as fallback for pace suggestion. */
  targetTime?: { distance_m: number; seconds: number } | null;
}

type Verdict = "ok" | "caution" | "risky";

const TYPE_OPTIONS: { id: string; en: string; zh: string; color: string; descEn: string; descZh: string }[] = [
  { id: "Warmup", en: "Warmup", zh: "熱身", color: "#fcd34d",
    descEn: "Easy jog to raise heart rate and prime muscles before the main effort.",
    descZh: "輕鬆慢跑提升心率，為主要訓練做好準備。" },
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
  { id: "Cooldown", en: "Cooldown", zh: "緩和", color: "#7dd3fc",
    descEn: "Easy jog after the main effort to flush legs and lower heart rate gradually.",
    descZh: "主要訓練後輕鬆慢跑，幫助雙腿恢復並逐步降低心率。" },
  { id: "Trail Run", en: "Trail Run", zh: "越野跑", color: "#84cc16",
    descEn: "Off-road run with elevation. Effort guided by EpH (Effort per Hour) instead of flat pace.",
    descZh: "越野跑，包含爬升。以 EpH（每小時努力分數）替代平路配速。" },
  { id: "Trail Race", en: "Trail Race", zh: "越野賽", color: "#65a30d",
    descEn: "Trail race effort. Pace is guided by EpH (distance_km + elevation_m/100 per hour).",
    descZh: "越野賽，以 EpH（每小時的距離公里 + 爬升米/100）為強度依據。" },
  { id: "Rest", en: "Rest", zh: "休息", color: "#64748b",
    descEn: "Full rest day. Let the body absorb training and rebuild.",
    descZh: "完全休息日，讓身體吸收訓練並修復。" },
];

const STEP_KINDS: { id: WorkoutStepKind; en: string; zh: string }[] = [
  { id: "warmup", en: "Warmup", zh: "熱身" },
  { id: "main", en: "Main", zh: "主項" },
  { id: "interval", en: "Interval", zh: "間歇" },
  { id: "recovery", en: "Recovery", zh: "恢復" },
  { id: "cooldown", en: "Cooldown", zh: "緩和" },
];

const normalizeType = (t?: string | null): string => {
  if (!t) return "";
  const map: Record<string, string> = {
    Easy: "Easy Run",
    Tempo: "Tempo Run",
    Long: "Long Run",
    Recovery: "Recovery Run",
    Progression: "Progression Run",
    Intervals: "Interval",
    "Warm Up": "Warmup",
    "Cool Down": "Cooldown",
  };
  return map[t] || t;
};

function typeColor(type: string): string {
  return TYPE_OPTIONS.find((o) => o.id === type)?.color ?? "#94a3b8";
}

function parseIntervalDesc(desc?: string | null): { reps: number; distM: number; rest: string | null } | null {
  if (!desc) return null;
  const a = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|km)\b/i.exec(desc);
  const b = /(\d+(?:\.\d+)?)\s*(m|km)\s*[x×]\s*(\d+)\b/i.exec(desc);
  if (!a && !b) return null;
  const reps = a ? parseInt(a[1], 10) : parseInt(b![3], 10);
  const val = parseFloat(a ? a[2] : b![1]);
  const unit = (a ? a[3] : b![2]).toLowerCase();
  const distM = unit === "km" ? val * 1000 : val;
  if (reps < 2 || reps > 30 || distM < 50 || distM > 10000) return null;
  const r = /(?:rest|recovery|jog|休息|恢復)\s*(?:of\s*)?([\d:]+\s*(?:s|sec|min|m)?|\d+\s*['′"″]?)/i.exec(desc);
  return { reps, distM, rest: r ? r[1].trim() : null };
}

function seedStepsForType(s: WorkoutSession): WorkoutSession {
  if (s.steps && s.steps.length > 0) return s;
  const t = normalizeType(s.type);
  if (t === "Interval") {
    const p = parseIntervalDesc(s.description);
    const step: WorkoutStep = p
      ? { kind: "interval", reps: p.reps, distance_m: p.distM, pace: s.pace ?? null, rest: p.rest }
      : { kind: "interval", reps: 5, distance_m: 800, pace: s.pace ?? null, rest: "90s" };
    return { ...s, steps: [step] };
  }
  if (t === "Warmup") return { ...s, steps: [{ kind: "warmup", distance_km: s.distance_km ?? 1.5, pace: s.pace ?? null }] };
  if (t === "Cooldown") return { ...s, steps: [{ kind: "cooldown", distance_km: s.distance_km ?? 1.5, pace: s.pace ?? null }] };
  return s;
}

function sessionsFromWorkout(w: EditableWorkout): WorkoutSession[] {
  // If a legacy single-workout Interval is opened, auto-split into 3 sessions so the
  // sequence shows Warmup + Intervals + Cooldown structured steps.
  let base: WorkoutSession[] = [];
  if (Array.isArray(w.sessions) && w.sessions.length > 0) {
    base = w.sessions.map((s) => ({ ...s, id: s.id || genSessionId(), type: normalizeType(s.type) }));
  } else if (w.type || w.distance_km) {
    const t = normalizeType(w.type || "");
    if ((t === "Interval") && w.distance_km) {
      const split = splitIntervalDay({
        type: "Interval",
        title: w.title ?? null,
        description: w.description ?? null,
        distance_km: w.distance_km ?? null,
        pace: w.pace ?? null,
        color: w.color ?? null,
      }, {});
      if (Array.isArray(split.sessions) && split.sessions.length > 0) {
        base = split.sessions.map((s: any) => ({ ...s, id: s.id || genSessionId(), type: normalizeType(s.type) }));
      }
    }
    if (base.length === 0) {
      base = [{
        id: genSessionId(),
        type: t || "Easy Run",
        title: w.title ?? null,
        distance_km: w.distance_km ?? null,
        pace: w.pace ?? null,
        description: w.description ?? null,
        color: w.color ?? null,
        elevation_m: w.elevation_m ?? null,
        eph: w.eph ?? null,
        hr_target: w.hr_target ?? null,
        steps: [],
      }];
    }
  }
  return base.map(seedStepsForType);
}

const EditWorkoutDialog = ({
  open, onOpenChange, lang, workout, planContext, onSave, onDelete, title,
  multiSession = false, appendNewSession = false,
  recentActivities = null, profile = null, targetTime = null,
}: Props) => {
  const isZh = lang === "zh";
  const initSessions = (): WorkoutSession[] => {
    const base = sessionsFromWorkout(workout);
    if (appendNewSession) {
      base.push({
        id: genSessionId(),
        time_of_day: base.length === 1 ? "PM" : null,
        type: "Easy Run", distance_km: null, pace: null, description: null,
        color: typeColor("Easy Run"), steps: [],
      });
    }
    return base;
  };
  const [sessions, setSessions] = useState<WorkoutSession[]>(initSessions);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [validating, setValidating] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [suggestSource, setSuggestSource] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setSessions(initSessions());
      // Auto-expand the steps panel — that's where the real structure lives now.
      setExpandedSteps({});
      setVerdict(null);
      setFeedback("");
      setNeedsConfirm(false);
      setSuggestSource({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workout, appendNewSession]);

  const updateSession = (idx: number, patch: Partial<WorkoutSession>) => {
    setSessions((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    setVerdict(null); setNeedsConfirm(false);
  };

  const addSession = () => {
    setSessions((prev) => [...prev, {
      id: genSessionId(),
      time_of_day: prev.length === 0 ? null : (prev.length === 1 ? "PM" : null),
      type: "Easy Run",
      distance_km: null, pace: null, description: null,
      color: typeColor("Easy Run"),
      steps: [],
    }]);
    setVerdict(null); setNeedsConfirm(false);
  };

  const removeSession = (idx: number) => {
    setSessions((prev) => prev.filter((_, i) => i !== idx));
    setVerdict(null); setNeedsConfirm(false);
  };

  const addStep = (sIdx: number, kind: WorkoutStepKind = "main") => {
    const s = sessions[sIdx];
    const base: WorkoutStep = kind === "interval"
      ? { kind, reps: 5, distance_m: 800, pace: s.pace ?? null, rest: "90s" }
      : { kind, distance_km: null, pace: s.pace ?? null };
    const steps = [...(s.steps ?? []), base];
    updateSession(sIdx, { steps });
  };

  const updateStep = (sIdx: number, stIdx: number, patch: Partial<WorkoutStep>) => {
    const s = sessions[sIdx];
    const steps = (s.steps ?? []).map((st, i) => (i === stIdx ? { ...st, ...patch } : st));
    updateSession(sIdx, { steps });
  };

  const removeStep = (sIdx: number, stIdx: number) => {
    const s = sessions[sIdx];
    const steps = (s.steps ?? []).filter((_, i) => i !== stIdx);
    updateSession(sIdx, { steps });
  };

  const doSuggest = (sIdx: number) => {
    const s = sessions[sIdx];
    const sug = suggestPaceAndHr({
      type: s.type, profile, recentActivities, targetTime,
    });
    const patch: Partial<WorkoutSession> = {};
    if (sug.pace) patch.pace = sug.pace;
    if (sug.bpm_low && sug.bpm_high) patch.hr_target = { zone: sug.zone ?? undefined, bpm_low: sug.bpm_low, bpm_high: sug.bpm_high };
    updateSession(sIdx, patch);
    const label =
      sug.source === "recent" ? (isZh ? "根據過去 30 天" : "from last 30 days") :
      sug.source === "target" ? (isZh ? "根據目標時間" : "from target time") :
      sug.source === "profile" ? (isZh ? "根據心率區間" : "from HR zones") :
      (isZh ? "未能建議" : "no suggestion");
    setSuggestSource((prev) => ({ ...prev, [s.id]: label }));
    if (sug.source === "none") toast.message(isZh ? "未有足夠資料建議配速" : "Not enough data to suggest pace");
  };

  const buildEdited = (): EditableWorkout => {
    const cleanSessions = sessions.map((s) => ({
      ...s,
      type: normalizeType(s.type),
      color: typeColor(normalizeType(s.type)),
    }));
    const summary = summarizeDay(cleanSessions);
    return {
      ...workout,
      ...summary,
      sessions: cleanSessions.length > 1 ? cleanSessions : undefined,
      // For single session, mirror to top-level fields so legacy readers work; drop sessions key.
    } as EditableWorkout;
  };

  const isUnchanged = (): boolean => {
    const next = buildEdited();
    return JSON.stringify({ s: next.sessions, t: next.type, d: next.distance_km, p: next.pace, desc: next.description })
      === JSON.stringify({ s: workout.sessions, t: workout.type, d: workout.distance_km, p: workout.pace, desc: workout.description });
  };

  const handleSaveClick = async () => {
    if (sessions.length === 0) {
      toast.error(isZh ? "請至少加入一個訓練" : "Add at least one workout");
      return;
    }
    if (isUnchanged()) { onOpenChange(false); return; }
    if (verdict === "ok" || needsConfirm) { await persist(); return; }
    setValidating(true);
    try {
      const next = buildEdited();
      const { data, error } = await supabase.functions.invoke("validate-workout-edit", {
        body: { lang, original: workout, edited: next, planContext: planContext ?? null },
      });
      if (error) throw error;
      const v = (data as any)?.verdict as Verdict | undefined;
      const fb = (data as any)?.feedback as string | undefined;
      const newDesc = (data as any)?.updatedDescription as string | undefined;
      setVerdict(v ?? "caution");
      setFeedback(fb ?? "");
      if (v === "ok") {
        await persist(newDesc?.trim() || undefined);
      } else {
        setNeedsConfirm(true);
      }
    } catch (e) {
      console.error("[EditWorkoutDialog] validate error:", e);
      // If validator is unavailable, fall back to direct save
      await persist();
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

  const showMulti = multiSession;
  const isTrailType = (t: string) => t === "Trail Run" || t === "Trail Race";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? (isZh ? "編輯訓練" : "Edit Workout")}</DialogTitle>
        </DialogHeader>

        {showMulti && (
          <div className="flex items-center justify-between -mt-1 mb-1">
            <span className="text-xs text-muted-foreground">
              {sessions.length > 1
                ? (isZh ? `本日 ${sessions.length} 個訓練` : `${sessions.length} sessions today`)
                : (isZh ? "可加入第二個訓練（例如下午跑）" : "You can add a second session (e.g. PM run)")}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={addSession}>
              <Plus size={14} className="mr-1" /> {isZh ? "新增訓練" : "Add session"}
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {sessions.map((s, sIdx) => {
            const trail = isTrailType(s.type);
            const stepsExpanded = expandedSteps[s.id] ?? ((s.steps?.length ?? 0) > 0);
            const sourceLabel = suggestSource[s.id];
            return (
              <div key={s.id} className="border border-border rounded-lg p-3 space-y-3 relative">
                {showMulti && sessions.length > 1 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: typeColor(s.type) }} />
                      <span className="text-xs font-medium text-muted-foreground">
                        {isZh ? `訓練 ${sIdx + 1}` : `Session ${sIdx + 1}`}
                      </span>
                      <select
                        className="text-xs rounded border border-input bg-background px-1.5 py-0.5"
                        value={s.time_of_day ?? ""}
                        onChange={(e) => updateSession(sIdx, { time_of_day: e.target.value || null })}
                      >
                        <option value="">{isZh ? "全日" : "Any time"}</option>
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSession(sIdx)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      aria-label="Remove session"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    {isZh ? "活動類型" : "Activity Type"}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: typeColor(s.type) }} />
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={s.type}
                      onChange={(e) => {
                        const newType = e.target.value;
                        const opt = TYPE_OPTIONS.find((o) => o.id === newType);
                        const patch: Partial<WorkoutSession> = {
                          type: newType,
                          color: opt?.color,
                          description: opt ? (isZh ? opt.descZh : opt.descEn) : s.description,
                        };
                        if (newType === "Interval" && (!s.steps || s.steps.length === 0)) {
                          patch.steps = [{ kind: "interval", reps: 5, distance_m: 800, pace: s.pace ?? null, rest: "90s" }];
                        } else if (newType === "Warmup" && (!s.steps || s.steps.length === 0)) {
                          patch.steps = [{ kind: "warmup", distance_km: s.distance_km ?? 1.5, pace: s.pace ?? null }];
                        } else if (newType === "Cooldown" && (!s.steps || s.steps.length === 0)) {
                          patch.steps = [{ kind: "cooldown", distance_km: s.distance_km ?? 1.5, pace: s.pace ?? null }];
                        }
                        updateSession(sIdx, patch);
                        if (newType === "Interval") setExpandedSteps((p) => ({ ...p, [s.id]: true }));
                      }}
                    >
                      {!TYPE_OPTIONS.some((o) => o.id === s.type) && s.type && (
                        <option value={s.type}>{s.type}</option>
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
                    value={s.distance_km != null ? String(s.distance_km) : ""}
                    onChange={(e) => updateSession(sIdx, { distance_km: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>

                {trail ? (
                  <>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        {isZh ? "爬升 (米)" : "Elevation Gain (m)"}
                      </label>
                      <Input
                        type="number" min="0" step="10"
                        value={s.elevation_m != null ? String(s.elevation_m) : ""}
                        onChange={(e) => updateSession(sIdx, { elevation_m: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        {isZh ? "EpH (每小時努力分數)" : "EpH (Effort per Hour)"}
                      </label>
                      <Input
                        type="number" min="0" step="0.1"
                        value={s.eph != null ? String(s.eph) : ""}
                        onChange={(e) => updateSession(sIdx, { eph: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-foreground">
                        {isZh ? "配速 (例: 5:30/km)" : "Pace (e.g. 5:30/km)"}
                      </label>
                      {showMulti && (
                        <button
                          type="button"
                          onClick={() => doSuggest(sIdx)}
                          className="text-xs flex items-center gap-1 text-primary hover:underline"
                        >
                          <Sparkles size={12} /> {isZh ? "建議" : "Suggest"}
                        </button>
                      )}
                    </div>
                    <Input
                      type="text" placeholder="5:30/km"
                      value={s.pace ?? ""}
                      onChange={(e) => updateSession(sIdx, { pace: e.target.value })}
                    />
                    {showMulti && s.hr_target?.bpm_low && s.hr_target?.bpm_high ? (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {isZh ? `心率 ${s.hr_target.bpm_low}-${s.hr_target.bpm_high} bpm` : `HR ${s.hr_target.bpm_low}-${s.hr_target.bpm_high} bpm`}
                        {s.hr_target.zone ? ` · Z${s.hr_target.zone}` : ""}
                      </p>
                    ) : null}
                    {sourceLabel && (
                      <p className="text-[11px] text-muted-foreground mt-1">{sourceLabel}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    {isZh ? "描述" : "Description"}
                  </label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                    value={s.description ?? ""}
                    onChange={(e) => updateSession(sIdx, { description: e.target.value })}
                  />
                </div>

                {showMulti && (
                  <div className="border-t border-border pt-2">
                    <button
                      type="button"
                      onClick={() => setExpandedSteps((p) => ({ ...p, [s.id]: !stepsExpanded }))}
                      className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      {stepsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {isZh ? "步驟 (熱身/主項/緩和)" : "Steps (warmup / main / cooldown)"}
                      {(s.steps?.length ?? 0) > 0 ? ` · ${s.steps!.length}` : ""}
                    </button>
                    {stepsExpanded && (
                      <div className="mt-2 space-y-2">
                        {(s.steps ?? []).map((st, stIdx) => (
                          <div key={stIdx} className="grid grid-cols-12 gap-1 items-center">
                            <select
                              className="col-span-4 text-xs rounded border border-input bg-background px-1.5 py-1"
                              value={st.kind}
                              onChange={(e) => updateStep(sIdx, stIdx, { kind: e.target.value as WorkoutStepKind })}
                            >
                              {STEP_KINDS.map((k) => (
                                <option key={k.id} value={k.id}>{isZh ? k.zh : k.en}</option>
                              ))}
                            </select>
                            <Input
                              className="col-span-3 h-8 text-xs"
                              type="number" placeholder="km"
                              value={st.distance_km != null ? String(st.distance_km) : ""}
                              onChange={(e) => updateStep(sIdx, stIdx, { distance_km: e.target.value ? Number(e.target.value) : null })}
                            />
                            <Input
                              className="col-span-4 h-8 text-xs"
                              type="text" placeholder="pace"
                              value={st.pace ?? ""}
                              onChange={(e) => updateStep(sIdx, stIdx, { pace: e.target.value })}
                            />
                            <button
                              type="button"
                              onClick={() => removeStep(sIdx, stIdx)}
                              className="col-span-1 text-muted-foreground hover:text-destructive flex justify-center"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addStep(sIdx)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Plus size={12} /> {isZh ? "新增步驟" : "Add step"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {showMulti && (
            <Button
              type="button" variant="outline" size="sm" className="w-full"
              onClick={addSession}
            >
              <Plus size={14} className="mr-1" /> {isZh ? "新增同日訓練" : "Add another session this day"}
            </Button>
          )}

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
              variant="destructive" className="w-full"
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
