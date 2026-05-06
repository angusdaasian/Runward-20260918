import { useMemo, useState } from "react";
import { LayoutGrid, BarChart3 } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { isRunning, type LoadActivity } from "@/lib/trainingLoad";

interface Props {
  lang: Lang;
  /** Any activities; we filter by the chosen year. */
  activities: (LoadActivity & {
    distance?: number;
    moving_time?: number;
  })[];
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_ZH = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

// Weekday rows: Mon..Sun (top to bottom)
const WEEKDAYS_EN = ["M", "", "W", "", "F", "", "S"];

interface DayCell {
  date: string; // YYYY-MM-DD
  dow: number;  // 0=Mon..6=Sun
  loadValue: number; // total moving minutes that day
  count: number;
  distanceKm: number;
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 0=Mon..6=Sun */
function mondayDow(d: Date): number {
  return (d.getDay() + 6) % 7;
}

type ViewMode = "bar" | "heatmap";

const ActivityYearHeatmap = ({ lang, activities }: Props) => {
  const [view, setView] = useState<ViewMode>("bar");

  // Pick the most recent year that has activities (default = current year)
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const a of activities) {
      const d = new Date(a.start_date);
      if (!isNaN(d.getTime())) set.add(d.getFullYear());
    }
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [activities]);

  const [year, setYear] = useState<number>(() => new Date().getFullYear());

  // Build the day grid for the chosen year (Jan 1 .. Dec 31), padded so each
  // column is a Mon-Sun week.
  const { weeks, monthLabels, totals, maxLoad, monthly, currentMonthIdx } = useMemo(() => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);

    // Aggregate activities by day
    const dayMap = new Map<string, DayCell>();
    const monthlyArr = Array.from({ length: 12 }, () => ({ count: 0, distanceKm: 0, minutes: 0 }));
    let total = 0;
    let totalDistKm = 0;
    let totalMin = 0;
    for (const act of activities) {
      const d = new Date(act.start_date);
      if (isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year) continue;
      const key = fmtDate(d);
      const minutes = (act.moving_time ?? 0) / 60;
      const distKm = (act.distance ?? 0) / 1000;
      const cell = dayMap.get(key) ?? {
        date: key,
        dow: mondayDow(d),
        loadValue: 0,
        count: 0,
        distanceKm: 0,
      };
      cell.loadValue += minutes;
      cell.count += 1;
      cell.distanceKm += distKm;
      dayMap.set(key, cell);
      total += 1;
      totalDistKm += distKm;
      totalMin += minutes;

      const m = d.getMonth();
      monthlyArr[m].count += 1;
      monthlyArr[m].distanceKm += distKm;
      monthlyArr[m].minutes += minutes;
    }

    // First column starts at the Monday on or before Jan 1
    const firstDow = mondayDow(start);
    const gridStart = new Date(start);
    gridStart.setDate(gridStart.getDate() - firstDow);

    // Last column ends at the Sunday on or after Dec 31
    const lastDow = mondayDow(end);
    const gridEnd = new Date(end);
    gridEnd.setDate(gridEnd.getDate() + (6 - lastDow));

    const cols: (DayCell | null)[][] = [];
    const monthLabelsLocal: { col: number; label: string }[] = [];
    let cursor = new Date(gridStart);
    let col: (DayCell | null)[] = [];
    let lastMonth = -1;

    while (cursor <= gridEnd) {
      const inYear = cursor.getFullYear() === year;
      const key = fmtDate(cursor);
      const cell = inYear
        ? (dayMap.get(key) ?? {
            date: key,
            dow: mondayDow(cursor),
            loadValue: 0,
            count: 0,
            distanceKm: 0,
          })
        : null;
      col.push(cell);

      // First Monday of a month → label
      if (col.length === 1 && inYear) {
        const m = cursor.getMonth();
        if (m !== lastMonth) {
          monthLabelsLocal.push({
            col: cols.length,
            label: (lang === "zh" ? MONTHS_ZH : MONTHS_EN)[m],
          });
          lastMonth = m;
        }
      }

      if (col.length === 7) {
        cols.push(col);
        col = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (col.length > 0) cols.push(col);

    let maxLoadLocal = 0;
    for (const c of dayMap.values()) {
      if (c.loadValue > maxLoadLocal) maxLoadLocal = c.loadValue;
    }

    const now = new Date();
    const currentMonth = now.getFullYear() === year ? now.getMonth() : -1;

    return {
      weeks: cols,
      monthLabels: monthLabelsLocal,
      totals: { count: total, distanceKm: totalDistKm, minutes: totalMin },
      maxLoad: maxLoadLocal,
      monthly: monthlyArr,
      currentMonthIdx: currentMonth,
    };
  }, [activities, year, lang]);

  const intensityClass = (cell: DayCell | null): string => {
    if (!cell) return "bg-transparent";
    if (cell.loadValue <= 0) return "bg-muted/40";
    // 4 buckets relative to year max
    const ratio = maxLoad > 0 ? cell.loadValue / maxLoad : 0;
    if (ratio < 0.25) return "bg-orange-900/70";
    if (ratio < 0.5) return "bg-orange-700/80";
    if (ratio < 0.75) return "bg-orange-500/90";
    return "bg-orange-400";
  };

