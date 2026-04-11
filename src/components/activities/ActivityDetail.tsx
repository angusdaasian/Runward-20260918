import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Clock, MapPin, Zap, Heart, TrendingUp, Mountain, Timer, Footprints, Trash2, Pencil, Sparkles, Lock } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
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
  return 1000 / speed / 60; // minutes per km
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

const ActivityDetail = ({ activity, lang, onBack, isPremium }: Props) => {
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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLang, setAiLang] = useState<string>(lang);

  const handleRename = async () => {
    if (!nameInput.trim() || nameInput === activityName) { setEditingName(false); return; }
    setSavingName(true);
    const { error } = await supabase.from('strava_activities').update({ name: nameInput.trim() } as any).eq('id', activity.id);
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
    const { error } = await supabase
      .from('strava_activities')
      .delete()
      .eq('id', activity.id);

    if (error) {
      toast.error(lang === "zh" ? "刪除失敗" : "Failed to delete activity");
      setDeleting(false);
    } else {
      toast.success(lang === "zh" ? "活動已刪除" : "Activity deleted");
      onBack();
    }
  };

  const runAiAnalysis = async (currentSplits: Split[] | null) => {
    if (!isPremium) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-activity", {
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
          },
          splits: currentSplits || [],
          lang,
        },
      });
      if (error) throw error;
      if (data?.error) {
        console.error("AI analysis error:", data.error);
      } else {
        setAiAnalysis(data?.analysis || "");
      }
    } catch (err: any) {
      console.error("AI analysis error:", err);
    }
    setAiLoading(false);
  };

  // Re-fetch in correct language when lang changes
  useEffect(() => {
    if (!isPremium || !aiAnalysis || lang === aiLang) return;
    setAiLoading(true);
    setAiAnalysis(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("analyze-activity", {
          body: { activityDbId: activity.id, translate: true, lang },
        });
        if (!error && data?.analysis) {
          setAiAnalysis(data.analysis);
          setAiLang(lang);
        }
      } catch (err) {
        console.error("Translation error:", err);
      }
      setAiLoading(false);
    })();
  }, [lang]);

  useEffect(() => {
    const fetchStreams = async () => {
      setLoading(true);
      if (!activity.strava_id || activity.strava_id <= 0) {
        setStreams([]);
        setSplits(null);
        if (isPremium) {
          await runAiAnalysis(null);
        }
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('strava-activity-streams', {
          body: { strava_id: activity.strava_id },
        });

        if (!error && data) {
          setStreams(data.streams || []);
          setSplits(data.splits || null);
          // Auto-run AI analysis after streams are loaded
          if (isPremium) {
            await runAiAnalysis(data.splits || null);
          }
        } else if (isPremium) {
          await runAiAnalysis(null);
        }
      } catch (err) {
        console.error('Error fetching streams:', err);
        if (isPremium) await runAiAnalysis(null);
      }
      setLoading(false);
    };

    fetchStreams();
  }, [activity.strava_id, isPremium]);

  // Process streams into chart data
  const chartData = useMemo(() => {
    if (!streams || streams.length === 0) return [];

    const timeStream = streams.find((s: any) => s.type === 'time');
    const distStream = streams.find((s: any) => s.type === 'distance');
    const hrStream = streams.find((s: any) => s.type === 'heartrate');
    const altStream = streams.find((s: any) => s.type === 'altitude');
    const velStream = streams.find((s: any) => s.type === 'velocity_smooth');

    if (!distStream) return [];

    const data: any[] = [];
    const step = Math.max(1, Math.floor(distStream.data.length / 200)); // Sample ~200 points

    for (let i = 0; i < distStream.data.length; i += step) {
      const point: any = {
        distance_km: (distStream.data[i] / 1000).toFixed(2),
      };
      if (timeStream) point.time = timeStream.data[i];
      if (hrStream) point.heartrate = hrStream.data[i];
      if (altStream) point.altitude = altStream.data[i];
      if (velStream && velStream.data[i] > 0) {
        point.pace = speedToPace(velStream.data[i]);
      }
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

  // Auto-select first available chart
  useEffect(() => {
    if (chartTabs.length > 0 && !chartTabs.find(t => t.key === activeChart)) {
      setActiveChart(chartTabs[0].key);
    }
  }, [chartTabs, activeChart]);

  const dateStr = new Date(activity.start_date).toLocaleDateString(
    lang === "zh" ? "zh-TW" : "en-US",
    { year: "numeric", month: "long", day: "numeric", weekday: "long" }
  );

  const avgPaceMin = speedToPace(activity.average_speed);
  const maxPaceMin = speedToPace(activity.max_speed);

  return (
    <div className="px-5 pt-4 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors">
          <ArrowLeft size={16} />
          {lang === "zh" ? "返回" : "Back"}
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
              <AlertDialogTitle>
                {lang === "zh" ? "確認刪除活動？" : "Delete this activity?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {lang === "zh"
                  ? "此操作無法復原。活動資料將從資料庫中永久刪除。"
                  : "This action cannot be undone. The activity data will be permanently deleted from the database."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{lang === "zh" ? "取消" : "Cancel"}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (lang === "zh" ? "刪除中..." : "Deleting...") : (lang === "zh" ? "確認刪除" : "Delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
        <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
      </div>

      {/* Map */}
      {activity.summary_polyline && (
        <div className="mb-4">
          <ActivityMap polyline={activity.summary_polyline} />
        </div>
      )}

      {/* Key Stats Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatBox icon={MapPin} label={lang === "zh" ? "距離" : "Distance"} value={(activity.distance / 1000).toFixed(2)} unit="km" />
        <StatBox icon={Clock} label={lang === "zh" ? "時間" : "Duration"} value={formatDuration(activity.moving_time)} />
        <StatBox icon={Zap} label={lang === "zh" ? "配速" : "Avg Pace"} value={formatPace(activity.average_speed)} unit="/km" />
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatBox icon={Timer} label={lang === "zh" ? "最快配速" : "Best Pace"} value={formatPace(activity.max_speed)} unit="/km" />
        <StatBox icon={Mountain} label={lang === "zh" ? "爬升" : "Elevation"} value={Math.round(activity.total_elevation_gain).toString()} unit="m" />
        {activity.average_heartrate ? (
          <StatBox icon={Heart} label={lang === "zh" ? "平均心率" : "Avg HR"} value={Math.round(activity.average_heartrate).toString()} unit="bpm" iconColor="text-destructive" />
        ) : (
          <StatBox icon={Clock} label={lang === "zh" ? "總時間" : "Elapsed"} value={formatDuration(activity.elapsed_time)} />
        )}
      </div>
      {activity.max_heartrate && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatBox icon={Heart} label={lang === "zh" ? "最高心率" : "Max HR"} value={Math.round(activity.max_heartrate).toString()} unit="bpm" iconColor="text-destructive" />
        </div>
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
          {/* Chart Tabs */}
          <div className="flex gap-1 mb-4">
            {chartTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveChart(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeChart === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              {activeChart === "pace" ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="distance_km"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${Math.round(v)}`}
                    label={{ value: "km", position: "insideBottomRight", offset: -5, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    reversed
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => formatPaceFromMinutes(v)}
                    domain={['auto', 'auto']}
                    label={{ value: "/km", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [formatPaceFromMinutes(value), lang === "zh" ? "配速" : "Pace"]}
                    labelFormatter={(v) => `${v} km`}
                  />
                  <Line type="monotone" dataKey="pace" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              ) : activeChart === "heartrate" ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="distance_km"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${Math.round(v)}`}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    domain={['auto', 'auto']}
                    label={{ value: "bpm", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [Math.round(value), "bpm"]}
                    labelFormatter={(v) => `${v} km`}
                  />
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
                  <XAxis
                    dataKey="distance_km"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${Math.round(v)}`}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    domain={['auto', 'auto']}
                    label={{ value: "m", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [`${Math.round(value)}m`, lang === "zh" ? "海拔" : "Altitude"]}
                    labelFormatter={(v) => `${v} km`}
                  />
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
            {lang === "zh" ? "每公里配速" : "Splits (per km)"}
          </h3>
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-4 text-[10px] text-muted-foreground font-medium pb-1 border-b border-border">
              <span>km</span>
              <span className="text-center">{lang === "zh" ? "配速" : "Pace"}</span>
              <span className="text-center">{lang === "zh" ? "爬升" : "Elev"}</span>
              <span className="text-center">HR</span>
            </div>
            {splits.map((split, idx) => {
              const pace = formatPace(split.average_speed);
              const avgSplitPace = speedToPace(activity.average_speed);
              const splitPace = speedToPace(split.average_speed);
              const isFaster = splitPace < avgSplitPace;
              return (
                <div key={idx} className="grid grid-cols-4 text-xs py-1.5 border-b border-border/50 last:border-0">
                  <span className="font-medium text-foreground">{split.split}</span>
                  <span className={`text-center font-semibold ${isFaster ? "text-green-500" : "text-foreground"}`}>
                    {pace}
                  </span>
                  <span className="text-center text-muted-foreground">
                    {split.elevation_difference > 0 ? "+" : ""}{Math.round(split.elevation_difference)}m
                  </span>
                  <span className="text-center text-muted-foreground">
                    {split.average_heartrate ? Math.round(split.average_heartrate) : "--"}
                  </span>
                </div>
              );
            })}
          </div>
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
              {lang === "zh"
                ? "升級 Premium 以解鎖 AI 訓練分析"
                : "Upgrade to Premium to unlock AI Workout Analysis"}
            </p>
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
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            {lang === "zh" ? "無法獲取分析結果" : "Could not retrieve analysis"}
          </p>
        )}
      </div>
    </div>
  );
};

export default ActivityDetail;
