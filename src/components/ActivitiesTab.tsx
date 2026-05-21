import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ActivityCalendar from "@/components/activities/ActivityCalendar";
import MonthlyRoadQuest from "@/components/activities/MonthlyRoadQuest";

// Heavy: pulls in leaflet + leaflet.css. Only needed when an activity card has a polyline.
const ActivityMap = lazy(() => import("@/components/activities/ActivityMap"));
// Heavy: pulls in react-markdown + share helpers + dialogs. Only needed after a card is tapped.
const ActivityDetail = lazy(() => import("@/components/activities/ActivityDetail"));

import SuggestedNextWorkout from "@/components/activities/SuggestedNextWorkout";
import { calculateRunningScore } from "@/lib/vdot";
import { loadForActivity, isRunning } from "@/lib/trainingLoad";
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

const PLAN_TYPE_LABELS: Record<string, { en: string; zh: string }> = {
  Easy: { en: "Easy Run", zh: "輕鬆跑" }, "Easy Run": { en: "Easy Run", zh: "輕鬆跑" },
  Tempo: { en: "Tempo Run", zh: "節奏跑" }, "Tempo Run": { en: "Tempo Run", zh: "節奏跑" },
  Interval: { en: "Interval", zh: "間歇跑" },
  Long: { en: "Long Run", zh: "長課" }, "Long Run": { en: "Long Run", zh: "長課" },
  Recovery: { en: "Recovery Run", zh: "恢復跑" }, "Recovery Run": { en: "Recovery Run", zh: "恢復跑" },
  "Cross Training": { en: "Cross Training", zh: "交叉訓練" },
  "Race Pace": { en: "Race Pace", zh: "比賽配速" },
  Race: { en: "Race", zh: "比賽" },
  Progression: { en: "Progression Run", zh: "漸進跑" }, "Progression Run": { en: "Progression Run", zh: "漸進跑" },
  "Trail Run": { en: "Trail Run", zh: "越野跑" }, "Trail Race": { en: "Trail Race", zh: "越野賽" },
  Rest: { en: "Rest", zh: "休息" },
};

const localizePlanTitle = (planned: { type: string; title?: string | null }, lang: Lang) => {
  if (lang !== "zh") return planned.title || PLAN_TYPE_LABELS[planned.type]?.en || planned.type;
  return PLAN_TYPE_LABELS[planned.type]?.zh || planned.title || planned.type;
};

