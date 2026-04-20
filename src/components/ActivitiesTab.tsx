import { useState, useEffect, useMemo, useCallback } from "react";
import { usePremium } from "@/contexts/PremiumContext";
import {
  Clock,
  MapPin,
  Zap,
  Heart,
  TrendingUp,
  Activity,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  RefreshCw,
  Flame,
  Timer,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ActivityMap from "@/components/activities/ActivityMap";
import ActivityCalendar from "@/components/activities/ActivityCalendar";
import MonthlyRoadQuest from "@/components/activities/MonthlyRoadQuest";
import ActivityDetail from "@/components/activities/ActivityDetail";
import ManualGarminImport from "@/components/activities/ManualGarminImport";
import CorosGpxImport from "@/components/activities/CorosGpxImport";
import SuggestedNextWorkout from "@/components/activities/SuggestedNextWorkout";
import { calculateRunningScore } from "@/lib/vdot";
import { useActivities, type StravaActivity } from "@/hooks/use-activities";
import FadeIn from "@/components/ui/FadeIn";
import { ActivityListSkeleton } from "@/components/ui/PageSkeleton";
import { useAppleHealth, type HealthStats } from "@/hooks/use-apple-health";

interface Props {
  lang: Lang;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(avgSpeed: number): string {
  if (avgSpeed <= 0) return "--";
  const paceSeconds = 1000 / avgSpeed;
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.floor(paceSeconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(2);
}

function getActivityScore(distance: number, movingTime: number): number | null {
  if (distance < 400 || movingTime < 60) return null;
  const score = calculateRunningScore(distance, movingTime);
  if (score < 5 || score > 100 || !isFinite(score)) return null;
  return Math.round(score * 10) / 10;
}

function formatSleep(minutes: number): string {
  if (minutes <= 0) return "--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

const runningSportTypes = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill", "running", "trail_running", "treadmill_running"]);

const sportTypeIcon: Record<string, string> = {
  Run: "🏃",
  TrailRun: "⛰️",
  Walk: "🚶",
  Ride: "🚴",
  Swim: "🏊",
  Hike: "🥾",
};

// ---------- Today Stats ----------
const TodayStats = ({ lang, healthStats }: { lang: Lang; healthStats: HealthStats | null }) => {
  if (!healthStats) return null;

  const stats = healthStats;

  const statCards = [
    {
      emoji: "👟",
      label: lang === "zh" ? "每日步數" : "Daily Steps",
      value: stats.steps > 0 ? stats.steps.toLocaleString() : "--",
      unit: lang === "zh" ? "步" : "Steps",
    },
    {
      emoji: "🔥",
      label: lang === "zh" ? "卡路里" : "Calories",
      value: stats.caloriesBurned > 0 ? stats.caloriesBurned.toLocaleString() : "--",
      unit: "kcal",
    },
    {
      emoji: "🚶",
      label: lang === "zh" ? "距離" : "Distance",
      value: stats.walkRunDistanceKm > 0 ? `${stats.walkRunDistanceKm}` : "--",
      unit: "km",
      tooltip: lang === "zh" ? "今日跑步與步行的總距離" : "Today's Running and Walking Distance",
    },
    {
      emoji: "🛏️",
      label: lang === "zh" ? "睡眠" : "Sleep",
      value: formatSleep(stats.sleepMinutes),
      unit: "",
    },
  ];

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg font-bold text-foreground">{lang === "zh" ? "今日統計" : "Today Stats"}</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {statCards.map((card, i) => (
          <div key={i} className="min-w-[140px] flex-1 bg-card border border-border rounded-2xl p-3.5 relative">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">{card.emoji}</span>
              <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
              {card.tooltip && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <HelpCircle size={12} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" className="text-xs w-auto max-w-[200px] p-2">
                    {card.tooltip}
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{card.value}</span>
              {card.unit && <span className="text-xs text-muted-foreground">{card.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- Activity Card ----------
const ActivityCard = ({
  act,
  lang,
  score,
  onClick,
}: {
  act: StravaActivity;
  lang: Lang;
  score: number | null;
  onClick?: () => void;
}) => (
  <div
    className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors"
    onClick={onClick}
  >
    <div className="flex items-start justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{sportTypeIcon[act.sport_type] || "🏃"}</span>
        <div>
          <h3 className="font-medium text-foreground text-sm">{act.name}</h3>
          <span className="text-xs text-muted-foreground">
{new Date(act.start_date).toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              weekday: "short",
            })}
            {" "}
            {new Date(act.start_date).toLocaleTimeString(lang === "zh" ? "zh-TW" : "en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {act.source && act.source !== "strava" && (
          <span className="text-[10px] text-white bg-red-500 px-2 py-0.5 rounded-full">
            {act.source === "Apple Health" ? "❤️ Health" : act.source}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{act.sport_type}</span>
      </div>
    </div>

    {act.source === "Apple Health" ? (
      /* Apple Health card layout — includes calories, no map */
      <>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div>
            <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "距離" : "Distance"}</span>
            <div className="flex items-center gap-1">
              <MapPin size={12} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{formatDistance(act.distance)} km</span>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "時間" : "Time"}</span>
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{formatDuration(act.moving_time)}</span>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "配速" : "Pace"}</span>
            <div className="flex items-center gap-1">
              <Zap size={12} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{formatPace(act.average_speed)} /km</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-2">
          {score !== null && (
            <div>
              <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "訓練分數" : "Score"}</span>
              <div className="flex items-center gap-1">
                <TrendingUp size={12} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">{score}</span>
              </div>
            </div>
          )}
          {act.average_heartrate && (
            <div>
              <span className="text-xs font-medium text-destructive block mb-0.5">HR</span>
              <div className="flex items-center gap-1">
                <Heart size={12} className="text-destructive" />
                <span className="text-sm font-semibold text-foreground">{Math.round(act.average_heartrate)}</span>
              </div>
            </div>
          )}
          {act.total_elevation_gain > 0 && (
            <div>
              <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "爬升" : "Elev"}</span>
              <div className="flex items-center gap-1">
                <TrendingUp size={12} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">{Math.round(act.total_elevation_gain)}m</span>
              </div>
            </div>
          )}
          {act.calories && act.calories > 0 && (
            <div>
              <span className="text-xs font-medium text-destructive block mb-0.5">{lang === "zh" ? "卡路里" : "Calories"}</span>
              <div className="flex items-center gap-1">
                <Flame size={12} className="text-destructive" />
                <span className="text-sm font-semibold text-foreground">{act.calories} kcal</span>
              </div>
            </div>
          )}
        </div>
      </>
    ) : (
      /* Strava / Garmin / Coros card layout — includes map, no calories */
      <>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div>
            <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "距離" : "Distance"}</span>
            <div className="flex items-center gap-1">
              <MapPin size={12} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{formatDistance(act.distance)} km</span>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "時間" : "Time"}</span>
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{formatDuration(act.moving_time)}</span>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "配速" : "Pace"}</span>
            <div className="flex items-center gap-1">
              <Zap size={12} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{formatPace(act.average_speed)} /km</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-2">
          {score !== null && (
            <div>
              <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "訓練分數" : "Score"}</span>
              <div className="flex items-center gap-1">
                <TrendingUp size={12} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">{score}</span>
              </div>
            </div>
          )}
          {act.average_heartrate && (
            <div>
              <span className="text-xs font-medium text-destructive block mb-0.5">HR</span>
              <div className="flex items-center gap-1">
                <Heart size={12} className="text-destructive" />
                <span className="text-sm font-semibold text-foreground">{Math.round(act.average_heartrate)}</span>
              </div>
            </div>
          )}
          {act.total_elevation_gain > 0 && (
            <div>
              <span className="text-xs font-medium text-primary block mb-0.5">{lang === "zh" ? "爬升" : "Elev"}</span>
              <div className="flex items-center gap-1">
                <TrendingUp size={12} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">{Math.round(act.total_elevation_gain)}m</span>
              </div>
            </div>
          )}
        </div>

        {act.summary_polyline && <ActivityMap polyline={act.summary_polyline} />}
      </>
    )}
  </div>
);

