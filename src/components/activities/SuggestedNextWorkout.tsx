import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Footprints } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  latestActivityId: string | null;
}

const SuggestedNextWorkout = ({ lang, latestActivityId }: Props) => {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const [nextWorkout, setNextWorkout] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isPremium || !latestActivityId) {
      setNextWorkout(null);
      return;
    }
    let active = true;
    (async () => {
      const field = lang === "zh" ? "next_workout_zh" : "next_workout_en";
      const fallback = lang === "zh" ? "next_workout_en" : "next_workout_zh";
      const { data } = await supabase
        .from("activity_analyses")
        .select(`${field}, ${fallback}`)
        .eq("user_id", user.id)
        .eq("activity_id", latestActivityId)
        .maybeSingle();
      if (!active) return;
      const row = data as any;
      setNextWorkout(row?.[field] || row?.[fallback] || null);
    })();
    return () => {
      active = false;
    };
  }, [user, isPremium, latestActivityId, lang]);

  if (!isPremium || !nextWorkout) return null;

  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Footprints size={16} className="text-primary" />
        <h3 className="font-display font-bold text-foreground text-sm">
          {lang === "zh" ? "建議的下一次訓練" : "Suggested Next Workout"}
        </h3>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground text-sm [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-primary">
        <ReactMarkdown>{nextWorkout}</ReactMarkdown>
      </div>
    </div>
  );
};

export default SuggestedNextWorkout;
