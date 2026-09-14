import { useEffect, useState } from "react";
import { Clock, Gauge, Mountain, Route, Timer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ActivityMap from "@/components/activities/ActivityMap";
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

export default function FeedActivityDetail({ activity, lang, onClose }: { activity: FeedActivityRef; lang: Lang; onClose: () => void }) {
  const zh = lang === "zh";
  const [row, setRow] = useState<DetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (supabase.rpc as any)("get_social_activity_detail", { p_source: activity.source, p_source_id: activity.source_id })
      .then(({ data, error }: { data: DetailRow[] | null; error: unknown }) => {
        if (cancelled) return;
        const first = (data || [])[0] || null;
        if (error || !first) setFailed(true);
        setRow(first);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activity.source, activity.source_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const km = Number(row?.distance_km || 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div style={{ height: "var(--safe-area-top, 0px)" }} className="shrink-0" />
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={onClose} aria-label={zh ? "關閉" : "Close"} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
          <X size={20} />
        </button>
        <p className="truncate text-sm font-semibold">{zh ? "跑步詳情" : "Run details"}</p>
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
              <Stat icon={<Route size={15} className="text-primary" />} label={zh ? "運動類型" : "Sport"} value={row.activity_type || (zh ? "跑步" : "Run")} />
            </div>

            <p className="text-[11px] text-muted-foreground">
              {zh ? "為保護隱私，社群動態不顯示心率或健康數據。" : "For privacy, community runs never show heart rate or health data."}
            </p>
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
