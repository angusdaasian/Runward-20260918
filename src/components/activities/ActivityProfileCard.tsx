import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Lang } from "@/lib/i18n";

interface Props {
  displayName: string | null;
  age: number | null;
  sex: string | null;
  avatarUrl: string | null;
  trainingScore: number;
  lang: Lang;
}

const SCORE_LEVELS = [
  { min: 65, en: "Elite", zh: "精英", color: "text-yellow-900", bgColor: "bg-gradient-to-r from-yellow-400 to-amber-500", range: "65+" },
  { min: 55, en: "Expert", zh: "專家", color: "text-purple-900", bgColor: "bg-gradient-to-r from-purple-400 to-violet-500", range: "55–64" },
  { min: 45, en: "Advanced", zh: "優秀", color: "text-blue-900", bgColor: "bg-gradient-to-r from-blue-400 to-cyan-500", range: "45–54" },
  { min: 35, en: "Intermediate", zh: "中級", color: "text-green-900", bgColor: "bg-gradient-to-r from-green-400 to-emerald-500", range: "35–44" },
  { min: 25, en: "Beginner", zh: "初學者", color: "text-teal-900", bgColor: "bg-gradient-to-r from-teal-300 to-teal-400", range: "25–34" },
  { min: 0, en: "Starter", zh: "入門", color: "text-slate-700", bgColor: "bg-gradient-to-r from-slate-300 to-slate-400", range: "< 25" },
];

function getScoreLevel(score: number, lang: Lang): { label: string; color: string; bgColor: string } {
  for (const level of SCORE_LEVELS) {
    if (score >= level.min) return { label: lang === "zh" ? level.zh : level.en, color: level.color, bgColor: level.bgColor };
  }
  return { label: lang === "zh" ? "入門" : "Starter", color: "text-slate-700", bgColor: "bg-gradient-to-r from-slate-300 to-slate-400" };
}

const ActivityProfileCard = ({ displayName, age, sex, avatarUrl, trainingScore, lang }: Props) => {
  const initials = (displayName || "U")[0].toUpperCase();
  const level = trainingScore > 0 ? getScoreLevel(trainingScore, lang) : null;
  const [showLevels, setShowLevels] = useState(false);

  const sexLabel = sex
    ? lang === "zh"
      ? sex === "Male" ? "男" : sex === "Female" ? "女" : sex
      : sex
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-14 w-14">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback className="text-lg font-display bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-foreground text-lg truncate">
            {displayName || (lang === "zh" ? "跑者" : "Runner")}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {age && <span>{age} {lang === "zh" ? "歲" : "yrs"}</span>}
            {age && sexLabel && <span>·</span>}
            {sexLabel && <span>{sexLabel}</span>}
          </div>
          {trainingScore > 0 && level && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${level.bgColor} ${level.color} shadow-sm`}>
                <span>{lang === "zh" ? "訓練分數" : "Training Score"}</span>
                <span className="text-sm">{trainingScore}</span>
                <span className="opacity-75">·</span>
                <span className="font-medium">{level.label}</span>
              </span>
              <button onClick={() => setShowLevels(!showLevels)} className="text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Score Levels Info */}
      {showLevels && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">{lang === "zh" ? "訓練分數等級" : "Training Score Levels"}</span>
            <button onClick={() => setShowLevels(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
          <div className="space-y-1.5">
            {SCORE_LEVELS.map((lvl) => (
              <div key={lvl.min} className="flex items-center gap-2">
                <span className={`inline-block w-16 text-center px-2 py-0.5 rounded-full text-[10px] font-bold ${lvl.bgColor} ${lvl.color}`}>
                  {lvl.range}
                </span>
                <span className="text-xs text-foreground">{lang === "zh" ? lvl.zh : lvl.en}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityProfileCard;
