import { useState, lazy, Suspense } from "react";
import { ScanEye, LineChart } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { PostureSkeleton } from "@/components/ui/PageSkeleton";
import HealthStatsCard from "@/components/analytics/HealthStatsCard";

const PostureTab = lazy(() => import("@/components/PostureTab"));
const PerformanceTab = lazy(() => import("@/components/PerformanceTab"));

interface Props {
  lang: Lang;
}

type SubTab = "performance" | "posture";

const AnalyticsTab = ({ lang }: Props) => {
  const [sub, setSub] = useState<SubTab>(() => {
    return (sessionStorage.getItem("analytics_subtab") as SubTab) || "performance";
  });

  const setSubTab = (s: SubTab) => {
    sessionStorage.setItem("analytics_subtab", s);
    setSub(s);
  };

  return (
    <div>
      <div className="px-5 pt-6 max-w-lg mx-auto">
        <h1 className="font-display text-3xl font-bold text-foreground mb-1">
          {lang === "zh" ? "分析" : "Analytics"}
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          {lang === "zh"
            ? "追蹤訓練負荷、趨勢與跑姿"
            : "Track your training load, trends and running form"}
        </p>

        {/* Sub-tab switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted mb-2">
          <button
            onClick={() => setSubTab("performance")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              sub === "performance"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LineChart size={15} />
            {lang === "zh" ? "表現" : "Performance"}
          </button>
          <button
            onClick={() => setSubTab("posture")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              sub === "posture"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ScanEye size={15} />
            {lang === "zh" ? "跑姿" : "Posture"}
          </button>
        </div>
      </div>

      <div style={{ display: sub === "performance" ? "block" : "none" }}>
        <div className="px-5 pt-4 max-w-lg mx-auto">
          <HealthStatsCard lang={lang} />
        </div>
        <Suspense fallback={<div className="px-5 pt-4"><PostureSkeleton /></div>}>
          <PerformanceTab lang={lang} />
        </Suspense>
      </div>
      <div style={{ display: sub === "posture" ? "block" : "none" }}>
        <Suspense fallback={<PostureSkeleton />}>
          <PostureTab lang={lang} />
        </Suspense>
      </div>
    </div>
  );
};

export default AnalyticsTab;
