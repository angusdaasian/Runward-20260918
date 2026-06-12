import { useMemo } from "react";
import { Info } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { useTerraDailyHealth } from "@/hooks/use-terra-daily-health";
import { loadForActivity, isCardio, isRunning } from "@/lib/trainingLoad";
import { buildWeeklyLoadSeries } from "@/lib/trainingLoad";
import { computeReadiness, selectProviderRows } from "@/lib/hrvReadiness";

interface Props {
  lang: Lang;
}

const zhT = (en: string, zh: string, lang: Lang) => (lang === "zh" ? zh : en);

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function InjuryLoadCards({ lang }: Props) {
  const { activities, profile } = useActivities();
  const { data: terraRows } = useTerraDailyHealth();

  const ageForLoad = (profile as any)?.age ?? null;

  const loadActs = useMemo(
    () =>
      activities.map((a) => ({
        start_date: a.start_date,
        moving_time: a.moving_time,
        average_heartrate: a.average_heartrate,
        max_heartrate: a.max_heartrate,
        sport_type: a.sport_type,
        source: a.source,
        garmin_training_load: (a as any).garmin_training_load ?? null,
        distance: (a as any).distance ?? 0,
      })),
    [activities],
  );

  const series = useMemo(
    () => buildWeeklyLoadSeries(loadActs as any, ageForLoad, 26),
    [loadActs, ageForLoad],
  );
  const tsb = series[series.length - 1]?.form ?? 0;

  const garminRows = useMemo(
    () => (terraRows ? selectProviderRows(terraRows as any, "GARMIN") : []),
    [terraRows],
  );
  const readiness = useMemo(
    () => (garminRows.length ? computeReadiness(garminRows) : null),
    [garminRows],
  );
  const sleepDebt14 = useMemo(() => {
    if (!garminRows.length) return null;
    const last14 = garminRows.slice(-14).filter((r) => r.sleep_seconds && r.sleep_seconds > 0);
    if (!last14.length) return null;
    const target = 8 * 3600;
    const debt = last14.reduce((s, r) => s + Math.max(0, target - (r.sleep_seconds || 0)), 0);
    return { hours: debt / 3600, nights: last14.length };
  }, [garminRows]);

  const loadStats = useMemo(() => {
    const today = startOfDay(new Date());
    const dayLoads: number[] = new Array(28).fill(0);
    for (const a of loadActs) {
      if (!isCardio(a.sport_type)) continue;
      const d = startOfDay(new Date(a.start_date));
      const offset = Math.round((today.getTime() - d.getTime()) / 86400000);
      if (offset < 0 || offset >= 28) continue;
      const idx = 27 - offset;
      const l = loadForActivity(a as any, ageForLoad) || 0;
      dayLoads[idx] += l;
    }
    const last7Loads = dayLoads.slice(-7);
    const acute = last7Loads.reduce((s, v) => s + v, 0);
    const chronic28 = dayLoads.reduce((s, v) => s + v, 0);
    const acwr = chronic28 > 0 ? acute / (chronic28 / 4) : 0;
    const m = acute / 7;
    const sd =
      Math.sqrt(last7Loads.reduce((s, v) => s + (v - m) ** 2, 0) / 7) || 0.0001;
    const monotony = m / sd;
    const strain = acute * monotony;
    return {
      acwr: Number.isFinite(acwr) ? acwr : 0,
      monotony: Number.isFinite(monotony) ? monotony : 0,
      strain: Number.isFinite(strain) ? strain : 0,
      acute,
    };
  }, [loadActs, ageForLoad]);

  const last7Start = (() => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - 6);
    return d;
  })();
  const last7 = loadActs.filter((a) => {
    const d = new Date(a.start_date);
    return d >= last7Start && isCardio(a.sport_type);
  });

  const sportSplit = useMemo(() => {
    const totals: Record<string, number> = {};
    let total = 0;
    for (const a of last7) {
      const t = a.moving_time || 0;
      const key = isRunning(a.sport_type)
        ? "Run"
        : a.sport_type === "Ride" || a.sport_type === "VirtualRide"
          ? "Bike"
          : a.sport_type === "Swim"
            ? "Swim"
            : a.sport_type === "Walk" || a.sport_type === "Hike"
              ? "Walk"
              : "Other";
      totals[key] = (totals[key] || 0) + t;
      total += t;
    }
    if (!total) return [];
    return Object.entries(totals)
      .map(([k, v]) => ({ key: k, pct: (v / total) * 100 }))
      .sort((a, b) => b.pct - a.pct);
  }, [last7]);

  const injury = useMemo(() => {
    let score = 0;
    const drivers: { en: string; zh: string; weight: number }[] = [];
    if (loadStats.acwr > 1.5) {
      const w = Math.min(35, (loadStats.acwr - 1.5) * 60);
      score += w;
      drivers.push({ en: "ACWR spike", zh: "急性負荷過高", weight: w });
    } else if (loadStats.acwr > 0 && loadStats.acwr < 0.5 && loadStats.acute > 0) {
      score += 15;
      drivers.push({ en: "Detraining", zh: "訓練不足", weight: 15 });
    }
    if (loadStats.monotony > 2) {
      const w = Math.min(20, (loadStats.monotony - 2) * 20);
      score += w;
      drivers.push({ en: "High monotony", zh: "訓練單一", weight: w });
    }
    if (sleepDebt14 && sleepDebt14.hours > 4) {
      const w = Math.min(25, (sleepDebt14.hours - 4) * 3);
      score += w;
      drivers.push({ en: "Sleep debt severe", zh: "睡眠不足嚴重", weight: w });
    }
    if (tsb < -20) {
      const w = Math.min(20, (-20 - tsb) * 1.2);
      score += w;
      drivers.push({ en: "Deep fatigue (TSB)", zh: "深度疲勞", weight: w });
    }
    if (readiness && readiness.score < 35) {
      score += 15;
      drivers.push({ en: "Low readiness", zh: "準備度低", weight: 15 });
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    drivers.sort((a, b) => b.weight - a.weight);
    return { score, drivers };
  }, [loadStats, sleepDebt14, tsb, readiness]);

  const injuryBand =
    injury.score < 25
      ? { label: zhT("Low", "低", lang), color: "text-emerald-600" }
      : injury.score < 50
        ? { label: zhT("Moderate", "中等", lang), color: "text-amber-500" }
        : injury.score < 75
          ? { label: zhT("Elevated", "偏高", lang), color: "text-orange-500" }
          : { label: zhT("High", "高", lang), color: "text-rose-600" };

  const acwrLabel =
    loadStats.acwr === 0
      ? zhT("No data", "無資料", lang)
      : loadStats.acwr < 0.8
        ? zhT("Undertrained", "訓練不足", lang)
        : loadStats.acwr <= 1.3
          ? zhT("Optimal", "最佳", lang)
          : loadStats.acwr <= 1.5
            ? zhT("Caution", "注意", lang)
            : zhT("High risk", "高風險", lang);

  const acwrDot =
    loadStats.acwr === 0
      ? "bg-muted-foreground"
      : loadStats.acwr < 0.8
        ? "bg-sky-500"
        : loadStats.acwr <= 1.3
          ? "bg-emerald-500"
          : loadStats.acwr <= 1.5
            ? "bg-amber-500"
            : "bg-rose-500";

  return (
    <div className="mb-4">
      {/* Injury Risk */}
      <div className="rounded-xl border border-border bg-card p-4 mb-3">
        <Head label={zhT("Injury Risk", "受傷風險", lang)}>
          <span className="text-[11px] text-muted-foreground">{injury.score}/100</span>
        </Head>
        <div className="flex items-baseline gap-2 mt-2">
          <div className={`text-4xl font-display font-bold ${injuryBand.color}`}>
            {injury.score}
          </div>
          <div className={`text-sm font-medium ${injuryBand.color}`}>{injuryBand.label}</div>
        </div>
        <div className="mt-3 h-1.5 rounded-full overflow-hidden relative bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500">
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 w-0.5 bg-foreground"
            style={{ left: `${Math.min(100, Math.max(0, injury.score))}%` }}
          />
        </div>
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {zhT("Top drivers", "主要因素", lang)}
          </div>
          {injury.drivers.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {zhT("No significant drivers", "無顯著因素", lang)}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {injury.drivers.slice(0, 3).map((d, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-xs flex-1 truncate">
                    {lang === "zh" ? d.zh : d.en}
                  </span>
                  <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${Math.min(100, (d.weight / 35) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Load Balance */}
      <div className="rounded-xl border border-border bg-card p-4">
        <Head label={zhT("Load Balance", "負荷平衡", lang)}>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${acwrDot}`} />
            <span className="uppercase tracking-wider">{acwrLabel}</span>
          </span>
        </Head>
        <div className="flex items-baseline gap-2 mt-2">
          <div className="text-4xl font-display font-bold tabular-nums">
            {loadStats.acwr.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">
            {zhT("Load Ratio · ACWR", "負荷比 · ACWR", lang)}
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">
          {zhT("0.8–1.3 safe · last 7 days vs. last 28", "0.8–1.3 安全 · 近 7 天 vs. 近 28 天", lang)}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {zhT("Sameness · Monotony", "單一性", lang)}
            </div>
            <div className="font-semibold tabular-nums">{loadStats.monotony.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {zhT("Weekly strain · Foster", "週負荷強度", lang)}
            </div>
            <div className="font-semibold tabular-nums">{Math.round(loadStats.strain)}</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {zhT("Sport split", "運動分布", lang)}
          </div>
          {sportSplit.length === 0 ? (
            <div className="text-xs text-muted-foreground">—</div>
          ) : (
            <>
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                {sportSplit.map((s) => (
                  <div
                    key={s.key}
                    className={
                      s.key === "Run"
                        ? "bg-foreground"
                        : s.key === "Bike"
                          ? "bg-sky-500"
                          : s.key === "Swim"
                            ? "bg-cyan-400"
                            : s.key === "Walk"
                              ? "bg-emerald-400"
                              : "bg-muted-foreground"
                    }
                    style={{ width: `${s.pct}%` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground">
                {sportSplit.map((s) => (
                  <span key={s.key}>
                    {s.key} {Math.round(s.pct)}%
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Head({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
        {label}
        <Info size={10} className="opacity-50" />
      </div>
      {children}
    </div>
  );
}
