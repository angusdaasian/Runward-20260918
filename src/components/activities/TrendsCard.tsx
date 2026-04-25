import { useMemo } from "react";
import { ArrowDown, ArrowUp, TriangleAlert } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { buildTrendComparison, type TrendMetric, type LoadActivity } from "@/lib/trainingLoad";

interface Props {
  lang: Lang;
  activities: (LoadActivity & {
    distance?: number;
    total_elevation_gain?: number;
    average_speed?: number;
  })[];
}

const LABELS: Record<string, { en: string; zh: string }> = {
  weeklyVolume: { en: "Weekly volume", zh: "週訓練時間" },
  weeklyDistance: { en: "Weekly distance", zh: "週距離" },
  weeklyElevation: { en: "Weekly elevation", zh: "週爬升" },
  sessionsPerWeek: { en: "Sessions / week", zh: "每週次數" },
  avgSessionLength: { en: "Avg session length", zh: "平均時長" },
  avgHr: { en: "Avg training HR", zh: "平均心率" },
  runningPace: { en: "Running pace", zh: "跑步配速" },
  cardiacEfficiency: { en: "Cardiac efficiency", zh: "心臟效率" },
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatPace(secPerKm: number): string {
  if (secPerKm <= 0) return "--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function formatValue(key: string, value: number): string {
  switch (key) {
    case "weeklyVolume":
    case "avgSessionLength": {
      const seconds = key === "weeklyVolume" ? value : value * 60;
      return formatDuration(seconds);
    }
    case "weeklyDistance":
      return `${value.toFixed(1)}km`;
    case "weeklyElevation":
      return `${Math.round(value)}m`;
    case "sessionsPerWeek":
      return value.toFixed(1);
    case "avgHr":
      return `${Math.round(value)} bpm`;
    case "runningPace":
      return formatPace(value);
    case "cardiacEfficiency":
      return value.toFixed(2);
    default:
      return value.toFixed(1);
  }
}

const Row = ({ m, lang }: { m: TrendMetric; lang: Lang }) => {
  const label = LABELS[m.key];
  if (!label) return null;
  const isImproving = m.direction === "improving";
  const isDeclining = m.direction === "declining";
  const Arrow = m.pctChange >= 0 ? ArrowUp : ArrowDown;
  const tone = isImproving
    ? "text-emerald-500"
    : isDeclining
      ? "text-rose-500"
      : "text-muted-foreground";
  const badgeBg = isImproving
    ? "bg-emerald-500/15 text-emerald-500"
    : isDeclining
      ? "bg-rose-500/15 text-rose-500"
      : "bg-muted text-muted-foreground";

  // Hide rows with no data on either side
  if (m.current === 0 && m.previous === 0) return null;

  // For HR, "improvement" = lower; show absolute % delta with sign reflecting direction-of-good
  const sign = m.pctChange > 0 ? "+" : m.pctChange < 0 ? "−" : "";
  const pctText = `${sign}${Math.abs(Math.round(m.pctChange))}%`;

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className={`flex items-center gap-2 min-w-0 ${tone}`}>
        <Arrow size={14} className="shrink-0" />
        <span className="text-sm text-foreground truncate">
          {lang === "zh" ? label.zh : label.en}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">
          {formatValue(m.key, m.previous)}
        </span>
        <span className="text-xs text-muted-foreground">→</span>
        <span className="text-sm font-bold text-foreground">
          {formatValue(m.key, m.current)}
        </span>
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${badgeBg}`}>
          {pctText}
        </span>
      </div>
    </div>
  );
};

const TrendsCard = ({ lang, activities }: Props) => {
  const trends = useMemo(() => buildTrendComparison(activities), [activities]);

  if (!trends.hasData) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-5">
        <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
          {lang === "zh" ? "趨勢 · 過去 4 週 vs 前 4 週" : "Trends · Last 4 weeks vs previous 4"}
        </h3>
        <p className="text-sm text-muted-foreground py-6 text-center">
          {lang === "zh"
            ? "需要至少 8 週的活動才能比較趨勢"
            : "Need at least 8 weeks of activity to compare trends"}
        </p>
      </div>
    );
  }

  const all = Object.values(trends.metrics);
  const improving = all.filter((m) => m.direction === "improving");
  const declining = all.filter((m) => m.direction === "declining");

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-5">
      <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-3">
        {lang === "zh" ? "趨勢 · 過去 4 週 vs 前 4 週" : "Trends · Last 4 weeks vs previous 4"}
      </h3>

      {improving.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 uppercase tracking-wide mt-1 mb-1">
            <ArrowUp size={12} />
            {lang === "zh" ? "進步中" : "Improving"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6 divide-y divide-border sm:divide-y-0">
            {improving.map((m) => (
              <Row key={m.key} m={m} lang={lang} />
            ))}
          </div>
        </>
      )}

      {declining.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-500 uppercase tracking-wide mt-4 mb-1">
            <TriangleAlert size={12} />
            {lang === "zh" ? "下降中" : "Declining"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6 divide-y divide-border sm:divide-y-0">
            {declining.map((m) => (
              <Row key={m.key} m={m} lang={lang} />
            ))}
          </div>
        </>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
        {lang === "zh"
          ? "比較最近 4 週與前 4 週的訓練數據。心率、配速越低越好。"
          : "Compares the last 4 weeks against the previous 4 weeks. For HR & pace, lower is better."}
      </p>
    </div>
  );
};

export default TrendsCard;
