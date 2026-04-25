import { useMemo } from "react";
import { Crown } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { useActivities } from "@/hooks/use-activities";
import TrainingLoadChart from "@/components/activities/TrainingLoadChart";
import TrainingLoadChartLocked from "@/components/activities/TrainingLoadChartLocked";
import TrendsCard from "@/components/activities/TrendsCard";
import ActivityYearHeatmap from "@/components/activities/ActivityYearHeatmap";
import { ActivityListSkeleton } from "@/components/ui/PageSkeleton";

interface Props {
  lang: Lang;
}

const PerformanceTab = ({ lang }: Props) => {
  const { user } = useAuth();
  const { isPremium } = usePremium();
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
      {!isPremium && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 bg-muted/50 rounded-lg px-3 py-2">
          <Crown size={14} className="text-warning shrink-0" />
          {lang === "zh"
            ? "升級高級版以解鎖完整訓練負荷曲線"
            : "Upgrade to Premium to unlock the full training load curve"}
        </div>
      )}

      {isPremium ? (
        <TrainingLoadChart
          lang={lang}
          activities={loadActivities}
          profileAge={(profile as any)?.age ?? null}
        />
      ) : (
        <TrainingLoadChartLocked lang={lang} />
      )}

      {/* Free for all users */}
      <TrendsCard lang={lang} activities={loadActivities} />
      <ActivityYearHeatmap lang={lang} activities={loadActivities} />
    </div>
  );
};

export default PerformanceTab;
