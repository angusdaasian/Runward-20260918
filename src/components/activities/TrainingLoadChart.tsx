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

interface Props {
  lang: Lang;
  activities: LoadActivity[];
  profileAge?: number | null;
}

const STATUS_LABELS: Record<LoadStatusKey, { en: string; zh: string; color: string }> = {
  overreaching: { en: "Overreaching", zh: "過度訓練", color: "text-red-500" },
  productive: { en: "Productive overreach", zh: "有效強度", color: "text-orange-500" },
  building: { en: "Building fitness", zh: "建立體能", color: "text-emerald-500" },
  fresh: { en: "Fresh / tapered", zh: "狀態良好", color: "text-sky-400" },
  maintenance: { en: "Maintenance", zh: "維持", color: "text-muted-foreground" },
  detraining: { en: "Detraining", zh: "退步中", color: "text-yellow-500" },
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
      <div className="bg-card border border-border rounded-xl p-4 mb-5">
        <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
          {lang === "zh" ? "訓練負荷" : "Training Load"}
        </h3>
        <p className="text-sm text-muted-foreground py-8 text-center">
          {lang === "zh"
            ? "需要更多含心率的活動才能計算訓練負荷曲線"
            : "Sync more activities with heart-rate data to see your load curve"}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
          {lang === "zh" ? "訓練負荷" : "Training Load"}
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-0.5 bg-sky-400" />
            <span className="text-muted-foreground">{lang === "zh" ? "體能" : "Fitness"}</span>
            <span className="font-bold text-foreground">{last.fitness.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-0.5 bg-orange-400" />
            <span className="text-muted-foreground">{lang === "zh" ? "疲勞" : "Fatigue"}</span>
            <span className="font-bold text-foreground">{last.fatigue.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-0.5 bg-rose-400" />
            <span className="text-muted-foreground">{lang === "zh" ? "狀態" : "Form"}</span>
            <span className="font-bold text-foreground">{last.form.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="formPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="formNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="hsl(0 72% 51%)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(0 72% 51%)" stopOpacity={0} />
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
              width={32}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 2" />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 10 }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  fitness: lang === "zh" ? "體能 (CTL)" : "Fitness (CTL)",
                  fatigue: lang === "zh" ? "疲勞 (ATL)" : "Fatigue (ATL)",
                  form: lang === "zh" ? "狀態 (TSB)" : "Form (TSB)",
                };
                return [value.toFixed(1), labels[name] || name];
              }}
              labelFormatter={(l) => `${lang === "zh" ? "週" : "Wk of"} ${l}`}
            />
            {/* Form area filled green when positive, red when negative */}
            <Area
              type="monotone"
              dataKey="form"
              stroke="none"
              fill="url(#formPos)"
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="fitness"
              stroke="hsl(199 89% 60%)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="fatigue"
              stroke="hsl(25 95% 60%)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="form"
              stroke="hsl(0 72% 60%)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Status */}
      <div className="mt-2 flex items-baseline gap-2 flex-wrap text-xs">
        <span className={`font-bold uppercase tracking-wide ${statusLabel.color}`}>
          {lang === "zh" ? statusLabel.zh : statusLabel.en}
        </span>
        <span className="text-muted-foreground">
          CTL {last.fitness.toFixed(1)} · ATL {last.fatigue.toFixed(1)} · TSB {last.form.toFixed(1)}
        </span>
        {fitnessTrendPct !== 0 && (
          <span className={fitnessTrendPct > 0 ? "text-emerald-500 font-medium" : "text-yellow-500 font-medium"}>
            {lang === "zh" ? "體能" : "fitness"} {fitnessTrendPct > 0 ? "↑" : "↓"}
            {Math.abs(fitnessTrendPct)}%
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-foreground leading-relaxed">
        {lang === "zh" ? statusDesc.zh : statusDesc.en}
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
        {lang === "zh"
          ? "體能 (CTL) = 6週 EWMA · 疲勞 (ATL) = 1週 EWMA · 狀態 (TSB) = 體能 − 疲勞 · 基於時間 × 心率強度"
          : "Fitness (CTL) = 6w EWMA · Fatigue (ATL) = 1w EWMA · Form (TSB) = fitness − fatigue · Based on duration × HR intensity"}
      </p>
    </div>
  );
};

export default TrainingLoadChart;
