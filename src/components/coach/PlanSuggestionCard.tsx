import { CalendarCheck, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlanSuggestion } from "@/hooks/use-ai-coach";

interface Props {
  suggestion: PlanSuggestion;
  status?: "pending" | "applied" | "dismissed";
  onApply: () => void;
  onDismiss: () => void;
  lang: "en" | "zh";
}

const PlanSuggestionCard = ({ suggestion, status, onApply, onDismiss, lang }: Props) => {
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const summary =
    (lang === "zh" ? suggestion.summary_zh : suggestion.summary_en) ||
    suggestion.summary_en ||
    suggestion.summary_zh;

  return (
    <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <CalendarCheck size={14} className="text-primary" />
        <span className="font-semibold text-xs">
          {t("Update your training plan?", "要更新訓練計劃嗎？")}
        </span>
      </div>
      {summary && (
        <p className="text-xs text-muted-foreground mb-2">{summary}</p>
      )}
      <ul className="text-xs space-y-0.5 mb-3">
        {suggestion.changes.map((c) => {
          const isRest = (c.type || "").toLowerCase() === "rest" || c.distance_km === 0;
          const label = isRest
            ? t("Rest", "休息")
            : `${c.type || ""}${c.distance_km ? ` · ${c.distance_km} km` : ""}${c.pace ? ` @ ${c.pace}` : ""}`.trim();
          return (
            <li key={c.date} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{c.date}</span>
              <span className="font-medium text-right truncate">{label}</span>
            </li>
          );
        })}
      </ul>
      {status === "applied" ? (
        <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
          <Check size={12} /> {t("Plan updated", "計劃已更新")}
        </div>
      ) : status === "dismissed" ? (
        <div className="text-xs text-muted-foreground">
          {t("Suggestion dismissed", "已忽略建議")}
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs flex-1" onClick={onApply}>
            <Check size={12} className="mr-1" />
            {t("Update plan", "更新計劃")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={onDismiss}
          >
            <X size={12} className="mr-1" />
            {t("Dismiss", "忽略")}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PlanSuggestionCard;
