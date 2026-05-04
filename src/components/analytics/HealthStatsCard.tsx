import { Activity, HeartPulse, Moon, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Lang } from "@/lib/i18n";
import {
  useTerraConnections,
  useTerraDailyHealth,
  useRefreshTerraDailyHealth,
} from "@/hooks/use-terra-daily-health";
import { useGarminDailyHealth } from "@/hooks/use-garmin-daily-health";
import { useMemo, useState } from "react";

interface Props {
  lang: Lang;
}

type ProviderKey = "GARMIN" | "COROS" | "SUUNTO" | "POLAR";

const PROVIDER_LABEL: Record<ProviderKey, string> = {
  GARMIN: "Garmin",
  COROS: "COROS",
  SUUNTO: "Suunto",
  POLAR: "Polar",
};

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
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "zh" ? "zh-HK" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

const HealthStatsCard = ({ lang }: Props) => {
  const { data: terraConns } = useTerraConnections();
  const { data: terraHistory } = useTerraDailyHealth();
  const { data: garminHistory } = useGarminDailyHealth();
  const { refresh: refreshTerra, refreshing } =
    useRefreshTerraDailyHealth(lang);

  // Build the list of available providers from Terra only.
  const providers = useMemo<ProviderKey[]>(() => {
    const set = new Set<ProviderKey>();
    for (const c of terraConns ?? []) {
      const p = c.provider?.toUpperCase();
      if (p === "GARMIN" || p === "COROS" || p === "SUUNTO" || p === "POLAR") {
        set.add(p as ProviderKey);
      }
    }
    return Array.from(set);
  }, [terraConns]);

  const [selected, setSelected] = useState<ProviderKey | null>(null);
  const active: ProviderKey | null = selected ?? providers[0] ?? null;

  if (providers.length === 0) return null;
  if (!active) return null;

  const latest =
    (terraHistory ?? []).find((r) => r.provider?.toUpperCase() === active) ?? null;
  const sameDateGarmin = active === "GARMIN" && latest
    ? (garminHistory ?? []).find((r) => r.date === latest.date) ?? null
    : null;
  const sleepSeconds = latest?.sleep_seconds ?? sameDateGarmin?.sleep_seconds ?? null;
  const sleepScore = latest?.sleep_score ?? sameDateGarmin?.sleep_score ?? null;

  const handleRefresh = () => {
    refreshTerra(active);
  };

  return (
    <Card className="p-4 mb-4 bg-gradient-to-br from-primary/5 via-card to-card border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">
            {lang === "zh" ? "每日健康狀態" : "Daily Health"}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {latest
              ? `${PROVIDER_LABEL[active]} · ${lang === "zh" ? "更新於" : "Updated"} ${fmtDate(latest.fetched_at ?? latest.date, lang)}`
              : `${PROVIDER_LABEL[active]} · ${lang === "zh" ? "尚未同步" : "Not yet synced"}`}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label={lang === "zh" ? "重新整理" : "Refresh"}
          className="p-2 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {providers.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => setSelected(p)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                p === active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Stat
          icon={<Activity size={14} className="text-primary" />}
          label={lang === "zh" ? "最大攝氧量" : "VO₂max"}
          value={latest?.vo2max != null ? Number(latest.vo2max).toFixed(1) : "—"}
          unit="ml/kg/min"
        />
        <Stat
          icon={<HeartPulse size={14} className="text-rose-500" />}
          label={lang === "zh" ? "靜息心率" : "Resting HR"}
          value={latest?.resting_hr != null ? String(latest.resting_hr) : "—"}
          unit="bpm"
        />
        <Stat
          icon={<Moon size={14} className="text-indigo-400" />}
          label={lang === "zh" ? "睡眠時間" : "Sleep"}
          value={fmtSleep(sleepSeconds)}
        />
        <Stat
          icon={<Sparkles size={14} className="text-emerald-500" />}
          label={lang === "zh" ? "睡眠分數" : "Sleep Score"}
          value={sleepScore != null ? String(sleepScore) : "—"}
          valueClass={sleepScoreClass(sleepScore)}
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
}

const Stat = ({ icon, label, value, unit, valueClass }: StatProps) => (
  <div className="rounded-lg border border-border/40 bg-background/40 p-2.5">
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className={`text-lg font-bold ${valueClass ?? "text-foreground"}`}>{value}</span>
      {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
    </div>
  </div>
);

export default HealthStatsCard;
