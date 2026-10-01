import { useMemo } from "react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { computePaceZones } from "@/lib/paceZones";
import PaceZoneBars from "@/components/activities/PaceZoneBars";

const PaceZonesCard = ({ lang }: { lang: Lang }) => {
  const { activities, profile } = useActivities();
  const zones = useMemo(() => computePaceZones(activities as any[], profile as any), [activities, profile]);
  if (!zones) {
    return (
      <div className="bg-card rounded-2xl p-5 ring-1 ring-border text-sm text-muted-foreground">
        <div className="font-display font-bold text-sm text-foreground mb-1">{lang === "zh" ? "配速區間" : "Pace Zones"}</div>
        {lang === "zh" ? "需要至少兩個心率區間的跑步紀錄。連結後會先使用 30 天紀錄，之後持續累積。" : "Needs runs in at least two heart-rate zones. It starts with the 30-day backfill and keeps accumulating."}
      </div>
    );
  }
  return <PaceZoneBars lang={lang} zones={zones} />;
};

export default PaceZonesCard;
