import { useState, useMemo } from "react";
import { Trophy, Droplets, MapPin, Flag, Medal } from "lucide-react";
import { Lang } from "@/lib/i18n";
import type { StravaActivity, PlannedWorkout } from "@/hooks/use-activities";

interface Props {
  lang: Lang;
  activities: StravaActivity[];
  plannedWorkouts: PlannedWorkout[];
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

const MILESTONES = [
  { pct: 0.25, icon: Droplets, labelEn: "Water Station", labelZh: "補水站" },
  { pct: 0.5, icon: MapPin, labelEn: "Halfway Point", labelZh: "中途點" },
  { pct: 0.75, icon: Flag, labelEn: "Final Stretch", labelZh: "最後衝刺" },
];

const MonthlyRoadQuest = ({ lang, activities, plannedWorkouts }: Props) => {
  const [goalKm, setGoalKm] = useState(getStoredGoal);

  const handleGoalChange = (g: number) => {
    setGoalKm(g);
    try { localStorage.setItem(STORAGE_KEY, String(g)); } catch {}
  };

  // Current month total km
  const monthlyKm = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let total = 0;
    for (const act of activities) {
      const d = new Date(act.start_date);
      if (d.getFullYear() === y && d.getMonth() === m) {
        total += act.distance / 1000;
      }
    }
    return total;
  }, [activities]);

  // Planned runs remaining this month
  const plannedRemaining = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return plannedWorkouts.filter(
      (pw) => pw.date.startsWith(monthPrefix) && pw.date >= todayStr
    ).length;
  }, [plannedWorkouts]);

  const progress = Math.min(monthlyKm / goalKm, 1);
  const progressPct = progress * 100;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏃</span>
          <h3 className="font-display font-bold text-foreground text-sm">
            {lang === "zh" ? "每月挑戰" : "Monthly Challenge"}
          </h3>
        </div>
        {/* Goal toggle */}
        <div className="flex bg-muted rounded-lg p-0.5">
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g}
              onClick={() => handleGoalChange(g)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
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

      {/* Progress text */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-lg font-bold text-foreground">
          {monthlyKm.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">/ {goalKm} km</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {Math.round(progressPct)}%
        </span>
      </div>

      {/* Road visual */}
      <div className="relative h-8 mb-1">
        {/* Road background */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 rounded-full bg-muted border border-border overflow-hidden">
          {/* Dashed center line */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full border-t border-dashed border-muted-foreground/20" />
          </div>
          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 bg-primary/20 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Milestones */}
        {MILESTONES.map((ms) => {
          const reached = progress >= ms.pct;
          return (
            <div
              key={ms.pct}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${ms.pct * 100}%` }}
            >
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                  reached ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                }`}
              >
                <ms.icon size={8} />
              </div>
            </div>
          );
        })}

        {/* Finish line medal */}
        <div className="absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2">
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
              progress >= 1 ? "bg-yellow-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"
            }`}
          >
            <Medal size={10} />
          </div>
        </div>

        {/* Runner icon */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-500 ease-out"
          style={{ left: `${Math.min(progressPct, 95)}%` }}
        >
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md ring-2 ring-background text-xs">
            🏃
          </div>
        </div>
      </div>

      {/* Milestone labels */}
      <div className="relative h-4 mb-2">
        {MILESTONES.map((ms) => (
          <span
            key={ms.pct}
            className="absolute -translate-x-1/2 text-[8px] text-muted-foreground whitespace-nowrap"
            style={{ left: `${ms.pct * 100}%` }}
          >
            {lang === "zh" ? ms.labelZh : ms.labelEn}
          </span>
        ))}
      </div>

      {/* Planned runs remaining */}
      {plannedRemaining > 0 && (
        <p className="text-[10px] text-muted-foreground text-center mt-1">
          {lang === "zh"
            ? `本月還有 ${plannedRemaining} 次計劃跑步`
            : `You have ${plannedRemaining} planned run${plannedRemaining !== 1 ? "s" : ""} remaining this month`}
        </p>
      )}

      {/* Completion celebration */}
      {progress >= 1 && (
        <div className="text-center mt-2">
          <span className="text-xs font-semibold text-primary">
            🎉 {lang === "zh" ? "恭喜完成本月挑戰！" : "Congratulations! Quest complete!"}
          </span>
        </div>
      )}
    </div>
  );
};

export default MonthlyRoadQuest;
