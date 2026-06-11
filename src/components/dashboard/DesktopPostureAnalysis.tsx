import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Play,
  Loader2,
  Crown,
  Lock,
  RefreshCw,
  Video,
  Sparkles,
  Lightbulb,
  Film,
} from "lucide-react";
import { PostureSkeleton } from "@/components/ui/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Lang, t } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { usePremium } from "@/contexts/PremiumContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokePostureAnalysis } from "@/lib/postureAnalysis";
import PoseOverlay from "@/components/posture/PoseOverlay";
import PostureResults, {
  PostureAnalysisResult,
  PostureAverages,
} from "@/components/posture/PostureResults";
import { saveVideoBlob, loadVideoBlob, deleteVideoBlob } from "@/lib/videoStorage";

interface Props {
  lang: Lang;
}

function extractFrames(videoFile: File, count = 6): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const frames: string[] = [];
      let currentFrame = 0;
      const times = Array.from({ length: count }, (_, i) =>
        Math.min(duration * ((i + 0.5) / count), duration - 0.1)
      );
      const captureFrame = () => {
        if (currentFrame >= times.length) {
          URL.revokeObjectURL(url);
          resolve(frames);
          return;
        }
        video.currentTime = times[currentFrame];
      };
      video.onseeked = () => {
        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = (canvas.width / video.videoWidth) * video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.7));
        currentFrame++;
        captureFrame();
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load video"));
      };
      captureFrame();
    };
  });
}

function parseStoredResult(row: any): PostureAnalysisResult | null {
  try {
    const feedback = row.feedback ? JSON.parse(row.feedback) : {};
    return {
      overall_score: row.overall_score,
      sections: {
        head: { score: row.head_score, feedback: "" },
        shoulder: { score: row.shoulder_score, feedback: "" },
        upper_limb: { score: row.upper_limb_score, feedback: "" },
        torso: { score: row.torso_score, feedback: "" },
        lower_limb: { score: row.lower_limb_score, feedback: "" },
      },
      strengths: feedback.strengths || [],
      improvements: feedback.improvements || [],
      summary: feedback.summary || "",
    };
  } catch {
    return null;
  }
}

const POSTURE_CACHE_KEY = "posture_last_result";
const POSTURE_CACHE_LANG_KEY = "posture_last_lang";
const POSTURE_USED_DATE_KEY = "posture_used_date";

