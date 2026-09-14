import { useEffect, useMemo, useState } from "react";
import { Clock, Gauge, HeartPulse, Mountain, Route, Timer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ActivityMap from "@/components/activities/ActivityMap";
import HrZoneBars from "@/components/activities/HrZoneBars";
import ActivitySocial from "./ActivitySocial";
import GroupInviteMenu from "./GroupInviteMenu";
import { computeZonePct, type ZonePct } from "@/lib/hrZones";
import type { Lang } from "@/lib/i18n";

export interface FeedActivityRef { source: string; source_id: string }

interface DetailRow {
  source: string;
  source_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  started_at: string;
  activity_name: string | null;
  activity_type: string | null;
  distance_km: number;
  duration_s: number | null;
  elevation_m: number | null;
  summary_polyline: string | null;
}

interface StreamRow {
  avg_hr: number | null;
  max_hr: number | null;
  laps: any[] | null;
  hr_samples: Array<{ t?: number; bpm?: number | null }> | null;
  distance_samples: Array<{ t?: number; d?: number | null }> | null;
  zone_lowers: number[] | null;
}

interface SplitRow {
  label: string;
  km: number;
  seconds: number;
  hr: number | null;
}

const durationLabel = (seconds: number | null) => {
  const s = Math.max(0, Number(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`;
};

const paceLabel = (km: number, seconds: number | null) => {
  const s = Number(seconds || 0);
  if (!km || km <= 0 || s <= 0) return "--";
  const perKm = s / km;
  return `${Math.floor(perKm / 60)}:${String(Math.round(perKm % 60)).padStart(2, "0")}/km`;
};

const speedLabel = (km: number, seconds: number | null) => {
  const s = Number(seconds || 0);
  if (!km || km <= 0 || s <= 0) return "--";
  return `${(km / (s / 3600)).toFixed(1)} km/h`;
};

/** Laps stored by Garmin/Terra → split rows. */
function lapsToSplits(laps: any[]): SplitRow[] {
  return laps
    .map((lap, i) => {
      const meters = Number(lap.distance_meters ?? lap.distance ?? 0);
      const seconds = Number(lap.duration_seconds ?? lap.moving_time ?? lap.elapsed_time ?? 0);
      const hr = lap.avg_hr ?? lap.average_hr ?? lap.average_heartrate ?? null;
      return {
        label: String(lap.lap_index ?? i + 1),
        km: meters / 1000,
        seconds,
        hr: typeof hr === "number" ? Math.round(hr) : null,
      };
    })
    .filter((s) => s.km > 0.05 && s.seconds > 0);
}

/** Derive 1 km splits (with average HR) from per-second distance + HR samples. */
function samplesToSplits(
  distance: Array<{ t?: number; d?: number | null }>,
  hr: Array<{ t?: number; bpm?: number | null }>,
): SplitRow[] {
  const hrAt = new Map<number, number>();
  for (const s of hr) {
    if (typeof s?.t === "number" && typeof s?.bpm === "number") hrAt.set(s.t, s.bpm);
  }
  const pts = distance
    .filter((s) => typeof s?.t === "number" && typeof s?.d === "number")
    .map((s) => ({ t: Number(s.t), d: Number(s.d) }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 10) return [];

  const out: SplitRow[] = [];
  let startT = pts[0].t;
  let nextKm = 1;
  let hrSum = 0;
  let hrCount = 0;
  for (const p of pts) {
    const bpm = hrAt.get(p.t);
    if (typeof bpm === "number") { hrSum += bpm; hrCount++; }
    if (p.d / 1000 >= nextKm) {
      out.push({
        label: String(nextKm),
        km: 1,
        seconds: p.t - startT,
        hr: hrCount ? Math.round(hrSum / hrCount) : null,
      });
      startT = p.t;
      nextKm += 1;
      hrSum = 0;
      hrCount = 0;
    }
  }
  const last = pts[pts.length - 1];
  const leftover = last.d / 1000 - (nextKm - 1);
  if (leftover > 0.05) {
    out.push({
      label: `${(nextKm - 1 + leftover).toFixed(2)}`,
      km: leftover,
      seconds: last.t - startT,
      hr: hrCount ? Math.round(hrSum / hrCount) : null,
    });
  }
  return out.filter((s) => s.seconds > 0);
}


export default function FeedActivityDetail({ activity, lang, onClose }: { activity: FeedActivityRef; lang: Lang; onClose: () => void }) {
  const zh = lang === "zh";
  const [row, setRow] = useState<DetailRow | null>(null);
  const [extra, setExtra] = useState<StreamRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setExtra(null);
    (supabase.rpc as any)("get_social_activity_detail", { p_source: activity.source, p_source_id: activity.source_id })
      .then(({ data, error }: { data: DetailRow[] | null; error: unknown }) => {
        if (cancelled) return;
        const first = (data || [])[0] || null;
        if (error || !first) setFailed(true);
        setRow(first);
        setLoading(false);
      });
    (supabase.rpc as any)("get_social_activity_streams", { p_source: activity.source, p_source_id: activity.source_id })
      .then(({ data }: { data: StreamRow[] | null }) => {
        if (cancelled) return;
        setExtra((data || [])[0] || null);
      });
    return () => { cancelled = true; };
  }, [activity.source, activity.source_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const km = Number(row?.distance_km || 0);

  const splits = useMemo<SplitRow[]>(() => {
    if (!extra) return [];
    if (Array.isArray(extra.laps) && extra.laps.length > 0) {
      const fromLaps = lapsToSplits(extra.laps);
      if (fromLaps.length > 0) return fromLaps;
    }
    if (Array.isArray(extra.distance_samples) && Array.isArray(extra.hr_samples)) {
      return samplesToSplits(extra.distance_samples, extra.hr_samples);
    }
    return [];
  }, [extra]);

  const zones = useMemo<ZonePct | null>(() => {
    const samples = extra?.hr_samples;
    if (!Array.isArray(samples) || samples.length === 0) return null;
    const bpm = samples.map((s) => (typeof s?.bpm === "number" ? s.bpm : null));
    const lowers = Array.isArray(extra?.zone_lowers) ? extra!.zone_lowers!.map(Number) : null;
    return computeZonePct(bpm, 190, 60, lowers);
  }, [extra]);

  const avgHr = typeof extra?.avg_hr === "number" ? Math.round(extra.avg_hr) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div style={{ height: "var(--safe-area-top, 0px)" }} className="shrink-0" />
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={onClose} aria-label={zh ? "關閉" : "Close"} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
          <X size={20} />
        </button>
        <p className="truncate text-sm font-semibold">{zh ? "跑步詳情" : "Run details"}</p>
        {row ? (
          <div className="ml-auto">
            <GroupInviteMenu
              targetUserId={row.user_id}
              targetName={row.display_name || (zh ? "跑者" : "Runner")}
              lang={lang}
            />
          </div>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {loading ? (
          <div className="space-y-4">
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
            <div className="h-48 animate-pulse rounded-lg bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : failed || !row ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {zh ? "此跑步已不可查看" : "This run is no longer available to view"}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar><AvatarImage src={row.avatar_url || undefined} /><AvatarFallback>{(row.display_name || "R")[0]}</AvatarFallback></Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{row.display_name || (zh ? "跑者" : "Runner")}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.started_at).toLocaleString(zh ? "zh-HK" : "en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            <h2 className="text-lg font-semibold">{row.activity_name || row.activity_type || (zh ? "跑步" : "Run")}</h2>

            {row.summary_polyline ? (
              <ActivityMap polyline={row.summary_polyline} lang={lang} className="h-56 w-full overflow-hidden rounded-lg" />
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<Route size={15} className="text-primary" />} label={zh ? "距離" : "Distance"} value={`${km.toFixed(2)} km`} />
              <Stat icon={<Clock size={15} className="text-primary" />} label={zh ? "時間" : "Moving time"} value={durationLabel(row.duration_s)} />
              <Stat icon={<Timer size={15} className="text-primary" />} label={zh ? "平均配速" : "Avg pace"} value={paceLabel(km, row.duration_s)} />
              <Stat icon={<Gauge size={15} className="text-primary" />} label={zh ? "平均速度" : "Avg speed"} value={speedLabel(km, row.duration_s)} />
              <Stat icon={<Mountain size={15} className="text-primary" />} label={zh ? "爬升" : "Elevation gain"} value={`${Math.round(Number(row.elevation_m || 0))} m`} />
              <Stat icon={<HeartPulse size={15} className="text-primary" />} label={zh ? "平均心率" : "Avg HR"} value={avgHr ? `${avgHr} bpm` : "--"} />
            </div>

            {splits.length > 0 && (
              <div className="rounded-lg border border-border bg-card">
                <p className="border-b border-border px-3 py-2 text-sm font-semibold">{zh ? "分段" : "Splits"}</p>
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-4 px-3 py-1.5 text-[11px] text-muted-foreground">
                    <span>{zh ? "段" : "Split"}</span>
                    <span className="text-right">{zh ? "距離" : "Dist"}</span>
                    <span className="text-right">{zh ? "配速" : "Pace"}</span>
                    <span className="text-right">{zh ? "心率" : "HR"}</span>
                  </div>
                  {splits.map((s, i) => (
                    <div key={`${s.label}-${i}`} className="grid grid-cols-4 px-3 py-2 text-sm tabular-nums">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-right">{s.km.toFixed(2)} km</span>
                      <span className="text-right">{paceLabel(s.km, s.seconds)}</span>
                      <span className="text-right">{s.hr ? `${s.hr}` : "--"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {zones && <HrZoneBars zones={zones} lang={lang} />}

            <ActivitySocial source={row.source} sourceId={row.source_id} lang={lang} />
          </div>
        )}
      </div>
    </div>
  );
}


function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}
