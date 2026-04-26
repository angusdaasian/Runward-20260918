import { Activity, HeartPulse, Moon, Sparkles, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Lang } from "@/lib/i18n";
import {
  useGarminDailyHealth,
  useHasGarminConnection,
  useRefreshGarminDailyHealth,
} from "@/hooks/use-garmin-daily-health";

interface Props {
  lang: Lang;
}

function fmtSleep(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function sleepScoreClass(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

function fmtDate(iso: string, lang: Lang): string {
  // iso may be a date string (YYYY-MM-DD) or full timestamp
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "zh" ? "zh-HK" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

const GarminHealthCard = ({ lang }: Props) => {
  const { data: hasConn, isLoading: connLoading } = useHasGarminConnection();
  const { data: history, isLoading: dataLoading } = useGarminDailyHealth();
  const { refresh, refreshing } = useRefreshGarminDailyHealth(lang);

  if (connLoading) return null;
  if (!hasConn) return null;

  const latest = history?.[0];
  const loading = dataLoading;

  return (
    <Card className="p-4 mb-4 bg-gradient-to-br from-primary/5 via-card to-card border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">
            {lang === "zh" ? "Garmin 健康狀態" : "Garmin Health"}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {latest
              ? `${lang === "zh" ? "更新於" : "Updated"} ${fmtDate(latest.fetched_at ?? latest.date, lang)}`
              : lang === "zh"
                ? "每日上午 10 點自動同步"
                : "Auto-syncs daily at 10am HKT"}
          </p>
        </div>
        <button
          onClick={() => refresh()}
          disabled={refreshing}
          aria-label={lang === "zh" ? "重新整理" : "Refresh"}
          className="p-2 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          icon={<Activity size={14} className="text-primary" />}
          label={lang === "zh" ? "最大攝氧量" : "VO₂max"}
          value={latest?.vo2max != null ? latest.vo2max.toFixed(1) : "—"}
          unit="ml/kg/min"
          loading={loading}
        />
        <Stat
          icon={<HeartPulse size={14} className="text-rose-500" />}
          label={lang === "zh" ? "靜息心率" : "Resting HR"}
          value={latest?.resting_hr != null ? String(latest.resting_hr) : "—"}
          unit="bpm"
          loading={loading}
        />
        <Stat
          icon={<Moon size={14} className="text-indigo-400" />}
          label={lang === "zh" ? "睡眠時間" : "Sleep"}
          value={fmtSleep(latest?.sleep_seconds ?? null)}
          loading={loading}
        />
        <Stat
          icon={<Sparkles size={14} className="text-amber-400" />}
          label={lang === "zh" ? "睡眠分數" : "Sleep Score"}
          value={latest?.sleep_score != null ? String(latest.sleep_score) : "—"}
          valueClass={sleepScoreClass(latest?.sleep_score ?? null)}
          loading={loading}
        />
      </div>
    </Card>
  );
};

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  valueClass?: string;
  loading?: boolean;
}

const Stat = ({ icon, label, value, unit, valueClass, loading }: StatProps) => (
  <div className="rounded-lg border border-border/40 bg-background/40 p-2.5">
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
    {loading ? (
      <div className="h-5 w-12 bg-muted animate-pulse rounded" />
    ) : (
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-bold ${valueClass ?? "text-foreground"}`}>{value}</span>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
    )}
  </div>
);

export default GarminHealthCard;