const DesktopPostureAnalysis = ({ lang }: Props) => {
  const zh = lang === "zh";
  const { toast } = useToast();
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const fileRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<PostureAnalysisResult | null>(null);
  const [averages, setAverages] = useState<PostureAverages | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [loadingLast, setLoadingLast] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [usedToday, setUsedToday] = useState(false);

  const isUsedToday = useCallback(() => {
    const lastUsed = localStorage.getItem(POSTURE_USED_DATE_KEY);
    if (!lastUsed) return false;
    const today = new Date().toISOString().slice(0, 10);
    return lastUsed === today;
  }, []);

  const markUsedToday = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(POSTURE_USED_DATE_KEY, today);
    setUsedToday(true);
  }, []);

  useEffect(() => {
    setUsedToday(isUsedToday());

    loadVideoBlob()
      .then((blob) => {
        if (blob) setVideoUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});

    const cached = localStorage.getItem(POSTURE_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as PostureAnalysisResult;
        setResult(parsed);
      } catch {
        /* ignore */
      }
    }

    if (!user) {
      setLoadingLast(false);
      return;
    }
    (async () => {
      try {
        const [{ data: lastRow }] = await Promise.all([
          supabase
            .from("posture_analyses")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          (async () => {
            const { data } = await supabase.rpc("get_posture_averages");
            if (data && Array.isArray(data) && data.length > 0 && data[0].total_count > 0) {
              setAverages(data[0] as unknown as PostureAverages);
            }
          })(),
        ]);
        if (lastRow) {
          const parsed = parseStoredResult(lastRow);
          if (parsed) {
            setResult(parsed);
            localStorage.setItem(POSTURE_CACHE_KEY, JSON.stringify(parsed));
          }
          const lastDate = lastRow.created_at?.slice(0, 10);
          const today = new Date().toISOString().slice(0, 10);
          if (lastDate === today) {
            setUsedToday(true);
            localStorage.setItem(POSTURE_USED_DATE_KEY, today);
          }
        }
      } catch (err) {
        console.warn("Failed to load last analysis:", err);
      }
      setLoadingLast(false);
    })();
  }, [user, isUsedToday]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        toast({
          title: zh ? "錯誤" : "Error",
          description: zh ? "請上傳影片檔案" : "Please upload a video file",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        toast({
          title: zh ? "檔案太大" : "File too large",
          description: zh ? "影片不能超過100MB" : "Video must be under 100MB",
          variant: "destructive",
        });
        return;
      }
      setResult(null);
      const blob = new Blob([file], { type: file.type });
      setVideoUrl(URL.createObjectURL(blob));
      saveVideoBlob(blob).catch(() => {});
      setExtracting(true);
      try {
        const extracted = await extractFrames(file, 6);
        setFrames(extracted);
      } catch {
        toast({
          title: zh ? "錯誤" : "Error",
          description: zh ? "無法處理影片" : "Failed to process video",
          variant: "destructive",
        });
      }
      setExtracting(false);
    },
    [zh, toast]
  );

  const fetchAverages = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("get_posture_averages");
      if (data && Array.isArray(data) && data.length > 0 && data[0].total_count > 0) {
        setAverages(data[0] as unknown as PostureAverages);
      }
    } catch (err) {
      console.warn("Failed to fetch averages:", err);
    }
  }, []);

  const saveResult = useCallback(
    async (parsed: PostureAnalysisResult) => {
      if (!user) return;
      try {
        await supabase.from("posture_analyses").insert({
          user_id: user.id,
          overall_score: parsed.overall_score,
          head_score: parsed.sections.head.score,
          shoulder_score: parsed.sections.shoulder.score,
          upper_limb_score: parsed.sections.upper_limb.score,
          torso_score: parsed.sections.torso.score,
          lower_limb_score: parsed.sections.lower_limb.score,
          feedback: JSON.stringify({
            strengths: parsed.strengths,
            improvements: parsed.improvements,
            summary: parsed.summary,
          }),
        });
      } catch (err) {
        console.warn("Failed to save analysis:", err);
      }
    },
    [user]
  );

  const handleAnalyze = useCallback(async () => {
    if (frames.length === 0) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const parsed = await invokePostureAnalysis<PostureAnalysisResult>({ frames, lang });
      setResult(parsed);
      setShowUpload(false);
      localStorage.setItem(POSTURE_CACHE_KEY, JSON.stringify(parsed));
      localStorage.setItem(POSTURE_CACHE_LANG_KEY, lang);
      if (!isPremium) markUsedToday();
      await Promise.all([saveResult(parsed), fetchAverages()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast({
        title: zh ? "錯誤" : "Error",
        description:
          message || (zh ? "網絡錯誤，請重試" : "Network error, please retry"),
        variant: "destructive",
      });
    }
    setAnalyzing(false);
  }, [frames, lang, zh, toast, saveResult, fetchAverages, isPremium, markUsedToday]);

  const handleRetest = () => {
    setVideoUrl(null);
    setFrames([]);
    setResult(null);
    setAverages(null);
    setShowUpload(true);
    if (fileRef.current) fileRef.current.value = "";
    deleteVideoBlob().catch(() => {});
    localStorage.removeItem(POSTURE_CACHE_KEY);
  };

  const freeUserBlocked = !isPremium && usedToday && !result;

  if (loadingLast) return <PostureSkeleton />;

  const showingLastResult = result && !showUpload && !frames.length;

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("postureAnalysis", lang)}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {t("postureDesc", lang)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isPremium && (
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border">
              <Crown size={14} className="text-warning shrink-0" />
              {usedToday
                ? zh
                  ? "今日免費次數已用完"
                  : "Free daily analysis used"
                : zh
                  ? "免費用戶每日 1 次"
                  : "Free: 1 per day"}
            </div>
          )}
          {(result || videoUrl) && (isPremium || !usedToday) && (
            <Button variant="outline" size="sm" onClick={handleRetest} className="gap-1.5">
              <RefreshCw size={14} />
              {zh ? "重新測試" : "New Analysis"}
            </Button>
          )}
        </div>
      </div>

      {/* Free user mobile banner */}
      {!isPremium && (
        <div className="md:hidden flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border">
          <Crown size={14} className="text-warning shrink-0" />
          {usedToday
            ? zh
              ? "今日免費次數已用完，升級高級版可無限使用"
              : "Free daily analysis used. Upgrade for unlimited access"
            : zh
              ? "免費用戶每日可分析 1 次"
              : "Free users: 1 analysis per day"}
        </div>
      )}

      {showingLastResult ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Card className="p-4 lg:col-span-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
              <Video className="h-4 w-4 text-primary" />
              {zh ? "影片回放" : "Video Playback"}
            </div>
            {videoUrl ? (
              <PoseOverlay videoUrl={videoUrl} lang={lang} />
            ) : (
              <div className="aspect-video rounded-xl bg-muted/40 flex items-center justify-center text-sm text-muted-foreground">
                {zh ? "影片已不可用" : "Video no longer available"}
              </div>
            )}
          </Card>
          <Card className="p-4 lg:col-span-2 overflow-hidden">
            <PostureResults
              result={result}
              averages={averages}
              lang={lang}
              onTranslated={(translated) => {
                setResult(translated);
                localStorage.setItem(POSTURE_CACHE_KEY, JSON.stringify(translated));
              }}
            />
          </Card>
        </div>
      ) : freeUserBlocked ? (
        <Card className="flex flex-col items-center justify-center gap-4 border-2 border-dashed border-border p-16">
          <div className="bg-warning/10 rounded-full p-5">
            <Lock size={32} className="text-warning" />
          </div>
          <div className="text-center max-w-md">
            <p className="font-display text-lg font-semibold text-foreground mb-1">
              {zh ? "今日次數已用完" : "Daily Limit Reached"}
            </p>
            <p className="text-sm text-muted-foreground">
              {zh
                ? "明天再來，或升級高級版無限使用"
                : "Come back tomorrow, or upgrade to Premium for unlimited access"}
            </p>
          </div>
        </Card>
      ) : !videoUrl ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-0 overflow-hidden">
            <label className="flex flex-col items-center justify-center gap-4 border-2 border-dashed border-border rounded-lg p-16 cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors min-h-[360px]">
              <div className="bg-primary/10 rounded-full p-5">
                <Upload size={36} className="text-primary" />
              </div>
              <div className="text-center">
                <p className="font-display font-semibold text-foreground text-lg">
                  {t("uploadVideo", lang)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("uploadVideoHint", lang)}
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  {zh ? "MP4 / MOV · 最大 100MB" : "MP4 / MOV · Max 100MB"}
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              {zh ? "拍攝建議" : "Tips for Best Results"}
            </div>
            <ul className="text-sm text-muted-foreground space-y-2.5">
              {[
                zh
                  ? "拍攝全身跑步姿勢，從頭到腳都需要在畫面中"
                  : "Capture the full body from head to toe while running",
                zh
                  ? "從側面拍攝效果最佳（左側或右側均可）"
                  : "Film from the side view (left or right) for best results",
                zh
                  ? "確保光線充足，避免背光或陰暗環境"
                  : "Ensure good lighting — avoid backlit or dark environments",
                zh
                  ? "保持鏡頭穩定，避免晃動"
                  : "Keep the camera steady with minimal shaking",
                zh
                  ? "建議拍攝 5–15 秒的跑步片段"
                  : "Record a 5–15 second running clip",
                zh
                  ? "穿著貼身運動服以便 AI 更準確地辨識姿勢"
                  : "Wear fitted sportswear so AI can detect posture accurately",
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Card className="p-4 lg:col-span-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
              <Video className="h-4 w-4 text-primary" />
              {zh ? "影片預覽" : "Video Preview"}
            </div>
            <PoseOverlay videoUrl={videoUrl} lang={lang} />

            {!result && frames.length > 0 && !extracting && (
              <div className="mt-5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
                  <Film className="h-4 w-4 text-sky-500" />
                  {t("extractedFrames", lang).replace("{n}", String(frames.length))}
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {frames.map((f, i) => (
                    <img
                      key={i}
                      src={f}
                      alt={`Frame ${i + 1}`}
                      className="rounded-md border border-border w-full aspect-video object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5 lg:col-span-2 flex flex-col">
            {!result ? (
              <>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {zh ? "AI 分析" : "AI Analysis"}
                </div>
                {extracting ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 size={16} className="animate-spin" />
                    {t("extractingFrames", lang)}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-6">
                    {zh
                      ? "我們已從影片中擷取代表性畫面，準備好就可以開始分析跑姿。"
                      : "We've sampled representative frames from your video. Run the analysis when you're ready."}
                  </p>
                )}
                <div className="mt-auto">
                  <Button
                    onClick={handleAnalyze}
                    disabled={analyzing || frames.length === 0}
                    size="lg"
                    className="w-full gap-2"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        {t("analyzing", lang)}
                      </>
                    ) : (
                      <>
                        <Play size={16} />
                        {t("analyzePosture", lang)}
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <PostureResults
                result={result}
                averages={averages}
                lang={lang}
                onTranslated={(translated) => {
                  setResult(translated);
                  localStorage.setItem(POSTURE_CACHE_KEY, JSON.stringify(translated));
                }}
              />
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default DesktopPostureAnalysis;
