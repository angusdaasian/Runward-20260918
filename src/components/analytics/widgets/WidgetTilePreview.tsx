import { useMemo } from "react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { useTerraDailyHealth } from "@/hooks/use-terra-daily-health";
import {
  Activity, Flame, Footprints, HeartPulse, Moon, Timer, Sparkles, Heart,
  LineChart, TrendingUp, CalendarDays, Trophy, ShieldAlert, Scale, Gauge, ChevronRight,
} from "lucide-react";
import WidgetTile from "../WidgetTile";
import { WidgetId } from "@/lib/analyticsWidgets";
import {
  computeReadiness,
  getBandMeta,
  selectProviderRows,
} from "@/lib/hrvReadiness";
import { useTerraConnections, useTerraTodayStats } from "@/hooks/use-terra-daily-health";
import { usePremium } from "@/contexts/PremiumContext";
import { loadForActivity, isCardio, isRunning, buildWeeklyLoadSeries, type LoadActivity } from "@/lib/trainingLoad";
import { computeInjuryRisk, injuryBand as injuryBandFn } from "@/lib/analyticsExplain";
import { computePaceZones, fmtPace, ZONE_KEYS } from "@/lib/paceZones";
import { ZONE_LABELS, ZONE_CLASSES } from "@/lib/hrZones";

interface Props {
  id: WidgetId;
  lang: Lang;
  onOpen: () => void;
}

const zh = (lang: Lang) => lang === "zh";

const Big = ({ value, unit, sub, cls }: { value: string; unit?: string; sub?: string; cls?: string }) => (
  <div>
    <div className="flex items-baseline gap-1">
      <span className={`tnum font-display text-num-md font-bold ${cls ?? "text-foreground"}`}>{value}</span>
      {unit && <span className="text-caption text-muted-foreground">{unit}</span>}
    </div>
    {sub && <div className="mt-0.5 text-caption leading-snug text-muted-foreground">{sub}</div>}
  </div>
);

/** For tiles that have no single number to show: an explicit navigation
 *  affordance instead of putting the word "View" in the numeral slot. */
const OpenHint = ({ label, sub }: { label: string; sub?: string }) => (
  <div className="pt-1">
    <div className="flex items-center gap-1 text-label font-semibold text-primary">
      <span className="truncate">{label}</span>
      <ChevronRight size={15} className="shrink-0" />
    </div>
    {sub && <div className="mt-0.5 text-caption leading-snug text-muted-foreground">{sub}</div>}
  </div>
);

