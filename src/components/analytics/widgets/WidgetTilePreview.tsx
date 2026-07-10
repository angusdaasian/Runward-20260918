import { useMemo } from "react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { useTerraDailyHealth } from "@/hooks/use-terra-daily-health";
import {
  Activity, Flame, Footprints, HeartPulse, Moon, Timer, Sparkles, Heart,
  LineChart, TrendingUp, CalendarDays, Trophy, ShieldAlert, Scale,
} from "lucide-react";
import WidgetTile from "../WidgetTile";
import { WidgetId } from "@/lib/analyticsWidgets";
import {
  computeReadiness,
  getBandMeta,
  selectProviderRows,
} from "@/lib/hrvReadiness";
import { useTerraConnections } from "@/hooks/use-terra-daily-health";
import { usePremium } from "@/contexts/PremiumContext";
import { loadForActivity, isCardio, isRunning, buildWeeklyLoadSeries } from "@/lib/trainingLoad";
import { computeInjuryRisk, injuryBand as injuryBandFn } from "@/lib/analyticsExplain";

interface Props {
  id: WidgetId;
  lang: Lang;
  onOpen: () => void;
}

const zh = (lang: Lang) => lang === "zh";

const Big = ({ value, unit, sub, cls }: { value: string; unit?: string; sub?: string; cls?: string }) => (
  <div>
    <div className="flex items-baseline gap-1">
      <span className={`text-2xl font-bold ${cls ?? "text-foreground"}`}>{value}</span>
      {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
    </div>
    {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
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
      ? { label: zh(lang) ? "低" : "Low", color: "text-emerald-600" }
      : injury.score < 50
        ? { label: zh(lang) ? "中等" : "Moderate", color: "text-amber-500" }
        : injury.score < 75
          ? { label: zh(lang) ? "偏高" : "Elevated", color: "text-orange-500" }
          : { label: zh(lang) ? "高" : "High", color: "text-rose-600" };

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
      const cal = activities
        .filter((a) => a.start_date.slice(0, 10) === todayKey)
        .reduce((s, a) => s + ((a as any).calories ?? 0), 0);
      return (
        <WidgetTile
          title={zh(lang) ? "卡路里" : "Calories"}
          subtitle={zh(lang) ? "今日活動" : "Today's activities"}
          icon={<Flame size={16} className="text-orange-500" />}
          onClick={onOpen}
          readonly
          lang={lang}
        >
          <Big value={cal > 0 ? Math.round(cal).toLocaleString() : "—"} unit="kcal" sub={cal === 0 ? (zh(lang) ? "尚無活動" : "No activity yet") : undefined} />
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
          icon={<Activity size={16} className="text-amber-500" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <ZonesPreview lang={lang} />
        </WidgetTile>
      );
    case "race_predictor":
      return (
        <WidgetTile
          title={zh(lang) ? "比賽預測" : "Race Predictor"}
          subtitle="5K · 10K · HM"
          icon={<Trophy size={16} className="text-yellow-500" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <Big value={zh(lang) ? "查看" : "View"} sub={zh(lang) ? "點擊查看預測時間" : "Tap to see predicted times"} />
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
          icon={<TrendingUp size={16} className="text-violet-500" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <Big value={zh(lang) ? "查看" : "View"} sub={zh(lang) ? "距離、配速、心率" : "Distance, pace, HR"} />
        </WidgetTile>
      );
    case "year_heatmap":
      return (
        <WidgetTile
          title={zh(lang) ? "年度熱力圖" : "Year Heatmap"}
          subtitle={zh(lang) ? "活動紀錄" : "Activity history"}
          icon={<CalendarDays size={16} className="text-emerald-500" />}
          onClick={onOpen}
          locked={hrZonesLocked}
          lang={lang}
        >
          <Big value={zh(lang) ? "查看" : "View"} sub={zh(lang) ? "365 天熱力圖" : "365-day map"} />
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
const TrainingLoadPreview = ({ lang }: { lang: Lang }) => {
  const { activities } = useActivities();
  const count = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    return activities.filter((a) => new Date(a.start_date).getTime() >= cutoff).length;
  }, [activities]);
  return <Big value={String(count)} sub={lang === "zh" ? "本週活動數" : "Activities this week"} />;
};

const ZonesPreview = ({ lang }: { lang: Lang }) => {
  // Simple visual preview only
  return (
    <div>
      <div className="flex items-end gap-1 h-12 mt-1">
        {[0.2, 0.45, 0.65, 0.35, 0.15].map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${
              ["bg-zinc-400", "bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400"][i]
            }`}
            style={{ height: `${h * 100}%`, opacity: 0.85 }}
          />
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">{lang === "zh" ? "點擊查看詳情" : "Tap for details"}</div>
    </div>
  );
};

export default Tile;
