import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Clock, MapPin, Zap, Heart, TrendingUp, Mountain, Timer, Footprints, Trash2, Pencil, Sparkles, Lock, Gauge, AlertTriangle, Flame, Trophy, MessageSquare, RefreshCw, Share2 } from "lucide-react";
import { shareActivity } from "@/lib/shareActivity";
import { Lang } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import ActivityMap from "./ActivityMap";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { loadForActivity } from "@/lib/trainingLoad";

interface StravaActivity {
  id: string;
  strava_id: number;
  name: string;
  sport_type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  average_speed: number;
  max_speed: number;
  average_heartrate: number | null;
  max_heartrate: number | null;
  summary_polyline: string | null;
  source?: string;
  calories?: number | null;
  laps?: any[] | null;
  map_screenshot_url?: string | null;
}

interface Split {
  distance: number;
  elapsed_time: number;
  moving_time: number;
  average_speed: number;
  average_heartrate?: number;
  elevation_difference: number;
  split: number;
}

interface Props {
  activity: StravaActivity;
  lang: Lang;
  onBack: () => void;
  isPremium?: boolean;
  trainingScore?: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPace(avgSpeed: number): string {
  if (avgSpeed <= 0) return "--";
  const paceSeconds = 1000 / avgSpeed;
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.floor(paceSeconds % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function speedToPace(speed: number): number {
  if (speed <= 0) return 0;
  return 1000 / speed / 60;
}

function formatPaceFromMinutes(minutes: number): string {
  if (minutes <= 0 || !isFinite(minutes)) return "--";
  const min = Math.floor(minutes);
  const sec = Math.round((minutes - min) * 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

const StatBox = ({ icon: Icon, label, value, unit, iconColor }: {
  icon: any; label: string; value: string; unit?: string; iconColor?: string;
}) => (
  <div className="bg-muted/50 rounded-lg p-3 flex flex-col items-center text-center">
    <Icon size={16} className={iconColor || "text-primary"} />
    <span className="text-[10px] text-muted-foreground mt-1">{label}</span>
    <span className="text-sm font-bold text-foreground">{value}</span>
    {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
  </div>
);

const ActivityDetail = ({ activity, lang, onBack, isPremium, trainingScore }: Props) => {
  const isAppleHealth = activity.source === "Apple Health";
  const isGarmin = activity.source === "Garmin";
  const isTerraActivity = activity.source?.startsWith("Terra") ?? false;
  const isTerraGarmin = isTerraActivity && activity.source === "Terra Garmin";
  const isCoros = activity.source === "COROS";
  const needsRpe = isAppleHealth || isGarmin || isTerraActivity || isCoros;
  const dbTable = isAppleHealth ? "apple_health_activities" : isGarmin || isCoros ? "garmin_activities" : isTerraActivity ? "terra_activities" : "strava_activities";

  const [streams, setStreams] = useState<any[]>([]);
  const [splits, setSplits] = useState<Split[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<"pace" | "heartrate" | "altitude">("pace");
  const [deleting, setDeleting] = useState(false);
  const [activityName, setActivityName] = useState(activity.name);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(activity.name);
  const [savingName, setSavingName] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiNextWorkout, setAiNextWorkout] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLang, setAiLang] = useState<string>(lang);
  const [rpeInput, setRpeInput] = useState<string>("");
  const [rpeSubmitted, setRpeSubmitted] = useState(false);
  const [analysisAttempted, setAnalysisAttempted] = useState(false);

  // Race tagging + comment state
  const activityDateOnly = useMemo(() => activity.start_date.split("T")[0], [activity.start_date]);
  const [sameDayRaces, setSameDayRaces] = useState<Array<{ id: string; name: string; name_zh: string | null; city: string; country: string }>>([]);
  // raceSelection: "" = none, "manual" = user typing, or a race id
  const [raceSelection, setRaceSelection] = useState<string>("");
  const [manualRaceName, setManualRaceName] = useState<string>("");
  const [userComment, setUserComment] = useState<string>("");
  const [savedRaceId, setSavedRaceId] = useState<string | null>(null);
  const [savedRaceName, setSavedRaceName] = useState<string | null>(null);
  const [savedComment, setSavedComment] = useState<string | null>(null);

  const handleRename = async () => {
    if (!nameInput.trim() || nameInput === activityName) { setEditingName(false); return; }
    setSavingName(true);
    const { error } = await supabase.from(dbTable).update({ name: nameInput.trim() } as any).eq('id', activity.id);
    if (error) {
      toast.error(lang === "zh" ? "重命名失敗" : "Failed to rename");
    } else {
      setActivityName(nameInput.trim());
      toast.success(lang === "zh" ? "已重命名" : "Activity renamed");
    }
    setSavingName(false);
    setEditingName(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from(dbTable).delete().eq('id', activity.id);
    if (error) {
      toast.error(lang === "zh" ? "刪除失敗" : "Failed to delete activity");
      setDeleting(false);
    } else {
      toast.success(lang === "zh" ? "活動已刪除" : "Activity deleted");
      onBack();
    }
  };

  const runAiAnalysis = async (currentSplits: Split[] | null, rpe?: number, opts?: { forceRefresh?: boolean }) => {
    if (!isPremium) return;
    setAiLoading(true);
    try {
      // Resolve current race selection into raceId / raceName
      let raceId: string | null = null;
      let raceName: string | null = null;
      if (raceSelection && raceSelection !== "" && raceSelection !== "manual") {
        raceId = raceSelection;
        const match = sameDayRaces.find(r => r.id === raceSelection);
        if (match) raceName = lang === "zh" && match.name_zh ? match.name_zh : match.name;
      } else if (raceSelection === "manual" && manualRaceName.trim()) {
        raceName = manualRaceName.trim();
      }

      const bodyPayload: any = {
        activityDbId: activity.id,
        activity: {
          name: activityName,
          distance: activity.distance,
          moving_time: activity.moving_time,
          elapsed_time: activity.elapsed_time,
          total_elevation_gain: activity.total_elevation_gain,
          start_date: activity.start_date,
          average_speed: activity.average_speed,
          max_speed: activity.max_speed,
          average_heartrate: activity.average_heartrate,
          max_heartrate: activity.max_heartrate,
          source: activity.source || "strava",
        },
        splits: currentSplits || [],
        lang,
        ...(rpe !== undefined ? { rpe } : {}),
        ...(raceId ? { raceId } : {}),
        ...(raceName ? { raceName } : {}),
        ...(userComment.trim() ? { userComment: userComment.trim() } : {}),
        ...(opts?.forceRefresh ? { forceRefresh: true } : {}),
      };
      if ((isGarmin || isTerraActivity) && activity.laps && Array.isArray(activity.laps) && activity.laps.length > 0) {
        bodyPayload.garminLaps = activity.laps;
      }
      const { data, error } = await supabase.functions.invoke("analyze-activity", { body: bodyPayload });
      if (error) {
        const errMsg = typeof error === "object" && error?.message ? error.message : String(error);
        toast.error(lang === "zh" ? `分析失敗: ${errMsg}` : `Analysis failed: ${errMsg}`);
        setAiAnalysis(null);
      } else if (data?.error) {
        toast.error(lang === "zh" ? `分析失敗: ${data.error}` : `Analysis failed: ${data.error}`);
        setAiAnalysis(null);
      } else if (data?.analysis) {
        setAiAnalysis(data.analysis);
        setAiNextWorkout(data.nextWorkout || null);
        setSavedRaceId(data.raceId || null);
        setSavedRaceName(data.raceName || null);
        setSavedComment(data.userComment || null);
      } else {
        setAiAnalysis(null);
      }
    } catch (err: any) {
      toast.error(lang === "zh" ? "AI 分析失敗" : "AI analysis failed");
      setAiAnalysis(null);
    }
    setAnalysisAttempted(true);
    setAiLoading(false);
  };

  const handleRpeSubmit = () => {
    const val = parseInt(rpeInput, 10);
    if (isNaN(val) || val < 1 || val > 10) {
      toast.error(lang === "zh" ? "請輸入 1-10 之間的數字" : "Please enter a number between 1 and 10");
      return;
    }
    setRpeSubmitted(true);
    runAiAnalysis(splits, val);
  };

  const handleAnalyzeClick = () => {
    // Strava-style flow: no RPE required, just trigger analysis with whatever race/comment is filled in.
    runAiAnalysis(splits);
  };

  const handleRegenerateAnalysis = () => {
    if (needsRpe) {
      const val = parseInt(rpeInput, 10);
      runAiAnalysis(splits, isNaN(val) ? undefined : val, { forceRefresh: true });
    } else {
      runAiAnalysis(splits, undefined, { forceRefresh: true });
    }
  };

  // Detect if user has changed race/comment vs what was saved with the last analysis
  const currentResolvedRaceId = raceSelection && raceSelection !== "manual" && raceSelection !== "" ? raceSelection : null;
  const currentResolvedRaceName =
    raceSelection === "manual" && manualRaceName.trim() ? manualRaceName.trim() :
    (currentResolvedRaceId ? (sameDayRaces.find(r => r.id === currentResolvedRaceId) ? (lang === "zh" && sameDayRaces.find(r => r.id === currentResolvedRaceId)!.name_zh ? sameDayRaces.find(r => r.id === currentResolvedRaceId)!.name_zh : sameDayRaces.find(r => r.id === currentResolvedRaceId)!.name) : null) : null);
  const inputsChanged =
    aiAnalysis != null &&
    (
      (currentResolvedRaceId || null) !== (savedRaceId || null) ||
      (currentResolvedRaceName || null) !== (savedRaceName || null) ||
      (userComment.trim() || null) !== (savedComment || null)
    );

  useEffect(() => {
    if (!isPremium || !aiAnalysis || lang === aiLang) return;
    setAiLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("analyze-activity", {
          body: { activityDbId: activity.id, translate: true, lang },
        });
        if (!error && data?.analysis) {
          setAiAnalysis(data.analysis);
          if (data.nextWorkout !== undefined) setAiNextWorkout(data.nextWorkout);
          setAiLang(lang);
        }
        // Re-hydrate race/comment state from the saved row so the user
        // doesn't have to re-enter race info after a language switch.
        const { data: row } = await supabase
          .from("activity_analyses")
          .select("race_id, race_name, user_comment")
          .eq("activity_id", activity.id)
          .maybeSingle();
        if (row) {
          if (row.race_id) {
            setRaceSelection(row.race_id);
            setSavedRaceId(row.race_id);
            setManualRaceName("");
          } else if (row.race_name) {
            setRaceSelection("manual");
            setManualRaceName(row.race_name);
            setSavedRaceName(row.race_name);
          }
          if (row.user_comment) {
            setUserComment(row.user_comment);
            setSavedComment(row.user_comment);
          }
          // Activities that already have an analysis don't need RPE re-entry
          setRpeSubmitted(true);
        }
      } catch (err) {
        console.error("Translation error:", err);
      }
      setAiLoading(false);
    })();
  }, [lang]);

  // Fetch races on the same calendar date as this activity
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("races")
        .select("id, name, name_zh, city, country")
        .eq("race_date", activityDateOnly);
      if (!cancelled && !error && Array.isArray(data)) {
        setSameDayRaces(data as any);
      }
    })();
    return () => { cancelled = true; };
  }, [activityDateOnly]);

  useEffect(() => {
    const fetchStreams = async () => {
      setLoading(true);
      // Apple Health / Garmin/Terra: no Strava streams. Map laps to splits.
      if (needsRpe || !activity.strava_id || activity.strava_id <= 0) {
        setStreams([]);
        if ((isGarmin || isTerraActivity) && Array.isArray(activity.laps) && activity.laps.length > 0) {
          const mapped: Split[] = activity.laps.map((lap: any, idx: number) => {
            const distance = Number(lap.distance ?? lap.distance_meters) || 0;
            const elapsed = Number(
              lap.elapsed_time ?? lap.moving_time ?? lap.duration_seconds,
            ) || 0;
            let avgSpeed = Number(lap.avg_speed ?? lap.average_speed) || 0;
            if (!avgSpeed && lap.average_pace_seconds_per_km) {
              const pace = Number(lap.average_pace_seconds_per_km);
              if (pace > 0) avgSpeed = 1000 / pace;
            }
            if (!avgSpeed && elapsed > 0) avgSpeed = distance / elapsed;
            return {
              distance,
              elapsed_time: elapsed,
              moving_time: Number(lap.moving_time ?? lap.duration_seconds) || elapsed,
              average_speed: avgSpeed,
              average_heartrate: lap.avg_hr ?? lap.average_hr ?? undefined,
              elevation_difference:
                Number(lap.elevation_gain ?? lap.total_ascent_meters ?? lap.total_ascent) || 0,
              split: lap.split_number ?? lap.lap_index ?? idx + 1,
            };
          });
          setSplits(mapped);
        } else {
          setSplits(null);
        }
        // Check if analysis already exists (cached)
        if (isPremium) {
          try {
            const { data } = await supabase.functions.invoke("analyze-activity", {
              body: { activityDbId: activity.id, activity: { name: activityName, distance: activity.distance, moving_time: activity.moving_time, elapsed_time: activity.elapsed_time, total_elevation_gain: activity.total_elevation_gain, start_date: activity.start_date, average_speed: activity.average_speed, max_speed: activity.max_speed, average_heartrate: activity.average_heartrate, max_heartrate: activity.max_heartrate, source: activity.source || "Apple Health" }, splits: [], lang, checkCacheOnly: true },
            });
            if (data?.analysis) {
              setAiAnalysis(data.analysis);
              setAiNextWorkout(data.nextWorkout || null);
              setRpeSubmitted(true);
              if (data.raceId) {
                setRaceSelection(data.raceId);
                setSavedRaceId(data.raceId);
              } else if (data.raceName) {
                setRaceSelection("manual");
                setManualRaceName(data.raceName);
                setSavedRaceName(data.raceName);
              }
              if (data.userComment) {
                setUserComment(data.userComment);
                setSavedComment(data.userComment);
              }
            }
          } catch {}
        }
        setLoading(false);
        return;
      }

      // Check for cached analysis (all sources). Only auto-load — do NOT auto-run a new analysis.
      // The user must click "Analyze" after optionally tagging a race / adding a comment / entering RPE.
      if (isPremium) {
        try {
          const { data } = await supabase.functions.invoke("analyze-activity", {
            body: {
              activityDbId: activity.id,
              activity: {
                name: activityName,
                distance: activity.distance,
                moving_time: activity.moving_time,
                elapsed_time: activity.elapsed_time,
                total_elevation_gain: activity.total_elevation_gain,
                start_date: activity.start_date,
                average_speed: activity.average_speed,
                max_speed: activity.max_speed,
                average_heartrate: activity.average_heartrate,
                max_heartrate: activity.max_heartrate,
                source: activity.source || "strava",
              },
              splits: [],
              lang,
              checkCacheOnly: true,
            },
          });
          if (data?.analysis) {
            setAiAnalysis(data.analysis);
            setAiNextWorkout(data.nextWorkout || null);
            setRpeSubmitted(true);
            if (data.raceId) {
              setRaceSelection(data.raceId);
              setSavedRaceId(data.raceId);
            } else if (data.raceName) {
              setRaceSelection("manual");
              setManualRaceName(data.raceName);
              setSavedRaceName(data.raceName);
            }
            if (data.userComment) {
              setUserComment(data.userComment);
              setSavedComment(data.userComment);
            }
            // Pre-warm the OTHER language's translation in the background so
            // toggling language is instant and the DB stays bilingual.
            const otherLang = lang === "zh" ? "en" : "zh";
            supabase.functions.invoke("analyze-activity", {
              body: { activityDbId: activity.id, translate: true, lang: otherLang },
            }).catch(() => {});
          }
        } catch {}
      }
      setLoading(false);
    };
    fetchStreams();
  }, [activity.strava_id, isPremium, needsRpe]);

  const chartData = useMemo(() => {
    if (!streams || streams.length === 0) return [];
    const timeStream = streams.find((s: any) => s.type === 'time');
    const distStream = streams.find((s: any) => s.type === 'distance');
    const hrStream = streams.find((s: any) => s.type === 'heartrate');
    const altStream = streams.find((s: any) => s.type === 'altitude');
    const velStream = streams.find((s: any) => s.type === 'velocity_smooth');
    if (!distStream) return [];
    const data: any[] = [];
    const step = Math.max(1, Math.floor(distStream.data.length / 200));
    for (let i = 0; i < distStream.data.length; i += step) {
      const point: any = { distance_km: (distStream.data[i] / 1000).toFixed(2) };
      if (timeStream) point.time = timeStream.data[i];
      if (hrStream) point.heartrate = hrStream.data[i];
      if (altStream) point.altitude = altStream.data[i];
      if (velStream && velStream.data[i] > 0) point.pace = speedToPace(velStream.data[i]);
      data.push(point);
    }
    return data;
  }, [streams]);

  const hasHeartrate = chartData.some(d => d.heartrate);
  const hasAltitude = chartData.some(d => d.altitude !== undefined);
  const hasPace = chartData.some(d => d.pace);

  const chartTabs = useMemo(() => {
    const tabs: { key: "pace" | "heartrate" | "altitude"; label: string }[] = [];
    if (hasPace) tabs.push({ key: "pace", label: lang === "zh" ? "配速" : "Pace" });
    if (hasHeartrate) tabs.push({ key: "heartrate", label: lang === "zh" ? "心率" : "Heart Rate" });
    if (hasAltitude) tabs.push({ key: "altitude", label: lang === "zh" ? "海拔" : "Altitude" });
    return tabs;
  }, [hasPace, hasHeartrate, hasAltitude, lang]);

  useEffect(() => {
    if (chartTabs.length > 0 && !chartTabs.find(t => t.key === activeChart)) {
      setActiveChart(chartTabs[0].key);
    }
  }, [chartTabs, activeChart]);

  const dateStr = new Date(activity.start_date).toLocaleDateString(
    lang === "zh" ? "zh-TW" : "en-US",
    { year: "numeric", month: "long", day: "numeric", weekday: "long" }
  );
  const timeStr = new Date(activity.start_date).toLocaleTimeString(
    lang === "zh" ? "zh-TW" : "en-US",
    { hour: "2-digit", minute: "2-digit" }
  );

  return (
    <div className="px-5 pt-4 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors">
          <ArrowLeft size={16} />
          {lang === "zh" ? "返回" : "Back"}
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              shareActivity({
                name: activityName,
                distanceMeters: activity.distance,
                movingTimeSeconds: activity.moving_time,
                averageSpeed: activity.average_speed,
                startDate: activity.start_date,
                analysis: aiAnalysis,
                nextWorkout: aiNextWorkout,
                lang,
              })
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Share2 size={14} />
            {lang === "zh" ? "分享" : "Share"}
          </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 size={14} />
              {lang === "zh" ? "刪除" : "Delete"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{lang === "zh" ? "確認刪除活動？" : "Delete this activity?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {lang === "zh" ? "此操作無法復原。活動資料將從資料庫中永久刪除。" : "This action cannot be undone. The activity data will be permanently deleted from the database."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{lang === "zh" ? "取消" : "Cancel"}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? (lang === "zh" ? "刪除中..." : "Deleting...") : (lang === "zh" ? "確認刪除" : "Delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      <div className="mb-4">
        {editingName ? (
          <div className="flex items-center gap-2">
            <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="flex-1 text-lg font-bold" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setEditingName(false); setNameInput(activityName); } }} />
            <button onClick={handleRename} disabled={savingName} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground disabled:opacity-50">
              {savingName ? "..." : (lang === "zh" ? "儲存" : "Save")}
            </button>
            <button onClick={() => { setEditingName(false); setNameInput(activityName); }} className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground">
              {lang === "zh" ? "取消" : "Cancel"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-foreground">{activityName}</h1>
            <button onClick={() => { setEditingName(true); setNameInput(activityName); }} className="text-muted-foreground hover:text-foreground transition-colors">
              <Pencil size={14} />
            </button>
          </div>
        )}
        <p className="text-sm text-muted-foreground mt-0.5">{dateStr} {timeStr}</p>
        {isAppleHealth && (
          <span className="text-[10px] text-white bg-red-500 px-2 py-0.5 rounded-full mt-1 inline-block">
            ❤️ {activity.source}
          </span>
        )}
      </div>

      {/* Apple Health accuracy reminder */}
      {isAppleHealth && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {lang === "zh"
              ? "Apple Health 的訓練分數可能不準確，因為第三方應用的心率和爬升數據不會被 Apple Health 政策允許捕獲。"
              : "Training Score for Apple Health may not be accurate as HR and Elevation from third-party applications are not captured under Apple Health's policy."}
          </p>
        </div>
      )}

      {/* Key Stats Grid */}
      {isAppleHealth ? (
        <>
          {/* Map above stats for Apple Health (if polyline exists) */}
          {activity.summary_polyline && (
            <div className="mb-4">
              <ActivityMap polyline={activity.summary_polyline} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatBox icon={MapPin} label={lang === "zh" ? "距離" : "Distance"} value={(activity.distance / 1000).toFixed(2)} unit="km" />
            <StatBox icon={Clock} label={lang === "zh" ? "時間" : "Time"} value={formatDuration(activity.moving_time)} />
            <StatBox icon={Zap} label={lang === "zh" ? "配速" : "Pace"} value={formatPace(activity.average_speed)} unit="/km" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatBox icon={TrendingUp} label={lang === "zh" ? "訓練分數" : "Training Score"} value={trainingScore != null ? trainingScore.toString() : "--"} />
            <StatBox icon={Flame} label={lang === "zh" ? "卡路里" : "Calories"} value={activity.calories != null ? activity.calories.toString() : "--"} unit="kcal" />
            <StatBox icon={Timer} label={lang === "zh" ? "總時間" : "Elapsed Time"} value={formatDuration(activity.elapsed_time)} />
          </div>
          {isPremium && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <StatBox
                icon={Flame}
                iconColor="text-orange-500"
                label={lang === "zh" ? "訓練負荷" : "Training Load"}
                value={(() => {
                  const l = loadForActivity({ start_date: activity.start_date, moving_time: activity.moving_time, average_heartrate: activity.average_heartrate, max_heartrate: activity.max_heartrate, sport_type: activity.sport_type });
                  return l != null ? l.toString() : "--";
                })()}
                unit="TRIMP"
              />
            </div>
          )}
        </>
      ) : (
        <>
          {/* Strava / Garmin / Coros: stats grid first, then map */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatBox icon={MapPin} label={lang === "zh" ? "距離" : "Distance"} value={(activity.distance / 1000).toFixed(2)} unit="km" />
            <StatBox icon={Clock} label={lang === "zh" ? "時間" : "Duration"} value={formatDuration(activity.moving_time)} />
            <StatBox icon={Zap} label={lang === "zh" ? "配速" : "Avg Pace"} value={formatPace(activity.average_speed)} unit="/km" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatBox icon={TrendingUp} label={lang === "zh" ? "訓練分數" : "Training Score"} value={trainingScore != null ? trainingScore.toString() : "--"} />
            <StatBox icon={Heart} label={lang === "zh" ? "平均心率" : "Avg HR"} value={activity.average_heartrate ? Math.round(activity.average_heartrate).toString() : "--"} unit="bpm" iconColor="text-destructive" />
            <StatBox icon={Mountain} label={lang === "zh" ? "爬升" : "Elevation"} value={Math.round(activity.total_elevation_gain).toString()} unit="m" />
          </div>
          {isPremium && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <StatBox
                icon={Flame}
                iconColor="text-orange-500"
                label={lang === "zh" ? "訓練負荷" : "Training Load"}
                value={(() => {
                  const l = loadForActivity({ start_date: activity.start_date, moving_time: activity.moving_time, average_heartrate: activity.average_heartrate, max_heartrate: activity.max_heartrate, sport_type: activity.sport_type, garmin_training_load: (activity as any).training_load ?? null });
                  return l != null ? l.toString() : "--";
                })()}
                unit="TRIMP"
              />
            </div>
          )}
          {/* Map below stats grid: prefer encoded polyline, fall back to Firecrawl screenshot for manual imports */}
          {activity.summary_polyline ? (
            <div className="mb-4">
              <ActivityMap polyline={activity.summary_polyline} />
            </div>
          ) : activity.map_screenshot_url ? (
            <div className="mb-4 rounded-lg overflow-hidden border border-border bg-muted">
              <img
                src={activity.map_screenshot_url}
                alt={lang === "zh" ? "活動路線地圖" : "Activity route map"}
                className="w-full h-auto block"
                loading="lazy"
              />
            </div>
          ) : null}
        </>
      )}

      {/* Charts */}
      {loading ? (
        <div className="bg-card border border-border rounded-xl p-6 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          <span className="ml-2 text-sm text-muted-foreground">
            {lang === "zh" ? "載入詳細資料..." : "Loading details..."}
          </span>
        </div>
      ) : chartData.length > 0 && chartTabs.length > 0 ? (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex gap-1 mb-4">
            {chartTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveChart(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeChart === tab.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              {activeChart === "pace" ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="distance_km" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${Math.round(v)}`}
                    label={{ value: "km", position: "insideBottomRight", offset: -5, fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis reversed tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatPaceFromMinutes(v)} domain={['auto', 'auto']}
                    label={{ value: "/km", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [formatPaceFromMinutes(value), lang === "zh" ? "配速" : "Pace"]} labelFormatter={(v) => `${v} km`} />
                  <Line type="monotone" dataKey="pace" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              ) : activeChart === "heartrate" ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="distance_km" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${Math.round(v)}`} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={['auto', 'auto']}
                    label={{ value: "bpm", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [Math.round(value), "bpm"]} labelFormatter={(v) => `${v} km`} />
                  <defs>
                    <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="heartrate" stroke="hsl(var(--destructive))" fill="url(#hrGradient)" strokeWidth={2} dot={false} />
                </AreaChart>
              ) : (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="distance_km" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${Math.round(v)}`} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={['auto', 'auto']}
                    label={{ value: "m", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [`${Math.round(value)}m`, lang === "zh" ? "海拔" : "Altitude"]} labelFormatter={(v) => `${v} km`} />
                  <defs>
                    <linearGradient id="altGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="altitude" stroke="hsl(var(--primary))" fill="url(#altGradient)" strokeWidth={2} dot={false} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* Splits Table */}
      {splits && splits.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mt-4">
          <h3 className="font-display font-bold text-foreground text-sm mb-3">
            {lang === "zh" ? "分段配速" : "Splits"}
          </h3>
          <div className="space-y-1">
            <div className="grid grid-cols-5 text-[10px] text-muted-foreground font-medium pb-1 border-b border-border">
              <span>#</span>
              <span className="text-center">{lang === "zh" ? "距離" : "Dist"}</span>
              <span className="text-center">{lang === "zh" ? "配速" : "Pace"}</span>
              <span className="text-center">{lang === "zh" ? "爬升" : "Elev"}</span>
              <span className="text-center">HR</span>
            </div>
            {splits.map((split, idx) => {
              const pace = formatPace(split.average_speed);
              const avgSplitPace = speedToPace(activity.average_speed);
              const splitPace = speedToPace(split.average_speed);
              const isFaster = splitPace < avgSplitPace;
              const distKm = (split.distance || 0) / 1000;
              const distLabel = distKm >= 1 ? `${distKm.toFixed(2)}km` : `${Math.round(split.distance || 0)}m`;
              return (
                <div key={idx} className="grid grid-cols-5 text-xs py-1.5 border-b border-border/50 last:border-0">
                  <span className="font-medium text-foreground">{split.split}</span>
                  <span className="text-center text-muted-foreground">{distLabel}</span>
                  <span className={`text-center font-semibold ${isFaster ? "text-green-500" : "text-foreground"}`}>{pace}</span>
                  <span className="text-center text-muted-foreground">{split.elevation_difference > 0 ? "+" : ""}{Math.round(split.elevation_difference)}m</span>
                  <span className="text-center text-muted-foreground">{split.average_heartrate ? Math.round(split.average_heartrate) : "--"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Race tag + Runner comment (Premium only) */}
      {isPremium && (
        <div className="bg-card border border-border rounded-xl p-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={16} className="text-primary" />
            <h3 className="font-display font-bold text-foreground text-sm">
              {lang === "zh" ? "比賽標籤與感受" : "Race Tag & Your Comment"}
            </h3>
          </div>

          <label className="text-xs font-medium text-foreground mb-1.5 block">
            {lang === "zh" ? "這是比賽嗎？" : "Was this a race?"}
          </label>
          {sameDayRaces.length > 0 ? (
            <select
              value={raceSelection}
              onChange={(e) => {
                setRaceSelection(e.target.value);
                if (e.target.value !== "manual") setManualRaceName("");
              }}
              className="w-full text-sm rounded-lg border border-input bg-background px-3 py-2 mb-2"
            >
              <option value="">{lang === "zh" ? "— 不是比賽 —" : "— Not a race —"}</option>
              {sameDayRaces.map(r => (
                <option key={r.id} value={r.id}>
                  {(lang === "zh" && r.name_zh ? r.name_zh : r.name)} · {r.city}
                </option>
              ))}
              <option value="manual">{lang === "zh" ? "找不到我的比賽，手動輸入…" : "I can't find my race — enter manually…"}</option>
            </select>
          ) : (
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-2">
                {lang === "zh"
                  ? "今天沒有可選的比賽，請在下方輸入比賽名稱。"
                  : "No race available today, please enter the race name below."}
              </p>
              <select
                value={raceSelection}
                onChange={(e) => setRaceSelection(e.target.value)}
                className="w-full text-sm rounded-lg border border-input bg-background px-3 py-2 mb-2"
              >
                <option value="">{lang === "zh" ? "— 不是比賽 —" : "— Not a race —"}</option>
                <option value="manual">{lang === "zh" ? "這是比賽 — 手動輸入" : "This was a race — enter manually"}</option>
              </select>
            </div>
          )}

          {raceSelection === "manual" && (
            <Input
              value={manualRaceName}
              onChange={(e) => setManualRaceName(e.target.value)}
              placeholder={lang === "zh" ? "輸入比賽名稱（例：渣打馬拉松）" : "Enter race name (e.g. Boston Marathon)"}
              className="mb-2"
              maxLength={120}
            />
          )}

          <label className="text-xs font-medium text-foreground mb-1.5 block mt-3">
            <MessageSquare size={12} className="inline mr-1" />
            {lang === "zh" ? "你對這次活動有什麼感想？（選填）" : "How did this activity feel? (optional)"}
          </label>
          <Textarea
            value={userComment}
            onChange={(e) => setUserComment(e.target.value)}
            placeholder={lang === "zh"
              ? "例如：腿很沉、心率偏高、最後 5 公里很辛苦…"
              : "e.g. Legs felt heavy, HR was higher than usual, struggled in the last 5 km…"}
            className="text-sm min-h-[72px]"
            maxLength={500}
          />

          {inputsChanged && (
            <button
              onClick={handleRegenerateAnalysis}
              disabled={aiLoading}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} />
              {lang === "zh" ? "用新資訊重新分析" : "Re-analyze with new info"}
            </button>
          )}
        </div>
      )}

      {/* AI Workout Analysis Section */}
      <div className="bg-card border border-border rounded-xl p-4 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-primary" />
          <h3 className="font-display font-bold text-foreground text-sm">
            {lang === "zh" ? "AI 訓練分析" : "AI Workout Analysis"}
          </h3>
          {!isPremium && <Lock size={14} className="text-muted-foreground" />}
        </div>
        {!isPremium ? (
          <div className="text-center py-6">
            <Lock size={24} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {lang === "zh" ? "升級 Premium 以解鎖 AI 訓練分析" : "Upgrade to Premium to unlock AI Workout Analysis"}
            </p>
          </div>
        ) : needsRpe && !rpeSubmitted && !aiAnalysis ? (
          /* RPE Input for Apple Health activities */
          <div className="py-2">
            <div className="bg-muted/50 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Gauge size={14} className="text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  {lang === "zh" ? "什麼是 RPE？" : "What is RPE?"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {lang === "zh"
                  ? "RPE（自覺運動強度）是一個 1-10 的量表，用來衡量你感覺這次運動有多辛苦。1 = 非常輕鬆（幾乎不費力），5 = 中等強度（有點吃力但還能對話），8 = 很辛苦（只能說幾個字），10 = 全力衝刺（完全無法說話）。"
                  : "RPE (Rate of Perceived Exertion) is a 1-10 scale measuring how hard the workout felt. 1 = Very easy (barely any effort), 5 = Moderate (challenging but can hold a conversation), 8 = Very hard (can only say a few words), 10 = Maximum effort (cannot speak at all)."}
              </p>
            </div>
            <label className="text-xs font-medium text-foreground mb-1.5 block">
              {lang === "zh" ? "這次訓練的 RPE 是多少？(1-10)" : "How hard did this workout feel? (RPE 1-10)"}
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={10}
                value={rpeInput}
                onChange={(e) => setRpeInput(e.target.value)}
                placeholder={lang === "zh" ? "輸入 1-10" : "Enter 1-10"}
                className="w-24 text-center"
                onKeyDown={(e) => { if (e.key === "Enter") handleRpeSubmit(); }}
              />
              <button
                onClick={handleRpeSubmit}
                disabled={!rpeInput}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {lang === "zh" ? "分析" : "Analyze"}
              </button>
            </div>
          </div>
        ) : aiLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            <span className="ml-2 text-sm text-muted-foreground">
              {lang === "zh" ? "AI 分析中..." : "Analyzing workout..."}
            </span>
          </div>
        ) : aiAnalysis ? (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground text-sm [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1 [&_ul]:my-1 [&_li]:my-0.5">
            <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
          </div>
        ) : !analysisAttempted ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              {lang === "zh"
                ? "請先（可選）在上方標記比賽和填寫感受，然後點擊下方按鈕開始 AI 分析。"
                : "Optionally tag a race and add a comment above first, then click below to run AI analysis."}
            </p>
            <button
              onClick={handleAnalyzeClick}
              disabled={aiLoading}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Sparkles size={12} className="inline mr-1" />
              {lang === "zh" ? "開始 AI 分析" : "Run AI Analysis"}
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-2">
              {lang === "zh" ? "無法獲取分析結果" : "Could not retrieve analysis"}
            </p>
            <button
              onClick={() => needsRpe ? setRpeSubmitted(false) : runAiAnalysis(splits)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {lang === "zh" ? "重試" : "Retry"}
            </button>
          </div>
        )}
      </div>

      {/* Suggested Next Workout */}
      {isPremium && aiNextWorkout && !aiLoading && (
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl p-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Footprints size={16} className="text-primary" />
            <h3 className="font-display font-bold text-foreground text-sm">
              {lang === "zh" ? "建議的下一次訓練" : "Suggested Next Workout"}
            </h3>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground text-sm [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-primary">
            <ReactMarkdown>{aiNextWorkout}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityDetail;
