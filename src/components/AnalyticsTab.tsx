import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { ScanEye, LineChart, Pencil, Loader2, MoveVertical, LayoutGrid, List } from "lucide-react";
import ReorderableWidgetGrid from "@/components/analytics/ReorderableWidgetGrid";
import { Lang } from "@/lib/i18n";
import { PostureSkeleton } from "@/components/ui/PageSkeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useActivities } from "@/hooks/use-activities";
import {
  AnalyticsWidgetPrefs,
  DEFAULT_PREFS,
  WidgetId,
  loadPrefs,
  savePrefs,
} from "@/lib/analyticsWidgets";
import WidgetTilePreview from "@/components/analytics/widgets/WidgetTilePreview";
import WidgetDetailDialog from "@/components/analytics/WidgetDetailDialog";
import CustomizeWidgetsDialog from "@/components/analytics/CustomizeWidgetsDialog";

import HealthStatsCard from "@/components/analytics/HealthStatsCard";
import HRVReadinessCard from "@/components/analytics/HRVReadinessCard";
import HrZonesWeekCard from "@/components/analytics/HrZonesWeekCard";
import RacePredictorCard from "@/components/analytics/RacePredictorCard";
import TrainingLoadChart from "@/components/activities/TrainingLoadChart";
import TrendsCard from "@/components/activities/TrendsCard";
import ActivityYearHeatmap from "@/components/activities/ActivityYearHeatmap";
import { useTerraDailyHealth } from "@/hooks/use-terra-daily-health";

const PostureTab = lazy(() => import("@/components/PostureTab"));
const PerformanceTab = lazy(() => import("@/components/PerformanceTab"));

interface Props {
  lang: Lang;
}

type SubTab = "performance" | "posture";

const widgetLabel = (id: WidgetId, lang: Lang): string => {
  const zh = lang === "zh";
  switch (id) {
    case "hrv": return zh ? "HRV 與訓練準備度" : "HRV & Readiness";
    case "health": return zh ? "每日健康" : "Daily Health";
    case "hr_zones": return zh ? "心率區間" : "Heart rate zones";
    case "race_predictor": return zh ? "比賽預測" : "Race predictor";
    case "training_load": return zh ? "訓練負荷" : "Training load";
    case "trends": return zh ? "趨勢" : "Trends";
    case "year_heatmap": return zh ? "年度熱力圖" : "Year heatmap";
    case "steps_today": return zh ? "步數 (今日)" : "Steps (today)";
    case "calories_today": return zh ? "卡路里 (今日)" : "Calories (today)";
    case "sleep_last_night": return zh ? "睡眠 (昨晚)" : "Sleep (last night)";
    case "sleep_score": return zh ? "睡眠分數" : "Sleep score";
    case "rhr": return zh ? "靜息心率" : "Resting HR";
    case "duration_week": return zh ? "運動時數 (本週)" : "Duration (week)";
    case "injury_risk": return zh ? "受傷風險" : "Injury Risk";
    case "load_balance": return zh ? "負荷平衡" : "Load Balance";
  }
};

