import { useEffect, useMemo, useState } from "react";
import { Heart, Lock, Sparkles } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { usePremium } from "@/contexts/PremiumContext";
import { supabase } from "@/integrations/supabase/client";
import { combineZonePct, estimateMaxHr, estimateRestingHr, ZonePct, ZONE_LABELS } from "@/lib/hrZones";

interface Props {
  lang: Lang;
}

const HrZonesWeekCard = ({ lang }: Props) => {
  const { activities, profile } = useActivities();
  const { isPremium } = usePremium();
  const [loading, setLoading] = useState(false);
  const [zones, setZones] = useState<ZonePct | null>(null);
  const [activityCount, setActivityCount] = useState(0);

  const weekActivities = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return activities.filter((a) => new Date(a.start_date).getTime() >= cutoff);
  }, [activities]);

  const age = (profile as any)?.age ?? null;
  const profileMaxHr = (profile as any)?.max_heartrate ?? null;
  const profileRestingHr = (profile as any)?.resting_heartrate ?? null;
  const profileCustomZones = (profile as any)?.custom_hr_zones ?? null;

  useEffect(() => {
    if (!isPremium) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const maxHr = estimateMaxHr(age, profileMaxHr);
        const restHr = estimateRestingHr(profileRestingHr);
        const custom = profileCustomZones;
        const parts: Array<{ samples: Array<number | null | undefined>; maxHr: number; restHr: number; custom?: number[] | null }> = [];
        let used = 0;

        // Terra hr_samples already loaded
        for (const a of weekActivities) {
          if (Array.isArray(a.hr_samples) && a.hr_samples.length > 10) {
            parts.push({ samples: a.hr_samples.map((s: any) => s.bpm), maxHr, restHr, custom });
            used++;
          }
        }

        // Strava: fetch streams on demand for past-week activities
        const stravaToFetch = weekActivities.filter(
          (a) => a.strava_id && (!a.hr_samples || a.hr_samples.length === 0),
        );
        if (stravaToFetch.length > 0) {
          const results = await Promise.all(
            stravaToFetch.slice(0, 15).map(async (a) => {
              try {
                const { data, error } = await supabase.functions.invoke("strava-activity-streams", {
                  body: { strava_id: a.strava_id },
                });
                if (error || !data?.streams) return null;
                const hrStream = data.streams.find((s: any) => s.type === "heartrate");
                if (!hrStream?.data?.length) return null;
                return { samples: hrStream.data, maxHr, restHr, custom };
              } catch {
                return null;
              }
            }),
          );
          for (const r of results) {
            if (r) {
              parts.push(r);
              used++;
            }
          }
        }

        if (!cancelled) {
          setZones(combineZonePct(parts));
          setActivityCount(used);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPremium, weekActivities, age, profileMaxHr, profileRestingHr, profileCustomZones]);

  if (!isPremium) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.15)] ring-1 ring-slate-200/70 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Heart size={16} className="text-destructive" />
        <h3 className="font-display font-bold text-slate-900 text-sm">
          {lang === "zh" ? "本週心率區間" : "Weekly HR Zones"}
        </h3>
        <span className="ml-auto text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
          PREMIUM
        </span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
        </div>
      ) : !zones ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          {lang === "zh"
            ? "過去 7 天沒有可用的心率資料。"
            : "No heart rate data available for the past 7 days."}
        </p>
      ) : (
        <>
          <p className="text-[11px] text-slate-500 mb-3">
            {profileCustomZones && profileCustomZones.length === 5
              ? (lang === "zh"
                  ? `自訂心率區間 · 基於 ${activityCount} 次活動`
                  : `Custom HR zones · ${activityCount} activities`)
              : (lang === "zh"
                  ? `基於 ${activityCount} 次活動 · 最大 ${estimateMaxHr(age, profileMaxHr)} / 靜息 ${estimateRestingHr(profileRestingHr)} bpm`
                  : `${activityCount} activities · max ${estimateMaxHr(age, profileMaxHr)} / rest ${estimateRestingHr(profileRestingHr)} bpm`)}
          </p>
          <div className="space-y-2">
            {ZONE_LABELS.map((z) => {
              const pct = zones[z.key];
              return (
                <div key={z.key} className="flex items-center gap-3">
                  <div className="w-20 text-[11px] font-semibold text-slate-700 shrink-0">
                    {lang === "zh" ? z.labelZh : z.label}
                  </div>
                  <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                        backgroundColor: z.color,
                      }}
                    />
                  </div>
                  <div className="w-10 text-right text-[11px] font-mono font-semibold text-slate-700 tabular-nums">
                    {pct.toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default HrZonesWeekCard;
