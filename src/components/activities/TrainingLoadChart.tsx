import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Lang } from "@/lib/i18n";
import {
  buildWeeklyLoadSeries,
  classifyLoadStatus,
  type LoadActivity,
  type LoadStatusKey,
} from "@/lib/trainingLoad";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { DeltaChip } from "@/components/ui/DeltaChip";

interface Props {
  lang: Lang;
  activities: LoadActivity[];
  profileAge?: number | null;
}

/* Token-backed status colours (were text-red-500 / text-orange-500 /
   text-emerald-500 / text-sky-400 / text-yellow-500). */
const STATUS_LABELS: Record<LoadStatusKey, { en: string; zh: string; color: string }> = {
  overreaching: { en: "Overreaching", zh: "過度訓練", color: "text-destructive" },
  productive: { en: "Productive overreach", zh: "有效強度", color: "text-warning" },
  building: { en: "Building fitness", zh: "建立體能", color: "text-success" },
  fresh: { en: "Fresh / tapered", zh: "狀態良好", color: "text-chart-2" },
  maintenance: { en: "Maintenance", zh: "維持", color: "text-muted-foreground" },
  detraining: { en: "Detraining", zh: "退步中", color: "text-elevation" },
};

const STATUS_DESC: Record<LoadStatusKey, { en: string; zh: string }> = {
  overreaching: {
    en: "Fatigue clearly exceeds fitness — prioritise recovery this week.",
    zh: "疲勞明顯高於體能 — 本週應以恢復為主。",
  },
  productive: {
    en: "Carrying manageable fatigue while fitness is building. Sweet spot — training is working.",
    zh: "可承受的疲勞配合體能上升 — 訓練正在見效。",
  },
  building: {
    en: "Fitness is rising and form is positive — solid block of training.",
    zh: "體能上升、狀態正面 — 訓練週期穩定。",
  },
  fresh: {
    en: "Form is high and fatigue is low — primed for a hard session or race.",
    zh: "狀態佳、疲勞低 — 適合高強度訓練或比賽。",
  },
  maintenance: {
    en: "Fitness is steady — maintaining current load.",
    zh: "體能維持中 — 保持目前訓練量。",
  },
  detraining: {
    en: "Fitness is dropping — increase training volume to rebuild.",
    zh: "體能下降中 — 增加訓練量以重建。",
  },
};

