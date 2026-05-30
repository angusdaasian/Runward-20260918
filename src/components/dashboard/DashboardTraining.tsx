import { lazy, Suspense, useMemo } from "react";
import { Dumbbell, CalendarDays, Flame, Target, TrendingUp } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import DesktopPageHeader from "./DesktopPageHeader";
import { TabPageSkeleton } from "@/components/ui/PageSkeleton";
import { useActivities } from "@/hooks/use-activities";

const TrainingTab = lazy(() => import("@/components/TrainingTab"));

interface Props {
  lang: Lang;
  score: number | null;
  setScore: (s: number | null) => void;
  onLoginRequest: () => void;
}

/**
 * Desktop transformation for the mobile TrainingTab.
 *
 * We deliberately REUSE the existing TrainingTab component (all of its
 * hooks, edge-function calls, plan logic, dialogs, etc.) and only restyle
 * its presentation for wide screens via wrapper CSS overrides. The mobile
 * file at src/components/TrainingTab.tsx is NOT modified.
 *
 * Overrides:
 *  - Remove the mobile `max-w-lg mx-auto` clamp so content fills the column.
 *  - Stretch inner `px-5` paddings to the desktop container.
 *  - Convert the underline-tab section switcher into a wider chip row.
 *  - Widen the paces/equivalent tables to breathe with extra columns.
 */
export default function DashboardTraining({ lang, score, setScore, onLoginRequest }: Props) {
  const zh = lang === "zh";
  const { plannedWorkouts, activities } = useActivities();

  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (plannedWorkouts || [])
      .filter((w) => new Date(w.date) >= today)
      .slice(0, 10);
  }, [plannedWorkouts]);

  // Quick stats for the desktop right rail
  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);

    const thisWeek = (activities || []).filter((a: any) => {
      const d = new Date(a.start_date_local || a.start_date || a.date);
      return d >= weekStart;
    });
    const km = thisWeek.reduce(
      (s: number, a: any) => s + (a.distance ? a.distance / 1000 : 0),
      0,
    );
    const sessions = thisWeek.length;
    const plannedThisWeek = (plannedWorkouts || []).filter((w) => {
      const d = new Date(w.date);
      return d >= weekStart && d <= new Date(weekStart.getTime() + 7 * 86400000);
    });
    const plannedKm = plannedThisWeek.reduce(
      (s, w: any) => s + (w.distance_km || 0),
      0,
    );
    return { km, sessions, plannedKm, plannedSessions: plannedThisWeek.length };
  }, [activities, plannedWorkouts]);

  return (
    <div>
      <DesktopPageHeader
        title={zh ? "訓練計畫" : "Training plan"}
        subtitle={
          zh
            ? "管理本週訓練、配速與比賽備戰"
            : "Plan your week, dial in paces, and gear up for your goal race"
        }
        icon={<Dumbbell className="h-5 w-5" />}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <Card
          className={[
            "p-0 overflow-hidden bg-card/40 border-border/60",
            // Reuse the mobile TrainingTab but neutralise its mobile clamp
            "[&_.max-w-lg]:!max-w-none",
            "[&_.pb-8]:!pb-2",
            // Loosen the 5-unit gutters down a touch — the Card already pads
            "[&_.px-5]:!px-6",
            // Spread the underline section toggle across full width nicely
            "[&_.pt-6]:!pt-5",
          ].join(" ")}
        >
          <Suspense fallback={<TabPageSkeleton />}>
            <TrainingTab
              score={score}
              setScore={setScore}
              lang={lang}
              onLoginRequest={onLoginRequest}
            />
          </Suspense>
        </Card>

        {/* ── Right rail (desktop only) ───────────────────────────────── */}
        <aside className="space-y-4">
          {/* Week-at-a-glance */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
                {zh ? "本週" : "This week"}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {zh ? "完成" : "Done"}
                </div>
                <div className="text-2xl font-display font-bold leading-tight mt-0.5">
                  {stats.km.toFixed(1)}
                  <span className="text-xs font-medium text-muted-foreground ml-1">km</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {stats.sessions} {zh ? "次活動" : "sessions"}
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {zh ? "計劃" : "Planned"}
                </div>
                <div className="text-2xl font-display font-bold leading-tight mt-0.5">
                  {stats.plannedKm.toFixed(1)}
                  <span className="text-xs font-medium text-muted-foreground ml-1">km</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {stats.plannedSessions} {zh ? "個訓練" : "workouts"}
                </div>
              </div>
            </div>
            {stats.plannedKm > 0 && (
              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (stats.km / stats.plannedKm) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1.5">
                  {Math.round((stats.km / Math.max(1, stats.plannedKm)) * 100)}%{" "}
                  {zh ? "完成週目標" : "of weekly target"}
                </div>
              </div>
            )}
          </Card>

          {/* Upcoming workouts */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
                {zh ? "即將到來" : "Upcoming"}
              </h3>
            </div>
            {upcoming.length === 0 ? (
              <div className="py-4 text-center">
                <Target className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {zh ? "尚無計劃訓練" : "No planned workouts"}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcoming.map((w: any, i: number) => {
                  const d = new Date(w.date);
                  const isToday =
                    d.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={`${w.date}-${i}`}
                      className={[
                        "flex items-center gap-3 p-2 rounded-md transition-colors",
                        isToday ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <div
                        className="h-11 w-11 rounded-md flex flex-col items-center justify-center text-[10px] font-bold shrink-0"
                        style={{
                          backgroundColor: `${w.color}20`,
                          color: w.color,
                        }}
                      >
                        <span className="leading-none text-sm">
                          {d.getDate()}
                        </span>
                        <span className="leading-none mt-0.5 opacity-70 uppercase">
                          {d.toLocaleDateString(zh ? "zh-TW" : "en-US", { month: "short" })}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">
                          {w.title || w.type}
                          {isToday && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-px rounded bg-primary text-primary-foreground">
                              {zh ? "今日" : "Today"}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {w.distance_km ? `${w.distance_km} km` : ""}
                          {w.distance_km && w.pace ? " · " : ""}
                          {w.pace || ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Tips */}
          <Card className="p-5 bg-gradient-to-br from-primary/5 via-card to-card border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
                {zh ? "訓練提示" : "Coach tip"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {zh
                ? "80% 的跑步應該在輕鬆配速下完成（Z1–Z2），剩下 20% 才用於節奏跑與間歇。讓配速分頁告訴你準確的區間。"
                : "Keep ~80% of your weekly mileage in Z1–Z2 easy zones, and reserve ~20% for tempo and intervals. Use the Paces tab to dial in exact ranges."}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
