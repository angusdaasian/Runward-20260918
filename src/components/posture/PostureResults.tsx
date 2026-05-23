import { useState } from "react";
import { CheckCircle, AlertTriangle, Video, Loader2 } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PostureRadarChart from "./PostureRadarChart";
import PostureScoreCard from "./PostureScoreCard";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-posture`;

interface SectionScore {
  score: number;
  feedback: string;
}

export interface PostureAnalysisResult {
  overall_score: number;
  sections: {
    head: SectionScore;
    shoulder: SectionScore;
    upper_limb: SectionScore;
    torso: SectionScore;
    lower_limb: SectionScore;
  };
  strengths: string[];
  improvements: string[];
  summary: string;
}

export interface PostureAverages {
  avg_overall: number;
  avg_head: number;
  avg_shoulder: number;
  avg_upper_limb: number;
  avg_torso: number;
  avg_lower_limb: number;
  total_count: number;
}

interface Props {
  result: PostureAnalysisResult;
  averages: PostureAverages | null;
  lang: Lang;
  onTranslated?: (translated: PostureAnalysisResult, newLang: Lang) => void;
}

const PostureResults = ({ result, averages, lang, onTranslated }: Props) => {
  const { toast } = useToast();
  const [translating, setTranslating] = useState(false);
  const [displayLang, setDisplayLang] = useState<Lang>(lang);
  const [displayResult, setDisplayResult] = useState<PostureAnalysisResult>(result);

  // If parent result changes, reset
  const [lastResult, setLastResult] = useState(result);
  if (result !== lastResult) {
    setLastResult(result);
    setDisplayResult(result);
    setDisplayLang(lang);
  }

  // Auto-translate when app lang changes
  const [lastLang, setLastLang] = useState(lang);
  if (lang !== lastLang && lang !== displayLang) {
    setLastLang(lang);
    setTimeout(() => handleTranslateToLang(lang), 0);
  } else if (lang !== lastLang) {
    setLastLang(lang);
  }

  const handleTranslateToLang = async (targetLang: Lang) => {
    if (targetLang === displayLang) return;
    setTranslating(true);
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          translate: true,
          existingResult: displayResult,
          lang: targetLang,
        }),
      });

      if (!resp.ok) {
        toast({
          title: displayLang === "zh" ? "翻譯失敗" : "Translation failed",
          description: displayLang === "zh" ? "請稍後再試" : "Please try again",
          variant: "destructive",
        });
        setTranslating(false);
        return;
      }

      const translated: PostureAnalysisResult = await resp.json();
      setDisplayResult(translated);
      setDisplayLang(targetLang);
      onTranslated?.(translated, targetLang);
    } catch {
      toast({
        title: displayLang === "zh" ? "錯誤" : "Error",
        description: displayLang === "zh" ? "網絡錯誤" : "Network error",
        variant: "destructive",
      });
    }
    setTranslating(false);
  };

  const r = displayResult;
  const dl = displayLang;

  return (
    <div className="space-y-4 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <Video size={18} className="text-primary" />
          {dl === "zh" ? "分析結果" : "Analysis Result"}
        </h2>
        {translating && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            {dl === "zh" ? "翻譯中..." : "Translating..."}
          </div>
        )}
      </div>

      {/* Score card */}
      <PostureScoreCard
        overallScore={r.overall_score}
        sections={r.sections}
        averages={averages ? {
          avg_overall: averages.avg_overall,
          avg_head: averages.avg_head,
          avg_shoulder: averages.avg_shoulder,
          avg_upper_limb: averages.avg_upper_limb,
          avg_torso: averages.avg_torso,
          avg_lower_limb: averages.avg_lower_limb,
        } : null}
        lang={dl}
      />

      {/* Radar chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-sm font-medium text-foreground mb-2">
          {dl === "zh" ? "各部位雷達圖" : "Section Radar"}
        </p>
        <PostureRadarChart
          scores={r}
          averages={averages ? {
            avg_head: averages.avg_head,
            avg_shoulder: averages.avg_shoulder,
            avg_upper_limb: averages.avg_upper_limb,
            avg_torso: averages.avg_torso,
            avg_lower_limb: averages.avg_lower_limb,
          } : null}
          lang={dl}
        />
      </div>

      {/* Strengths */}
      {r.strengths.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
            <CheckCircle size={15} className="text-green-500" />
            {dl === "zh" ? "優點" : "Strengths"}
          </p>
          <ul className="space-y-1.5">
            {r.strengths.map((s, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvements */}
      {r.improvements.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle size={15} className="text-yellow-500" />
            {dl === "zh" ? "改善建議" : "Areas for Improvement"}
          </p>
          <ul className="space-y-1.5">
            {r.improvements.map((s, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-yellow-500 mt-0.5">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary */}
      {r.summary && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-medium text-foreground mb-1">
            {dl === "zh" ? "總結" : "Summary"}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">{r.summary}</p>
        </div>
      )}
    </div>
  );
};

export default PostureResults;
