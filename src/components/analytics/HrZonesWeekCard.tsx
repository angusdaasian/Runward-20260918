import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { usePremium } from "@/contexts/PremiumContext";
import { supabase } from "@/integrations/supabase/client";
import { combineZonePct, estimateMaxHr, estimateRestingHr, ZonePct } from "@/lib/hrZones";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { ZoneBars } from "@/components/ui/ZoneBars";

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
        // Only attempt if user has a Strava connection (avoids 404s for non-Strava users)
        const { data: stravaConn } = await supabase
          .from("strava_connections")
          .select("id")
          .maybeSingle();
        const stravaToFetch = stravaConn
          ? weekActivities.filter(
              (a) => a.strava_id && (!a.hr_samples || a.hr_samples.length === 0),
            )
          : [];
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
    <SurfaceCard className="mb-4">
      <div className="mb-3 flex items-center gap-2">
        <Heart size={16} className="text-hr" />
        <h3 className="font-display text-h3 font-semibold text-card-foreground">
          {lang === "zh" ? "本週心率區間" : "Weekly HR Zones"}
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : (
        <>
          {zones ? (
            <p className="mb-3 text-caption text-muted-foreground">
              {profileCustomZones && profileCustomZones.length === 5
                ? (lang === "zh"
                    ? `自訂心率區間 · 基於 ${activityCount} 次活動`
                    : `Custom HR zones · ${activityCount} activities`)
                : (lang === "zh"
                    ? `基於 ${activityCount} 次活動 · 最大 ${estimateMaxHr(age, profileMaxHr)} / 靜息 ${estimateRestingHr(profileRestingHr)} bpm`
                    : `${activityCount} activities · max ${estimateMaxHr(age, profileMaxHr)} / rest ${estimateRestingHr(profileRestingHr)} bpm`)}
            </p>
          ) : null}
          <ZoneBars zones={zones} variant="hr" lang={lang} />
        </>
      )}
    </SurfaceCard>
  );
};

export default HrZonesWeekCard;
