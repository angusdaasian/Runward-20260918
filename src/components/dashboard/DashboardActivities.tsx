import { useMemo, useState } from "react";
import { Activity as ActivityIcon, Calendar as CalendarIcon, TrendingUp, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lang } from "@/lib/i18n";
import { useActivities, type StravaActivity } from "@/hooks/use-activities";
import DesktopPageHeader from "./DesktopPageHeader";
import ActivityCalendar from "@/components/activities/ActivityCalendar";
import ActivityYearHeatmap from "@/components/activities/ActivityYearHeatmap";
import TrendsCard from "@/components/activities/TrendsCard";
import TrainingLoadChart from "@/components/activities/TrainingLoadChart";
import DashboardMonthlyChallenge from "./DashboardMonthlyChallenge";
import DashboardActivityDetail from "./DashboardActivityDetail";

interface Props {
  lang: Lang;
}

function fmtDistance(meters: number) {
  return (meters / 1000).toFixed(2);
}
function fmtPace(metersPerSec: number) {
  if (!metersPerSec) return "—";
  const sec = 1000 / metersPerSec;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DashboardActivities({ lang }: Props) {
  const zh = lang === "zh";
  const { activities, plannedWorkouts, userRaces, profile } = useActivities();
  const [pageSize, setPageSize] = useState(20);
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null);

  const list = activities || [];
  const visible = list.slice(0, pageSize);

  const totals = useMemo(() => {
    const km = list.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
    const time = list.reduce((s, a) => s + (a.moving_time || 0), 0);
    const elev = list.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
    return { km, time, elev, count: list.length };
  }, [list]);

  return (
    <div className="space-y-6">
      <DesktopPageHeader
        title={zh ? "活動" : "Activities"}
        subtitle={
          zh
            ? `共 ${totals.count} 筆 · 累積 ${totals.km.toFixed(0)} 公里 · ${Math.round(totals.elev)} 公尺爬升`
            : `${totals.count} sessions · ${totals.km.toFixed(0)} km · ${Math.round(totals.elev)} m elevation`
        }
        icon={<ActivityIcon className="h-5 w-5" />}
      />

      {/* Top row: calendar (wide) + monthly road quest */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
              {zh ? "月曆" : "Calendar"}
            </h3>
          </div>
          <ActivityCalendar
            lang={lang}
            activities={list}
            plannedWorkouts={plannedWorkouts || []}
            userRaces={userRaces || []}
          />
        </Card>

        <DashboardMonthlyChallenge
          lang={lang}
          activities={list}
          plannedWorkouts={plannedWorkouts || []}
        />
      </div>

      {/* Mid row: trends + training load */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
              {zh ? "趨勢" : "Trends"}
            </h3>
          </div>
          <TrendsCard lang={lang} activities={list as any} />
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
              {zh ? "訓練負荷" : "Training load"}
            </h3>
          </div>
          <TrainingLoadChart
            lang={lang}
            activities={list as any}
            profileAge={(profile as any)?.age ?? null}
          />
        </Card>
      </div>

      {/* Year heatmap */}
      <Card className="p-5">
        <ActivityYearHeatmap lang={lang} activities={list as any} />
      </Card>

      {/* Activity list table */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
            {zh ? "全部活動" : "All activities"}
          </h3>
          <span className="text-xs text-muted-foreground">
            {zh ? `顯示 ${visible.length} / ${list.length}` : `Showing ${visible.length} of ${list.length}`}
          </span>
        </div>

        {list.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {zh ? "尚無活動" : "No activities yet"}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left font-semibold py-2 pr-3">{zh ? "活動" : "Activity"}</th>
                    <th className="text-left font-semibold py-2 pr-3">{zh ? "日期" : "Date"}</th>
                    <th className="text-right font-semibold py-2 pr-3">{zh ? "距離" : "Distance"}</th>
                    <th className="text-right font-semibold py-2 pr-3">{zh ? "時間" : "Time"}</th>
                    <th className="text-right font-semibold py-2 pr-3">{zh ? "配速" : "Pace"}</th>
                    <th className="text-right font-semibold py-2 pr-3">{zh ? "爬升" : "Elev"}</th>
                    <th className="text-right font-semibold py-2">HR</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-border/40 hover:bg-muted/40 transition-colors"
                    >
                      <td className="py-2.5 pr-3 max-w-xs">
                        <div className="font-medium truncate">{a.name}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {a.sport_type}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground text-xs">
                        {new Date(a.start_date).toLocaleDateString(zh ? "zh-TW" : "en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums font-medium">
                        {fmtDistance(a.distance)} <span className="text-muted-foreground text-xs">km</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{fmtDuration(a.moving_time)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{fmtPace(a.average_speed)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                        {Math.round(a.total_elevation_gain || 0)}m
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {a.average_heartrate ? Math.round(a.average_heartrate) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visible.length < list.length && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" size="sm" onClick={() => setPageSize((p) => p + 20)}>
                  {zh ? "載入更多" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