// ---------- Main Component ----------
const SKELETON_MIN_MS = 400;

const ActivitiesTab = ({ lang }: Props) => {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const { activities, profile, connected, fitnessAppConnected, plannedWorkouts, loading, invalidateAll } = useActivities();
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null);
  const [showAllActivities, setShowAllActivities] = useState(false);

  // Mandatory skeleton on every mount
  const [skeletonDone, setSkeletonDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSkeletonDone(true), SKELETON_MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  // Start fetching Apple Health stats immediately (even during skeleton loading)
  const appleHealth = useAppleHealth(lang);
  const [ahConnected, setAhConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("apple_health_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAhConnected(true);
          if (!appleHealth.syncing) {
            appleHealth.syncHealthData();
          }
        }
      });
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("fitness-activities-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "strava_activities", filter: `user_id=eq.${user.id}` },
        () => invalidateAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "apple_health_activities", filter: `user_id=eq.${user.id}` },
        () => invalidateAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "garmin_activities", filter: `user_id=eq.${user.id}` },
        () => invalidateAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, invalidateAll]);

  const { activityScores, averageScore } = useMemo(() => {
    const scores: Record<string, number | null> = {};
    const validScores: number[] = [];
    for (const act of activities) {
      if (runningSportTypes.has(act.sport_type)) {
        const s = getActivityScore(act.distance, act.moving_time);
        scores[act.id] = s;
        if (s !== null) validScores.push(s);
      } else {
        scores[act.id] = null;
      }
    }
    const recentScores = validScores.slice(0, 20);
    const avg =
      recentScores.length >= 1
        ? Math.round((recentScores.reduce((a, b) => a + b, 0) / recentScores.length) * 10) / 10
        : 0;
    return { activityScores: scores, averageScore: avg };
  }, [activities]);

  const [resyncing, setResyncing] = useState(false);

  const handleResync = useCallback(async () => {
    if (!user || resyncing) return;
    setResyncing(true);
    try {
      await supabase.from("apple_health_activities").delete().eq("user_id", user.id);
      const { workouts } = await appleHealth.readHealthData(1, 60);
      await appleHealth.saveWorkoutsToDb(workouts);
      invalidateAll();
      toast.success(lang === "zh" ? "已重新同步活動" : "Activities resynced successfully");
    } catch (err) {
      console.error("Resync error:", err);
      toast.error(lang === "zh" ? "重新同步失敗" : "Resync failed");
    }
    setResyncing(false);
  }, [user, resyncing, appleHealth, invalidateAll, lang]);

  if (loading || !skeletonDone) return <ActivityListSkeleton />;

  if (selectedActivity) {
    return (
      <ActivityDetail
        activity={selectedActivity}
        lang={lang}
        onBack={() => {
          setSelectedActivity(null);
        }}
        isPremium={isPremium}
        trainingScore={profile?.training_score ?? undefined}
      />
    );
  }

  if (showAllActivities) {
    return (
      <FadeIn className="px-5 pt-6 max-w-lg mx-auto pb-24">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowAllActivities(false)} className="p-1">
              <ChevronDown size={24} className="text-foreground rotate-90" />
            </button>
            <h1 className="font-display text-xl font-bold text-foreground">
              {lang === "zh" ? "所有活動" : "All Activities"}
            </h1>
          </div>
          {ahConnected && (
            <button
              onClick={handleResync}
              disabled={resyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={resyncing ? "animate-spin" : ""} />
              {resyncing ? (lang === "zh" ? "同步中..." : "Syncing...") : (lang === "zh" ? "重新同步" : "Resync")}
            </button>
          )}
        </div>
        <div className="space-y-3">
          {activities.map((act) => (
            <ActivityCard
              key={act.id}
              act={act}
              lang={lang}
              score={activityScores[act.id]}
              onClick={() => setSelectedActivity(act)}
            />
          ))}
          {activities.length === 0 && (
            <div className="text-center py-8">
              <Activity size={36} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">{lang === "zh" ? "暫無活動" : "No activities yet"}</p>
            </div>
          )}
        </div>
      </FadeIn>
    );
  }

  const latestActivity = activities[0] || null;

  return (
    <FadeIn className="px-5 pt-6 max-w-lg mx-auto">
      {/* Today Stats from Apple HealthKit */}
      <TodayStats lang={lang} healthStats={ahConnected ? appleHealth.healthStats : null} />

      {/* Manual Garmin import — only when no fitness app (Strava/Garmin/Coros) is connected */}
      {!fitnessAppConnected && (
        <ManualGarminImport lang={lang} onImported={invalidateAll} />
      )}

      {/* Recent Activity */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-bold text-foreground">
            {lang === "zh" ? "最近活動" : "Recent Activity"}
          </h2>
          {activities.length > 0 && (
            <button
              onClick={() => setShowAllActivities(true)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {lang === "zh" ? "查看全部" : "See all"}
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {activities.length === 0 ? (
          <div className="bg-accent/50 border border-border rounded-xl p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Activity size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              {lang === "zh" ? "連結健身應用以同步活動" : "Connect a Fitness App to Sync Activities"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {lang === "zh"
                ? "前往設定 → 連結應用來連結 Strava 或其他健身平台。"
                : "Go to Settings → Connect Apps to link Strava or other fitness platforms."}
            </p>
          </div>
        ) : latestActivity ? (
          <div className="space-y-3">
            <ActivityCard
              act={latestActivity}
              lang={lang}
              score={activityScores[latestActivity.id]}
              onClick={() => setSelectedActivity(latestActivity)}
            />
          </div>
        ) : (
          <div className="text-center py-8">
            <Activity size={36} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm">{lang === "zh" ? "暫無活動" : "No activities yet"}</p>
          </div>
        )}
      </div>

      {/* Today's Suggestion (analysis-derived if fresh, else generated, else expired prompt) */}
      <SuggestedNextWorkout
        lang={lang}
        latestActivityId={latestActivity?.id ?? null}
        latestActivityDate={latestActivity?.start_date ?? null}
      />

      {/* Monthly Road Quest */}
      <MonthlyRoadQuest lang={lang} activities={activities} plannedWorkouts={plannedWorkouts} />

      {/* Monthly Calendar */}
      <div className="pb-4">
        <h2 className="text-sm font-semibold text-foreground mb-2">{lang === "zh" ? "月曆" : "Monthly Overview"}</h2>
        <ActivityCalendar lang={lang} activities={activities} plannedWorkouts={plannedWorkouts} />
      </div>
    </FadeIn>
  );
};

export default ActivitiesTab;
