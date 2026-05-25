import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Play, Loader2, RotateCcw, Crown, Lock, RefreshCw } from "lucide-react";
import { PostureSkeleton } from "@/components/ui/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Lang, t } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { usePremium } from "@/contexts/PremiumContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokePostureAnalysis } from "@/lib/postureAnalysis";
import PoseOverlay from "@/components/posture/PoseOverlay";
import PostureResults, { PostureAnalysisResult, PostureAverages } from "@/components/posture/PostureResults";
import { saveVideoBlob, loadVideoBlob, deleteVideoBlob } from "@/lib/videoStorage";

interface Props {
  lang: Lang;
}

function extractFrames(videoFile: File, count = 4): Promise<string[]> {
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
        canvas.width = Math.min(video.videoWidth, 480);
        canvas.height = (canvas.width / video.videoWidth) * video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.6));
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

const PostureTab = ({ lang }: Props) => {
  const { toast } = useToast();
  const { user } = useAuth();
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

  const POSTURE_USED_DATE_KEY = "posture_used_date";

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

  // Load last analysis on mount — from localStorage first, then DB
  // Also restore persisted video from IndexedDB
  useEffect(() => {
    setUsedToday(isUsedToday());

    // Restore video from IndexedDB
    loadVideoBlob().then((blob) => {
      if (blob) {
        setVideoUrl(URL.createObjectURL(blob));
      }
    }).catch(() => {});

    // Always try localStorage first (persists after logout)
    const cached = localStorage.getItem(POSTURE_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as PostureAnalysisResult;
        setResult(parsed);
      } catch { /* ignore */ }
    }

    if (!user) { setLoadingLast(false); return; }
    (async () => {
      try {
        const [{ data: lastRow }, _] = await Promise.all([
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
          // Check if last analysis was today (DB-based check)
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

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast({ title: lang === "zh" ? "錯誤" : "Error", description: lang === "zh" ? "請上傳影片檔案" : "Please upload a video file", variant: "destructive" });
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: lang === "zh" ? "檔案太大" : "File too large", description: lang === "zh" ? "影片不能超過100MB" : "Video must be under 100MB", variant: "destructive" });
      return;
    }

    setResult(null);
    const blob = new Blob([file], { type: file.type });
    setVideoUrl(URL.createObjectURL(blob));
    // Persist video blob to IndexedDB
    saveVideoBlob(blob).catch(() => {});
    setExtracting(true);
    try {
      const extracted = await extractFrames(file, 6);
      setFrames(extracted);
    } catch {
      toast({ title: lang === "zh" ? "錯誤" : "Error", description: lang === "zh" ? "無法處理影片" : "Failed to process video", variant: "destructive" });
    }
    setExtracting(false);
  }, [lang, toast]);

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

  const saveResult = useCallback(async (parsed: PostureAnalysisResult) => {
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
        feedback: JSON.stringify({ strengths: parsed.strengths, improvements: parsed.improvements, summary: parsed.summary }),
      });
    } catch (err) {
      console.warn("Failed to save analysis:", err);
    }
  }, [user]);

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

      // Mark free user usage for today
      if (!isPremium) markUsedToday();

      await Promise.all([saveResult(parsed), fetchAverages()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast({ title: lang === "zh" ? "錯誤" : "Error", description: message || (lang === "zh" ? "網絡錯誤，請重試" : "Network error, please retry"), variant: "destructive" });
    }
    setAnalyzing(false);
  }, [frames, lang, toast, saveResult, fetchAverages]);

  const handleRetest = () => {
    setVideoUrl(null);
    setFrames([]);
    setResult(null);
    setAverages(null);
    setShowUpload(true);
    if (fileRef.current) fileRef.current.value = "";
    // Delete persisted video
    deleteVideoBlob().catch(() => {});
    localStorage.removeItem(POSTURE_CACHE_KEY);
  };

  const { isPremium } = usePremium();

  // Free users: blocked if already used today AND trying to start a new analysis
  const freeUserBlocked = !isPremium && usedToday && !result;

  if (loadingLast) {
    return <PostureSkeleton />;
  }

  // Show last result if exists and user hasn't clicked retest
  const showingLastResult = result && !showUpload && !frames.length;

  return (
    <div className="px-5 pt-6 max-w-lg mx-auto pb-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-display text-3xl font-bold text-foreground">{t("postureAnalysis", lang)}</h1>
        {(result || videoUrl) && (isPremium || !usedToday) && (
          <Button variant="outline" size="sm" onClick={handleRetest} className="gap-1.5">
            <RefreshCw size={14} />
            {lang === "zh" ? "重新測試" : "Retest"}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">{t("postureDesc", lang)}</p>

      {/* Free user daily limit info */}
      {!isPremium && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 bg-muted/50 rounded-lg px-3 py-2">
          <Crown size={14} className="text-warning shrink-0" />
          {usedToday
            ? (lang === "zh" ? "今日免費次數已用完，升級高級版可無限使用" : "Free daily analysis used. Upgrade to Premium for unlimited access")
            : (lang === "zh" ? "免費用戶每日可分析 1 次，升級高級版可無限使用" : "Free users: 1 analysis per day. Upgrade to Premium for unlimited")}
        </div>
      )}

      {/* Show last result with persisted video */}
      {showingLastResult ? (
        <div className="space-y-4">
          {videoUrl && <PoseOverlay videoUrl={videoUrl} lang={lang} />}
          <PostureResults result={result} averages={averages} lang={lang} onTranslated={(translated) => {
            setResult(translated);
            localStorage.setItem(POSTURE_CACHE_KEY, JSON.stringify(translated));
          }} />
        </div>
      ) : freeUserBlocked ? (
        <div className="flex flex-col items-center justify-center gap-4 border-2 border-dashed border-border rounded-2xl p-12 bg-card">
          <div className="bg-warning/10 rounded-full p-4">
            <Lock size={28} className="text-warning" />
          </div>
          <div className="text-center">
            <p className="font-display font-semibold text-foreground mb-1">{lang === "zh" ? "今日次數已用完" : "Daily Limit Reached"}</p>
            <p className="text-sm text-muted-foreground">{lang === "zh" ? "明天再來，或升級高級版無限使用" : "Come back tomorrow, or upgrade to Premium for unlimited access"}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Upload area */}
           {!videoUrl ? (
            <>
              <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-2xl p-10 cursor-pointer hover:border-primary/50 transition-colors bg-card">
                <div className="bg-primary/10 rounded-full p-4">
                  <Upload size={28} className="text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground text-sm">{t("uploadVideo", lang)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("uploadVideoHint", lang)}</p>
                </div>
                <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
              </label>

              <div className="bg-muted/50 rounded-xl px-4 py-3 space-y-2 mt-3">
                <p className="text-xs font-semibold text-foreground">
                  {lang === "zh" ? "📋 拍攝建議" : "📋 Tips for Best Results"}
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>{lang === "zh" ? "拍攝全身跑步姿勢，從頭到腳都需要在畫面中" : "Capture the full body from head to toe while running"}</li>
                  <li>{lang === "zh" ? "從側面拍攝效果最佳（左側或右側均可）" : "Film from the side view for best results (left or right)"}</li>
                  <li>{lang === "zh" ? "確保光線充足，避免背光或陰暗環境" : "Ensure good lighting — avoid backlit or dark environments"}</li>
                  <li>{lang === "zh" ? "保持鏡頭穩定，避免晃動" : "Keep the camera steady with minimal shaking"}</li>
                  <li>{lang === "zh" ? "建議拍攝 5-15 秒的跑步片段" : "Record a 5–15 second running clip for optimal analysis"}</li>
                  <li>{lang === "zh" ? "穿著貼身運動服以便 AI 更準確地辨識姿勢" : "Wear fitted sportswear so AI can detect your posture accurately"}</li>
                </ul>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <PoseOverlay videoUrl={videoUrl} lang={lang} />

              {!result && (
                <>
                  {extracting ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={16} className="animate-spin" />
                      {t("extractingFrames", lang)}
                    </div>
                  ) : frames.length > 0 ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {t("extractedFrames", lang).replace("{n}", String(frames.length))}
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {frames.map((f, i) => (
                          <img key={i} src={f} alt={`Frame ${i + 1}`} className="rounded-lg border border-border w-full aspect-video object-cover" />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex gap-2">
                    <Button onClick={handleAnalyze} disabled={analyzing || frames.length === 0} className="flex-1">
                      {analyzing ? (
                        <><Loader2 size={16} className="animate-spin" /> {t("analyzing", lang)}</>
                      ) : (
                        <><Play size={16} /> {t("analyzePosture", lang)}</>
                      )}
                    </Button>
                  </div>
                </>
              )}

              {result && (
                <PostureResults result={result} averages={averages} lang={lang} onTranslated={(translated) => {
                  setResult(translated);
                  localStorage.setItem(POSTURE_CACHE_KEY, JSON.stringify(translated));
                }} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PostureTab;
