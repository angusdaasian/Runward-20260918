import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Clock, MapPin, Zap, Heart, TrendingUp, Mountain, Timer, Footprints, Trash2, Pencil, Sparkles, Lock, Gauge, AlertTriangle, Flame, Trophy, MessageSquare, RefreshCw, Share2 } from "lucide-react";
import { shareActivity, shareSplits, shareCharts } from "@/lib/shareActivity";
import AiPosterDialog from "./AiPosterDialog";
import CustomShareDialog from "./CustomShareDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { loadForActivity, isRunning } from "@/lib/trainingLoad";
import { calculateRunningScore } from "@/lib/vdot";
import { computeZonePct, estimateMaxHr, estimateRestingHr } from "@/lib/hrZones";
import HrZoneBars from "./HrZoneBars";

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
  hr_samples?: Array<{ t: number; bpm: number }> | null;
  distance_samples?: Array<{ t: number; d: number }> | null;
  elevation_samples?: Array<{ t: number; e: number }> | null;
  cadence_samples?: Array<{ t: number; rpm: number }> | null;
  avg_cadence?: number | null;
  map_screenshot_url?: string | null;
  provenance?: "strava" | "apple_health" | "garmin" | "terra";
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
  onDeleted?: () => void;
  isPremium?: boolean;
  trainingScore?: number;
  profileAge?: number | null;
  profileMaxHr?: number | null;
  profileRestingHr?: number | null;
  profileCustomZones?: number[] | null;
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

