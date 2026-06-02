import { useState, useMemo, useEffect } from "react";
import { Trophy, Flag, Calendar as CalendarIcon, TrendingUp, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lang } from "@/lib/i18n";
import type { StravaActivity, PlannedWorkout } from "@/hooks/use-activities";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  lang: Lang;
  activities: StravaActivity[];
  plannedWorkouts: PlannedWorkout[];
  className?: string;
}

const GOAL_OPTIONS = [50, 100, 200, 300, 400];
const STORAGE_KEY = "monthly-road-quest-goal";

function getStoredGoal(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && GOAL_OPTIONS.includes(Number(v))) return Number(v);
  } catch {}
  return 100;
}

export default function DashboardMonthlyChallenge({ lang, activities, plannedWorkouts, className }: Props) {
  const { user } = useAuth();
  const zh = lang === "zh";
  const [goalKm, setGoalKm] = useState(getStoredGoal);

  // Sync goal from DB (same source as mobile MonthlyRoadQuest)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("monthly_goal_km")
        .eq("user_id", user.id)
        .maybeSingle();
      const dbGoal = (data as any)?.monthly_goal_km;
      if (dbGoal && GOAL_OPTIONS.includes(Number(dbGoal))) {
        setGoalKm(Number(dbGoal));
        try { localStorage.setItem(STORAGE_KEY, String(dbGoal)); } catch {}
      } else {
        const local = getStoredGoal();
        await supabase.from("profiles").update({ monthly_goal_km: local } as any).eq("user_id", user.id);
      }
    })();
  }, [user]);

  const handleGoalChange = (g: number) => {
    setGoalKm(g);
    try { localStorage.setItem(STORAGE_KEY, String(g)); } catch {}
    if (user) {
      supabase.from("profiles").update({ monthly_goal_km: g } as any).eq("user_id", user.id).then();
    }
  };

  const { monthlyKm, runs, plannedRemaining, daysLeft, daysInMonth, monthLabel } = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let total = 0;
    let runs = 0;
    for (const act of activities) {
      if (!isRunning((act as any).sport_type)) continue;
      const d = new Date(act.start_date);
      if (d.getFullYear() === y && d.getMonth() === m) {
        total += (act.distance || 0) / 1000;
        runs += 1;
      }
    }
    const todayStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}`;
    const plannedRemaining = plannedWorkouts.filter(
      (pw) => pw.date.startsWith(monthPrefix) && pw.date >= todayStr
    ).length;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate() + 1;
    const monthLabel = now.toLocaleDateString(zh ? "zh-TW" : "en-US", { month: "long", year: "numeric" });
    return { monthlyKm: total, runs, plannedRemaining, daysLeft, daysInMonth, monthLabel };
  }, [activities, plannedWorkouts, zh]);

  const progress = Math.min(monthlyKm / goalKm, 1);
  const progressPct = progress * 100;
  const remainingKm = Math.max(0, goalKm - monthlyKm);
  const dailyPaceNeeded = daysLeft > 0 ? remainingKm / daysLeft : 0;
  const onTrackPace = (monthlyKm / Math.max(1, daysInMonth - daysLeft + 1));
  const projected = onTrackPace * daysInMonth;

  // Build SVG arc (semicircle gauge)
  const R = 90;
  const CIRC = Math.PI * R; // half circumference
  const dashOffset = CIRC * (1 - progress);

  return (
    <Card className={`p-6 overflow-hidden relative ${className || ""}`}>
      {/* Background flourish */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]">
        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-primary blur-3xl" />
      </div>

      <div className="relative flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="font-display font-bold text-base">
              {zh ? "每月挑戰" : "Monthly Challenge"}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">{monthLabel}</p>
        </div>
        <div className="flex bg-muted rounded-lg p-0.5">
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g}
              onClick={() => handleGoalChange(g)}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                goalKm === g
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {g}km
            </button>
          ))}
        </div>
      </div>

      {/* Gauge */}
      <div className="relative flex flex-col items-center mb-5">
        <svg width="220" height="120" viewBox="0 0 220 120" className="overflow-visible">
          <path
            d={`M 20 110 A ${R} ${R} 0 0 1 200 110`}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d={`M 20 110 A ${R} ${R} 0 0 1 200 110`}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            className="transition-all duration-700 ease-out"
          />
          {/* Finish flag */}
          <g transform={`translate(200,110)`}>
            <circle r="10" fill={progress >= 1 ? "hsl(var(--primary))" : "hsl(var(--muted))"} />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <div className="text-3xl font-display font-bold tabular-nums">
            {monthlyKm.toFixed(1)}
            <span className="text-sm text-muted-foreground font-medium ml-1">/ {goalKm} km</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {Math.round(progressPct)}% · {zh ? `還剩 ${remainingKm.toFixed(1)} km` : `${remainingKm.toFixed(1)} km to go`}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg bg-muted/40 p-3 text-center">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500 mx-auto mb-1" />
          <div className="text-base font-display font-bold tabular-nums">{runs}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {zh ? "本月跑步" : "Runs"}
          </div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-center">
          <CalendarIcon className="h-3.5 w-3.5 text-blue-500 mx-auto mb-1" />
          <div className="text-base font-display font-bold tabular-nums">{daysLeft}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {zh ? "剩餘天數" : "Days left"}
          </div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-center">
          <Target className="h-3.5 w-3.5 text-orange-500 mx-auto mb-1" />
          <div className="text-base font-display font-bold tabular-nums">{dailyPaceNeeded.toFixed(1)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {zh ? "每日 km" : "km / day"}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Flag className="h-3 w-3" />
          {zh
            ? `預計達成 ${projected.toFixed(0)} km`
            : `Projected ${projected.toFixed(0)} km`}
        </span>
        {plannedRemaining > 0 && (
          <span>{zh ? `還有 ${plannedRemaining} 次計劃` : `${plannedRemaining} planned left`}</span>
        )}
      </div>

      {progress >= 1 && (
        <div className="mt-3 text-center text-sm font-semibold text-primary">
          🎉 {zh ? "恭喜完成本月挑戰！" : "Challenge complete!"}
        </div>
      )}
    </Card>
  );
}
