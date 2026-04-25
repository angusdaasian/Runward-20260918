import { useMemo } from "react";
import { Lang } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useActivities } from "@/hooks/use-activities";
import TrainingLoadChart from "@/components/activities/TrainingLoadChart";
import TrendsCard from "@/components/activities/TrendsCard";
import ActivityYearHeatmap from "@/components/activities/ActivityYearHeatmap";
import { ActivityListSkeleton } from "@/components/ui/PageSkeleton";

interface Props {
  lang: Lang;
}

const PerformanceTab = ({ lang }: Props) => {
  const { user } = useAuth();
  const { activities, profile, loading } = useActivities();

  const loadActivities = useMemo(
    () =>
      activities.map((a) => ({
        start_date: a.start_date,
        moving_time: a.moving_time,
        average_heartrate: a.average_heartrate,
        max_heartrate: a.max_heartrate,
        sport_type: a.sport_type,
        source: a.source,
        garmin_training_load: (a as any).garmin_training_load ?? null,
        // extras for trend comparison:
        distance: a.distance,
        total_elevation_gain: a.total_elevation_gain,
        average_speed: a.average_speed,
      })),
    [activities],
  );

  if (!user) {
    return (
      <div className="px-5 pt-6 max-w-lg mx-auto pb-4">
        <p className="text-sm text-muted-foreground text-center py-12">
          {lang === "zh" ? "請先登入以查看表現分析" : "Sign in to view performance analytics"}
        </p>
      </div>
    );
  }

  if (loading) return <ActivityListSkeleton />;

  const hasActivities = activities.length > 0;

  if (!hasActivities) {
    return (
      <div className="px-5 pt-6 max-w-lg mx-auto pb-4">
        <h2 className="font-display text-xl font-bold text-foreground mb-1">
          {lang === "zh" ? "表現分析" : "Performance"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {lang === "zh"
            ? "同步活動以查看訓練負荷與趨勢"
            : "Sync activities to see your training load and trends"}
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-2 max-w-lg mx-auto pb-4">
      {/* All charts free for everyone */}
      <ActivityYearHeatmap lang={lang} activities={loadActivities} />

      <TrainingLoadChart
        lang={lang}
        activities={loadActivities}
        profileAge={(profile as any)?.age ?? null}
      />

      <TrendsCard lang={lang} activities={loadActivities} />
    </div>
  );
};

export default PerformanceTab;