const TrainingLoadChart = ({ lang, activities, profileAge }: Props) => {
  const series = useMemo(
    () => buildWeeklyLoadSeries(activities, profileAge ?? null, 26),
    [activities, profileAge],
  );

  /* Split form at y=0 so the fill actually reads positive/negative. Previously
     a red `formNeg` gradient was defined and never referenced, while the Area
     always filled green — so the chart contradicted its own copy. */
  const chartData = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        formPos: s.form > 0 ? s.form : 0,
        formNeg: s.form < 0 ? s.form : 0,
      })),
    [series],
  );

  const last = series[series.length - 1];
  const prev = series[Math.max(0, series.length - 5)];
  const status = classifyLoadStatus(series);
  const statusLabel = STATUS_LABELS[status];
  const statusDesc = STATUS_DESC[status];

  const fitnessTrendPct =
    prev && prev.fitness > 0
      ? Math.round(((last.fitness - prev.fitness) / prev.fitness) * 100)
      : 0;

  // Tick labels every ~4 weeks
  const tickIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < series.length; i += 4) out.push(i);
    if (out[out.length - 1] !== series.length - 1) out.push(series.length - 1);
    return out;
  }, [series]);

  const hasData = series.some((s) => s.load > 0);

  if (!hasData) {
    return (
      <SurfaceCard className="mb-5">
        <h3 className="mb-2 text-caption font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {lang === "zh" ? "訓練負荷" : "Training Load"}
        </h3>
        <p className="py-8 text-center text-label text-muted-foreground">
          {lang === "zh"
            ? "需要更多含心率的活動才能計算訓練負荷曲線"
            : "Sync more activities with heart-rate data to see your load curve"}
        </p>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="mb-5">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-caption font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {lang === "zh" ? "訓練負荷" : "Training Load"}
        </h3>
        <div className="flex items-center gap-3 text-caption">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-2.5 bg-chart-2" />
            <span className="text-muted-foreground">{lang === "zh" ? "體能" : "Fitness"}</span>
            <span className="tnum font-bold text-foreground">{last.fitness.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-2.5 bg-chart-3" />
            <span className="text-muted-foreground">{lang === "zh" ? "疲勞" : "Fatigue"}</span>
            <span className="tnum font-bold text-foreground">{last.fatigue.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-2.5 bg-chart-1" />
            <span className="text-muted-foreground">{lang === "zh" ? "狀態" : "Form"}</span>
            <span className="tnum font-bold text-foreground">{last.form.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="formPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="formNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="weekLabel"
              ticks={tickIndices.map((i) => series[i].weekLabel)}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 2" />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 11,
                boxShadow: "var(--shadow-raised)",
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 10 }}
              formatter={((value: number, name: string) => {
                if (name === "formPos" || name === "formNeg") return null;
                const labels: Record<string, string> = {
                  fitness: lang === "zh" ? "體能 (CTL)" : "Fitness (CTL)",
                  fatigue: lang === "zh" ? "疲勞 (ATL)" : "Fatigue (ATL)",
                  form: lang === "zh" ? "狀態 (TSB)" : "Form (TSB)",
                };
                return [value.toFixed(1), labels[name] || name];
              }) as never}
              labelFormatter={(l) => `${lang === "zh" ? "週" : "Wk of"} ${l}`}
            />
            {/* Form split at zero: green above, red below */}
            <Area
              type="monotone"
              dataKey="formPos"
              stroke="none"
              fill="url(#formPos)"
              isAnimationActive={false}
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey="formNeg"
              stroke="none"
              fill="url(#formNeg)"
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="fitness"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="fatigue"
              stroke="hsl(var(--chart-3))"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="form"
              stroke="hsl(var(--chart-1))"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Status */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
        <span className={`font-bold uppercase tracking-wide ${statusLabel.color}`}>
          {lang === "zh" ? statusLabel.zh : statusLabel.en}
        </span>
        <span className="tnum text-muted-foreground">
          CTL {last.fitness.toFixed(1)} · ATL {last.fatigue.toFixed(1)} · TSB {last.form.toFixed(1)}
        </span>
        {fitnessTrendPct !== 0 && (
          <DeltaChip pct={fitnessTrendPct} suffix={lang === "zh" ? "體能" : "fitness"} />
        )}
      </div>
      <p className="mt-1.5 text-caption leading-relaxed text-foreground">
        {lang === "zh" ? statusDesc.zh : statusDesc.en}
      </p>
      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-caption leading-relaxed text-muted-foreground">
        {lang === "zh" ? (
          <>
            <p>
              <span className="font-semibold text-chart-2">體能</span>：你長期累積的耐力底子(過去約6週的訓練量平均)。數字越高代表你越「練得起來」。
            </p>
            <p>
              <span className="font-semibold text-chart-3">疲勞</span>：你身體最近的累積壓力(過去約一週的訓練量)。數字越高代表你越累。
            </p>
            <p>
              <span className="font-semibold text-chart-1">狀態</span>：體能減去疲勞。正值=狀態好、適合比賽;負值=疲勞中、需要恢復。
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="font-semibold text-chart-2">Fitness</span>: your long-term endurance base — how much training you've absorbed over the past ~6 weeks. Higher = stronger aerobic engine.
            </p>
            <p>
              <span className="font-semibold text-chart-3">Fatigue</span>: how tired your body is right now from recent training (past ~1 week). Higher = more accumulated stress.
            </p>
            <p>
              <span className="font-semibold text-chart-1">Form</span>: fitness minus fatigue. Positive = fresh and race-ready; negative = fatigued and needing recovery.
            </p>
          </>
        )}
      </div>
    </SurfaceCard>
  );
};

export default TrainingLoadChart;
