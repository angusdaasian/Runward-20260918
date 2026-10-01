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
        {lang === "zh" ? "需要近 90 天內至少兩個心率區間的跑步紀錄。" : "Needs runs with heart rate in at least two zones over the last 90 days."}
      </div>
    );
  }
  return <PaceZoneBars lang={lang} zones={zones} />;
};

export default PaceZonesCard;
