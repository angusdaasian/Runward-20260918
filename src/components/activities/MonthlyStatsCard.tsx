import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { Lang } from "@/lib/i18n";
import {
  summarizeRunTypes,
  RUN_TYPE_LABELS_EN,
  RUN_TYPE_LABELS_ZH,
  type RunActivity,
  type ClassifierContext,
} from "@/lib/runClassifier";
import { shareMonthlyStats } from "@/lib/shareMonthlyStats";

interface Props {
  lang: Lang;
  year: number;
  month: number; // 0-indexed
  activities: Array<RunActivity & { start_date: string }>;
  classifierCtx: ClassifierContext;
}

const MONTH_LABELS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_LABELS_ZH = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

function fmtHm(seconds: number, isZh: boolean): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return isZh ? `${m}分` : `${m}m`;
  return isZh ? `${h}時${m}分` : `${h}h ${m}m`;
}

/** Count Mondays whose ISO week overlaps the month — simple, intuitive denominator. */
function weeksInMonth(year: number, month: number): number {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // anchor to first Monday on/before first day
  const day = first.getDay();
  const offset = day === 0 ? 6 : day - 1;
  const start = new Date(year, month, 1 - offset);
  let count = 0;
  for (let d = new Date(start); d <= last; d.setDate(d.getDate() + 7)) {
    count++;
  }
  return Math.max(1, count);
}

const MonthlyStatsCard = ({ lang, year, month, activities, classifierCtx }: Props) => {
  const isZh = lang === "zh";
  const [sharing, setSharing] = useState(false);

  const monthLabel = `${isZh ? MONTH_LABELS_ZH[month] : MONTH_LABELS_EN[month]} ${year}`;

  const monthActs = useMemo(
    () =>
      activities.filter((a) => {
        const d = new Date(a.start_date);
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [activities, year, month],
  );

  const { totalKm, runCount, totalSeconds, avgWeeklyKm, breakdown } = useMemo(() => {
    const totalMeters = monthActs.reduce((s, a) => s + (a.distance || 0), 0);
    const totalSeconds = monthActs.reduce(
      (s, a) => s + (a.moving_time || a.elapsed_time || 0),
      0,
    );
    const totalKm = totalMeters / 1000;
    const weeks = weeksInMonth(year, month);
    const breakdown = summarizeRunTypes(monthActs, classifierCtx);
    return {
      totalKm,
      runCount: monthActs.length,
      totalSeconds,
      avgWeeklyKm: totalKm / weeks,
      breakdown,
    };
  }, [monthActs, classifierCtx, year, month]);

  const labelMap = isZh ? RUN_TYPE_LABELS_ZH : RUN_TYPE_LABELS_EN;

  const onShare = async () => {
    setSharing(true);
    try {
      await shareMonthlyStats({
        monthLabel,
        totalKm,
        runCount,
        totalSeconds,
        avgWeeklyKm,
        breakdown,
        lang,
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-primary/10 via-card to-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-bold text-foreground text-sm">
            {isZh ? "月度跑步報告" : "Monthly Running Report"}
          </h3>
          <p className="text-[10px] text-muted-foreground">{monthLabel}</p>
        </div>
        <button
          type="button"
          onClick={onShare}
          disabled={sharing || runCount === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 active:scale-95 transition-transform"
        >
          <Share2 size={12} />
          {isZh ? "分享" : "Share"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatTile label={isZh ? "總距離" : "Distance"} value={totalKm.toFixed(1)} unit="km" />
        <StatTile label={isZh ? "跑步次數" : "Runs"} value={String(runCount)} unit={isZh ? "次" : ""} />
        <StatTile label={isZh ? "總時長" : "Total Time"} value={fmtHm(totalSeconds, isZh)} unit="" />
        <StatTile label={isZh ? "週均距離" : "Avg / Week"} value={avgWeeklyKm.toFixed(1)} unit="km" />
      </div>

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          {isZh ? "訓練類型" : "Workout Mix"}
        </p>
        {breakdown.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {isZh ? "本月暫無跑步活動" : "No runs logged this month"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {breakdown.map((item) => (
              <span
                key={item.type}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: `${item.color}22`,
                  color: item.color,
                  border: `1px solid ${item.color}55`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.count} × {labelMap[item.type]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const StatTile = ({ label, value, unit }: { label: string; value: string; unit: string }) => (
  <div className="rounded-lg bg-background/60 border border-border/50 p-3">
    <p className="text-[10px] text-muted-foreground font-medium mb-1">{label}</p>
    <p className="text-xl font-bold text-foreground leading-none font-display">
      {value}
      {unit && <span className="text-xs text-muted-foreground font-normal ml-1">{unit}</span>}
    </p>
  </div>
);

export default MonthlyStatsCard;