const localizePlanDescription = (planned: { type: string; distance_km: number | null; pace?: string | null; description?: string | null; elevation_m?: number | null; eph?: number | null }, lang: Lang) => {
  if (lang !== "zh") return planned.description || "";
  const km = planned.distance_km ? `${planned.distance_km}km` : "";
  const pace = planned.pace ? `，配速約${planned.pace}` : "";
  if (planned.type === "Trail Run" || planned.type === "Trail Race") {
    const parts = [km, planned.elevation_m != null ? `爬升 ${Math.round(planned.elevation_m)}m` : "", planned.eph != null ? `目標 EpH ${planned.eph}` : ""].filter(Boolean);
    return `${parts.join(" · ")}${parts.length ? "。" : ""}${planned.type === "Trail Race" ? "越野賽日" : "越野跑訓練"}，以爬升、技術及努力分配為主，不按平路配速執行。`;
  }
  const label = PLAN_TYPE_LABELS[planned.type]?.zh || planned.type;
  if (planned.type === "Rest") return "全日休息恢復。";
  if (km) return `${km}${label}${pace}。`;
  return label;
};

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
  load,
  isPremium,
  onClick,
}: {
  act: StravaActivity;
  lang: Lang;
  score: number | null;
  load: number | null;
  isPremium: boolean;
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
            })}{" "}
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
          {isPremium && load !== null && (
            <div>
              <span className="text-xs font-medium text-orange-500 block mb-0.5">
                {lang === "zh" ? "負荷" : "Load"}
              </span>
              <div className="flex items-center gap-1">
                <Flame size={12} className="text-orange-500" />
                <span className="text-sm font-semibold text-foreground">{load}</span>
              </div>
            </div>
          )}
          {score !== null && (
            <div>
              <span className="text-xs font-medium text-primary block mb-0.5">
                {lang === "zh" ? "訓練分數" : "Score"}
              </span>
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
              <span className="text-xs font-medium text-destructive block mb-0.5">
                {lang === "zh" ? "卡路里" : "Calories"}
              </span>
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
          {isPremium && load !== null && (
            <div>
              <span className="text-xs font-medium text-orange-500 block mb-0.5">
                {lang === "zh" ? "負荷" : "Load"}
              </span>
              <div className="flex items-center gap-1">
                <Flame size={12} className="text-orange-500" />
                <span className="text-sm font-semibold text-foreground">{load}</span>
              </div>
            </div>
          )}
          {score !== null && (
            <div>
              <span className="text-xs font-medium text-primary block mb-0.5">
                {lang === "zh" ? "訓練分數" : "Score"}
              </span>
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

        {act.summary_polyline && (
          <Suspense fallback={<div className="h-40 rounded-lg bg-muted/30 animate-pulse" />}>
            <ActivityMap polyline={act.summary_polyline} />
          </Suspense>
        )}
      </>
    )}
  </div>
);

const MONTH_NAMES_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_NAMES_ZH = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

const MonthlyActivityList = ({
  activities,
  lang,
  activityScores,
  activityLoads,
  isPremium,
  onSelect,
}: {
  activities: StravaActivity[];
  lang: Lang;
  activityScores: Record<string, number | null>;
  activityLoads: Record<string, number | null>;
  isPremium: boolean;
  onSelect: (a: StravaActivity) => void;
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, StravaActivity[]>();
    for (const a of activities) {
      const d = new Date(a.start_date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const [y, m] = key.split("-").map(Number);
      const label = lang === "zh"
        ? `${y}年 ${MONTH_NAMES_ZH[m]}`
        : `${MONTH_NAMES_EN[m]} ${y}`;
      const totalKm = items.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
      return { key, label, items, totalKm };
    });
  }, [activities, lang]);

  const [open, setOpen] = useState<string[]>(() => (groups[0] ? [groups[0].key] : []));

  if (activities.length === 0) {
    return (
      <div className="text-center py-8">
        <Activity size={36} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground text-sm">{lang === "zh" ? "暫無活動" : "No activities yet"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isOpen = open.includes(g.key);
        return (
          <div key={g.key} className="bg-card border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() =>
                setOpen((prev) =>
                  prev.includes(g.key) ? prev.filter((k) => k !== g.key) : [...prev, g.key],
                )
              }
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors"
            >
              <div className="flex flex-col items-start">
                <span className="font-display text-base font-semibold text-foreground">{g.label}</span>
                <span className="text-xs text-muted-foreground">
                  {g.items.length} {lang === "zh" ? "個活動" : g.items.length === 1 ? "activity" : "activities"} · {g.totalKm.toFixed(1)} km
                </span>
              </div>
              <ChevronDown
                size={20}
                className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="px-3 pb-3 pt-1 space-y-3">
                {g.items.map((act) => (
                  <ActivityCard
                    key={act.id}
                    act={act}
                    lang={lang}
                    score={activityScores[act.id]}
                    load={activityLoads[act.id]}
                    isPremium={isPremium}
                    onClick={() => onSelect(act)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------- Main Component ----------


const ActivitiesTab = ({ lang }: Props) => {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  // Homepage shows ONLY the latest activity → tiny, fast query.
  // The full history is loaded in the background and used by the calendar,
  // monthly road quest, and the "All Activities" page — without ever
  // changing the latest-activity card on the homepage.
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [warmupReady, setWarmupReady] = useState(false);
  useEffect(() => {
    const w = window as any;
    let idleId: any;
    let timeoutId: any;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(() => setWarmupReady(true), { timeout: 4000 });
    } else {
      timeoutId = setTimeout(() => setWarmupReady(true), 1500);
    }
    return () => {
      if (idleId && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const homepage = useActivities({ limit: 1 });
  const full = useActivities({ enabled: warmupReady });

  const profile = homepage.profile;
  const connected = homepage.connected;
  const fitnessAppConnected = homepage.fitnessAppConnected;
  const plannedWorkouts = homepage.plannedWorkouts;
  const userRaces = homepage.userRaces;
  const invalidateAll = homepage.invalidateAll;
  const loading = homepage.loading;
  const fullLoading = full.loading;

  // Use the full list as soon as it's ready; otherwise fall back to the
  // homepage's latest-only list. The latest activity is identical in both,
  // so the homepage card never swaps mid-render.
  const activities = full.activities.length > 0 ? full.activities : homepage.activities;
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null);
  const [dateSheet, setDateSheet] = useState<{
    dateLabel: string;
    activities: StravaActivity[];
    planned: {
      type: string;
      distance_km: number | null;
      color: string;
      title?: string | null;
      description?: string | null;
      pace?: string | null;
      elevation_m?: number | null;
      eph?: number | null;
    } | null;
    races?: { id: string; race_name: string; race_name_zh?: string | null; category: string }[];
  } | null>(null);

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "terra_activities", filter: `user_id=eq.${user.id}` },
        () => invalidateAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, invalidateAll]);

  const { activityScores, activityLoads, averageScore } = useMemo(() => {
    const scores: Record<string, number | null> = {};
    const loads: Record<string, number | null> = {};
    const validScores: number[] = [];
    const profileAge = (profile as any)?.age ?? null;
    for (const act of activities) {
      if (isRunning(act.sport_type)) {
        const s = getActivityScore(act.distance, act.moving_time);
        scores[act.id] = s;
        if (s !== null) validScores.push(s);
      } else {
        scores[act.id] = null;
      }
      loads[act.id] = loadForActivity(
        {
          start_date: act.start_date,
          moving_time: act.moving_time,
          average_heartrate: act.average_heartrate,
          max_heartrate: act.max_heartrate,
          sport_type: act.sport_type,
          source: act.source,
          garmin_training_load: (act as any).garmin_training_load ?? null,
        },
        profileAge,
      );
    }
    const recentScores = validScores.slice(0, 20);
    const avg =
      recentScores.length >= 1
        ? Math.round((recentScores.reduce((a, b) => a + b, 0) / recentScores.length) * 10) / 10
        : 0;
    return { activityScores: scores, activityLoads: loads, averageScore: avg };
  }, [activities, profile]);

  const [resyncing, setResyncing] = useState(false);

  const handleResync = useCallback(async () => {
    if (!user || resyncing) return;
    setResyncing(true);
    try {
      let terraResult: any = null;
      // Apple Health (native)
      try {
        await supabase.from("apple_health_activities").delete().eq("user_id", user.id);
        const { workouts } = await appleHealth.readHealthData(1, 60);
        await appleHealth.saveWorkoutsToDb(workouts);
      } catch (e) {
        console.warn("Apple Health resync skipped/failed:", e);
      }

      // Terra (Garmin/Coros/Polar/Suunto via Terra) — pulls activities + hr_samples
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (accessToken) {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/terra-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              provider: "GARMIN",
              targetUserId: "c7a7d1ca-c7bf-4288-bb9d-794006a04087",
              startDate: "2026-05-05",
              endDate: "2026-05-06",
              historicalActivity: true,
              latestWithSamples: true,
            }),
          });
          terraResult = await response.json().catch(() => null);
          if (!response.ok) throw new Error(terraResult?.error ?? `Terra sync failed (${response.status})`);
          for (let i = 0; i < 6; i++) {
            const { data: sampledRows } = await (supabase as any)
              .from("terra_activities")
              .select("id, hr_samples")
              .eq("user_id", "c7a7d1ca-c7bf-4288-bb9d-794006a04087")
              .eq("provider", "GARMIN")
              .gte("start_time", "2026-05-05T00:00:00Z")
              .lt("start_time", "2026-05-06T00:00:00Z")
              .not("hr_samples", "is", null)
              .limit(1);
            if ((sampledRows?.[0]?.hr_samples?.length ?? 0) > 0) {
              terraResult = { ...(terraResult ?? {}), activities: Math.max(terraResult?.activities ?? 0, 1) };
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }
      } catch (e) {
        console.warn("Terra resync failed:", e);
      }

      invalidateAll();
      if (terraResult?.activities === 0) {
        toast.error(lang === "zh" ? "Terra 尚未返回 HR samples" : "Terra returned no HR samples yet");
      } else {
        toast.success(lang === "zh" ? "已重新同步活動" : "Activities resynced successfully");
      }
    } catch (err) {
      console.error("Resync error:", err);
      toast.error(lang === "zh" ? "重新同步失敗" : "Resync failed");
    }
    setResyncing(false);
  }, [user, resyncing, appleHealth, invalidateAll, lang]);

  if (loading) return <ActivityListSkeleton />;

  if (selectedActivity) {
    return (
      <Suspense fallback={<ActivityListSkeleton />}>
        <ActivityDetail
          activity={selectedActivity}
          lang={lang}
          onBack={() => {
            setSelectedActivity(null);
          }}
          onDeleted={invalidateAll}
          isPremium={isPremium}
          trainingScore={profile?.training_score ?? undefined}
          profileAge={(profile as any)?.age ?? null}
          profileMaxHr={(profile as any)?.max_heartrate ?? null}
          profileRestingHr={(profile as any)?.resting_heartrate ?? null}
          profileCustomZones={(profile as any)?.custom_hr_zones ?? null}
        />
      </Suspense>
    );
  }


  if (showAllActivities) {
    return (
      <AllActivitiesView
        lang={lang}
        activities={full.activities}
        loading={fullLoading}
        activityScores={activityScores}
        activityLoads={activityLoads}
        isPremium={isPremium}
        onBack={() => setShowAllActivities(false)}
        onSelect={setSelectedActivity}
      />
    );
  }



  const latestActivity = activities[0] || null;

  return (
    <FadeIn className="px-5 pt-6 max-w-lg mx-auto">
      {/* Today Stats from Apple HealthKit */}
      <TodayStats lang={lang} healthStats={ahConnected ? appleHealth.healthStats : null} />



      {/* Recent Activity */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-bold text-foreground">
            {lang === "zh" ? "最近活動" : "Recent Activity"}
          </h2>
          {activities.length > 0 && (
            <button
              onClick={() => { setWarmupReady(true); setShowAllActivities(true); }}
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
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {lang === "zh"
                ? "活動通常會在手錶同步後一分鐘內出現。在少數情況下，我們的資料供應商可能會有些延遲，請耐心等候，並請避免重新連結手錶應用。"
                : "Activities usually appear within a minute of your watch syncing. In rare occasions our data provider may be delayed — please hang tight and refrain from disconnecting or reconnecting your watch app."}
            </div>
            <ActivityCard
              act={latestActivity}
              lang={lang}
              score={activityScores[latestActivity.id]}
              load={activityLoads[latestActivity.id]}
              isPremium={isPremium}
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

      {/* Training Load curve has moved to Analytics → Performance */}

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
        <ActivityCalendar
          lang={lang}
          activities={activities}
          plannedWorkouts={plannedWorkouts}
          userRaces={userRaces}
          onSelectDate={({ date, activity, extraActivities, planned, races }) => {
            const d = new Date(date + "T00:00:00");
            const dateLabel = d.toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            setDateSheet({
              dateLabel,
              activities: [...(activity ? [activity as StravaActivity] : []), ...(extraActivities as StravaActivity[])],
              planned: planned
                ? {
                    type: planned.type,
                    distance_km: planned.distance_km,
                    color: planned.color,
                    title: (planned as any).title ?? null,
                    description: (planned as any).description ?? null,
                    pace: (planned as any).pace ?? null,
                    elevation_m: (planned as any).elevation_m ?? null,
                    eph: (planned as any).eph ?? null,
                  }
                : null,
              races: races || [],
            });
          }}
        />
      </div>

      {/* Date detail bottom sheet */}
      <Sheet open={!!dateSheet} onOpenChange={(open) => !open && setDateSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto flex flex-col">
          {dateSheet && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">
                  {dateSheet.dateLabel}
                  {dateSheet.activities.length > 1 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {lang === "zh"
                        ? `${dateSheet.activities.length} 項活動`
                        : `${dateSheet.activities.length} activities`}
                    </span>
                  )}
                </SheetTitle>
              </SheetHeader>

              {dateSheet.activities.length > 0 && (
                <div className="mt-4 space-y-4">
                  {dateSheet.activities.map((act, idx) => {
                    const score = activityScores[act.id];
                    return (
                      <div key={act.id} className={`space-y-3 ${idx > 0 ? "pt-4 border-t border-border" : ""}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{sportTypeIcon[act.sport_type] || "🏃"}</span>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-foreground text-sm truncate">{act.name}</h3>
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(act.start_date).toLocaleTimeString(lang === "zh" ? "zh-TW" : "en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {" · "}
                              {act.source && act.source !== "strava" ? act.source : "Strava"}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <span className="text-[11px] font-medium text-primary block mb-0.5">
                              {lang === "zh" ? "距離" : "Distance"}
                            </span>
                            <div className="flex items-center gap-1">
                              <MapPin size={12} className="text-primary" />
                              <span className="text-sm font-semibold text-foreground">
                                {formatDistance(act.distance)} km
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-[11px] font-medium text-primary block mb-0.5">
                              {lang === "zh" ? "時間" : "Time"}
                            </span>
                            <div className="flex items-center gap-1">
                              <Clock size={12} className="text-primary" />
                              <span className="text-sm font-semibold text-foreground">
                                {formatDuration(act.moving_time)}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-[11px] font-medium text-primary block mb-0.5">
                              {lang === "zh" ? "配速" : "Pace"}
                            </span>
                            <div className="flex items-center gap-1">
                              <Zap size={12} className="text-primary" />
                              <span className="text-sm font-semibold text-foreground">
                                {formatPace(act.average_speed)} /km
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          {score !== null && score !== undefined && (
                            <div>
                              <span className="text-[11px] font-medium text-primary block mb-0.5">
                                {lang === "zh" ? "訓練分數" : "Score"}
                              </span>
                              <div className="flex items-center gap-1">
                                <TrendingUp size={12} className="text-primary" />
                                <span className="text-sm font-semibold text-foreground">{score}</span>
                              </div>
                            </div>
                          )}
                          {act.average_heartrate && (
                            <div>
                              <span className="text-[11px] font-medium text-destructive block mb-0.5">HR</span>
                              <div className="flex items-center gap-1">
                                <Heart size={12} className="text-destructive" />
                                <span className="text-sm font-semibold text-foreground">
                                  {Math.round(act.average_heartrate)}
                                </span>
                              </div>
                            </div>
                          )}
                          {act.total_elevation_gain > 0 && (
                            <div>
                              <span className="text-[11px] font-medium text-primary block mb-0.5">
                                {lang === "zh" ? "爬升" : "Elev"}
                              </span>
                              <div className="flex items-center gap-1">
                                <TrendingUp size={12} className="text-primary" />
                                <span className="text-sm font-semibold text-foreground">
                                  {Math.round(act.total_elevation_gain)}m
                                </span>
                              </div>
                            </div>
                          )}
                          {act.calories && act.calories > 0 && (
                            <div>
                              <span className="text-[11px] font-medium text-destructive block mb-0.5">
                                {lang === "zh" ? "卡路里" : "Calories"}
                              </span>
                              <div className="flex items-center gap-1">
                                <Flame size={12} className="text-destructive" />
                                <span className="text-sm font-semibold text-foreground">{act.calories} kcal</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            setDateSheet(null);
                            setSelectedActivity(act);
                          }}
                          className="w-full px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                        >
                          {lang === "zh" ? "查看詳情" : "View details"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {dateSheet.planned && (
                <div className={`${dateSheet.activities.length > 0 ? "mt-4 pt-4 border-t border-border" : "mt-4"}`}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: dateSheet.planned.color || "hsl(var(--muted-foreground))" }}
                    />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {lang === "zh" ? "計劃" : "Planned"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                    <span className="text-base font-semibold text-foreground">
                      {localizePlanTitle(dateSheet.planned, lang)}
                    </span>
                    {dateSheet.planned.distance_km && (
                      <span className="text-sm text-muted-foreground">{dateSheet.planned.distance_km} km</span>
                    )}
                    {(dateSheet.planned.type === "Trail Run" || dateSheet.planned.type === "Trail Race") && dateSheet.planned.elevation_m != null && (
                      <span className="text-sm text-muted-foreground">+{Math.round(dateSheet.planned.elevation_m)} m</span>
                    )}
                    {(dateSheet.planned.type === "Trail Run" || dateSheet.planned.type === "Trail Race") && dateSheet.planned.eph != null && (
                      <span className="text-sm text-muted-foreground">EpH {dateSheet.planned.eph}</span>
                    )}
                    {dateSheet.planned.pace && dateSheet.planned.type !== "Trail Run" && dateSheet.planned.type !== "Trail Race" && (
                      <span className="text-sm text-muted-foreground">@ {dateSheet.planned.pace}</span>
                    )}
                  </div>
                  {dateSheet.planned.description && (
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {localizePlanDescription(dateSheet.planned, lang)}
                    </p>
                  )}
                </div>
              )}

              {dateSheet.races && dateSheet.races.length > 0 && (
                <div
                  className={`${dateSheet.activities.length > 0 || dateSheet.planned ? "mt-4 pt-4 border-t border-border" : "mt-4"}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🏁</span>
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                      {lang === "zh" ? "賽事日" : "Race Day"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {dateSheet.races.map((r) => (
                      <div key={r.id} className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                        <p className="text-sm font-semibold text-foreground">
                          {lang === "zh" && r.race_name_zh ? r.race_name_zh : r.race_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{r.category}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </FadeIn>
  );
};

export default ActivitiesTab;
