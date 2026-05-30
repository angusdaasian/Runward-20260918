import { lazy, Suspense, useMemo, useState } from "react";
import {
  Dumbbell, ChevronLeft, ChevronRight, Activity, Target, Sparkles,
  Settings2, TrendingUp, Calendar as CalendarIcon, Gauge,
} from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import DesktopPageHeader from "./DesktopPageHeader";
import { TabPageSkeleton } from "@/components/ui/PageSkeleton";
import { useActivities } from "@/hooks/use-activities";
import { getMainPaces, predictTime, formatTime, roadRaceDistances } from "@/lib/vdot";

const TrainingTab = lazy(() => import("@/components/TrainingTab"));

interface Props {
  lang: Lang;
  score: number | null;
  setScore: (s: number | null) => void;
  onLoginRequest: () => void;
}

const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtRange(a: Date, b: Date, zh: boolean): string {
  const loc = zh ? "zh-TW" : "en-US";
  const monthA = a.toLocaleDateString(loc, { month: "short" });
  const monthB = b.toLocaleDateString(loc, { month: "short" });
  if (monthA === monthB) return `${monthA} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`;
  return `${monthA} ${a.getDate()} – ${monthB} ${b.getDate()}, ${b.getFullYear()}`;
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardTraining({ lang, score, setScore, onLoginRequest }: Props) {
  const zh = lang === "zh";
  const L = (en: string, z: string) => (zh ? z : en);
  const { plannedWorkouts, activities } = useActivities();

  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const [planOpen, setPlanOpen] = useState(false);
  const [scoreInput, setScoreInput] = useState<string>(score != null ? String(score) : "");

  const weekEnd = addDays(weekAnchor, 6);
  const todayIso = isoDay(new Date());

  // Build 7-day grid
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekAnchor, i);
      const iso = isoDay(date);
      const planned = (plannedWorkouts || []).filter((w: any) => (w.date || "").slice(0, 10) === iso);
      const completed = (activities || []).filter((a: any) => {
        const d = a.start_date_local || a.start_date;
        return d && d.slice(0, 10) === iso;
      });
      return { date, iso, planned, completed };
    });
  }, [weekAnchor, plannedWorkouts, activities]);

  // Weekly totals
  const totals = useMemo(() => {
    let plannedKm = 0, doneKm = 0, doneCount = 0, plannedCount = 0;
    for (const d of days) {
      for (const p of d.planned) {
        plannedKm += p.distance_km || 0;
        plannedCount += 1;
      }
      for (const a of d.completed as any[]) {
        doneKm += (a.distance || 0) / 1000;
        doneCount += 1;
      }
    }
    return { plannedKm, doneKm, doneCount, plannedCount };
  }, [days]);

  // Paces & predictions (VDOT)
  const sc = typeof score === "number" && score > 0 ? score : null;
  const paces = useMemo(() => (sc ? getMainPaces(sc).slice(0, 5) : []), [sc]);
  const predictions = useMemo(() => {
    if (!sc) return [];
    const want = ["5K", "10K", "Half Marathon", "Marathon"];
    return roadRaceDistances
      .filter((d) => want.includes(d.name))
      .map((d) => ({
        name: d.name,
        nameZh: d.nameZh,
        time: formatTime(predictTime(sc, d.meters)),
      }));
  }, [sc]);

  const progressPct = totals.plannedKm > 0 ? Math.min(100, (totals.doneKm / totals.plannedKm) * 100) : 0;

  return (
    <div>
      <DesktopPageHeader
        title={L("Training", "訓練")}
        subtitle={L(
          "Calendar-first weekly view, with paces and race predictions",
          "以週為單位的日曆檢視，配速與比賽預測一覽",
        )}
        icon={<Dumbbell className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              {L("Generate / edit plan", "生成 / 編輯計劃")}
            </Button>
          </div>
        }
      />

      {/* Top KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
        <KPICard
          icon={<Gauge className="h-4 w-4" />}
          label={L("Running score", "跑力分數")}
          value={sc ? String(Math.round(sc)) : "—"}
          sub={L("VDOT-based", "以 VDOT 計算")}
        />
      </div>

      {/* Calendar + sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        {/* Week calendar */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
                {L("Week view", "週檢視")}
              </h3>
              <span className="text-sm text-muted-foreground ml-2">
                {fmtRange(weekAnchor, weekEnd, zh)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeekAnchor(startOfWeek(new Date()))}
              >
                {L("Today", "今天")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {days.map((d, i) => {
              const isToday = d.iso === todayIso;
              const dayLabel = zh ? WEEKDAYS_ZH[i] : WEEKDAYS_EN[i];
              const dayCompletedKm = (d.completed as any[]).reduce(
                (s, a: any) => s + (a.distance || 0) / 1000,
                0,
              );
              return (
                <div
                  key={d.iso}
                  className={[
                    "rounded-lg border bg-background/40 min-h-[180px] flex flex-col",
                    isToday ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "px-2 py-1.5 flex items-center justify-between text-[11px] border-b",
                      isToday ? "bg-primary/10 border-primary/30" : "border-border/40",
                    ].join(" ")}
                  >
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                      {dayLabel}
                    </span>
                    <span
                      className={[
                        "font-display font-bold",
                        isToday ? "text-primary" : "text-foreground",
                      ].join(" ")}
                    >
                      {d.date.getDate()}
                    </span>
                  </div>
                  <div className="p-1.5 space-y-1 flex-1">
                    {d.planned.length === 0 && (d.completed as any[]).length === 0 && (
                      <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground/50 italic px-1 text-center">
                        {L("Rest", "休息")}
                      </div>
                    )}
                    {d.planned.map((p: any, idx: number) => (
                      <div
                        key={`p-${idx}`}
                        className="rounded-md p-1.5 text-[10px] leading-tight border"
                        style={{
                          backgroundColor: `${p.color || "#3b82f6"}15`,
                          borderColor: `${p.color || "#3b82f6"}40`,
                        }}
                      >
                        <div
                          className="font-semibold truncate"
                          style={{ color: p.color || "#3b82f6" }}
                        >
                          {p.title || p.type}
                        </div>
                        {p.distance_km ? (
                          <div className="text-muted-foreground mt-0.5">
                            {p.distance_km} km{p.pace ? ` · ${p.pace}` : ""}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {(d.completed as any[]).map((a: any, idx: number) => (
                      <div
                        key={`a-${idx}`}
                        className="rounded-md p-1.5 text-[10px] leading-tight border border-emerald-500/30 bg-emerald-500/10"
                      >
                        <div className="font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                          ✓ {((a.distance || 0) / 1000).toFixed(1)} km
                        </div>
                        <div className="text-muted-foreground mt-0.5 truncate">
                          {a.name || a.sport_type}
                        </div>
                      </div>
                    ))}
                  </div>
                  {dayCompletedKm > 0 && (
                    <div className="px-2 py-1 text-[10px] text-muted-foreground border-t border-border/40 bg-muted/20">
                      {dayCompletedKm.toFixed(1)} km {L("done", "完成")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* VDOT / Score */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
                {L("Running score", "跑力分數")}
              </h3>
            </div>
            <div className="flex items-end gap-2">
              <Input
                type="number"
                inputMode="decimal"
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
                placeholder={L("e.g. 45", "例如 45")}
                className="h-9"
              />
              <Button
                size="sm"
                onClick={() => {
                  const n = parseFloat(scoreInput);
                  setScore(Number.isFinite(n) && n > 0 ? n : null);
                }}
              >
                {L("Apply", "套用")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              {L(
                "Drives target paces and race-time predictions across the dashboard.",
                "用於整個儀表板的目標配速與比賽時間預測。",
              )}
            </p>
          </Card>

          {/* Paces */}
          <Card className="p-5">
            <h3 className="font-display font-semibold text-sm uppercase tracking-wider mb-3">
              {L("Target paces", "目標配速")}
            </h3>
            {paces.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                {L("Set a running score to see paces.", "設定跑力分數以查看配速。")}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium pb-1.5">{L("Zone", "區間")}</th>
                    <th className="text-right font-medium pb-1.5">/ km</th>
                    <th className="text-right font-medium pb-1.5">/ 400m</th>
                  </tr>
                </thead>
                <tbody>
                  {paces.map((p) => (
                    <tr key={p.name} className="border-t border-border/40">
                      <td className="py-1.5 font-medium">{zh ? p.nameZh : p.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.kmPace}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {p.lapPace}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Race predictions */}
          <Card className="p-5">
            <h3 className="font-display font-semibold text-sm uppercase tracking-wider mb-3">
              {L("Race predictions", "比賽預測")}
            </h3>
            {predictions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                {L("Set a running score above.", "請先設定跑力分數。")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {predictions.map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/40"
                  >
                    <span className="text-xs font-medium">{zh ? r.nameZh : r.name}</span>
                    <span className="text-sm font-display font-semibold tabular-nums">{r.time}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>

      {/* Plan generation / editing — reuses the mobile TrainingTab in a Sheet */}
      <Sheet open={planOpen} onOpenChange={setPlanOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 overflow-y-auto"
        >
          <SheetHeader className="px-5 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>{L("Plan workspace", "計劃工作區")}</SheetTitle>
          </SheetHeader>
          <div className="p-2">
            <Suspense fallback={<TabPageSkeleton />}>
              <TrainingTab
                score={score}
                setScore={setScore}
                lang={lang}
                onLoginRequest={onLoginRequest}
              />
            </Suspense>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KPICard({
  icon, label, value, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
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
