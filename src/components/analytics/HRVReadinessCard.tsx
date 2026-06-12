import { useMemo, useState } from "react";
import { Activity, HeartPulse } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Lang } from "@/lib/i18n";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from "recharts";
import {
  useTerraConnections,
  useTerraDailyHealth,
} from "@/hooks/use-terra-daily-health";
import {
  computeReadiness,
  getBandMeta,
  getHrvSeries,
  selectProviderRows,
} from "@/lib/hrvReadiness";
import InfoTip from "@/components/analytics/InfoTip";
import { tInfo } from "@/lib/analyticsExplain";

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

const HRVReadinessCard = ({ lang }: Props) => {
  const { data: conns } = useTerraConnections();
  const { data: history } = useTerraDailyHealth();

  // Find providers with HRV data
  const providers = useMemo<ProviderKey[]>(() => {
    const set = new Set<ProviderKey>();
    for (const c of conns ?? []) {
      const p = c.provider?.toUpperCase();
      if (p === "GARMIN" || p === "COROS" || p === "SUUNTO" || p === "POLAR") {
        const hasHrv = (history ?? []).some(
          (r) => r.provider?.toUpperCase() === p && r.hrv != null,
        );
        if (hasHrv) set.add(p as ProviderKey);
      }
    }
    return Array.from(set);
  }, [conns, history]);

  const [selected, setSelected] = useState<ProviderKey | null>(null);
  const active = selected ?? providers[0] ?? null;

  const rows = useMemo(
    () => (active ? selectProviderRows(history ?? [], active) : []),
    [history, active],
  );
  const series = useMemo(() => getHrvSeries(rows, 7), [rows]);
  const readiness = useMemo(() => computeReadiness(rows), [rows]);

  if (!active || series.length < 3) return null;

  const band = getBandMeta(readiness.band, lang);
  const baseline = readiness.baselineHrv ?? 0;
  const sd = readiness.baselineSdHrv ?? 0;

  return (
    <Card className="p-4 mb-4 bg-gradient-to-br from-primary/5 via-card to-card border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground flex items-center gap-1.5">
            {lang === "zh" ? "心率變異與訓練準備度" : "HRV & Training Readiness"}
            <InfoTip text={tInfo("readiness", lang)} iconSize={12} />
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {PROVIDER_LABEL[active]} ·{" "}
            {lang === "zh" ? "過去 7 天" : "Last 7 days"}
          </p>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${band.color} leading-none`}>
            {readiness.score}
          </div>
          <div className={`text-[11px] font-medium ${band.color}`}>
            {band.label}
          </div>
        </div>
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

      {/* HRV chart */}
      <div className="h-32 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            {sd > 0 && (
              <ReferenceArea
                y1={baseline - sd * 0.5}
                y2={baseline + sd * 0.5}
                fill="hsl(var(--primary))"
                fillOpacity={0.08}
                stroke="none"
              />
            )}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(d: string) => {
                const dt = new Date(`${d}T00:00:00`);
                return dt.toLocaleDateString(lang === "zh" ? "zh-HK" : "en-US", {
                  month: "numeric",
                  day: "numeric",
                });
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={28}
              domain={["dataMin - 5", "dataMax + 5"]}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 10 }}
              formatter={(v: number) => [`${v} ms`, "HRV"]}
            />
            <Line
              type="monotone"
              dataKey="hrv"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "hsl(var(--primary))" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Stat
          icon={<Activity size={13} className="text-primary" />}
          label={lang === "zh" ? "今天" : "Today"}
          value={readiness.todayHrv != null ? `${readiness.todayHrv}` : "—"}
          unit="ms"
        />
        <Stat
          icon={<Activity size={13} className="text-sky-400" />}
          label={lang === "zh" ? "7 天均值" : "7d avg"}
          value={readiness.hrv7 != null ? `${readiness.hrv7}` : "—"}
          unit="ms"
          extra={
            readiness.deltaPct != null
              ? `${readiness.deltaPct > 0 ? "+" : ""}${readiness.deltaPct}%`
              : undefined
          }
          extraClass={
            readiness.deltaPct != null && readiness.deltaPct < 0
              ? "text-orange-500"
              : "text-emerald-500"
          }
        />
        <Stat
          icon={<HeartPulse size={13} className="text-rose-500" />}
          label={lang === "zh" ? "平均靜息心率" : "Avg RHR"}
          value={readiness.rhr7 != null ? `${readiness.rhr7}` : "—"}
          unit="bpm"
        />
      </div>

      <p className="mt-3 text-xs text-foreground leading-relaxed">{band.advice}</p>

      {/* Readiness scale bar */}
      <div className="mt-3">
        <div className="relative h-2.5 rounded-full overflow-hidden bg-muted">
          <div className="absolute inset-y-0 left-0 w-[40%] bg-rose-500/70" />
          <div className="absolute inset-y-0 left-[40%] w-[30%] bg-amber-400/70" />
          <div className="absolute inset-y-0 left-[70%] w-[30%] bg-emerald-500/70" />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-foreground border-2 border-background shadow"
            style={{ left: `${Math.min(100, Math.max(0, readiness.score))}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
          <span>0</span>
          <span>40</span>
          <span>70</span>
          <span>100</span>
        </div>
        <div className="flex justify-between text-[10px] mt-1.5">
          <span className="text-rose-500 font-medium">
            {lang === "zh" ? "← 低：休息 / 易疲勞" : "← Lower: rest / fatigue risk"}
          </span>
          <span className="text-emerald-500 font-medium">
            {lang === "zh" ? "高：可高強度訓練 →" : "Higher: ready to push →"}
          </span>
        </div>
      </div>
    </Card>
  );
};

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  extra?: string;
  extraClass?: string;
}

const Stat = ({ icon, label, value, unit, extra, extraClass }: StatProps) => (
  <div className="rounded-lg border border-border/40 bg-background/40 p-2.5">
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
    <div className="flex items-baseline gap-1 flex-wrap">
      <span className="text-base font-bold text-foreground">{value}</span>
      {unit && <span className="text-[9px] text-muted-foreground">{unit}</span>}
      {extra && <span className={`text-[10px] font-medium ${extraClass ?? ""}`}>{extra}</span>}
    </div>
  </div>
);

export default HRVReadinessCard;
