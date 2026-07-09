import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Clock, MapPin, Heart, TrendingUp, Mountain, Timer, Footprints, Gauge, Flame, Calendar, Sparkles,
} from "lucide-react";
import { shareActivityToGemini } from "@/lib/shareToGemini";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import ActivityMap from "@/components/activities/ActivityMap";
import HrZoneBars from "@/components/activities/HrZoneBars";
import { Lang } from "@/lib/i18n";
import type { StravaActivity } from "@/hooks/use-activities";
import { supabase } from "@/integrations/supabase/client";
import {
  computeZonePct, estimateMaxHr, estimateRestingHr, ZONE_LABELS, isValidCustomZones, zoneBoundaries,
} from "@/lib/hrZones";
import { calculateRunningScore } from "@/lib/vdot";

interface Props {
  activity: StravaActivity | null;
  lang: Lang;
  open: boolean;
  onClose: () => void;
  profileAge?: number | null;
  profileMaxHr?: number | null;
  profileRestingHr?: number | null;
  profileCustomZones?: number[] | null;
}

function fmtPace(metersPerSec: number) {
  if (!metersPerSec) return "—";
  const sec = 1000 / metersPerSec;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function speedToPace(speed: number) {
  if (speed <= 0) return 0;
  return 1000 / speed / 60;
}

export default function DashboardActivityDetail({
  activity, lang, open, onClose,
  profileAge, profileMaxHr, profileRestingHr, profileCustomZones,
}: Props) {
  const zh = lang === "zh";
  const [streams, setStreams] = useState<any[]>([]);
  const [activeChart, setActiveChart] = useState<"pace" | "heartrate" | "altitude" | "cadence">("pace");

  // Fetch Strava streams for richer charts
  useEffect(() => {
    if (!activity || !open) return;
    setStreams([]);
    if (!activity.strava_id || activity.strava_id <= 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("strava-activity-streams", {
          body: { activityId: activity.strava_id },
        });
        if (!cancelled && Array.isArray(data?.streams)) setStreams(data.streams);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [activity, open]);

  const chartData = useMemo(() => {
    if (!activity) return [];
    const hrSamples = Array.isArray(activity.hr_samples) ? activity.hr_samples : null;
    const distSamples = Array.isArray(activity.distance_samples) ? activity.distance_samples : null;
    const elevSamples = Array.isArray(activity.elevation_samples) ? activity.elevation_samples : null;
    const cadSamples = Array.isArray(activity.cadence_samples) ? activity.cadence_samples : null;

    if ((hrSamples && hrSamples.length > 10) || (distSamples && distSamples.length > 10)
      || (elevSamples && elevSamples.length > 10) || (cadSamples && cadSamples.length > 10)) {
      const tMap = new Map<number, any>();
      hrSamples?.forEach((s: any) => tMap.set(s.t, { ...(tMap.get(s.t) || {}), heartrate: s.bpm }));
      distSamples?.forEach((s: any) => tMap.set(s.t, { ...(tMap.get(s.t) || {}), distM: s.d }));
      elevSamples?.forEach((s: any) => tMap.set(s.t, { ...(tMap.get(s.t) || {}), altitude: s.e }));
      cadSamples?.forEach((s: any) => tMap.set(s.t, { ...(tMap.get(s.t) || {}), cadence: s.rpm }));
      const ordered = Array.from(tMap.entries()).sort((a, b) => a[0] - b[0]);
      if (!ordered.length) return [];
      const lastT = ordered[ordered.length - 1][0] || 1;
      const totalDist = activity.distance || 0;
      const step = Math.max(1, Math.floor(ordered.length / 250));
      const data: any[] = [];
      const WINDOW = 30;
      for (let i = 0; i < ordered.length; i += step) {
        const [t, v] = ordered[i];
        const km = v.distM != null ? v.distM / 1000 : (totalDist > 0 ? (totalDist * (t / lastT)) / 1000 : t / 60);
        const point: any = { distance_km: Number(km.toFixed(2)) };
        if (v.heartrate) point.heartrate = v.heartrate;
        if (v.altitude != null) point.altitude = v.altitude;
        if (v.cadence != null && v.cadence > 0) point.cadence = v.cadence;
        if (distSamples && v.distM != null) {
          let j = i;
          while (j > 0 && t - ordered[j][0] < WINDOW) j--;
          const prev = ordered[j][1].distM;
          const dt = t - ordered[j][0];
          if (prev != null && dt >= 5) {
            const speed = (v.distM - prev) / dt;
            const p = speedToPace(speed);
            if (p >= 2.5 && p <= 15) point.pace = p;
          }
        }
        data.push(point);
      }
      return data;
    }
    if (!streams || streams.length === 0) return [];
    const timeStream = streams.find((s: any) => s.type === "time");
    const distStream = streams.find((s: any) => s.type === "distance");
    const hrStream = streams.find((s: any) => s.type === "heartrate");
    const altStream = streams.find((s: any) => s.type === "altitude");
    const velStream = streams.find((s: any) => s.type === "velocity_smooth");
    const cadStream = streams.find((s: any) => s.type === "cadence");
    if (!distStream) return [];
    const step = Math.max(1, Math.floor(distStream.data.length / 200));
    const data: any[] = [];
    for (let i = 0; i < distStream.data.length; i += step) {
      const point: any = { distance_km: Number((distStream.data[i] / 1000).toFixed(2)) };
      if (timeStream) point.time = timeStream.data[i];
      if (hrStream) point.heartrate = hrStream.data[i];
      if (altStream) point.altitude = altStream.data[i];
      if (velStream && velStream.data[i] > 0) point.pace = speedToPace(velStream.data[i]);
      if (cadStream && cadStream.data[i] > 0) point.cadence = cadStream.data[i] * 2;
      data.push(point);
    }
    return data;
  }, [activity, streams]);

  const hasPace = chartData.some(d => d.pace);
  const hasHR = chartData.some(d => d.heartrate);
  const hasAlt = chartData.some(d => d.altitude !== undefined);
  const hasCad = chartData.some(d => typeof d.cadence === "number");

  const chartTabs = useMemo(() => {
    const tabs: { key: typeof activeChart; label: string }[] = [];
    if (hasPace) tabs.push({ key: "pace", label: zh ? "配速" : "Pace" });
    if (hasHR) tabs.push({ key: "heartrate", label: zh ? "心率" : "Heart Rate" });
    if (hasAlt) tabs.push({ key: "altitude", label: zh ? "海拔" : "Altitude" });
    if (hasCad) tabs.push({ key: "cadence", label: zh ? "步頻" : "Cadence" });
    return tabs;
  }, [hasPace, hasHR, hasAlt, hasCad, zh]);

  useEffect(() => {
    if (chartTabs.length && !chartTabs.find(t => t.key === activeChart)) {
      setActiveChart(chartTabs[0].key);
    }
  }, [chartTabs, activeChart]);

  const hrZones = useMemo(() => {
    if (!activity) return null;
    const maxHr = estimateMaxHr(profileAge ?? null, profileMaxHr ?? null);
    const restHr = estimateRestingHr(profileRestingHr ?? null);
    const custom = profileCustomZones ?? null;
    if (Array.isArray(activity.hr_samples) && activity.hr_samples.length > 10) {
      return computeZonePct(activity.hr_samples.map((s: any) => s.bpm), maxHr, restHr, custom);
    }
    const hr = streams.find((s: any) => s.type === "heartrate");
    if (hr && Array.isArray(hr.data) && hr.data.length > 10) {
      return computeZonePct(hr.data, maxHr, restHr, custom);
    }
    return null;
  }, [activity, profileAge, profileMaxHr, profileRestingHr, profileCustomZones, streams]);

  const laps = useMemo(() => {
    if (!activity?.laps || !Array.isArray(activity.laps)) return [];
    return activity.laps.map((l: any, i: number) => {
      const distance = Number(l.distance ?? l.distance_meters) || 0;
      const elapsed = Number(l.elapsed_time ?? l.moving_time ?? l.duration_seconds) || 0;
      const speed = (distance > 0 && elapsed > 0) ? distance / elapsed : 0;
      return {
        idx: i + 1,
        km: distance / 1000,
        elapsed,
        pace: speed,
        hr: l.avg_hr ?? l.average_hr ?? l.average_heartrate ?? null,
        elev: Number(l.elevation_gain ?? l.total_ascent_meters ?? l.total_ascent ?? 0),
      };
    });
  }, [activity]);

  const activityScore = useMemo(() => {
    if (!activity) return null;
    if (!activity.distance || activity.distance < 400) return null;
    if (!activity.moving_time || activity.moving_time < 60) return null;
    const v = calculateRunningScore(activity.distance, activity.moving_time);
    if (!isFinite(v) || v < 5 || v > 100) return null;
    return Math.round(v * 10) / 10;
  }, [activity]);

  if (!activity) return null;

  const km = (activity.distance || 0) / 1000;
  const dateStr = new Date(activity.start_date).toLocaleDateString(
    zh ? "zh-TW" : "en-US",
    { year: "numeric", month: "long", day: "numeric", weekday: "long" }
  );
  const timeStr = new Date(activity.start_date).toLocaleTimeString(
    zh ? "zh-TW" : "en-US",
    { hour: "2-digit", minute: "2-digit" }
  );

  const tiles = [
    { icon: TrendingUp, label: zh ? "距離" : "Distance", value: km.toFixed(2), unit: "km", color: "text-primary" },
    { icon: Timer, label: zh ? "時間" : "Time", value: fmtDuration(activity.moving_time), unit: "", color: "text-blue-500" },
    { icon: Gauge, label: zh ? "配速" : "Pace", value: fmtPace(activity.average_speed), unit: "/km", color: "text-emerald-500" },
    { icon: Mountain, label: zh ? "爬升" : "Elevation", value: Math.round(activity.total_elevation_gain || 0).toString(), unit: "m", color: "text-orange-500" },
    { icon: Heart, label: zh ? "平均心率" : "Avg HR", value: activity.average_heartrate ? Math.round(activity.average_heartrate).toString() : "—", unit: "bpm", color: "text-rose-500" },
    { icon: Heart, label: zh ? "最高心率" : "Max HR", value: activity.max_heartrate ? Math.round(activity.max_heartrate).toString() : "—", unit: "bpm", color: "text-red-500" },
    { icon: Flame, label: zh ? "卡路里" : "Calories", value: activity.calories ? Math.round(activity.calories).toString() : "—", unit: "kcal", color: "text-amber-500" },
    { icon: Footprints, label: zh ? "步頻" : "Cadence", value: activity.avg_cadence ? Math.round(activity.avg_cadence).toString() : "—", unit: "spm", color: "text-purple-500" },
  ];

  const chartColor =
    activeChart === "heartrate" ? "hsl(0,72%,55%)" :
    activeChart === "altitude" ? "hsl(25,90%,55%)" :
    activeChart === "cadence" ? "hsl(270,60%,55%)" :
    "hsl(var(--primary))";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-3 pr-8">
            <DialogTitle className="font-display text-xl font-bold">{activity.name}</DialogTitle>
            <button
              onClick={() => shareActivityToGemini(activity, lang)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title={zh ? "分享到 Gemini 提問" : "Ask Gemini about this run"}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {zh ? "問 Gemini" : "Ask Gemini"}
            </button>
          </div>
          <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dateStr}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeStr}</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{activity.sport_type}</span>
            {activity.source && <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] uppercase tracking-wide">{activity.source}</span>}
            {activityScore && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">
                VDOT {activityScore}
              </span>
            )}
          </div>
        </div>


        <div className="px-6 py-5 space-y-5">
          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t.label}</span>
                  <t.icon className={`h-4 w-4 ${t.color}`} />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-display font-bold tabular-nums">{t.value}</span>
                  {t.unit && <span className="text-xs text-muted-foreground">{t.unit}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Map + Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="font-display font-semibold text-sm mb-3">{zh ? "路線" : "Route"}</h4>
              {activity.summary_polyline ? (
                <ActivityMap polyline={activity.summary_polyline} className="h-72" />
              ) : (
                <div className="h-72 rounded-lg flex items-center justify-center text-sm text-muted-foreground bg-muted/30">
                  {zh ? "無路線資料" : "No route data"}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-display font-semibold text-sm">{zh ? "圖表" : "Charts"}</h4>
                {chartTabs.length > 0 && (
                  <div className="flex bg-muted rounded-lg p-0.5">
                    {chartTabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveChart(tab.key)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          activeChart === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  {zh ? "無詳細圖表資料" : "No detailed chart data"}
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer>
                    <AreaChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartColor} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={chartColor} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="distance_km"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(v) => `${v}`}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        reversed={activeChart === "pace"}
                        domain={activeChart === "pace" ? ["dataMin - 0.3", "dataMax + 0.3"] : ["auto", "auto"]}
                        tickFormatter={(v) => activeChart === "pace" ? `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}` : `${Math.round(v)}`}
                        width={42}
                      />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        labelFormatter={(v) => `${v} km`}
                        formatter={(v: any) => {
                          if (activeChart === "pace") {
                            const m = Math.floor(v); const s = Math.round((v - m) * 60);
                            return [`${m}:${String(s).padStart(2, "0")}/km`, zh ? "配速" : "Pace"];
                          }
                          return [Math.round(v), activeChart === "heartrate" ? "bpm" : activeChart === "altitude" ? "m" : "spm"];
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey={activeChart}
                        stroke={chartColor}
                        strokeWidth={2}
                        fill="url(#chartGrad)"
                        isAnimationActive={false}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* HR zones + laps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {hrZones && (
              <HrZoneBars zones={hrZones} lang={lang} />
            )}
            {laps.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
                <h4 className="font-display font-semibold text-sm mb-3">{zh ? "圈數" : "Laps"}</h4>
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="text-left py-2">#</th>
                        <th className="text-right py-2">km</th>
                        <th className="text-right py-2">{zh ? "時間" : "Time"}</th>
                        <th className="text-right py-2">{zh ? "配速" : "Pace"}</th>
                        <th className="text-right py-2">HR</th>
                        <th className="text-right py-2">{zh ? "爬升" : "Elev"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laps.map((l) => (
                        <tr key={l.idx} className="border-b border-border/40">
                          <td className="py-1.5 font-semibold">{l.idx}</td>
                          <td className="text-right tabular-nums">{l.km.toFixed(2)}</td>
                          <td className="text-right tabular-nums">{fmtDuration(l.elapsed)}</td>
                          <td className="text-right tabular-nums">{fmtPace(l.pace)}</td>
                          <td className="text-right tabular-nums text-muted-foreground">{l.hr ? Math.round(l.hr) : "—"}</td>
                          <td className="text-right tabular-nums text-muted-foreground">{Math.round(l.elev)}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
