import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity as ActivityIcon,
  TrendingUp,
  Timer,
  Mountain,
  Flame,
  Calendar,
  ChevronRight,
  Trophy,
  Dumbbell,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useActivities, type StravaActivity } from "@/hooks/use-activities";
import type { Lang } from "@/lib/i18n";
import DashboardMonthlyChallenge from "./DashboardMonthlyChallenge";
import DashboardActivityDetail from "./DashboardActivityDetail";
import { useSimpleMode } from "@/hooks/use-simple-mode";

type Props = {
  lang: Lang;
  onNavigate: (view: "training" | "races" | "community" | "analytics") => void;
};

function fmtDistance(meters: number) {
  return (meters / 1000).toFixed(1);
}
function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtPace(metersPerSec: number) {
  if (!metersPerSec) return "—";
  const secPerKm = 1000 / metersPerSec;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export default function DashboardOverview({ lang, onNavigate }: Props) {
  const zh = lang === "zh";
  const { activities, plannedWorkouts, userRaces, profile } = useActivities();
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null);
  const [simpleMode] = useSimpleMode();

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const weekly = (activities || []).filter((a) => new Date(a.start_date) >= weekStart);
    const monthly = (activities || []).filter((a) => new Date(a.start_date) >= monthStart);

    const sum = (arr: typeof activities, key: keyof (typeof activities)[number]) =>
      (arr || []).reduce((s, a) => s + (Number(a[key]) || 0), 0);

    return {
      weeklyKm: sum(weekly, "distance") / 1000,
      weeklyTime: sum(weekly, "moving_time"),
      weeklyCount: weekly.length,
      monthlyKm: sum(monthly, "distance") / 1000,
      monthlyElev: sum(monthly, "total_elevation_gain"),
      monthlyCount: monthly.length,
    };
  }, [activities]);

  const recent = (activities || []).slice(0, 6);

  const upcomingWorkouts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (plannedWorkouts || [])
      .filter((w) => new Date(w.date) >= today)
      .slice(0, 5);
  }, [plannedWorkouts]);

  const nextRace = useMemo(() => {
    const today = new Date();
    return (userRaces || [])
      .filter((r) => new Date(r.race_date) >= today)
      .sort((a, b) => new Date(a.race_date).getTime() - new Date(b.race_date).getTime())[0];
  }, [userRaces]);

  const greetingName = (profile as any)?.full_name?.split(" ")?.[0] || (profile as any)?.username || "";

  const tiles = [
    {
      label: zh ? "本週距離" : "Weekly distance",
      value: stats.weeklyKm.toFixed(1),
      unit: "km",
      icon: TrendingUp,
      accent: "text-primary",
    },
    {
      label: zh ? "本週時間" : "Weekly time",
      value: fmtDuration(stats.weeklyTime),
      unit: "",
      icon: Timer,
      accent: "text-blue-500",
    },
    {
      label: zh ? "本月距離" : "Monthly distance",
      value: stats.monthlyKm.toFixed(1),
      unit: "km",
      icon: ActivityIcon,
      accent: "text-emerald-500",
    },
    {
      label: zh ? "本月爬升" : "Monthly elevation",
      value: Math.round(stats.monthlyElev).toString(),
      unit: "m",
      icon: Mountain,
      accent: "text-orange-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">
            {zh ? "歡迎回來" : "Welcome back"}
            {greetingName ? `, ${greetingName}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {zh
              ? `本週已完成 ${stats.weeklyCount} 次訓練 · 本月 ${stats.monthlyCount} 次`
              : `${stats.weeklyCount} sessions this week · ${stats.monthlyCount} this month`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate("training")}>
            <Dumbbell className="h-4 w-4 mr-1.5" />
            {zh ? "查看訓練" : "Training"}
          </Button>
          <Button size="sm" onClick={() => onNavigate("activities")}>
            <ActivityIcon className="h-4 w-4 mr-1.5" />
            {zh ? "所有活動" : "All activities"}
          </Button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {t.label}
              </span>
              <t.icon className={`h-4 w-4 ${t.accent}`} />
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-display font-bold">{t.value}</span>
              {t.unit && (
                <span className="text-sm text-muted-foreground font-medium">{t.unit}</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Recent activities — spans 2 */}
        <Card className="xl:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-lg flex items-center gap-2">
              <ActivityIcon className="h-4 w-4 text-primary" />
              {zh ? "最近活動" : "Recent activities"}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("activities")}>
              {zh ? "查看全部" : "View all"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {recent.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {zh ? "尚無活動紀錄" : "No activities yet"}
            </div>
          ) : (
            <div className="divide-y divide-border -mx-2">
              {recent.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedActivity(a)}
                  className="w-full text-left grid grid-cols-12 gap-3 items-center px-2 py-3 hover:bg-muted/40 rounded-md transition-colors cursor-pointer"
                >
                  <div className="col-span-5 min-w-0">
                    <div className="font-medium text-sm truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      {new Date(a.start_date).toLocaleDateString(zh ? "zh-TW" : "en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="col-span-2 text-right">
                    <div className="font-display font-semibold text-sm">{fmtDistance(a.distance)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">km</div>
                  </div>
                  <div className="col-span-2 text-right">
                    <div className="font-display font-semibold text-sm">{fmtDuration(a.moving_time)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {zh ? "時間" : "time"}
                    </div>
                  </div>
                  <div className="col-span-3 text-right">
                    <div className="font-display font-semibold text-sm">{fmtPace(a.average_speed)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {zh ? "配速" : "pace"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {!simpleMode && (
            <DashboardMonthlyChallenge
              lang={lang}
              activities={activities || []}
              plannedWorkouts={plannedWorkouts || []}
            />
          )}
          {/* Next race */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                {zh ? "下一場比賽" : "Next race"}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("races")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {nextRace ? (
              <Link to="/dashboard?view=races" className="block group">
                <div className="font-display font-bold text-base group-hover:text-primary transition-colors">
                  {zh && nextRace.race_name_zh ? nextRace.race_name_zh : nextRace.race_name}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(nextRace.race_date).toLocaleDateString(zh ? "zh-TW" : "en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {nextRace.city ? ` · ${nextRace.city}` : ""}
                </div>
              </Link>
            ) : (
              <div className="text-xs text-muted-foreground py-2">
                {zh ? "尚未安排比賽" : "No upcoming race"}
              </div>
            )}
          </Card>

          {/* Upcoming workouts */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                {zh ? "即將到來的訓練" : "Upcoming workouts"}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("training")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {upcomingWorkouts.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                {zh ? "尚無計劃" : "No planned workouts"}
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingWorkouts.map((w, i) => (
                  <div
                    key={`${w.date}-${i}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/40"
                  >
                    <div
                      className="h-9 w-9 rounded-md flex flex-col items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: `${w.color}20`, color: w.color }}
                    >
                      <span className="leading-none">
                        {new Date(w.date).toLocaleDateString(zh ? "zh-TW" : "en-US", {
                          day: "numeric",
                        })}
                      </span>
                      <span className="leading-none mt-0.5 opacity-70">
                        {new Date(w.date).toLocaleDateString(zh ? "zh-TW" : "en-US", {
                          month: "short",
                        })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {w.title || w.type}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {w.distance_km ? `${w.distance_km} km` : w.pace || ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <DashboardActivityDetail
        activity={selectedActivity}
        lang={lang}
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        profileAge={(profile as any)?.age ?? null}
        profileMaxHr={(profile as any)?.max_heartrate ?? null}
        profileRestingHr={(profile as any)?.resting_heartrate ?? null}
        profileCustomZones={(profile as any)?.custom_hr_zones ?? null}
      />
    </div>
  );
}
