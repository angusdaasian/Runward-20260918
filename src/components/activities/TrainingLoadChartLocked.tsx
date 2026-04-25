import { Lock, Sparkles } from "lucide-react";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  onUpgrade?: () => void;
}

const TrainingLoadChartLocked = ({ lang, onUpgrade }: Props) => {
  return (
    <div className="relative bg-card border border-border rounded-xl p-4 mb-5 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
          {lang === "zh" ? "訓練負荷" : "Training Load"}
        </h3>
        <Lock size={14} className="text-muted-foreground" />
      </div>

      {/* Decorative blurred chart silhouette */}
      <div className="h-48 relative pointer-events-none select-none">
        <svg viewBox="0 0 300 120" className="w-full h-full opacity-40 blur-sm">
          <path
            d="M0,80 C30,75 60,60 90,55 C120,50 150,40 180,35 C210,30 240,28 300,25"
            stroke="hsl(199 89% 60%)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M0,90 C30,70 60,75 90,55 C120,40 150,55 180,40 C210,30 240,45 300,30"
            stroke="hsl(25 95% 60%)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M0,100 C30,95 60,98 90,95 C120,92 150,90 180,93 C210,95 240,90 300,95"
            stroke="hsl(0 72% 60%)"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>

        {/* Overlay CTA */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Sparkles size={18} className="text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {lang === "zh" ? "解鎖訓練負荷曲線" : "Unlock Training Load Curve"}
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {lang === "zh"
              ? "查看每週體能、疲勞與狀態趨勢,優化訓練週期"
              : "Track weekly Fitness, Fatigue & Form to optimise your training cycle"}
          </p>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="mt-3 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              {lang === "zh" ? "升級至 Premium" : "Upgrade to Premium"}
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
        {lang === "zh"
          ? "Premium 功能 · 基於每週 TRIMP (時間 × 心率強度)"
          : "Premium feature · Based on weekly TRIMP (duration × HR intensity)"}
      </p>
    </div>
  );
};

export default TrainingLoadChartLocked;
