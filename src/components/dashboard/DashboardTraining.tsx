import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Dumbbell, ChevronLeft, ChevronRight, Activity, Target, TrendingUp,
  Calendar as CalendarIcon, Settings2, Sparkles, Lock, Wand2,
} from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DesktopPageHeader from "./DesktopPageHeader";
import { TabPageSkeleton } from "@/components/ui/PageSkeleton";
import { useActivities } from "@/hooks/use-activities";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { supabase } from "@/integrations/supabase/client";
import { subscribePlanChanged } from "@/lib/planEvents";

const TrainingTab = lazy(() => import("@/components/TrainingTab"));

interface Props {
  lang: Lang;
  score: number | null;
  setScore: (s: number | null) => void;
  onLoginRequest: () => void;
}

type PlanKind = "free" | "ai" | "custom";

const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function planKindOf(p: any): PlanKind | null {
  if (!p) return null;
  if (p.goal === "free") return "free";
  if (p.goal === "custom") return "custom";
  return "ai";
}

export default function DashboardTraining({ lang, onLoginRequest }: Props) {
  const zh = lang === "zh";
  const L = (en: string, z: string) => (zh ? z : en);
  const { activities } = useActivities();
  const { user } = useAuth();
  const { isPremium } = usePremium();

  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [selectedKind, setSelectedKind] = useState<PlanKind>("ai");
  const [weekIdx, setWeekIdx] = useState(0);

  // Load user's plan
  useEffect(() => {
    if (!user) { setPlan(null); setLoadingPlan(false); return; }
    const load = async () => {
      try {
        const { data } = await supabase
          .from("training_plans" as any)
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const p = (data as any[])?.[0] || null;
        setPlan(p);
        const k = planKindOf(p);
        if (k) setSelectedKind(k);
      } finally {
        setLoadingPlan(false);
      }
    };
    load();
    const unsub = subscribePlanChanged(() => { void load(); });
    return () => { unsub(); };
  }, [user]);

  // Initialize week index near today when plan loads / kind changes
  useEffect(() => {
    if (!plan || planKindOf(plan) !== selectedKind) return;
    const planArr: any[] = Array.isArray(plan.plan_data) ? plan.plan_data : [];
    const today = new Date().toISOString().split("T")[0];
    const idx = planArr.findIndex((w: any) => (w.days || []).some((d: any) => d.date >= today));
    setWeekIdx(Math.max(0, idx));
  }, [plan, selectedKind]);

  const activePlanKind = planKindOf(plan);
  const isViewingActivePlan = activePlanKind === selectedKind;
  const planWeeks: any[] = isViewingActivePlan && Array.isArray(plan?.plan_data) ? plan.plan_data : [];
  const currentWeek = planWeeks[weekIdx];

  // Build day-by-day completion map
  const completedByDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const a of (activities || []) as any[]) {
      const d = (a.start_date_local || a.start_date || "").slice(0, 10);
      if (!d) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(a);
    }
    return m;
  }, [activities]);

  // Week KPI totals
  const totals = useMemo(() => {
    let plannedKm = 0, doneKm = 0, doneCount = 0, plannedCount = 0;
    if (currentWeek?.days) {
      for (const day of currentWeek.days as any[]) {
        if (day.distance_km) { plannedKm += day.distance_km; plannedCount += 1; }
        const done = completedByDay.get(day.date) || [];
        for (const a of done) { doneKm += (a.distance || 0) / 1000; doneCount += 1; }
      }
    }
    return { plannedKm, doneKm, doneCount, plannedCount };
  }, [currentWeek, completedByDay]);

  const progressPct = totals.plannedKm > 0 ? Math.min(100, (totals.doneKm / totals.plannedKm) * 100) : 0;
  const todayIso = isoDay(new Date());

  return (
    <div>
      <DesktopPageHeader
        title={L("Training", "訓練")}
        subtitle={L("Your training plan, week-by-week", "你的訓練計劃，逐週檢視")}
        icon={<Dumbbell className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            {L("Generate / edit plan", "生成 / 編輯計劃")}
          </Button>
        }
      />

      {/* Plan kind toggler */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <Tabs value={selectedKind} onValueChange={(v) => setSelectedKind(v as PlanKind)}>
          <TabsList>
            <TabsTrigger value="free">
              {L("Free plan", "免費計劃")}
              {activePlanKind === "free" && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {L("AI plan", "AI 計劃")}
              {!isPremium && <Lock className="h-3 w-3 ml-1 opacity-60" />}
              {activePlanKind === "ai" && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </TabsTrigger>
            <TabsTrigger value="custom">
              {L("Custom plan", "自訂計劃")}
              {activePlanKind === "custom" && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {activePlanKind && (
          <div className="text-xs text-muted-foreground">
            {L("Active: ", "目前計劃：")}
            <span className="font-medium text-foreground">
              {activePlanKind === "free" ? L("Free", "免費") : activePlanKind === "ai" ? L("AI", "AI") : L("Custom", "自訂")}
            </span>
            {plan?.distance ? ` · ${plan.distance}` : ""}
            {plan?.target_time ? ` · ${plan.target_time}` : ""}
          </div>
        )}
      </div>

      {/* No user / loading / no plan states */}
      {!user ? (
        <EmptyState
          icon={<Wand2 className="h-6 w-6" />}
          title={L("Sign in to view your training plan", "登入以查看你的訓練計劃")}
          desc={L("Create a free, AI, or custom plan and follow it day-by-day.", "建立免費、AI 或自訂計劃，按日跟進。")}
          ctaLabel={L("Sign in", "登入")}
          onCta={onLoginRequest}
        />
      ) : loadingPlan ? (
        <TabPageSkeleton />
      ) : !isViewingActivePlan ? (
        <EmptyState
          icon={selectedKind === "ai" && !isPremium ? <Lock className="h-6 w-6" /> : <Wand2 className="h-6 w-6" />}
          title={
            selectedKind === "ai" && !isPremium
              ? L("AI plan is a Premium feature", "AI 計劃為高級會員功能")
              : selectedKind === "free"
                ? L("No free plan selected yet", "尚未選擇免費計劃")
                : selectedKind === "custom"
                  ? L("No custom plan yet", "尚未建立自訂計劃")
                  : L("No AI plan yet", "尚未生成 AI 計劃")
          }
          desc={
            activePlanKind
              ? L(
                  `You currently have a ${activePlanKind} plan active. Generating a new ${selectedKind} plan will replace it.`,
                  `你目前使用「${activePlanKind === "free" ? "免費" : activePlanKind === "ai" ? "AI" : "自訂"}」計劃。建立新的計劃會取代它。`,
                )
              : L("Open the plan workspace to get started.", "開啟計劃工作區以開始。")
          }
          ctaLabel={
            selectedKind === "free"
              ? L("Browse free plans", "瀏覽免費計劃")
              : selectedKind === "custom"
                ? L("Create custom plan", "建立自訂計劃")
                : L("Generate AI plan", "生成 AI 計劃")
          }
          ctaDisabled={selectedKind === "ai" && !isPremium}
          onCta={() => setPlanOpen(true)}
        />
      ) : planWeeks.length === 0 ? (
        <EmptyState
          icon={<Wand2 className="h-6 w-6" />}
          title={L("Plan is empty", "計劃為空")}
          desc={L("Open the plan workspace to add workouts.", "開啟計劃工作區以新增訓練。")}
          ctaLabel={L("Open workspace", "開啟工作區")}
          onCta={() => setPlanOpen(true)}
        />
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <KPICard
              icon={<Activity className="h-4 w-4" />}
              label={L("Week completed", "本週完成")}
              value={`${totals.doneKm.toFixed(1)} km`}
              sub={`${totals.doneCount} ${L("sessions", "次活動")}`}
            />
            <KPICard
              icon={<Target className="h-4 w-4" />}
              label={L("Week planned", "本週計劃")}
              value={`${totals.plannedKm.toFixed(1)} km`}
              sub={`${totals.plannedCount} ${L("workouts", "個訓練")}`}
            />
            <KPICard
              icon={<TrendingUp className="h-4 w-4" />}
              label={L("Adherence", "完成率")}
              value={`${Math.round(progressPct)}%`}
              sub={
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${progressPct}%` }} />
                </div>
              }
            />
          </div>

          {/* Plan week calendar */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
                  {L("Week", "週")} {weekIdx + 1} / {planWeeks.length}
                </h3>
                {currentWeek?.focus && (
                  <span className="text-sm text-muted-foreground ml-2">— {currentWeek.focus}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setWeekIdx(Math.max(0, weekIdx - 1))} disabled={weekIdx === 0} aria-label="Previous week">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const idx = planWeeks.findIndex((w: any) => (w.days || []).some((d: any) => d.date >= todayIso));
                  setWeekIdx(Math.max(0, idx));
                }}>
                  {L("Today", "今天")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setWeekIdx(Math.min(planWeeks.length - 1, weekIdx + 1))} disabled={weekIdx >= planWeeks.length - 1} aria-label="Next week">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {(currentWeek?.days || []).map((d: any, i: number) => {
                const isToday = d.date === todayIso;
                const dayLabel = zh ? WEEKDAYS_ZH[i] : WEEKDAYS_EN[i];
                const completed = completedByDay.get(d.date) || [];
                const dateObj = d.date ? new Date(d.date + "T00:00:00") : null;
                return (
                  <div
                    key={d.date || i}
                    className={[
                      "rounded-lg border bg-background/40 min-h-[200px] flex flex-col",
                      isToday ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60",
                    ].join(" ")}
                  >
                    <div className={["px-2 py-1.5 flex items-center justify-between text-[11px] border-b",
                      isToday ? "bg-primary/10 border-primary/30" : "border-border/40"].join(" ")}>
                      <span className="font-semibold uppercase tracking-wider text-muted-foreground">{dayLabel}</span>
                      <span className={["font-display font-bold", isToday ? "text-primary" : "text-foreground"].join(" ")}>
                        {dateObj ? dateObj.getDate() : ""}
                      </span>
                    </div>
                    <div className="p-1.5 space-y-1 flex-1">
                      {!d.type && completed.length === 0 && (
                        <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground/50 italic px-1 text-center">
                          {L("Rest", "休息")}
                        </div>
                      )}
                      {d.type && (
                        <div className="rounded-md p-1.5 text-[10px] leading-tight border"
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
                      )}
                      {completed.map((a: any, idx: number) => (
                        <div key={`a-${idx}`} className="rounded-md p-1.5 text-[10px] leading-tight border border-emerald-500/30 bg-emerald-500/10">
                          <div className="font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                            ✓ {((a.distance || 0) / 1000).toFixed(1)} km
                          </div>
                          <div className="text-muted-foreground mt-0.5 truncate">{a.name || a.sport_type}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* Plan generation / editing — reuses the mobile TrainingTab in a Sheet */}
      <Sheet open={planOpen} onOpenChange={setPlanOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 overflow-y-auto">
          <SheetHeader className="px-5 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>{L("Plan workspace", "計劃工作區")}</SheetTitle>
          </SheetHeader>
          <div className="p-2">
            <Suspense fallback={<TabPageSkeleton />}>
              <TrainingTab score={null} setScore={() => {}} lang={lang} onLoginRequest={onLoginRequest} />
            </Suspense>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KPICard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="text-2xl font-display font-bold leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function EmptyState({
  icon, title, desc, ctaLabel, onCta, ctaDisabled,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  ctaLabel: string;
  onCta: () => void;
  ctaDisabled?: boolean;
}) {
  return (
    <Card className="p-10 flex flex-col items-center text-center">
      <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-lg mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-5">{desc}</p>
      <Button onClick={onCta} disabled={ctaDisabled}>{ctaLabel}</Button>
    </Card>
  );
}
