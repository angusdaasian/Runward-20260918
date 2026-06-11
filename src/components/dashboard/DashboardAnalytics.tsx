import { useMemo, useState, lazy, Suspense } from "react";
import {
  LineChart,
  ScanEye,
  Activity,
  Heart,
  Zap,
  Target,
  TrendingUp,
  CalendarRange,
  Flame,
  Loader2,
} from "lucide-react";
import { Lang } from "@/lib/i18n";
import DesktopPageHeader from "./DesktopPageHeader";
import { Card } from "@/components/ui/card";
import { PostureSkeleton } from "@/components/ui/PageSkeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useActivities } from "@/hooks/use-activities";

import HealthStatsCard from "@/components/analytics/HealthStatsCard";
import HRVReadinessCard from "@/components/analytics/HRVReadinessCard";
import HrZonesWeekCard from "@/components/analytics/HrZonesWeekCard";
import RacePredictorCard from "@/components/analytics/RacePredictorCard";
import TrainingLoadChart from "@/components/activities/TrainingLoadChart";
import TrendsCard from "@/components/activities/TrendsCard";
import ActivityYearHeatmap from "@/components/activities/ActivityYearHeatmap";

const DesktopPostureAnalysis = lazy(() => import("./DesktopPostureAnalysis"));

interface Props {
  lang: Lang;
}

type SubTab = "performance" | "posture";

export default function DashboardAnalytics({ lang }: Props) {
  const zh = lang === "zh";
  const { user } = useAuth();
  const { activities, profile, loading } = useActivities();

  const [sub, setSub] = useState<SubTab>(
    () => (sessionStorage.getItem("dash_analytics_subtab") as SubTab) || "performance"
  );
  const setSubTab = (s: SubTab) => {
    sessionStorage.setItem("dash_analytics_subtab", s);
    setSub(s);
  };

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
        distance: a.distance,
        total_elevation_gain: a.total_elevation_gain,
        average_speed: a.average_speed,
      })),
    [activities]
  );

  return (
    <div>
      <DesktopPageHeader
        title={zh ? "分析" : "Analytics"}
        subtitle={
          zh
            ? "表現、心率、姿勢全方位追蹤"
            : "Performance, heart rate, and posture insights"
        }
        icon={<Activity className="h-5 w-5" />}
        actions={
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setSubTab("performance")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                sub === "performance"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LineChart size={14} />
              {zh ? "表現" : "Performance"}
            </button>
            <button
              onClick={() => setSubTab("posture")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                sub === "posture"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ScanEye size={14} />
              {zh ? "跑姿" : "Posture"}
            </button>
          </div>
        }
      />

      {sub === "performance" && (
        <PerformanceDesktop
          lang={lang}
          loading={loading}
          hasUser={!!user}
          hasActivities={activities.length > 0}
          loadActivities={loadActivities}
          profileAge={(profile as any)?.age ?? null}
        />
      )}

      {sub === "posture" && (
        <Suspense fallback={<PostureSkeleton />}>
          <DesktopPostureAnalysis lang={lang} />
        </Suspense>
      )}
    </div>
  );
}

interface PerfProps {
  lang: Lang;
  loading: boolean;
  hasUser: boolean;
  hasActivities: boolean;
  loadActivities: any[];
  profileAge: number | null;
}

function PerformanceDesktop({
  lang,
  loading,
  hasUser,
  hasActivities,
  loadActivities,
  profileAge,
}: PerfProps) {
  const zh = lang === "zh";

  if (!hasUser) {
    return (
      <Card className="p-12 text-center">
        <p className="text-sm text-muted-foreground">
          {zh ? "請先登入以查看表現分析" : "Sign in to view performance analytics"}
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Row 1 — Health + Readiness side by side */}
      <Section
        icon={<Heart className="h-4 w-4 text-rose-500" />}
        label={zh ? "今日健康" : "Today's Health"}
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <DashCard><HealthStatsCard lang={lang} /></DashCard>
          <DashCard><HRVReadinessCard lang={lang} /></DashCard>
        </div>
      </Section>

      {hasActivities && (
        <>
          {/* Row 2 — Training Load full width */}
          <Section
            icon={<TrendingUp className="h-4 w-4 text-primary" />}
            label={zh ? "訓練負荷" : "Training Load"}
          >
            <DashCard>
              <TrainingLoadChart
                lang={lang}
                activities={loadActivities}
                profileAge={profileAge}
              />
            </DashCard>
          </Section>

          {/* Row 3 — HR Zones + Race predictor */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Section
              icon={<Zap className="h-4 w-4 text-amber-500" />}
              label={zh ? "心率區間 (本週)" : "Heart Rate Zones (week)"}
            >
              <DashCard><HrZonesWeekCard lang={lang} /></DashCard>
            </Section>

            <Section
              icon={<Target className="h-4 w-4 text-emerald-500" />}
              label={zh ? "比賽預測" : "Race Predictor"}
            >
              <DashCard><RacePredictorCard lang={lang} /></DashCard>
            </Section>
          </div>

          {/* Row 4 — Trends full width */}
          <Section
            icon={<LineChart className="h-4 w-4 text-sky-500" />}
            label={zh ? "趨勢比較" : "Trends"}
          >
            <DashCard>
              <TrendsCard lang={lang} activities={loadActivities} />
            </DashCard>
          </Section>

          {/* Row 5 — Year heatmap full width */}
          <Section
            icon={<CalendarRange className="h-4 w-4 text-fuchsia-500" />}
            label={zh ? "年度活動" : "Year in Activity"}
          >
            <DashCard>
              <ActivityYearHeatmap lang={lang} activities={loadActivities} />
            </DashCard>
          </Section>
        </>
      )}

      {!hasActivities && (
        <Card className="p-12 text-center">
          <Flame className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {zh
              ? "同步活動以查看訓練負荷與趨勢"
              : "Sync activities to see your training load and trends"}
          </p>
        </Card>
      )}
    </div>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </section>
  );
}

/**
 * Wrap mobile-first cards in a desktop-friendly container that neutralises
 * their full-bleed padding/margins so they sit cleanly in a dashboard grid.
 */
function DashCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-4 md:p-5 overflow-hidden [&>*]:!mx-0 [&>*]:!my-0 [&>*]:!rounded-none [&>*]:!border-0 [&>*]:!shadow-none [&>*]:!bg-transparent [&>*]:!p-0">
      {children}
    </Card>
  );
}
