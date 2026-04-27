import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Lang } from "@/lib/i18n";

interface StravaActivity {
  id: string;
  distance: number;
  start_date: string;
  sport_type: string;
  [key: string]: any;
}

interface PlannedWorkout {
  date: string;
  type: string;
  distance_km: number | null;
  color: string;
  title?: string | null;
  description?: string | null;
  pace?: string | null;
}

interface UserRaceLite {
  id: string;
  race_name: string;
  race_name_zh?: string | null;
  race_date: string;
  category: string;
}

interface Props {
  lang: Lang;
  activities: StravaActivity[];
  plannedWorkouts: PlannedWorkout[];
  userRaces?: UserRaceLite[];
  onSelectDate?: (info: {
    date: string;
    activity: StravaActivity | null;
    extraActivities: StravaActivity[];
    planned: PlannedWorkout | null;
    races?: UserRaceLite[];
  }) => void;
}

const WEEKDAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_LABELS_ZH = ["一", "二", "三", "四", "五", "六", "日"];

const MONTH_LABELS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_LABELS_ZH = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

const TYPE_SHORT: Record<string, string> = {
  Easy: "E", "Easy Run": "E",
  Tempo: "T", "Tempo Run": "T",
  Interval: "I",
  Long: "L", "Long Run": "L",
  Recovery: "R", "Recovery Run": "R",
  Progression: "P", "Progression Run": "P",
  "Cross Training": "X",
  "Race Pace": "RP",
  Rest: "",
};

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday = 0, Sunday = 6 (ISO)
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Pad to full weeks
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ActivityCalendar = ({ lang, activities, plannedWorkouts, userRaces = [], onSelectDate }: Props) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const days = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);

  // Build lookup: date string -> total km from Strava
  const kmByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const act of activities) {
      const d = new Date(act.start_date);
      const key = formatDateKey(d);
      map[key] = (map[key] || 0) + act.distance / 1000;
    }
    return map;
  }, [activities]);

  // Build lookup: date string -> all activities on that date (sorted by distance desc)
  const actsByDate = useMemo(() => {
    const map: Record<string, StravaActivity[]> = {};
    for (const act of activities) {
      const d = new Date(act.start_date);
      const key = formatDateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(act);
    }
    for (const key in map) {
      map[key].sort((a, b) => b.distance - a.distance);
    }
    return map;
  }, [activities]);

  // Build lookup: date string -> planned workout
  const planByDate = useMemo(() => {
    const map: Record<string, PlannedWorkout> = {};
    for (const pw of plannedWorkouts) {
      if (pw.type !== "Rest") {
        map[pw.date] = pw;
      }
    }
    return map;
  }, [plannedWorkouts]);

  // Build lookup: date string -> user races
  const racesByDate = useMemo(() => {
    const map: Record<string, UserRaceLite[]> = {};
    for (const r of userRaces) {
      if (!map[r.race_date]) map[r.race_date] = [];
      map[r.race_date].push(r);
    }
    return map;
  }, [userRaces]);

  // Monthly total km from Strava
  const monthlyTotalKm = useMemo(() => {
    let total = 0;
    for (const act of activities) {
      const d = new Date(act.start_date);
      if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
        total += act.distance / 1000;
      }
    }
    return total;
  }, [activities, viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const weekdayLabels = lang === "zh" ? WEEKDAY_LABELS_ZH : WEEKDAY_LABELS_EN;
  const monthLabel = lang === "zh" ? MONTH_LABELS_ZH[viewMonth] : MONTH_LABELS_EN[viewMonth];
  const todayKey = formatDateKey(today);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-accent">
          <ChevronLeft size={18} className="text-foreground" />
        </button>
        <div className="text-center">
          <h3 className="font-display font-bold text-foreground text-sm">
            {monthLabel} {viewYear}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {monthlyTotalKm > 0
              ? `${monthlyTotalKm.toFixed(1)} km ${lang === "zh" ? "已跑" : "ran"}`
              : lang === "zh" ? "暫無活動" : "No activities"}
          </p>
        </div>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-accent">
          <ChevronRight size={18} className="text-foreground" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdayLabels.map((label) => (
          <div key={label} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }

          const key = formatDateKey(day);
          const isToday = key === todayKey;
          const stravaKm = kmByDate[key];
          const planned = planByDate[key];
          const dayActs = actsByDate[key] || [];
          const hasStrava = stravaKm !== undefined && stravaKm > 0;
          const isTappable = hasStrava || !!planned;

          const cellClass = `aspect-square rounded-lg flex flex-col items-center justify-center relative overflow-hidden text-[10px] ${
            isToday ? "ring-1 ring-primary" : ""
          } ${hasStrava ? "bg-primary/10" : planned ? "bg-accent/50" : ""}`;

          const inner = (
            <>
              <span className={`font-medium leading-none ${isToday ? "text-primary font-bold" : "text-foreground"}`}>
                {day.getDate()}
              </span>
              {hasStrava && (
                <span className="text-[8px] font-bold text-primary leading-none mt-0.5">
                  {stravaKm.toFixed(1)}
                </span>
              )}
              {planned && !hasStrava && (
                <span
                  className="text-[8px] font-bold leading-none mt-0.5"
                  style={{ color: planned.color || "hsl(var(--muted-foreground))" }}
                >
                  {TYPE_SHORT[planned.type] || planned.type.charAt(0)}
                  {planned.distance_km ? ` ${planned.distance_km}` : ""}
                </span>
              )}
              {planned && hasStrava && (
                <div
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: planned.color || "hsl(var(--muted-foreground))" }}
                />
              )}
            </>
          );

          if (isTappable && onSelectDate) {
            const primary = dayActs[0] || null;
            const extras = dayActs.slice(1);
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onSelectDate({
                    date: key,
                    activity: primary,
                    extraActivities: extras,
                    planned: planned || null,
                  })
                }
                className={`${cellClass} cursor-pointer transition-transform active:scale-95 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/40`}
              >
                {inner}
              </button>
            );
          }

          return (
            <div key={key} className={cellClass}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 justify-center">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-primary/20" />
          <span className="text-[10px] text-muted-foreground">{lang === "zh" ? "已跑" : "Ran"}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
          <span className="text-[10px] text-muted-foreground">{lang === "zh" ? "計劃" : "Planned"}</span>
        </div>
      </div>
    </div>
  );
};

export default ActivityCalendar;
