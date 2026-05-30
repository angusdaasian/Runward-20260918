import { useState, lazy, Suspense } from "react";
import { LineChart, ScanEye, Activity, Heart, Zap, Target } from "lucide-react";
import { Lang } from "@/lib/i18n";
import DesktopPageHeader from "./DesktopPageHeader";
import { Card } from "@/components/ui/card";
import { PostureSkeleton } from "@/components/ui/PageSkeleton";
import HealthStatsCard from "@/components/analytics/HealthStatsCard";
import HRVReadinessCard from "@/components/analytics/HRVReadinessCard";
import HrZonesWeekCard from "@/components/analytics/HrZonesWeekCard";
import RacePredictorCard from "@/components/analytics/RacePredictorCard";

const PostureTab = lazy(() => import("@/components/PostureTab"));
const PerformanceTab = lazy(() => import("@/components/PerformanceTab"));

interface Props {
  lang: Lang;
}

type SubTab = "performance" | "posture";

export default function DashboardAnalytics({ lang }: Props) {
  const zh = lang === "zh";
  const [sub, setSub] = useState<SubTab>(
    () => (sessionStorage.getItem("dash_analytics_subtab") as SubTab) || "performance"
  );
  const setSubTab = (s: SubTab) => {
    sessionStorage.setItem("dash_analytics_subtab", s);
    setSub(s);
  };

  return (
    <div>
      <DesktopPageHeader
        title={zh ? "分析" : "Analytics"}
        subtitle={zh ? "表現、心率、姿勢全方位追蹤" : "Performance, heart rate, and posture insights"}
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
        <div className="space-y-6">
          {/* Cards grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <SectionLabel icon={<Heart className="h-4 w-4 text-rose-500" />} label={zh ? "健康指標" : "Health"} />
              <HealthStatsCard lang={lang} />
              <HRVReadinessCard lang={lang} />
            </div>
            <div className="space-y-4">
              <SectionLabel icon={<Zap className="h-4 w-4 text-amber-500" />} label={zh ? "心率區間" : "Heart rate zones"} />
              <HrZonesWeekCard lang={lang} />
              <SectionLabel icon={<Target className="h-4 w-4 text-emerald-500" />} label={zh ? "比賽預測" : "Race predictor"} />
              <RacePredictorCard lang={lang} />
            </div>
          </div>

          {/* Performance deep-dive */}
          <Card className="p-6">
            <SectionLabel
              icon={<LineChart className="h-4 w-4 text-primary" />}
              label={zh ? "詳細表現分析" : "Performance deep dive"}
            />
            <div className="mt-2">
              <Suspense fallback={<PostureSkeleton />}>
                <PerformanceTab lang={lang} />
              </Suspense>
            </div>
          </Card>
        </div>
      )}

      {sub === "posture" && (
        <Card className="p-6">
          <Suspense fallback={<PostureSkeleton />}>
            <PostureTab lang={lang} />
          </Suspense>
        </Card>
      )}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );
}
