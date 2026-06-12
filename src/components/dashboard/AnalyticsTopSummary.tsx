import { useMemo } from "react";
import { Info } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { useAuth } from "@/contexts/AuthContext";
import { useTerraDailyHealth } from "@/hooks/use-terra-daily-health";
import {
  buildWeeklyLoadSeries,
  loadForActivity,
  isCardio,
  isRunning,
} from "@/lib/trainingLoad";
import { computeReadiness, selectProviderRows } from "@/lib/hrvReadiness";
import {
  computeInjuryRisk,
  injuryBand as injuryBandFn,
  computeTrainingReadiness,
  tInfo,
} from "@/lib/analyticsExplain";
import InfoTip from "@/components/analytics/InfoTip";

interface Props {
  lang: Lang;
}

const zhT = (en: string, zh: string, lang: Lang) => (lang === "zh" ? zh : en);

/* ---------- helpers ---------- */

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

function fmtHours(seconds: number) {
  if (!seconds) return "0h";
  const h = seconds / 3600;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

function fmtPaceSecPerKm(secPerKm: number) {
  if (!secPerKm || !isFinite(secPerKm)) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pctDelta(curr: number, prev: number) {
  if (!prev) return curr ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function deltaColor(pct: number, higherIsBetter: boolean) {
  if (Math.abs(pct) < 1) return "text-muted-foreground";
  const good = higherIsBetter ? pct > 0 : pct < 0;
  return good ? "text-emerald-600" : "text-rose-500";
}

/* ---------- main ---------- */

export default function AnalyticsTopSummary({ lang }: Props) {
  const { user } = useAuth();
  const { activities, profile } = useActivities();
  const { data: terraRows } = useTerraDailyHealth();

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
        average_speed: (a as any).average_speed ?? 0,
      })),
    [activities]
  );

  /* CTL / ATL / TSB from existing weekly series */
  const series = useMemo(
    () => buildWeeklyLoadSeries(loadActs as any, (profile as any)?.age ?? null, 26),
    [loadActs, profile]
  );
  const latest = series[series.length - 1];
  const ctl = latest?.fitness ?? 0;
  const atl = latest?.fatigue ?? 0;
  const tsb = latest?.form ?? 0;

  /* 7-day volume + sessions */
  const last7Start = daysAgo(6);
  const prev7Start = daysAgo(13);
  const last7 = loadActs.filter((a) => {
    const d = new Date(a.start_date);
    return d >= last7Start && isCardio(a.sport_type);
  });
  const prev7 = loadActs.filter((a) => {
    const d = new Date(a.start_date);
    return d >= prev7Start && d < last7Start && isCardio(a.sport_type);
  });

  const sumSec = (xs: typeof loadActs) => xs.reduce((s, a) => s + (a.moving_time || 0), 0);
  const sumKm = (xs: typeof loadActs) => xs.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
  const volSec7 = sumSec(last7);
  const volSecPrev = sumSec(prev7);
  const distKm7 = sumKm(last7);
  const distKmPrev = sumKm(prev7);
  const sessions7 = last7.length;
  const sessionsPrev = prev7.length;

  /* avg HR + pace (running) for last 7 / prev 7 */
  function paceHr(xs: typeof loadActs) {
    let hrSum = 0,
      hrCount = 0;
    let paceWSum = 0,
      paceWDist = 0;
    for (const a of xs) {
      if (a.average_heartrate && a.average_heartrate > 30) {
        hrSum += a.average_heartrate;
        hrCount += 1;
      }
      if (isRunning(a.sport_type) && a.distance > 400 && a.moving_time > 60) {
        const secPerM = a.moving_time / a.distance;
        paceWSum += secPerM * a.distance;
        paceWDist += a.distance;
      }
    }
    return {
      avgHr: hrCount ? hrSum / hrCount : 0,
      paceSecPerKm: paceWDist ? (paceWSum / paceWDist) * 1000 : 0,
    };
  }
  const cur = paceHr(last7);
  const prv = paceHr(prev7);

  /* HRV / RHR / sleep debt */
  const garminRows = useMemo(
    () => (terraRows ? selectProviderRows(terraRows as any, "GARMIN") : []),
    [terraRows]
  );
  const readiness = useMemo(
    () => (garminRows.length ? computeReadiness(garminRows) : null),
    [garminRows]
  );

  // sleep debt: 14d, baseline 8h
  const sleepDebt14 = useMemo(() => {
    if (!garminRows.length) return null;
    const last14 = garminRows.slice(-14).filter((r) => r.sleep_seconds && r.sleep_seconds > 0);
    if (!last14.length) return null;
    const target = 8 * 3600;
    const debt = last14.reduce((s, r) => s + Math.max(0, target - (r.sleep_seconds || 0)), 0);
    return {
      hours: debt / 3600,
      nights: last14.length,
      perNightHours: debt / 3600 / last14.length,
    };
  }, [garminRows]);

  // HRV z-score (recent 7d vs 60d baseline, log-space)
  const hrvZ = useMemo<number | null>(() => {
    const hrv = garminRows.filter((r) => r.hrv != null).map((r) => Number(r.hrv));
    if (hrv.length < 8) return null;
    const last60 = hrv.slice(-60);
    const last7 = hrv.slice(-7);
    if (last60.length < 5 || last7.length < 3) return null;
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    const sd = (x: number[]) => {
      if (x.length < 2) return 0;
      const m = mean(x);
      return Math.sqrt(mean(x.map((v) => (v - m) ** 2)));
    };
    const lnBase = mean(last60.map((v) => Math.log(v)));
    const lnBaseSd = Math.max(sd(last60.map((v) => Math.log(v))), 0.05);
    const lnRecent = mean(last7.map((v) => Math.log(v)));
    return (lnRecent - lnBase) / lnBaseSd;
  }, [garminRows]);


  /* ACWR + monotony + strain */
  const ageForLoad = (profile as any)?.age ?? null;
  const loadStats = useMemo(() => {
    // last 7 vs prior 21 daily loads
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
    const last28Loads = dayLoads;
    const acute = last7Loads.reduce((s, v) => s + v, 0);
    const chronic28 = last28Loads.reduce((s, v) => s + v, 0);
    const acwr = chronic28 > 0 ? acute / (chronic28 / 4) : 0;

    // monotony = mean / sd of last 7 day-loads
    const m = last7Loads.reduce((s, v) => s + v, 0) / 7;
    const sd =
      Math.sqrt(
        last7Loads.reduce((s, v) => s + (v - m) ** 2, 0) / 7
      ) || 0.0001;
    const monotony = m / sd;
    const strain = acute * monotony;

    return {
      acwr: Number.isFinite(acwr) ? acwr : 0,
      monotony: Number.isFinite(monotony) ? monotony : 0,
      strain: Number.isFinite(strain) ? strain : 0,
      acute,
    };
  }, [loadActs, ageForLoad]);

  /* sport split last 7 days */
  const sportSplit = useMemo(() => {
    const totals: Record<string, number> = {};
    let total = 0;
    for (const a of last7) {
      if (!isCardio(a.sport_type)) continue;
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

  /* CTL ramp rate per week */
  const ctlRampPerWeek = useMemo(() => {
    if (series.length < 2) return 0;
    const last = series[series.length - 1]?.fitness ?? 0;
    const prev = series[series.length - 2]?.fitness ?? last;
    return last - prev;
  }, [series]);

  /* Injury risk score (0-100) */
  const injury = useMemo(
    () =>
      computeInjuryRisk({
        acwr: loadStats.acwr,
        monotony: loadStats.monotony,
        acute: loadStats.acute,
        tsb,
        ctlRampPerWeek,
        hrvZ,
        sleepDebtPerNightHours: sleepDebt14?.perNightHours ?? null,
        readinessScore: readiness?.score ?? null,
      }),
    [loadStats, tsb, ctlRampPerWeek, hrvZ, sleepDebt14, readiness],
  );

  /* Training readiness layered with training context (spec) */
  const trainingReadiness = useMemo(
    () =>
      computeTrainingReadiness(readiness, {
        tsb,
        acwr: loadStats.acwr,
        monotony: loadStats.monotony,
        sleepDebtPerNightHours: sleepDebt14?.perNightHours ?? null,
        sleepScore: null,
      }),
    [readiness, tsb, loadStats, sleepDebt14],
  );

  if (!user) return null;

  const injuryBand = injuryBandFn(injury.score, lang);

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
    <div className="space-y-3 mb-6">
      {/* ---------- Row 1: KPI strip ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-0 rounded-xl border border-border bg-card overflow-hidden">
        <KpiCell
          label={zhT("Fitness · CTL", "體能 · CTL", lang)}
          value={ctl.toFixed(0)}
          sub={zhT("42-day load", "42 天負荷", lang)}
        />
        <KpiCell
          label={zhT("Fatigue · ATL", "疲勞 · ATL", lang)}
          value={atl.toFixed(0)}
          sub={zhT("7-day rolling", "7 天滾動", lang)}
        />
        <KpiCell
          label={zhT("Form · TSB", "狀態 · TSB", lang)}
          value={`${tsb > 0 ? "+" : ""}${tsb.toFixed(0)}`}
          sub={
            tsb > 10
              ? zhT("Fresh", "輕鬆", lang)
              : tsb > -10
                ? zhT("Neutral", "中性", lang)
                : zhT("Fatigued", "疲勞", lang)
          }
        />
        <KpiCell
          label={zhT("Volume · 7D", "週量 · 7D", lang)}
          value={fmtHours(volSec7)}
          sub={`${sessions7} ${zhT("sessions", "次", lang)}`}
        />
        <KpiCell
          label={zhT("Weight", "體重", lang)}
          value="—"
          sub={zhT("latest reading", "最新讀數", lang)}
        />
      </div>

      {/* ---------- Row 2: Readiness / Injury / Load balance ---------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Training readiness */}
        <Card>
          <CardHead
            label={zhT("Training Readiness", "訓練準備度", lang)}
            infoText={tInfo("readiness", lang)}
          >
            <span
              className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded ${
                trainingReadiness.band === "primed" || trainingReadiness.band === "balanced"
                  ? "bg-emerald-100 text-emerald-700"
                  : trainingReadiness.band === "moderate"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-rose-100 text-rose-700"
              }`}
            >
              {trainingReadiness.band === "primed"
                ? zhT("PRIMED", "極佳", lang)
                : trainingReadiness.band === "balanced"
                  ? zhT("READY", "良好", lang)
                  : trainingReadiness.band === "moderate"
                    ? zhT("MODERATE", "中等", lang)
                    : zhT("REST", "休息", lang)}
            </span>
          </CardHead>
          <div className="flex items-baseline gap-2 mt-2">
            <div
              className={`text-5xl font-display font-bold ${
                trainingReadiness.score < 35
                  ? "text-rose-500"
                  : trainingReadiness.score < 65
                    ? "text-amber-500"
                    : "text-emerald-600"
              }`}
            >
              {trainingReadiness.score}
            </div>
            <div className="text-sm text-muted-foreground">/100</div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full ${
                trainingReadiness.score < 35
                  ? "bg-rose-500"
                  : trainingReadiness.score < 65
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${trainingReadiness.score}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
            <Mini
              label="HRV"
              value={readiness?.hrv7 != null ? `${readiness.hrv7} ms` : "—"}
              delta={
                readiness?.deltaPct != null ? `${readiness.deltaPct > 0 ? "+" : ""}${readiness.deltaPct.toFixed(1)}%` : null
              }
              deltaGood={(readiness?.deltaPct ?? 0) >= 0}
            />
            <Mini
              label="RHR"
              value={readiness?.rhr7 != null ? `${readiness.rhr7} bpm` : "—"}
              delta={null}
              deltaGood={true}
            />
            <Mini
              label={zhT("Sleep debt", "睡眠負債", lang)}
              value={sleepDebt14 ? `${sleepDebt14.hours.toFixed(1)}h` : "—"}
              delta={sleepDebt14 ? `${sleepDebt14.nights}d` : null}
              deltaGood={!sleepDebt14 || sleepDebt14.hours < 4}
            />
          </div>
        </Card>

        {/* Injury risk */}
        <Card>
          <CardHead label={zhT("Injury Risk", "受傷風險", lang)} infoText={tInfo("injury", lang)}>
            <span className="text-[11px] text-muted-foreground">{injury.score}/100</span>
          </CardHead>
          <div className="flex items-baseline gap-2 mt-2">
            <div className={`text-5xl font-display font-bold ${injuryBand.color}`}>
              {injury.score}
            </div>
            <div className={`text-sm font-medium ${injuryBand.color}`}>{injuryBand.label}</div>
          </div>
          {/* gradient bar */}
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
        </Card>

        {/* Load balance */}
        <Card>
          <CardHead label={zhT("Load Balance", "負荷平衡", lang)}>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${acwrDot}`} />
              <span className="uppercase tracking-wider">{acwrLabel}</span>
            </span>
          </CardHead>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="text-5xl font-display font-bold tabular-nums">
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
                  {sportSplit.map((s, i) => (
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
        </Card>
      </div>

      {/* ---------- Row 3: This week vs last week ---------- */}
      <Card className="!p-0">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">
              {zhT("This Week vs Last Week", "本週 vs 上週", lang)}
            </span>
            <Info size={12} className="text-muted-foreground" />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {zhT("Last 7 days vs previous 7 days", "近 7 天 vs 前 7 天", lang)}
          </span>
        </div>
        <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <CompareCell
            value={`${sessions7}`}
            unit=""
            label={zhT("Sessions", "次數", lang)}
            prev={`${sessionsPrev}`}
            pct={pctDelta(sessions7, sessionsPrev)}
            higherIsBetter
            lang={lang}
          />
          <CompareCell
            value={fmtHours(volSec7)}
            unit=""
            label={zhT("Volume", "時數", lang)}
            prev={fmtHours(volSecPrev)}
            pct={pctDelta(volSec7, volSecPrev)}
            higherIsBetter
            lang={lang}
          />
          <CompareCell
            value={`${Math.round(distKm7)}`}
            unit="km"
            label={zhT("Distance", "距離", lang)}
            prev={`${Math.round(distKmPrev)}km`}
            pct={pctDelta(distKm7, distKmPrev)}
            higherIsBetter
            lang={lang}
          />
          <CompareCell
            value={fmtPaceSecPerKm(cur.paceSecPerKm)}
            unit="/km"
            label={zhT("Avg Pace", "平均配速", lang)}
            prev={`${fmtPaceSecPerKm(prv.paceSecPerKm)}/km`}
            pct={pctDelta(cur.paceSecPerKm, prv.paceSecPerKm)}
            higherIsBetter={false}
            lang={lang}
          />
          <CompareCell
            value={cur.avgHr ? `${Math.round(cur.avgHr)}` : "—"}
            unit="bpm"
            label={zhT("Avg HR", "平均心率", lang)}
            prev={prv.avgHr ? `${Math.round(prv.avgHr)}bpm` : "—"}
            pct={pctDelta(cur.avgHr, prv.avgHr)}
            higherIsBetter={false}
            lang={lang}
          />
        </div>
      </Card>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function KpiCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 border-r last:border-r-0 border-b md:border-b-0 border-border">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
        {label}
        <Info size={10} className="opacity-50" />
      </div>
      <div className="text-3xl font-display font-bold mt-1 tabular-nums leading-none">
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1.5">{sub}</div>}
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>{children}</div>
  );
}

function CardHead({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
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

function Mini({
  label,
  value,
  delta,
  deltaGood,
}: {
  label: string;
  value: string;
  delta: string | null;
  deltaGood: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums leading-tight">{value}</div>
      {delta && (
        <div className={`text-[10px] ${deltaGood ? "text-emerald-600" : "text-rose-500"}`}>
          {delta}
        </div>
      )}
    </div>
  );
}

function CompareCell({
  value,
  unit,
  label,
  prev,
  pct,
  higherIsBetter,
  lang,
}: {
  value: string;
  unit?: string;
  label: string;
  prev: string;
  pct: number;
  higherIsBetter: boolean;
  lang: Lang;
}) {
  return (
    <div className="text-center md:text-left">
      <div className="text-2xl font-display font-bold tabular-nums leading-none">
        {value}
        {unit && <span className="text-xs text-muted-foreground font-medium ml-0.5">{unit}</span>}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        {zhT("was", "原", lang)} {prev}{" "}
        <span className={deltaColor(pct, higherIsBetter)}>
          {pct > 0 ? "+" : ""}
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}