const ActivityDetail = ({ activity, lang, onBack, onDeleted, isPremium, trainingScore, profileAge, profileMaxHr, profileRestingHr, profileCustomZones }: Props) => {
  const isAppleHealth = activity.source === "Apple Health";
  const isTerraActivity = activity.provenance === "terra" || (activity.source?.startsWith("Terra") ?? false);
  const isGarmin = activity.provenance === "garmin" && activity.source === "Garmin";
  const isCoros = activity.provenance === "garmin" && activity.source === "COROS";
  const needsRpe = isAppleHealth || isGarmin || isTerraActivity || isCoros;
  const dbTable = isTerraActivity ? "terra_activities" : isAppleHealth ? "apple_health_activities" : isGarmin || isCoros ? "garmin_activities" : "strava_activities";
  const isRunningActivity = isRunning(activity.sport_type);

  // Per-activity training score (VDOT) — computed from this activity's distance & time
  const activityScore = useMemo(() => {
    if (!isRunningActivity) return null;
    if (!activity.distance || activity.distance < 400) return null;
    if (!activity.moving_time || activity.moving_time < 60) return null;
    const v = calculateRunningScore(activity.distance, activity.moving_time);
    if (!isFinite(v) || v < 5 || v > 100) return null;
    return Math.round(v * 10) / 10;
  }, [activity.distance, activity.moving_time, isRunningActivity]);
  const displayScore = activityScore ?? trainingScore ?? null;

  const [streams, setStreams] = useState<any[]>([]);
  const [splits, setSplits] = useState<Split[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<"pace" | "heartrate" | "altitude" | "cadence">("pace");
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
  const [aiPosterOpen, setAiPosterOpen] = useState(false);
  const [customShareOpen, setCustomShareOpen] = useState(false);
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
    const updatePayload = (isTerraActivity || isGarmin || isCoros)
      ? { activity_name: nameInput.trim() }
      : { name: nameInput.trim() };
    const { error } = await supabase.from(dbTable).update(updatePayload as any).eq('id', activity.id);
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
    const { data, error } = await supabase.from(dbTable).delete().eq('id', activity.id).select('id');
    if (error || !data || data.length === 0) {
      toast.error(lang === "zh" ? "刪除失敗" : "Failed to delete activity");
      setDeleting(false);
    } else {
      toast.success(lang === "zh" ? "活動已刪除" : "Activity deleted");
      onDeleted?.();
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
      // Send per-second HR + distance samples (Terra) so the AI can detect interval patterns
      if (Array.isArray(activity.hr_samples) && activity.hr_samples.length > 10) {
        bodyPayload.hrSamples = activity.hr_samples;
      }
      if (Array.isArray(activity.distance_samples) && activity.distance_samples.length > 10) {
        bodyPayload.distanceSamples = activity.distance_samples;
      }
      if (Array.isArray(activity.elevation_samples) && activity.elevation_samples.length > 10) {
        bodyPayload.elevationSamples = activity.elevation_samples;
      }
      if (hrZones) {
        bodyPayload.hrZones = hrZones;
      }
      // Strava streams: derive HR/distance/elevation samples for the AI as well
      if (streams && streams.length > 0) {
        const timeStream = streams.find((s: any) => s.type === 'time');
        const hrStream = streams.find((s: any) => s.type === 'heartrate');
        const distStream = streams.find((s: any) => s.type === 'distance');
        const altStream = streams.find((s: any) => s.type === 'altitude');
        if (timeStream && Array.isArray(timeStream.data)) {
          const times: number[] = timeStream.data;
          if (!bodyPayload.hrSamples && hrStream && Array.isArray(hrStream.data)) {
            bodyPayload.hrSamples = times.map((t, i) => ({ t, bpm: hrStream.data[i] })).filter(s => s.bpm != null);
          }
          if (!bodyPayload.distanceSamples && distStream && Array.isArray(distStream.data)) {
            bodyPayload.distanceSamples = times.map((t, i) => ({ t, d: distStream.data[i] })).filter(s => s.d != null);
          }
          if (!bodyPayload.elevationSamples && altStream && Array.isArray(altStream.data)) {
            bodyPayload.elevationSamples = times.map((t, i) => ({ t, e: altStream.data[i] })).filter(s => s.e != null);
          }
        }
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
            // Use real distance / elapsed for true split pace (matches the watch).
            // Terra's avg_speed is a moving average and disagrees with what Garmin Connect shows.
            let avgSpeed = (distance > 0 && elapsed > 0)
              ? distance / elapsed
              : Number(lap.avg_speed ?? lap.average_speed) || 0;
            if (!avgSpeed && lap.average_pace_seconds_per_km) {
              const pace = Number(lap.average_pace_seconds_per_km);
              if (pace > 0) avgSpeed = 1000 / pace;
            }
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
    // Highest fidelity: per-second HR + distance samples from Terra (when available).
    const hrSamples = Array.isArray(activity.hr_samples) ? activity.hr_samples : null;
    const distSamples = Array.isArray(activity.distance_samples) ? activity.distance_samples : null;
    const elevSamples = Array.isArray(activity.elevation_samples) ? activity.elevation_samples : null;
    const cadSamples = Array.isArray(activity.cadence_samples) ? activity.cadence_samples : null;
    if ((hrSamples && hrSamples.length > 10) || (distSamples && distSamples.length > 10) || (elevSamples && elevSamples.length > 10) || (cadSamples && cadSamples.length > 10)) {
      const totalDist = activity.distance || 0;
      // Build a unified per-second view keyed by t.
      const tMap = new Map<number, { heartrate?: number; distM?: number; altitude?: number; cadence?: number }>();
      if (hrSamples) {
        for (const s of hrSamples) {
          tMap.set(s.t, { ...(tMap.get(s.t) || {}), heartrate: s.bpm });
        }
      }
      if (distSamples) {
        for (const s of distSamples) {
          tMap.set(s.t, { ...(tMap.get(s.t) || {}), distM: s.d });
        }
      }
      if (elevSamples) {
        for (const s of elevSamples) {
          tMap.set(s.t, { ...(tMap.get(s.t) || {}), altitude: s.e });
        }
      }
      if (cadSamples) {
        for (const s of cadSamples) {
          tMap.set(s.t, { ...(tMap.get(s.t) || {}), cadence: s.rpm });
        }
      }
      const ordered = Array.from(tMap.entries()).sort((a, b) => a[0] - b[0]);
      // Compute pace via 30s rolling distance delta (min/km), so spikes are smoothed.
      const WINDOW = 30;
      const distAt = (idx: number) => ordered[idx][1].distM;
      const data: any[] = [];
      const lastT = ordered[ordered.length - 1][0] || 1;
      const step = Math.max(1, Math.floor(ordered.length / 250));
      for (let i = 0; i < ordered.length; i += step) {
        const [t, v] = ordered[i];
        const km = v.distM != null
          ? v.distM / 1000
          : (totalDist > 0 ? (totalDist * (t / lastT)) / 1000 : t / 60);
        const point: any = { distance_km: km.toFixed(2), time: t };
        if (v.heartrate) point.heartrate = v.heartrate;
        if (v.altitude != null) point.altitude = v.altitude;
        if (v.cadence != null && v.cadence > 0) point.cadence = v.cadence;
        // Pace from distance window
        if (distSamples && v.distM != null) {
          let j = i;
          while (j > 0 && t - ordered[j][0] < WINDOW) j--;
          const prev = distAt(j);
          const dt = t - ordered[j][0];
          if (prev != null && dt >= 5) {
            const dd = v.distM - prev;
            if (dd > 0) {
              const speed = dd / dt; // m/s
              const pace = speedToPace(speed);
              // Drop unrealistic paces (slower than 15 min/km or faster than 2:30 min/km)
              if (pace >= 2.5 && pace <= 15) point.pace = pace;
            }
          }
        }
        data.push(point);
      }
      // Second-pass IQR clipping on pace to remove residual outliers
      const paces = data.map((d) => d.pace).filter((p): p is number => typeof p === "number").sort((a, b) => a - b);
      if (paces.length > 8) {
        const q = (frac: number) => paces[Math.floor(paces.length * frac)];
        const q1 = q(0.1), q3 = q(0.9);
        const iqr = q3 - q1;
        const lo = q1 - 1.5 * iqr;
        const hi = q3 + 1.5 * iqr;
        for (const d of data) {
          if (typeof d.pace === "number" && (d.pace < lo || d.pace > hi)) delete d.pace;
        }
      }
      return data;
    }
    // per-lap chart from splits so HR + Pace charts still render.
    if ((!streams || streams.length === 0) && splits && splits.length > 0) {
      const data: any[] = [];
      let cum = 0;
      for (const s of splits) {
        cum += (s.distance || 0);
        const point: any = { distance_km: (cum / 1000).toFixed(2) };
        if (s.average_heartrate) point.heartrate = s.average_heartrate;
        if (s.average_speed > 0) point.pace = speedToPace(s.average_speed);
        data.push(point);
      }
      return data;
    }
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
  }, [streams, splits, activity.hr_samples, activity.distance_samples, activity.elevation_samples, activity.distance]);

  const hasHeartrate = chartData.some(d => d.heartrate);
  const hasAltitude = chartData.some(d => d.altitude !== undefined);
  const hasPace = chartData.some(d => d.pace);

  const chartTabs = useMemo(() => {
    const tabs: { key: "pace" | "heartrate" | "altitude"; label: string }[] = [];
    if (isRunningActivity && hasPace) tabs.push({ key: "pace", label: lang === "zh" ? "配速" : "Pace" });
    if (hasHeartrate) tabs.push({ key: "heartrate", label: lang === "zh" ? "心率" : "Heart Rate" });
    if (isRunningActivity && hasAltitude) tabs.push({ key: "altitude", label: lang === "zh" ? "海拔" : "Altitude" });
    return tabs;
  }, [hasPace, hasHeartrate, hasAltitude, lang, isRunningActivity]);

  useEffect(() => {
    if (chartTabs.length > 0 && !chartTabs.find(t => t.key === activeChart)) {
      setActiveChart(chartTabs[0].key);
    }
  }, [chartTabs, activeChart]);

  // HR zone distribution from highest-resolution source available.
  const hrZones = useMemo(() => {
    const maxHr = estimateMaxHr(profileAge ?? null, profileMaxHr ?? null);
    const restHr = estimateRestingHr(profileRestingHr ?? null);
    const custom = profileCustomZones ?? null;
    // 1. Terra per-second samples
    if (Array.isArray(activity.hr_samples) && activity.hr_samples.length > 10) {
      return computeZonePct(activity.hr_samples.map((s: any) => s.bpm), maxHr, restHr, custom);
    }
    // 2. Strava heartrate stream
    const hrStream = streams.find((s: any) => s.type === "heartrate");
    if (hrStream && Array.isArray(hrStream.data) && hrStream.data.length > 10) {
      return computeZonePct(hrStream.data, maxHr, restHr, custom);
    }
    return null;
  }, [activity.hr_samples, profileMaxHr, profileAge, profileRestingHr, profileCustomZones, streams]);

  const dateStr = new Date(activity.start_date).toLocaleDateString(
    lang === "zh" ? "zh-TW" : "en-US",
    { year: "numeric", month: "long", day: "numeric", weekday: "long" }
  );
  const timeStr = new Date(activity.start_date).toLocaleTimeString(
    lang === "zh" ? "zh-TW" : "en-US",
    { hour: "2-digit", minute: "2-digit" }
  );

  // Stats for AI poster
  const posterStats = useMemo(() => {
    const distanceKm = (activity.distance || 0) / 1000;
    const sec = activity.moving_time || 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const timeStr = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
    const paceSec = activity.average_speed > 0 ? 1000 / activity.average_speed : 0;
    const pm = Math.floor(paceSec / 60);
    const ps = Math.floor(paceSec % 60);
    const paceStr = paceSec > 0 ? `${pm}:${String(ps).padStart(2, "0")}` : "--";
    return {
      distanceKm,
      timeStr,
      paceStr,
      calories: (activity as any).calories ?? null,
      hr: activity.average_heartrate ?? null,
      elevation: activity.total_elevation_gain ?? null,
    };
  }, [activity]);

  return (
    <div className="px-5 pt-4 pb-8 max-w-lg mx-auto">
      <AiPosterDialog open={aiPosterOpen} onOpenChange={setAiPosterOpen} stats={posterStats} lang={lang} />
      <CustomShareDialog
        open={customShareOpen}
        onOpenChange={setCustomShareOpen}
        lang={lang}
        data={{
          name: activityName,
          startDate: activity.start_date,
          lang,
          distanceMeters: activity.distance,
          movingTimeSeconds: activity.moving_time,
          averageSpeed: activity.average_speed,
          averageHeartrate: activity.average_heartrate ?? null,
          maxHeartrate: activity.max_heartrate ?? null,
          elevationGainMeters: activity.total_elevation_gain ?? null,
          calories: (activity as any).calories ?? null,
          summaryPolyline: activity.summary_polyline ?? null,
          splits: splits ? splits.map((s) => ({
            distance: s.distance,
            elapsed_time: s.elapsed_time,
            average_speed: s.average_speed,
            average_heartrate: s.average_heartrate ?? null,
          })) : [],
          chartData: chartData.map((d: any) => ({
            distance_km: Number(d.distance_km),
            pace: typeof d.pace === "number" ? d.pace : undefined,
            heartrate: typeof d.heartrate === "number" ? d.heartrate : undefined,
            altitude: typeof d.altitude === "number" ? d.altitude : undefined,
          })),
          hrZones: hrZones,
        }}
        available={{
          route: !!activity.summary_polyline,
          splits: !!splits && splits.length > 0,
          hrZones: !!hrZones,
          pace: activity.average_speed > 0,
          avgHr: !!activity.average_heartrate && activity.average_heartrate > 0,
          maxHr: !!activity.max_heartrate && activity.max_heartrate > 0,
          elevation: !!activity.total_elevation_gain && activity.total_elevation_gain > 0,
          calories: !!(activity as any).calories && (activity as any).calories > 0,
          chartPace: chartData.some((d: any) => typeof d.pace === "number" && d.pace > 0),
          chartHr: chartData.some((d: any) => typeof d.heartrate === "number" && d.heartrate > 0),
          chartAlt: chartData.some((d: any) => typeof d.altitude === "number"),
        }}
      />
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors">
          <ArrowLeft size={16} />
          {lang === "zh" ? "返回" : "Back"}
        </button>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                <Share2 size={14} />
                {lang === "zh" ? "分享" : "Share"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() =>
                  shareActivity({
                    name: activityName,
                    distanceMeters: activity.distance,
                    movingTimeSeconds: activity.moving_time,
                    averageSpeed: activity.average_speed,
                    startDate: activity.start_date,
                    averageHeartrate: activity.average_heartrate ?? null,
                    elevationGainMeters: activity.total_elevation_gain ?? null,
                    summaryPolyline: activity.summary_polyline ?? null,
                    lang,
                  })
                }
              >
                {lang === "zh" ? "分享活動卡片" : "Share activity card"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!splits || splits.length === 0}
                onClick={() => {
                  if (!isPremium) {
                    toast.error(lang === "zh" ? "升級 Premium 以解鎖" : "Upgrade to Premium to unlock");
                    return;
                  }
                  if (!splits || splits.length === 0) return;
                  shareSplits({
                    name: activityName,
                    startDate: activity.start_date,
                    splits: splits.map((s) => ({
                      distance: s.distance,
                      elapsed_time: s.elapsed_time,
                      average_speed: s.average_speed,
                      average_heartrate: s.average_heartrate ?? null,
                    })),
                    lang,
                  });
                }}
              >
                <span className="flex items-center gap-2 w-full">
                  {lang === "zh" ? "分享分段" : "Share splits"}
                  {!isPremium && <Lock size={12} className="ml-auto text-muted-foreground" />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!chartData || chartData.length < 2}
                onClick={() => {
                  if (!isPremium) {
                    toast.error(lang === "zh" ? "升級 Premium 以解鎖" : "Upgrade to Premium to unlock");
                    return;
                  }
                  if (!chartData || chartData.length < 2) return;
                  shareCharts({
                    name: activityName,
                    startDate: activity.start_date,
                    data: chartData.map((d: any) => ({
                      distance_km: Number(d.distance_km),
                      pace: typeof d.pace === "number" ? d.pace : undefined,
                      heartrate: typeof d.heartrate === "number" ? d.heartrate : undefined,
                    })),
                    lang,
                  });
                }}
              >
                <span className="flex items-center gap-2 w-full">
                  {lang === "zh" ? "分享圖表" : "Share charts"}
                  {!isPremium && <Lock size={12} className="ml-auto text-muted-foreground" />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!isPremium) {
                    toast.error(lang === "zh" ? "升級 Premium 以解鎖" : "Upgrade to Premium to unlock");
                    return;
                  }
                  setCustomShareOpen(true);
                }}
              >
                <span className="flex items-center gap-2 w-full">
                  <Sparkles size={12} className="text-primary" />
                  {lang === "zh" ? "自訂分享卡片" : "Custom share card"}
                  {!isPremium && <Lock size={12} className="ml-auto text-muted-foreground" />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!isPremium) {
                    toast.error(lang === "zh" ? "升級 Premium 以解鎖" : "Upgrade to Premium to unlock");
                    return;
                  }
                  setAiPosterOpen(true);
                }}
              >
                <span className="flex items-center gap-2 w-full">
                  <Sparkles size={12} className="text-primary" />
                  {lang === "zh" ? "AI 海報（上傳照片）" : "AI poster (upload photo)"}
                  {!isPremium && <Lock size={12} className="ml-auto text-muted-foreground" />}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <StatBox icon={TrendingUp} label={lang === "zh" ? "訓練分數" : "Training Score"} value={displayScore != null ? displayScore.toString() : "--"} />
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
            <StatBox icon={TrendingUp} label={lang === "zh" ? "訓練分數" : "Training Score"} value={displayScore != null ? displayScore.toString() : "--"} />
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
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.15)] ring-1 ring-slate-200/70">
          <div className="flex gap-1.5 mb-4">
            {chartTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveChart(tab.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeChart === tab.key
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="distance_km" tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={(v) => `${Math.round(v)}`}
                    label={{ value: "km", position: "insideBottomRight", offset: -5, fontSize: 10, fill: "#64748B" }} />
                  <YAxis reversed tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={(v) => formatPaceFromMinutes(v)} domain={['auto', 'auto']} width={52}
                    label={{ value: "min/km", angle: -90, position: "insideLeft", fontSize: 10, fill: "#64748B" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#0F172A" }}
                    formatter={(value: number) => [`${formatPaceFromMinutes(value)} min/km`, lang === "zh" ? "配速" : "Pace"]} labelFormatter={(v) => `${v} km`} />
                  <Line type="monotone" dataKey="pace" stroke="#FC4C02" strokeWidth={2.5} dot={false} connectNulls />
                </LineChart>
              ) : activeChart === "heartrate" ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="distance_km" tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={(v) => `${Math.round(v)}`} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748B" }} domain={['auto', 'auto']}
                    label={{ value: "bpm", angle: -90, position: "insideLeft", fontSize: 10, fill: "#64748B" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#0F172A" }}
                    formatter={(value: number) => [Math.round(value), "bpm"]} labelFormatter={(v) => `${v} km`} />
                  <defs>
                    <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="heartrate" stroke="#EF4444" fill="url(#hrGradient)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              ) : (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="distance_km" tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={(v) => `${Math.round(v)}`} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748B" }} domain={['auto', 'auto']}
                    label={{ value: "m", angle: -90, position: "insideLeft", fontSize: 10, fill: "#64748B" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#0F172A" }}
                    formatter={(value: number) => [`${Math.round(value)}m`, lang === "zh" ? "海拔" : "Altitude"]} labelFormatter={(v) => `${v} km`} />
                  <defs>
                    <linearGradient id="altGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="altitude" stroke="#0EA5E9" fill="url(#altGradient)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* HR Zones distribution for this activity */}
      {hrZones && (
        <div className="mt-4">
          <HrZoneBars
            zones={hrZones}
            lang={lang}
            onEdit={() => {
              // Always force a real navigation (cache-busting param) so MoreTab
              // mounts and ProfileSection's hash listener fires reliably.
              const target = `/?tab=more&_hr=${Date.now()}#hr-zones`;
              window.location.href = target;
            }}
            subtitle={
              profileCustomZones && profileCustomZones.length === 5
                ? (lang === "zh" ? "自訂心率區間" : "Custom HR zones")
                : (lang === "zh"
                    ? `最大 ${estimateMaxHr(profileAge ?? null, profileMaxHr ?? null)} / 靜息 ${estimateRestingHr(profileRestingHr ?? null)} bpm`
                    : `Max ${estimateMaxHr(profileAge ?? null, profileMaxHr ?? null)} / rest ${estimateRestingHr(profileRestingHr ?? null)} bpm`)
            }
          />
        </div>
      )}

      {/* Non-running notice */}
      {!isRunningActivity && (
        <div className="bg-card border border-border rounded-xl p-4 mt-4">
          <p className="text-sm text-muted-foreground text-center">
            {lang === "zh"
              ? "非跑步活動不提供分段、AI 訓練分析或配速圖表。"
              : "Non-running activities don't have splits, AI analysis or pace charts."}
          </p>
        </div>
      )}

      {/* Intervals Table — Garmin-style */}
      {isRunningActivity && splits && splits.length > 0 && (
        <div className="bg-white rounded-2xl overflow-hidden mt-4 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.15)] ring-1 ring-slate-200/70">
          <div className="px-5 pt-4 pb-3">
            <h3 className="font-display font-bold text-slate-900 text-sm">
              {lang === "zh" ? "分段" : "Intervals"}
            </h3>
          </div>
          {/* Header row */}
          <div className="grid grid-cols-[36px_1fr_1fr_1fr_1fr_56px] items-end gap-2 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <span>Int</span>
            <span>{lang === "zh" ? "類型" : "Type"}</span>
            <span className="text-right">{lang === "zh" ? "時間" : "Time"}</span>
            <span className="text-right">
              {lang === "zh" ? "距離" : "Dist"}
              <span className="block text-[9px] font-normal normal-case text-slate-400">m</span>
            </span>
            <span className="text-right">
              {lang === "zh" ? "平均配速" : "Avg Pace"}
              <span className="block text-[9px] font-normal normal-case text-slate-400">min/km</span>
            </span>
            <span className="text-right">HR</span>
          </div>
          {(() => {
            // Filter out GPS-noise laps (tiny distance/duration that produce
            // unrealistic paces, e.g. 6m @ 2:44/km from a Garmin auto-lap glitch).
            const NOISE_DIST_M = 50;
            const NOISE_TIME_S = 10;
            const visibleSplits = splits.filter((s) => {
              const d = s.distance || 0;
              const t = s.elapsed_time || 0;
              return !(d < NOISE_DIST_M && t < NOISE_TIME_S);
            });
            // Detect interval workout from lap data using RELATIVE pace spread,
            // ignoring noise laps when computing fastest/slowest.
            const speeds = visibleSplits.map(s => s.average_speed).filter(v => v > 0);
            const hrs = visibleSplits.map(s => s.average_heartrate ?? 0).filter(v => v > 0);
            const fastestSpeed = speeds.length ? Math.max(...speeds) : 0;
            const slowestSpeed = speeds.length ? Math.min(...speeds) : 0;
            let isIntervalWorkout = false;
            if (speeds.length >= 3 && slowestSpeed > 0) {
              const paceRatio = fastestSpeed / slowestSpeed;
              const hrSpread = hrs.length >= 3 ? Math.max(...hrs) - Math.min(...hrs) : 0;
              isIntervalWorkout = paceRatio >= 1.4 || (paceRatio >= 1.25 && hrSpread >= 20);
            }
            let runNum = 0;
            const totalDist = visibleSplits.reduce((a, s) => a + (s.distance || 0), 0);
            const totalTime = visibleSplits.reduce((a, s) => a + (s.elapsed_time || 0), 0);
            const avgSpeedTotal = totalTime > 0 ? totalDist / totalTime : 0;
            const hrWeighted = visibleSplits.reduce((a, s) => a + ((s.average_heartrate || 0) * (s.elapsed_time || 0)), 0);
            const hrTimeSum = visibleSplits.reduce((a, s) => a + (s.average_heartrate ? (s.elapsed_time || 0) : 0), 0);
            const avgHrTotal = hrTimeSum > 0 ? Math.round(hrWeighted / hrTimeSum) : null;
            const rows = visibleSplits.map((split, idx) => {
              const distMeters = split.distance || 0;
              // Rest if this lap's speed is <70% of the fastest lap's speed
              // (i.e. >~43% slower in pace terms).
              const isRest = isIntervalWorkout
                && fastestSpeed > 0
                && split.average_speed > 0
                && split.average_speed < fastestSpeed * 0.7;
              const pace = formatPace(split.average_speed);
              const hr = split.average_heartrate ? Math.round(split.average_heartrate) : null;
              if (!isRest) runNum++;
              return (
                <div
                  key={idx}
                  className={`grid grid-cols-[36px_1fr_1fr_1fr_1fr_56px] items-center gap-2 px-5 py-3 text-xs border-b border-slate-100 last:border-0 ${
                    isRest ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <span className={`font-semibold tabular-nums ${isRest ? "text-slate-400" : "text-slate-900"}`}>
                    {isRest ? "" : runNum}
                  </span>
                  <span className={`${isRest ? "text-slate-400 font-normal" : "text-slate-900 font-semibold"}`}>
                    {isRest ? (lang === "zh" ? "休息" : "Rest") : (lang === "zh" ? "跑步" : "Run")}
                  </span>
                  <span className={`text-right tabular-nums ${isRest ? "text-slate-400" : "text-slate-900 font-semibold"}`}>
                    {formatDuration(split.elapsed_time)}
                  </span>
                  <span className={`text-right tabular-nums ${isRest ? "text-slate-400" : "text-slate-900 font-semibold"}`}>
                    {Math.round(distMeters)}
                  </span>
                  <span className={`text-right tabular-nums ${isRest ? "text-slate-400" : "text-slate-900 font-semibold"}`}>
                    {pace}
                  </span>
                  <span className={`text-right tabular-nums ${isRest ? "text-slate-400" : "text-slate-900"}`}>
                    {hr ?? "--"}
                  </span>
                </div>
              );
            });
            return (
              <>
                {rows}
                <div className="grid grid-cols-[36px_1fr_1fr_1fr_1fr_56px] items-center gap-2 px-5 py-3.5 text-xs bg-slate-100 border-t border-slate-200">
                  <span className="font-bold text-slate-900">Σ</span>
                  <span className="font-bold text-slate-900">{lang === "zh" ? "總計" : "Total"}</span>
                  <span className="text-right tabular-nums font-bold text-slate-900">{formatDuration(totalTime)}</span>
                  <span className="text-right tabular-nums font-bold text-slate-900">{Math.round(totalDist)}</span>
                  <span className="text-right tabular-nums font-bold text-slate-900">{formatPace(avgSpeedTotal)}</span>
                  <span className="text-right tabular-nums font-bold text-slate-900">{avgHrTotal ?? "--"}</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Race tag + Runner comment (Premium only, running activities only) */}
      {isRunningActivity && isPremium && (
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

      {/* AI Workout Analysis Section (running activities only) */}
      {isRunningActivity && (
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
      )}

      {/* Suggested Next Workout */}
      {isRunningActivity && isPremium && aiNextWorkout && !aiLoading && (
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
