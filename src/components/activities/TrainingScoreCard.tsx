import { TrendingUp } from "lucide-react";
import { Lang } from "@/lib/i18n";

interface Props {
  score: number;
  lang: Lang;
}

function getScoreLevel(score: number, lang: Lang): { label: string; color: string } {
  if (score >= 65) return { label: lang === "zh" ? "精英" : "Elite", color: "text-yellow-500" };
  if (score >= 55) return { label: lang === "zh" ? "專家" : "Expert", color: "text-purple-500" };
  if (score >= 45) return { label: lang === "zh" ? "優秀" : "Advanced", color: "text-blue-500" };
  if (score >= 35) return { label: lang === "zh" ? "中級" : "Intermediate", color: "text-green-500" };
  if (score >= 25) return { label: lang === "zh" ? "初學者" : "Beginner", color: "text-teal-500" };
  return { label: lang === "zh" ? "入門" : "Starter", color: "text-muted-foreground" };
}

const TrainingScoreCard = ({ score, lang }: Props) => {
  const level = getScoreLevel(score, lang);

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <TrendingUp size={20} className="text-primary" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">
              {lang === "zh" ? "訓練分數" : "Training Score"}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">{score}</span>
              <span className={`text-xs font-medium ${level.color}`}>{level.label}</span>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        {lang === "zh"
          ? "根據最近 20 次活動計算，反映你的訓練量和一致性"
          : "Based on your last 20 activities, reflecting training load and consistency"}
      </p>
    </div>
  );
};

export default TrainingScoreCard;
