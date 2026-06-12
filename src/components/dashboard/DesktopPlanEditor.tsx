import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Loader2, Save, Trash2, Plus, AlertTriangle, Lock, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";
import { notifyPlanChanged } from "@/lib/planEvents";
import type { EditableWorkout } from "@/components/training/EditWorkoutDialog";

const EditWorkoutDialog = lazy(() => import("@/components/training/EditWorkoutDialog"));
import DesktopAiPlanControls from "./DesktopAiPlanControls";

export type PlanKind = "free" | "ai" | "custom";

interface Props {
  lang: Lang;
  selectedKind: PlanKind;
  activePlanKind: PlanKind | null;
  plan: any;
  isPremium: boolean;
  onPlanSaved: (next: any) => void;
}

const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildBlankWeeks(numWeeks: number, startDate: Date): any[] {
  const weeks: any[] = [];
  const start = new Date(startDate);
  // align to Monday
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  for (let w = 0; w < numWeeks; w++) {
    const days: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      days.push({ date: isoDay(d), type: null, distance_km: null, pace: null, description: null });
    }
    weeks.push({ focus: "", days });
  }
  return weeks;
}

export default function DesktopPlanEditor({
  lang, selectedKind, activePlanKind, plan, isPremium, onPlanSaved,
}: Props) {
  const zh = lang === "zh";
  const L = (en: string, z: string) => (zh ? z : en);
  const { user } = useAuth();

  const isEditingActive = activePlanKind === selectedKind && !!plan;
  // Free plans are editable only by premium users; AI/custom always editable when active.
  const canEdit = isEditingActive && (selectedKind !== "free" || isPremium);

  // Working copy of the plan (so edits don't fight parent state until saved)
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ weekIdx: number; dayIdx: number } | null>(null);

  // Free plan presets
  const [freePresets, setFreePresets] = useState<any[]>([]);
  const [freeDistance, setFreeDistance] = useState<string>("");

  useEffect(() => {
    if (isEditingActive) setDraft(JSON.parse(JSON.stringify(plan)));
    else setDraft(null);
  }, [isEditingActive, plan]);

  // Load free presets when relevant
  useEffect(() => {
    if (selectedKind !== "free" || isEditingActive) return;
    (async () => {
      const { data } = await supabase
        .from("free_training_plans" as any)
        .select("*")
        .order("distance");
      const list = (data as any[]) || [];
      setFreePresets(list);
      if (!freeDistance && list.length) setFreeDistance(list[0].distance);
    })();
  }, [selectedKind, isEditingActive, freeDistance]);

  const weeks: any[] = Array.isArray(draft?.plan_data) ? draft.plan_data : [];
  const todayIso = isoDay(new Date());

  const persist = async (next: any, options?: { silent?: boolean }) => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: any = {
        distance: next.distance,
        target_time: next.target_time,
        days_per_week: next.days_per_week,
        weeks: next.weeks,
        weekly_km_min: next.weekly_km_min,
        weekly_km_max: next.weekly_km_max,
        plan_data: next.plan_data,
        race_date: next.race_date,
        goal: next.goal,
      };
      const { data, error } = await supabase
        .from("training_plans" as any)
        .update(payload)
        .eq("id", next.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      const saved = data || next;
      setDraft(JSON.parse(JSON.stringify(saved)));
      onPlanSaved(saved);
      notifyPlanChanged();
      if (!options?.silent) toast.success(L("Plan saved", "已儲存計劃"));
    } catch (e: any) {
      toast.error(e.message || L("Failed to save", "儲存失敗"));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFreePreset = async (preset: any) => {
    if (!user) return;
    if (activePlanKind && activePlanKind !== "free") {
      if (!window.confirm(L(
        "This will replace your current plan. Continue?",
        "這會取代你目前的計劃，是否繼續？",
      ))) return;
    }
    setSaving(true);
    try {
      // delete prior plan(s)
      await supabase.from("training_plans" as any).delete().eq("user_id", user.id);
      const row: any = {
        user_id: user.id,
        goal: "free",
        distance: preset.distance,
        target_time: preset.target_time,
        weeks: preset.weeks,
        days_per_week: preset.days_per_week,
        weekly_km_min: preset.weekly_km_min,
        weekly_km_max: preset.weekly_km_max,
        plan_data: preset.plan_data,
      };
      const { data, error } = await supabase
        .from("training_plans" as any).insert(row).select().maybeSingle();
      if (error) throw error;
      onPlanSaved(data);
      notifyPlanChanged();
      toast.success(L("Free plan activated", "免費計劃已啟用"));
    } catch (e: any) {
      toast.error(e.message || L("Failed", "失敗"));
    } finally { setSaving(false); }
  };

  const createBlankCustom = async () => {
    if (!user) return;
    if (activePlanKind && activePlanKind !== "custom") {
      if (!window.confirm(L(
        "This will replace your current plan. Continue?",
        "這會取代你目前的計劃，是否繼續？",
      ))) return;
    }
    setSaving(true);
    try {
      await supabase.from("training_plans" as any).delete().eq("user_id", user.id);
      const row: any = {
        user_id: user.id,
        goal: "custom",
        distance: "Custom",
        target_time: null,
        weeks: 8,
        days_per_week: 4,
        plan_data: buildBlankWeeks(8, new Date()),
      };
      const { data, error } = await supabase
        .from("training_plans" as any).insert(row).select().maybeSingle();
      if (error) throw error;
      onPlanSaved(data);
      notifyPlanChanged();
      toast.success(L("Custom plan created", "已建立自訂計劃"));
    } catch (e: any) {
      toast.error(e.message || L("Failed", "失敗"));
    } finally { setSaving(false); }
  };

  const handleDeletePlan = async () => {
    if (!user || !draft?.id) return;
    if (!window.confirm(L("Delete this plan permanently?", "確定永久刪除此計劃？"))) return;
    setSaving(true);
    try {
      await supabase.from("training_plans" as any).delete().eq("id", draft.id);
      onPlanSaved(null);
      notifyPlanChanged();
      toast.success(L("Plan deleted", "已刪除計劃"));
    } finally { setSaving(false); }
  };

  const updateDay = (weekIdx: number, dayIdx: number, patch: any) => {
    const next = { ...draft, plan_data: weeks.map((w, wi) => wi !== weekIdx ? w : {
      ...w, days: w.days.map((d: any, di: number) => di !== dayIdx ? d : { ...d, ...patch }),
    }) };
    setDraft(next);
  };

  // ─────────────── No active plan of selected kind: show generator/picker ───────────────
  if (!isEditingActive) {
    return (
      <div className="p-6 space-y-5">
        {activePlanKind && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              {L(
                `You currently have a "${activePlanKind}" plan active. Activating a new ${selectedKind} plan will replace it.`,
                `你目前使用「${activePlanKind === "free" ? "免費" : activePlanKind === "ai" ? "AI" : "自訂"}」計劃，建立新的會取代它。`,
              )}
            </div>
          </div>
        )}

        {selectedKind === "free" && (
          <Card className="p-5">
            <h3 className="font-display font-semibold text-base mb-1">
              {L("Pick a free plan", "選擇免費計劃")}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {L("Choose a preset by race distance and target time.", "依比賽距離與目標時間選擇預設計劃。")}
            </p>
            <div className="flex items-center gap-2 mb-4">
              <Label className="text-sm shrink-0">{L("Distance", "距離")}</Label>
              <Select
                value={freeDistance}
                onValueChange={setFreeDistance}
              >
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from(new Set(freePresets.map((p) => p.distance))).map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {freePresets.filter((p) => p.distance === freeDistance).map((p) => (
                <Card key={p.id} className="p-4 hover:border-primary/60 transition">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{p.distance} · {p.target_time}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.weeks} {L("weeks", "週")} · {p.days_per_week} {L("days/wk", "天/週")}
                        {p.weekly_km_min ? ` · ${p.weekly_km_min}–${p.weekly_km_max} km` : ""}
                      </div>
                    </div>
                    <Button size="sm" disabled={saving} onClick={() => handleSelectFreePreset(p)}>
                      {L("Use this", "使用")}
                    </Button>
                  </div>
                </Card>
              ))}
              {freePresets.length === 0 && (
                <div className="text-sm text-muted-foreground">{L("Loading…", "載入中…")}</div>
              )}
            </div>
          </Card>
        )}

        {selectedKind === "custom" && (
          <Card className="p-6">
            <h3 className="font-display font-semibold text-base mb-1">
              {L("Create a custom plan", "建立自訂計劃")}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {L(
                "Start from a blank 8-week template, then add workouts day-by-day.",
                "從 8 週空白模板開始，逐日加入訓練。",
              )}
            </p>
            <Button onClick={createBlankCustom} disabled={saving}>
              <Plus className="h-4 w-4 mr-1.5" />
              {L("Create blank 8-week plan", "建立 8 週空白計劃")}
            </Button>
          </Card>
        )}

        {selectedKind === "ai" && (
          <Card className="p-6">
            <h3 className="font-display font-semibold text-base mb-1 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {L("AI training plan", "AI 訓練計劃")}
            </h3>
            {!isPremium ? (
              <div className="text-sm text-muted-foreground mt-2 flex items-start gap-2">
                <Lock className="h-4 w-4 mt-0.5" />
                <span>{L(
                  "AI plan generation is a Premium feature. Please upgrade to generate a personalised AI plan.",
                  "AI 計劃生成為高級會員功能，請升級以生成個人化計劃。",
                )}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">
                {L(
                  "AI plan generation is currently available through the mobile app. Once your AI plan is created, you can edit it here.",
                  "AI 計劃生成目前只在手機應用中提供。AI 計劃建立後，你可以在此編輯。",
                )}
              </p>
            )}
          </Card>
        )}
      </div>
    );
  }

  // ─────────────── Editing existing active plan ───────────────
  const planMetaEditable = canEdit && selectedKind !== "free";
  const dayEditable = canEdit;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b flex items-center justify-between gap-3 sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">
            {selectedKind === "free" ? L("Free plan", "免費計劃")
              : selectedKind === "ai" ? L("AI plan", "AI 計劃")
              : L("Custom plan", "自訂計劃")}
          </span>
          {!canEdit && selectedKind === "free" && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> {L("Read-only (Premium to edit)", "唯讀（升級可編輯）")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={handleDeletePlan} disabled={saving}>
              <Trash2 className="h-4 w-4 mr-1.5" /> {L("Delete plan", "刪除計劃")}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={() => persist(draft)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {L("Save changes", "儲存")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Plan meta */}
        {selectedKind === "ai" ? (
          <DesktopAiPlanControls
            lang={lang}
            plan={draft}
            weekIdx={(() => {
              const todayIso = isoDay(new Date());
              const idx = weeks.findIndex((w: any) => (w.days || []).some((d: any) => d.date >= todayIso));
              return Math.max(0, idx);
            })()}
            isPremium={isPremium}
            onPlanUpdated={(next) => { setDraft(next ? JSON.parse(JSON.stringify(next)) : null); onPlanSaved(next); }}
          />
        ) : (
          <Card className="p-5">
            <h3 className="font-display font-semibold text-sm uppercase tracking-wider mb-4">
              {L("Plan goals", "計劃目標")}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label={L("Distance", "距離")}>
                <Input value={draft?.distance ?? ""} disabled={!planMetaEditable}
                  onChange={(e) => setDraft({ ...draft, distance: e.target.value })} />
              </Field>
              <Field label={L("Target time", "目標時間")}>
                <Input value={draft?.target_time ?? ""} placeholder="hh:mm:ss" disabled={!planMetaEditable}
                  onChange={(e) => setDraft({ ...draft, target_time: e.target.value })} />
              </Field>
              <Field label={L("Weeks", "週數")}>
                <Input type="number" min={1} max={52} value={draft?.weeks ?? ""} disabled={!planMetaEditable}
                  onChange={(e) => setDraft({ ...draft, weeks: Number(e.target.value) || null })} />
              </Field>
              <Field label={L("Days / week", "每週天數")}>
                <Input type="number" min={1} max={7} value={draft?.days_per_week ?? ""} disabled={!planMetaEditable}
                  onChange={(e) => setDraft({ ...draft, days_per_week: Number(e.target.value) || null })} />
              </Field>
              {("race_date" in (draft || {})) && (
                <Field label={L("Race date", "比賽日期")}>
                  <Input type="date" value={draft?.race_date ?? ""} disabled={!planMetaEditable}
                    onChange={(e) => setDraft({ ...draft, race_date: e.target.value || null })} />
                </Field>
              )}
            </div>
          </Card>
        )}


        {/* Weeks */}
        <Tabs defaultValue="0" className="w-full">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="inline-flex h-auto flex-wrap">
              {weeks.map((w, i) => (
                <TabsTrigger key={i} value={String(i)} className="text-xs">
                  {L("Wk", "週")} {i + 1}
                  {w.focus ? <span className="ml-1 text-muted-foreground hidden lg:inline">· {w.focus}</span> : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {weeks.map((w, wi) => (
            <TabsContent key={wi} value={String(wi)} className="mt-4">
              <Card className="p-4">
                {planMetaEditable && (
                  <div className="mb-3">
                    <Field label={L("Week focus", "本週重點")}>
                      <Input value={w.focus || ""} onChange={(e) => {
                        const next = { ...draft, plan_data: weeks.map((ww, idx) => idx !== wi ? ww : { ...ww, focus: e.target.value }) };
                        setDraft(next);
                      }} />
                    </Field>
                  </div>
                )}
                <div className="grid grid-cols-7 gap-2">
                  {(w.days || []).map((d: any, di: number) => {
                    const isToday = d.date === todayIso;
                    const dayLabel = zh ? WEEKDAYS_ZH[di] : WEEKDAYS_EN[di];
                    const dateObj = d.date ? new Date(d.date + "T00:00:00") : null;
                    return (
                      <button
                        key={di}
                        type="button"
                        disabled={!dayEditable}
                        onClick={() => setEditing({ weekIdx: wi, dayIdx: di })}
                        className={[
                          "text-left rounded-lg border bg-background/40 min-h-[150px] flex flex-col transition",
                          isToday ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60",
                          dayEditable ? "hover:border-primary/60 cursor-pointer" : "cursor-default opacity-90",
                        ].join(" ")}
                      >
                        <div className={["px-2 py-1.5 flex items-center justify-between text-[11px] border-b",
                          isToday ? "bg-primary/10 border-primary/30" : "border-border/40"].join(" ")}>
                          <span className="font-semibold uppercase tracking-wider text-muted-foreground">{dayLabel}</span>
                          <span className={["font-display font-bold", isToday ? "text-primary" : "text-foreground"].join(" ")}>
                            {dateObj ? dateObj.getDate() : ""}
                          </span>
                        </div>
                        <div className="p-2 flex-1 text-xs">
                          {d.type ? (
                            <div className="rounded-md p-1.5 leading-tight border"
                              style={{ backgroundColor: `${d.color || "#3b82f6"}15`, borderColor: `${d.color || "#3b82f6"}40` }}>
                              <div className="font-semibold truncate" style={{ color: d.color || "#3b82f6" }}>
                                {d.title || d.type}
                              </div>
                              {d.distance_km ? (
                                <div className="text-muted-foreground mt-0.5">
                                  {d.distance_km} km{d.pace ? ` · ${d.pace}` : ""}
                                </div>
                              ) : null}
                              {d.description && (
                                <div className="text-muted-foreground/80 mt-1 line-clamp-3">{d.description}</div>
                              )}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground/60 italic">
                              {dayEditable ? L("+ Add workout", "+ 加入訓練") : L("Rest", "休息")}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Edit workout dialog */}
      {editing && draft && (
        <Suspense fallback={null}>
          <EditWorkoutDialog
            open={!!editing}
            onOpenChange={(o) => { if (!o) setEditing(null); }}
            lang={lang}
            workout={(weeks[editing.weekIdx]?.days?.[editing.dayIdx] || {}) as EditableWorkout}
            planContext={`${draft.distance || ""} ${draft.target_time || ""}`.trim() || null}
            multiSession={selectedKind !== "free"}
            onSave={async (next) => {
              updateDay(editing.weekIdx, editing.dayIdx, {
                type: next.type ?? null,
                title: next.title ?? null,
                distance_km: next.distance_km ?? null,
                pace: next.pace ?? null,
                description: next.description ?? null,
                color: next.color ?? null,
                elevation_m: next.elevation_m ?? null,
                eph: next.eph ?? null,
                sessions: next.sessions ?? undefined,
              });
              setEditing(null);
            }}
            onDelete={async () => {
              updateDay(editing.weekIdx, editing.dayIdx, {
                type: null, title: null, distance_km: null, pace: null,
                description: null, color: null, elevation_m: null, eph: null, sessions: undefined,
              });
              setEditing(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