  const totalHours = Math.round(totals.minutes / 60);

  // Bar chart: scale by minutes (matches heatmap intensity metric)
  const maxMonthMinutes = useMemo(
    () => monthly.reduce((m, x) => Math.max(m, x.minutes), 0),
    [monthly],
  );
  const monthLabelsArr = lang === "zh" ? MONTHS_ZH : MONTHS_EN;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
          {lang === "zh" ? `${totals.count} 項活動 · ${year}` : `${totals.count} activities in ${year}`}
        </h3>
        <div className="flex items-center gap-2">
          {availableYears.length > 1 && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="text-xs bg-muted border border-border rounded-md px-2 py-1 text-foreground"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted">
            <button
              onClick={() => setView("heatmap")}
              aria-label="Heatmap view"
              className={`p-1 rounded ${view === "heatmap" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setView("bar")}
              aria-label="Bar chart view"
              className={`p-1 rounded ${view === "bar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <BarChart3 size={14} />
            </button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        {lang === "zh"
          ? `共 ${totals.distanceKm.toFixed(0)} 公里 · ${totalHours} 小時`
          : `${totals.distanceKm.toFixed(0)} km · ${totalHours}h total`}
      </p>

      {view === "bar" ? (
        // Bar chart by month
        <div>
          <div className="flex items-end gap-1.5 h-40">
            {monthly.map((m, i) => {
              const ratio = maxMonthMinutes > 0 ? m.minutes / maxMonthMinutes : 0;
              const isCurrent = i === currentMonthIdx;
              const hasData = m.minutes > 0;
              const heightPct = hasData ? Math.max(ratio * 100, 4) : 0;
              const title = hasData
                ? `${monthLabelsArr[i]} · ${m.count} ${lang === "zh" ? "項" : m.count === 1 ? "activity" : "activities"} · ${m.distanceKm.toFixed(1)} km`
                : `${monthLabelsArr[i]}`;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={title}>
                  {hasData ? (
                    <div
                      className={`w-full rounded-sm ${isCurrent ? "bg-orange-400" : "bg-orange-900/70"}`}
                      style={{ height: `${heightPct}%` }}
                    />
                  ) : (
                    <div className="w-full h-[2px] rounded-full bg-muted/60" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-1.5 mt-2">
            {monthLabelsArr.map((lbl, i) => (
              <div
                key={i}
                className={`flex-1 text-center text-[10px] ${i === currentMonthIdx ? "text-foreground font-semibold" : "text-muted-foreground"}`}
              >
                {lbl}
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Heatmap grid
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="inline-block min-w-full">
            {/* Month labels */}
            <div className="relative h-4 ml-5">
              <div className="flex gap-[3px]">
                {weeks.map((_, i) => {
                  const lbl = monthLabels.find((m) => m.col === i);
                  return (
                    <div key={i} className="w-[11px] text-[10px] text-muted-foreground">
                      {lbl ? <span className="absolute" style={{ left: `calc(${i} * 14px)` }}>{lbl.label}</span> : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Body: weekday labels + cells */}
            <div className="flex gap-1">
              {/* Weekday axis */}
              <div className="flex flex-col gap-[3px] mr-1 pt-[1px]">
                {WEEKDAYS_EN.map((w, i) => (
                  <div key={i} className="h-[11px] w-3 text-[9px] text-muted-foreground leading-[11px]">
                    {w}
                  </div>
                ))}
              </div>

              {/* Week columns */}
              <div className="flex gap-[3px]">
                {weeks.map((wk, ci) => (
                  <div key={ci} className="flex flex-col gap-[3px]">
                    {Array.from({ length: 7 }).map((_, ri) => {
                      const cell = wk[ri] ?? null;
                      const cls = intensityClass(cell);
                      const title = cell
                        ? cell.loadValue > 0
                          ? `${cell.date} · ${cell.count} ${lang === "zh" ? "項" : cell.count === 1 ? "activity" : "activities"} · ${cell.distanceKm.toFixed(1)} km`
                          : `${cell.date}`
                        : "";
                      return (
                        <div
                          key={ri}
                          title={title}
                          className={`w-[11px] h-[11px] rounded-[2px] ${cls}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground tracking-wider uppercase">
              <span>{lang === "zh" ? "少" : "Less"}</span>
              <div className="w-[11px] h-[11px] rounded-[2px] bg-muted/40" />
              <div className="w-[11px] h-[11px] rounded-[2px] bg-orange-900/70" />
              <div className="w-[11px] h-[11px] rounded-[2px] bg-orange-700/80" />
              <div className="w-[11px] h-[11px] rounded-[2px] bg-orange-500/90" />
              <div className="w-[11px] h-[11px] rounded-[2px] bg-orange-400" />
              <span>{lang === "zh" ? "多" : "More"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityYearHeatmap;
