import { useMemo } from "react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { StatTile } from "@/components/ui/StatTile";

/**
 * Mobile KPI strip.
 *
 * Adds the focal layer the mobile analytics tab never had: every number was
 * capped at 24px inside 148px tiles, with no summary, period selector or
 * trend. The desktop AnalyticsTopSummary already proved the pattern — this is
 * its mobile counterpart, and it renders above both the widget grid and the
 * classic view so the tab always opens with a readable summary.
 */
interface Props {
  lang: Lang;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function fmtDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MobileKpiStrip({ lang }: Props) {
  const { activities } = useActivities();
  const zh = lang === "zh";

  const stats = useMemo(() => {
    const now = Date.now();
    const inWindow = (t: number, from: number, to: number) => t >= now - to && t < now - from;

    let km7 = 0, sec7 = 0, sessions7 = 0;
    let kmPrev = 0;

    for (const a of activities) {
      const t = new Date(a.start_date).getTime();
      if (!isFinite(t)) continue;
      const meters = typeof a.distance === "number" ? a.distance : 0;
      const moving = typeof a.moving_time === "number" ? a.moving_time : 0;

      if (inWindow(t, 0, WEEK_MS)) {
        km7 += meters / 1000;
        sec7 += moving;
        sessions7 += 1;
      } else if (inWindow(t, WEEK_MS, 2 * WEEK_MS)) {
        kmPrev += meters / 1000;
      }
    }

    const avgPaceSecPerKm = km7 > 0 ? sec7 / km7 : null;
    const deltaPct = kmPrev > 0 ? ((km7 - kmPrev) / kmPrev) * 100 : null;

    return { km7, sec7, sessions7, avgPaceSecPerKm, deltaPct };
  }, [activities]);

  const hasAny = stats.sessions7 > 0;

  return (
    <div className="mb-4 space-y-3">
      <StatTile
        label={zh ? "本週距離" : "Distance · 7 days"}
        value={hasAny ? stats.km7.toFixed(1) : "—"}
        unit={hasAny ? "km" : undefined}
        size="hero"
        tone="primary"
        variant="surface"
        trend={{ pct: stats.deltaPct, higherIsBetter: true }}
        sub={
          hasAny
            ? zh
              ? `${stats.sessions7} 次跑步`
              : `${stats.sessions7} ${stats.sessions7 === 1 ? "run" : "runs"}`
            : zh
              ? "本週尚無紀錄"
              : "No runs logged this week"
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label={zh ? "時間" : "Time"}
          value={hasAny ? fmtDuration(stats.sec7) : "—"}
          size="md"
        />
        <StatTile
          label={zh ? "平均配速" : "Avg pace"}
          value={stats.avgPaceSecPerKm ? fmtPace(stats.avgPaceSecPerKm) : "—"}
          unit={stats.avgPaceSecPerKm ? "/km" : undefined}
          size="md"
        />
      </div>
    </div>
  );
}

export default MobileKpiStrip;
