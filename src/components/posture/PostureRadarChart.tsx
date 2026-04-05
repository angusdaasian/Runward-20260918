import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from "recharts";
import { Lang } from "@/lib/i18n";

interface SectionScore {
  score: number;
  feedback: string;
}

interface PostureScores {
  overall_score: number;
  sections: {
    head: SectionScore;
    shoulder: SectionScore;
    upper_limb: SectionScore;
    torso: SectionScore;
    lower_limb: SectionScore;
  };
}

interface Averages {
  avg_head: number;
  avg_shoulder: number;
  avg_upper_limb: number;
  avg_torso: number;
  avg_lower_limb: number;
}

interface Props {
  scores: PostureScores;
  averages: Averages | null;
  lang: Lang;
}

const PostureRadarChart = ({ scores, averages, lang }: Props) => {
  const labels = lang === "zh"
    ? { head: "頭部", shoulder: "肩膀", upper_limb: "上肢", torso: "軀幹", lower_limb: "下肢" }
    : { head: "Head", shoulder: "Shoulder", upper_limb: "Upper Limb", torso: "Torso", lower_limb: "Lower Limb" };

  const data = [
    { subject: labels.head, score: scores.sections.head.score, avg: averages?.avg_head ?? 0 },
    { subject: labels.shoulder, score: scores.sections.shoulder.score, avg: averages?.avg_shoulder ?? 0 },
    { subject: labels.upper_limb, score: scores.sections.upper_limb.score, avg: averages?.avg_upper_limb ?? 0 },
    { subject: labels.torso, score: scores.sections.torso.score, avg: averages?.avg_torso ?? 0 },
    { subject: labels.lower_limb, score: scores.sections.lower_limb.score, avg: averages?.avg_lower_limb ?? 0 },
  ];

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 500 }} 
          />
          <PolarRadiusAxis 
            angle={90} 
            domain={[0, 100]} 
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} 
          />
          <Radar
            name={lang === "zh" ? "你的分數" : "Your Score"}
            dataKey="score"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.25}
            strokeWidth={2}
          />
          {averages && (
            <Radar
              name={lang === "zh" ? "平均分數" : "App Average"}
              dataKey="avg"
              stroke="hsl(var(--warning))"
              fill="hsl(var(--warning))"
              fillOpacity={0.1}
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          )}
          <Legend 
            wrapperStyle={{ fontSize: 11 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PostureRadarChart;
