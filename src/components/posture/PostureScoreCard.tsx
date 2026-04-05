import { Lang } from "@/lib/i18n";

interface SectionScore {
  score: number;
  feedback: string;
}

interface Props {
  overallScore: number;
  sections: {
    head: SectionScore;
    shoulder: SectionScore;
    upper_limb: SectionScore;
    torso: SectionScore;
    lower_limb: SectionScore;
  };
  averages: {
    avg_overall: number;
    avg_head: number;
    avg_shoulder: number;
    avg_upper_limb: number;
    avg_torso: number;
    avg_lower_limb: number;
  } | null;
  lang: Lang;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-500";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-green-50 border-green-200";
  if (score >= 60) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

const PostureScoreCard = ({ overallScore, sections, averages, lang }: Props) => {
  const labels = lang === "zh"
    ? { head: "頭部", shoulder: "肩膀", upper_limb: "上肢", torso: "軀幹", lower_limb: "下肢", overall: "整體評分", you: "你", avg: "平均", section: "部位", score: "分數", feedback: "反饋" }
    : { head: "Head", shoulder: "Shoulder", upper_limb: "Upper Limb", torso: "Torso", lower_limb: "Lower Limb", overall: "Overall Score", you: "You", avg: "Avg", section: "Section", score: "Score", feedback: "Feedback" };

  const sectionEntries = [
    { key: "head" as const, label: labels.head, avgKey: "avg_head" as const },
    { key: "shoulder" as const, label: labels.shoulder, avgKey: "avg_shoulder" as const },
    { key: "upper_limb" as const, label: labels.upper_limb, avgKey: "avg_upper_limb" as const },
    { key: "torso" as const, label: labels.torso, avgKey: "avg_torso" as const },
    { key: "lower_limb" as const, label: labels.lower_limb, avgKey: "avg_lower_limb" as const },
  ];

  return (
    <div className="space-y-4">
      {/* Overall score hero */}
      <div className={`flex items-center justify-center flex-col rounded-2xl border-2 p-6 ${scoreBg(overallScore)}`}>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{labels.overall}</p>
        <p className={`text-5xl font-display font-bold ${scoreColor(overallScore)}`}>{overallScore}</p>
        <p className="text-xs text-muted-foreground mt-1">/100</p>
      </div>

      {/* Section scores table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
          <span>{labels.section}</span>
          <span className="text-center w-12">{labels.you}</span>
          {averages && <span className="text-center w-12">{labels.avg}</span>}
        </div>
        {sectionEntries.map(({ key, label, avgKey }) => (
          <div key={key} className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-3 border-t border-border items-start">
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sections[key].feedback}</p>
            </div>
            <span className={`text-sm font-bold text-center w-12 ${scoreColor(sections[key].score)}`}>
              {sections[key].score}
            </span>
            {averages && (
              <span className="text-sm text-muted-foreground text-center w-12">
                {averages[avgKey]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PostureScoreCard;