function fmtSleep(s: number | null) {
  if (s == null) return null;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}h ${m}m`;
}

const Tile = ({ id, lang, onOpen }: Props) => {
  const { activities, profile } = useActivities();
  const { data: history } = useTerraDailyHealth();
  const { data: conns } = useTerraConnections();
  const { isPremium } = usePremium();
  const { stats: todayStats } = useTerraTodayStats();

  const hrZonesLocked = !isPremium && id === "hr_zones";

  // --- shared injury/load computations ---
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
    () => (history ? selectProviderRows(history as any, "GARMIN") : []),
    [history],
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
    return { hours: debt / 3600, nights: last14.length, perNightHours: debt / 3600 / last14.length };
  }, [garminRows]);

  const hrvZ = useMemo<number | null>(() => {
    const hrv = garminRows.filter((r) => r.hrv != null).map((r) => Number(r.hrv));
    if (hrv.length < 8) return null;
    const last60 = hrv.slice(-60);
    const last7 = hrv.slice(-7);
    if (last60.length < 5 || last7.length < 3) return null;
    const ln = (x: number[]) => x.map((v) => Math.log(v));
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    const sd = (x: number[]) => {
      if (x.length < 2) return 0;
      const m = mean(x);
      return Math.sqrt(mean(x.map((v) => (v - m) ** 2)));
    };
    const baseLn = mean(ln(last60));
    const baseSd = Math.max(sd(ln(last60)), 0.05);
    return (mean(ln(last7)) - baseLn) / baseSd;
  }, [garminRows]);

  const ctlRampPerWeek = useMemo(() => {
    if (series.length < 2) return 0;
    const last = series[series.length - 1]?.fitness ?? 0;
    const prev = series[Math.max(0, series.length - 2)]?.fitness ?? last;
    return last - prev;
  }, [series]);

  function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

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
    const sd = Math.sqrt(last7Loads.reduce((s, v) => s + (v - m) ** 2, 0) / 7) || 0.0001;
    const monotony = m / sd;
    const strain = acute * monotony;
    return {
      acwr: Number.isFinite(acwr) ? acwr : 0,
      monotony: Number.isFinite(monotony) ? monotony : 0,
      strain: Number.isFinite(strain) ? strain : 0,
      acute,
    };
  }, [loadActs, ageForLoad]);

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

  const injuryBand = injuryBandFn(injury.score, lang);

  const acwrLabel =
    loadStats.acwr === 0
      ? zh(lang) ? "無資料" : "No data"
      : loadStats.acwr < 0.8
        ? zh(lang) ? "訓練不足" : "Undertrained"
        : loadStats.acwr <= 1.3
          ? zh(lang) ? "最佳" : "Optimal"
          : loadStats.acwr <= 1.5
            ? zh(lang) ? "注意" : "Caution"
            : zh(lang) ? "高風險" : "High risk";

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

  // Pick newest non-null helper
  const latestOf = <K extends keyof NonNullable<typeof history>[number]>(key: K) =>
    (history ?? []).find((r) => r[key] != null)?.[key] ?? null;

  switch (id) {
    case "hrv": {
      const providers = Array.from(new Set((conns ?? []).map((c) => c.provider?.toUpperCase()).filter(Boolean))) as any[];
      const provider = providers[0] ?? null;
      const rows = provider ? selectProviderRows(history ?? [], provider) : [];
      const readiness = computeReadiness(rows);
      const band = getBandMeta(readiness.band, lang);
      const v = readiness.todayHrv != null ? Math.round(readiness.todayHrv) : null;
      return (
        <WidgetTile
          title="HRV"
          subtitle={zh(lang) ? "今日" : "Today"}
          icon={<Sparkles size={16} className="text-emerald-500" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          {v != null ? (
            <Big value={String(v)} unit="ms" sub={band?.label ?? (zh(lang) ? "讀數" : "Reading")} cls={band?.color ?? undefined} />
          ) : (
            <Big value="—" sub={zh(lang) ? "尚無基線" : "No baseline"} />
          )}
        </WidgetTile>
      );
    }
    case "health": {
      const vo2 = latestOf("vo2max") as number | null;
      return (
        <WidgetTile
          title={zh(lang) ? "VO₂max" : "VO₂max"}
          subtitle={zh(lang) ? "最新" : "Latest"}
          icon={<Heart size={16} className="text-rose-500" />}
          onClick={onOpen}
          readonly
          lang={lang}
        >
          <Big value={vo2 != null ? Number(vo2).toFixed(1) : "—"} unit="ml/kg/min" sub={vo2 == null ? (zh(lang) ? "尚無資料" : "No data") : undefined} />
        </WidgetTile>
      );
    }
    case "rhr": {
      const rhr = latestOf("resting_hr") as number | null;
      return (
        <WidgetTile
          title={zh(lang) ? "靜息心率" : "Resting HR"}
          subtitle={zh(lang) ? "最新" : "Latest"}
          icon={<HeartPulse size={16} className="text-rose-500" />}
          onClick={onOpen}
          readonly
          lang={lang}
        >
          <Big value={rhr != null ? String(rhr) : "—"} unit="bpm" sub={rhr == null ? (zh(lang) ? "尚無資料" : "No data") : undefined} />
        </WidgetTile>
      );
    }
    case "sleep_last_night": {
      const s = latestOf("sleep_seconds") as number | null;
      return (
        <WidgetTile
          title={zh(lang) ? "睡眠" : "Sleep"}
          subtitle={zh(lang) ? "昨晚" : "Last night"}
          icon={<Moon size={16} className="text-indigo-400" />}
          onClick={onOpen}
          readonly
          lang={lang}
        >
          <Big value={fmtSleep(s) ?? "—"} sub={s == null ? (zh(lang) ? "尚無資料" : "No data") : undefined} />
        </WidgetTile>
      );
    }
    case "sleep_score": {
      const score = latestOf("sleep_score") as number | null;
      return (
        <WidgetTile
          title={zh(lang) ? "睡眠分數" : "Sleep Score"}
          subtitle={zh(lang) ? "昨晚" : "Last night"}
          icon={<Moon size={16} className="text-indigo-400" />}
          onClick={onOpen}
          readonly
          lang={lang}
        >
          <Big value={score != null ? String(score) : "—"} sub={score == null ? (zh(lang) ? "尚無資料" : "No data") : undefined} />
        </WidgetTile>
      );
    }
    case "steps_today": {
      const todayRow = (history ?? []).find((r) => r.date === new Date().toISOString().slice(0, 10));
      const steps = todayRow?.steps ?? latestOf("steps") as number | null;
      return (
        <WidgetTile
          title={zh(lang) ? "步數" : "Steps"}
          subtitle={zh(lang) ? "今日" : "Today"}
          icon={<Footprints size={16} className="text-sky-500" />}
          onClick={onOpen}
          readonly
          lang={lang}
        >
          <Big value={steps != null ? steps.toLocaleString() : "—"} sub={steps == null ? (zh(lang) ? "尚無資料" : "No data") : undefined} />
        </WidgetTile>
      );
    }
    case "calories_today": {
      const todayKey = new Date().toISOString().slice(0, 10);
      // Follow the Daily Health card: watch daily total first, then today's
      // stored daily row, then summed activity calories as a last resort.
      const todayRow = (history ?? []).find((r) => r.date === todayKey && r.calories != null);
      const actCal = activities
        .filter((a) => a.start_date.slice(0, 10) === todayKey)
        .reduce((s, a) => s + ((a as any).calories ?? 0), 0);
      const cal = todayStats?.caloriesBurned ?? (todayRow?.calories != null ? Number(todayRow.calories) : null) ?? actCal;
      return (
        <WidgetTile
          title={zh(lang) ? "卡路里" : "Calories"}
          subtitle={zh(lang) ? "今日" : "Today"}
          icon={<Flame size={16} className="text-orange-500" />}
          onClick={onOpen}
          readonly
          lang={lang}
        >
          <Big value={cal > 0 ? Math.round(cal).toLocaleString() : "—"} unit="kcal" sub={cal === 0 ? (zh(lang) ? "尚無資料" : "No data") : undefined} />
        </WidgetTile>
      );
    }
    case "duration_week": {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      const sec = activities
        .filter((a) => new Date(a.start_date).getTime() >= cutoff)
        .reduce((s, a) => s + (a.moving_time ?? 0), 0);
      const h = Math.floor(sec / 3600);
      const m = Math.round((sec % 3600) / 60);
      return (
        <WidgetTile
          title={zh(lang) ? "運動時數" : "Duration"}
          subtitle={zh(lang) ? "本週" : "This week"}
          icon={<Timer size={16} className="text-emerald-500" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <Big value={`${h}h ${m}m`} sub={zh(lang) ? "過去 7 天" : "Last 7 days"} />
        </WidgetTile>
      );
    }
    case "hr_zones":
      return (
        <WidgetTile
          title={zh(lang) ? "心率區間" : "HR Zones"}
          subtitle={zh(lang) ? "本週" : "This week"}
          icon={<Activity size={16} className="text-hr" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <ZonesPreview lang={lang} />
        </WidgetTile>
      );
    case "pace_zones": {
      const zones = computePaceZones(activities as any[], profile as any);
      return (
        <WidgetTile
          title={zh(lang) ? "配速區間" : "Pace Zones"}
          subtitle={zones ? (zh(lang) ? `${zones.runCount} 次跑步` : `${zones.runCount} runs`) : (zh(lang) ? "累積跑步紀錄" : "Accumulated runs")}
          icon={<Gauge size={16} className="text-primary" />}
          onClick={onOpen}
          lang={lang}
        >
          {zones ? <PaceZonesPreview zones={zones} /> : <Big value="—" sub={zh(lang) ? "尚無足夠資料" : "Not enough data yet"} />}
        </WidgetTile>
      );
    }
    case "race_predictor":
      return (
        <WidgetTile
          title={zh(lang) ? "比賽預測" : "Race Predictor"}
          subtitle="5K · 10K · HM"
          icon={<Trophy size={16} className="text-gold" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <OpenHint
            label={zh(lang) ? "預測時間" : "Predicted times"}
            sub="5K · 10K · HM"
          />
        </WidgetTile>
      );
    case "training_load":
      return (
        <WidgetTile
          title={zh(lang) ? "訓練負荷" : "Training Load"}
          subtitle="CTL · ATL · TSB"
          icon={<LineChart size={16} className="text-primary" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <TrainingLoadPreview lang={lang} />
        </WidgetTile>
      );
    case "trends":
      return (
        <WidgetTile
          title={zh(lang) ? "趨勢" : "Trends"}
          subtitle={zh(lang) ? "本週 vs 上週" : "Week over week"}
          icon={<TrendingUp size={16} className="text-chart-4" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <OpenHint
            label={zh(lang) ? "週對週趨勢" : "Week over week"}
            sub={zh(lang) ? "距離、配速、心率" : "Distance, pace, HR"}
          />
        </WidgetTile>
      );
    case "year_heatmap":
      return (
        <WidgetTile
          title={zh(lang) ? "年度熱力圖" : "Year Heatmap"}
          subtitle={zh(lang) ? "活動紀錄" : "Activity history"}
          icon={<CalendarDays size={16} className="text-heat-4" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <OpenHint
            label={zh(lang) ? "365 天紀錄" : "365-day history"}
            sub={zh(lang) ? "點擊查看熱力圖" : "Tap to open the heatmap"}
          />
        </WidgetTile>
      );
    case "injury_risk":
      return (
        <WidgetTile
          title={zh(lang) ? "受傷風險" : "Injury Risk"}
          subtitle={injuryBand.label}
          icon={<ShieldAlert size={16} className="text-rose-500" />}
          onClick={onOpen}
          readonly
          lang={lang}
        >
          <Big
            value={String(injury.score)}
            unit="/100"
            sub={injury.drivers[0] ? (zh(lang) ? injury.drivers[0].zh : injury.drivers[0].en) : (zh(lang) ? "無顯著因素" : "No significant drivers")}
            cls={injuryBand.color}
          />
        </WidgetTile>
      );
    case "load_balance":
      return (
        <WidgetTile
          title={zh(lang) ? "負荷平衡" : "Load Balance"}
          subtitle={acwrLabel}
          icon={<Scale size={16} className="text-sky-500" />}
          onClick={onOpen}
          readonly
          lang={lang}
        >
          <Big
            value={loadStats.acwr === 0 ? "—" : loadStats.acwr.toFixed(2)}
            unit={loadStats.acwr === 0 ? undefined : "ACWR"}
            sub={zh(lang) ? `單一性 ${loadStats.monotony.toFixed(2)}` : `Monotony ${loadStats.monotony.toFixed(2)}`}
            cls={acwrDot.replace("bg-", "text-")}
          />
        </WidgetTile>
      );
  }
};

// --- inline small previews ---

/** Show the real latest form (TSB) rather than an activity count — the tile
 *  advertises "CTL · ATL · TSB" and previously printed an unrelated number. */
const TrainingLoadPreview = ({ lang }: { lang: Lang }) => {
  const { activities, profile } = useActivities();
  const series = useMemo(
    () =>
      buildWeeklyLoadSeries(
        activities as unknown as LoadActivity[],
        (profile as { age?: number | null } | null)?.age ?? null,
        26
      ),
    [activities, profile],
  );
  const last = series[series.length - 1];
  if (!last) {
    return <Big value="—" sub={lang === "zh" ? "尚無足夠資料" : "Not enough data yet"} />;
  }
  return (
    <Big
      value={last.form.toFixed(1)}
      unit="TSB"
      sub={
        lang === "zh"
          ? `體能 ${last.fitness.toFixed(0)} · 疲勞 ${last.fatigue.toFixed(0)}`
          : `Fitness ${last.fitness.toFixed(0)} · Fatigue ${last.fatigue.toFixed(0)}`
      }
    />
  );
};

/** A zone *legend*, not fabricated data. This tile has no distribution until
 *  the detail view loads it, so bar heights here were invented numbers
 *  presented as "this week". */
const ZonesPreview = ({ lang }: { lang: Lang }) => (
  <div className="space-y-1.5 pt-1">
    {ZONE_LABELS.map((z, i) => (
      <div key={z.key} className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-[2px] ${ZONE_CLASSES[i]}`} aria-hidden />
        <span className="truncate text-caption text-muted-foreground">
          {lang === "zh" ? z.labelZh : z.label}
        </span>
      </div>
    ))}
  </div>
);

const PaceZonesPreview = ({ zones }: { zones: NonNullable<ReturnType<typeof computePaceZones>> }) => (
  <div className="space-y-1.5 pt-0.5">
    {ZONE_KEYS.map((key, index) => (
      <div key={key} className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-[2px] ${ZONE_CLASSES[index]}`} aria-hidden />
          <span className="text-caption font-semibold text-muted-foreground">Z{index + 1}</span>
        </div>
        <span className="tnum text-caption font-semibold text-foreground">
          {fmtPace(zones.pace[key])}
        </span>
      </div>
    ))}
  </div>
);

export default Tile;
