import { Lang } from "@/lib/i18n";
import { SurfaceCard } from "@/components/ui/SurfaceCard";

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

/* Token-backed. Previously bg-green-50 / bg-yellow-50 / bg-red-50 with
   text-green-600 / text-yellow-600 / text-red-500 and no dark variants, so
   the hero rendered as a pale light-mode block on a 7%-lightness page. */
function scoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

function scoreSurface(score: number): string {
  if (score >= 80) return "border-success/30 bg-success/10";
  if (score >= 60) return "border-warning/30 bg-warning/10";
  return "border-destructive/30 bg-destructive/10";
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
      <div className={`flex flex-col items-center justify-center rounded-2xl border p-6 ${scoreSurface(overallScore)}`}>
        <p className="mb-1 text-caption font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {labels.overall}
        </p>
        <p className={`tnum font-display text-num-hero font-bold ${scoreColor(overallScore)}`}>
          {overallScore}
        </p>
        <p className="mt-1 text-caption text-muted-foreground">/100</p>
      </div>

      {/* Section scores table */}
      <SurfaceCard bare className="overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 bg-surface-2 px-4 py-2 text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <span>{labels.section}</span>
          <span className="w-12 text-center">{labels.you}</span>
          {averages && <span className="w-12 text-center">{labels.avg}</span>}
        </div>
        {sectionEntries.map(({ key, label, avgKey }) => (
          <div key={key} className="grid grid-cols-[1fr_auto_auto] items-start gap-x-3 border-t border-border px-4 py-3">
            <div>
              <p className="text-label font-semibold text-foreground">{label}</p>
              <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
                {sections[key].feedback}
              </p>
            </div>
            <span className={`tnum w-12 text-center text-label font-bold ${scoreColor(sections[key].score)}`}>
              {sections[key].score}
            </span>
            {averages && (
              <span className="tnum w-12 text-center text-label text-muted-foreground">
                {averages[avgKey]}
              </span>
            )}
          </div>
        ))}
      </SurfaceCard>
    </div>
  );
};

export default PostureScoreCard;