const AnalyticsTab = ({ lang }: Props) => {
  const { user } = useAuth();
  const { activities, profile } = useActivities();
  const { data: terraHistory } = useTerraDailyHealth();
  const [sub, setSub] = useState<SubTab>(() => {
    return (sessionStorage.getItem("analytics_subtab") as SubTab) || "performance";
  });
  const setSubTab = (s: SubTab) => {
    sessionStorage.setItem("analytics_subtab", s);
    setSub(s);
  };

  const [prefs, setPrefs] = useState<AnalyticsWidgetPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [openWidget, setOpenWidget] = useState<WidgetId | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [viewMode, setViewMode] = useState<"widgets" | "classic">(() => {
    return (localStorage.getItem("analytics_view_mode") as "widgets" | "classic") || "widgets";
  });
  const toggleViewMode = () => {
    const next = viewMode === "widgets" ? "classic" : "widgets";
    localStorage.setItem("analytics_view_mode", next);
    setViewMode(next);
  };

  useEffect(() => {
    if (!user?.id) { setPrefsLoaded(true); return; }
    let cancelled = false;
    loadPrefs(user.id).then((p) => {
      if (!cancelled) { setPrefs(p); setPrefsLoaded(true); }
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleSavePrefs = (next: AnalyticsWidgetPrefs) => {
    setPrefs(next);
    if (user?.id) void savePrefs(user.id, next);
  };

  const visibleWidgets = useMemo(
    () => prefs.order.filter((id) => !prefs.hidden.includes(id)),
    [prefs],
  );

  const labels = useMemo(() => {
    const out: Record<WidgetId, string> = {} as any;
    (["hrv","health","hr_zones","race_predictor","training_load","trends","year_heatmap","steps_today","calories_today","sleep_last_night","sleep_score","rhr","duration_week","injury_risk","load_balance"] as WidgetId[]).forEach((id) => {
      out[id] = widgetLabel(id, lang);
    });
    return out;
  }, [lang]);

  // Build details
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
    [activities],
  );

  const renderDetail = (id: WidgetId) => {
    switch (id) {
      case "hrv":
        return <HRVReadinessCard lang={lang} />;
      case "health":
      case "rhr":
      case "sleep_last_night":
      case "sleep_score":
      case "steps_today":
        return <HealthStatsCard lang={lang} />;
      case "hr_zones":
        return <HrZonesWeekCard lang={lang} />;
      case "race_predictor":
        return <RacePredictorCard lang={lang} />;
      case "training_load":
        return (
          <TrainingLoadChart
            lang={lang}
            activities={loadActivities}
            profileAge={(profile as any)?.age ?? null}
          />
        );
      case "trends":
        return <TrendsCard lang={lang} activities={loadActivities} />;
      case "year_heatmap":
        return <ActivityYearHeatmap lang={lang} activities={loadActivities} />;
      case "calories_today":
      case "duration_week":
      case "injury_risk":
      case "load_balance":
        return (
          <div className="text-sm text-muted-foreground">
            {lang === "zh"
              ? "請至『表現』分頁的傳統檢視查看完整詳情。"
              : "Open the Performance tab classic view for full details."}
          </div>
        );
    }
  };

  return (
    <div>
      <div className="px-5 pt-6 max-w-lg mx-auto">
        <div className="flex w-full border-b border-border mb-2">
          <button
            onClick={() => setSubTab("performance")}
            className={`flex-1 flex items-center justify-center gap-1.5 pb-3 pt-2 -mb-px border-b-2 text-base font-semibold transition-colors ${
              sub === "performance"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <LineChart size={16} />
            {lang === "zh" ? "表現" : "Performance"}
          </button>
          <button
            onClick={() => setSubTab("posture")}
            className={`flex-1 flex items-center justify-center gap-1.5 pb-3 pt-2 -mb-px border-b-2 text-base font-semibold transition-colors ${
              sub === "posture"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ScanEye size={16} />
            {lang === "zh" ? "跑姿" : "Posture"}
          </button>
        </div>
      </div>

      <div style={{ display: sub === "performance" ? "block" : "none" }}>
        <div className="px-4 pt-4 pb-8 max-w-lg mx-auto">
          {!prefsLoaded ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" size={20} />
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
                  {viewMode === "widgets" && <MoveVertical size={12} className="shrink-0" />}
                  <span className="truncate">
                    {viewMode === "widgets"
                      ? lang === "zh"
                        ? "提示：長按小工具可拖曳重新排序"
                        : "Tip: long-press a widget to drag and reorder"
                      : lang === "zh"
                        ? "傳統檢視"
                        : "Classic view"}
                  </span>
                </div>
                <button
                  onClick={toggleViewMode}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {viewMode === "widgets" ? <List size={12} /> : <LayoutGrid size={12} />}
                  {viewMode === "widgets"
                    ? lang === "zh" ? "傳統" : "Classic"
                    : lang === "zh" ? "小工具" : "Widgets"}
                </button>
              </div>
              {viewMode === "widgets" ? (
                <>
                  <ReorderableWidgetGrid
                    order={visibleWidgets}
                    lang={lang}
                    onOpen={(id) => setOpenWidget(id)}
                    onReorder={(nextVisible) => {
                      const hiddenInOrder = prefs.order.filter((id) => prefs.hidden.includes(id));
                      handleSavePrefs({ order: [...nextVisible, ...hiddenInOrder], hidden: prefs.hidden });
                    }}
                  />
                  <button
                    onClick={() => setCustomizing(true)}
                    className="mt-6 w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-primary hover:bg-primary/5 rounded-lg transition-colors"
                  >
                    <Pencil size={14} />
                    {lang === "zh" ? "自訂Dashboard" : "Customize dashboard"}
                  </button>
                </>
              ) : (
                <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>}>
                  <PerformanceTab lang={lang} />
                </Suspense>
              )}
            </>

          )}
        </div>


        <WidgetDetailDialog
          open={openWidget != null}
          onOpenChange={(o) => !o && setOpenWidget(null)}
          title={openWidget ? labels[openWidget] : ""}
        >
          {openWidget && renderDetail(openWidget)}
        </WidgetDetailDialog>

        <CustomizeWidgetsDialog
          open={customizing}
          onOpenChange={setCustomizing}
          prefs={prefs}
          onSave={handleSavePrefs}
          lang={lang}
          labels={labels}
        />
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
