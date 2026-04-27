import { Sparkles } from "lucide-react";
import { useActivities } from "@/hooks/use-activities";
import type { CoachPreferences } from "@/hooks/use-ai-coach";

interface Props {
  prefs: CoachPreferences | null;
  insights: Array<{ insight_key: string; insight_value: string }>;
  lang: "en" | "zh";
}

const ContextBar = ({ prefs, insights, lang }: Props) => {
  const { userRaces } = useActivities();
  const parts: string[] = [];
  if (prefs?.experience_level) parts.push(prefs.experience_level);
  if (prefs?.training_goal) {
    parts.push(
      lang === "zh" ? `目標 ${prefs.training_goal}` : `Training for ${prefs.training_goal}`,
    );
  }
  if (prefs?.training_days?.length) {
    parts.push(
      lang === "zh"
        ? `每週 ${prefs.training_days.length} 天`
        : `${prefs.training_days.length} days/week`,
    );
  }
  if (prefs?.preferred_units) {
    parts.push(prefs.preferred_units === "miles" ? "miles" : "km");
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingCount = (userRaces || []).filter((r) => r.race_date >= todayIso).length;
  if (upcomingCount > 0) {
    parts.push(
      lang === "zh"
        ? `${upcomingCount} 場即將賽事`
        : `${upcomingCount} upcoming race${upcomingCount > 1 ? "s" : ""}`,
    );
  }
  insights.slice(0, 2).forEach((i) => {
    if (i.insight_value) parts.push(i.insight_value);
  });

  if (!parts.length) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/40 text-xs text-muted-foreground">
      <Sparkles size={12} className="shrink-0 text-primary" />
      <span className="truncate">
        <span className="font-medium text-foreground">
          {lang === "zh" ? "教練了解：" : "Coach knows: "}
        </span>
        {parts.join(" • ")}
      </span>
    </div>
  );
};

export default ContextBar;
