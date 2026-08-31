import { useCallback, useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { notifyPlanChanged } from "@/lib/planEvents";
import { Loader2, Wand2, History, Undo2, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  lang: Lang;
  planId: string;
  autoAdjustEnabled: boolean;
}

interface AdjustmentRow {
  id: string;
  kind: string;
  status: string;
  triggered_at: string;
  trigger_reason: string | null;
  summary_en: string | null;
  summary_zh: string | null;
  revised_target_time: string | null;
}

const AutoAdjustCard = ({ lang, planId, autoAdjustEnabled }: Props) => {
  const zh = lang === "zh";
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(autoAdjustEnabled);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<"recalibrate" | "detect" | "revert" | null>(null);
  const [history, setHistory] = useState<AdjustmentRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => setEnabled(autoAdjustEnabled), [autoAdjustEnabled]);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("plan_auto_adjustments")
      .select("id,kind,status,triggered_at,trigger_reason,summary_en,summary_zh,revised_target_time")
      .eq("plan_id", planId)
      .order("triggered_at", { ascending: false })
      .limit(10);
    setHistory((data as AdjustmentRow[]) ?? []);
  }, [planId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const toggle = async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    const { error } = await supabase
      .from("training_plans")
      .update({ auto_adjust_enabled: next })
      .eq("id", planId);
    setSaving(false);
    if (error) {
      setEnabled(!next);
      toast({ title: zh ? "無法更新設定" : "Could not save setting", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next
        ? (zh ? "已開啟自動調整" : "Auto-adjust on")
        : (zh ? "已關閉自動調整" : "Auto-adjust off"),
      description: next
        ? (zh ? "計劃會根據你實際完成的訓練自動調整。" : "Your plan will adapt to what you actually run.")
        : (zh ? "計劃只會在你手動要求時才改動。" : "Your plan will only change when you ask."),
    });
  };

  const invoke = async (action: "detect" | "recalibrate" | "revert") => {
    setRunning(action);
    try {
      const { data, error } = await supabase.functions.invoke("plan-auto-adjust", {
        body: { action, plan_id: planId },
      });
      if (error) throw error;
      const status = (data as any)?.status;
      const summary = zh ? (data as any)?.summary_zh : (data as any)?.summary_en;
      if (status === "applied") {
        toast({
          title: zh ? "計劃已更新" : "Plan updated",
          description: summary || (data as any)?.reason || (zh ? "已重新編排餘下的訓練。" : "Remaining weeks have been rebuilt."),
        });
        notifyPlanChanged();
      } else if (status === "reverted") {
        toast({ title: zh ? "已還原上一個版本" : "Reverted to previous plan" });
        notifyPlanChanged();
      } else if (status === "no_change") {
        toast({
          title: zh ? "不需要調整" : "No adjustment needed",
          description: (data as any)?.reason,
        });
      } else {
        toast({
          title: zh ? "未能調整" : "Nothing changed",
          description: (data as any)?.reason || (data as any)?.error,
          variant: status === "failed" ? "destructive" : undefined,
        });
      }
      void loadHistory();
    } catch (e: any) {
      toast({
        title: zh ? "調整失敗" : "Adjustment failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()} ${d.toLocaleString(zh ? "zh-HK" : "en", { month: "short" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const hasApplied = history.some((h) => h.status === "applied");

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
            <Wand2 size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground leading-tight">
              {zh ? "自動調整計劃" : "Auto-adjust plan"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              {zh
                ? "如果你縮短、改變或跳過了訓練，系統會重新編排餘下的週數，而比賽日期保持不變。"
                : "If you cut short, swap or skip sessions, the remaining weeks get rebuilt around what you actually ran. Your race date stays fixed."}
            </p>
          </div>
        </div>
        <Switch checked={enabled} disabled={saving} onCheckedChange={toggle} aria-label={zh ? "自動調整" : "Auto-adjust"} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 text-xs justify-start"
          disabled={running !== null}
          onClick={() => invoke("recalibrate")}
        >
          {running === "recalibrate"
            ? <Loader2 size={14} className="mr-2 animate-spin" />
            : <History size={14} className="mr-2" />}
          {zh ? "重新校準整個計劃（分析過去所有訓練）" : "Recalibrate whole program from past training"}
        </Button>

        {enabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-xs justify-start"
            disabled={running !== null}
            onClick={() => invoke("detect")}
          >
            {running === "detect"
              ? <Loader2 size={14} className="mr-2 animate-spin" />
              : <Wand2 size={14} className="mr-2" />}
            {zh ? "立即檢查本週偏差" : "Check this week now"}
          </Button>
        )}

        {hasApplied && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-xs justify-start text-muted-foreground"
            disabled={running !== null}
            onClick={() => invoke("revert")}
          >
            {running === "revert"
              ? <Loader2 size={14} className="mr-2 animate-spin" />
              : <Undo2 size={14} className="mr-2" />}
            {zh ? "還原上一次調整" : "Undo last adjustment"}
          </Button>
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground"
          >
            <span>{zh ? `調整記錄（${history.length}）` : `Adjustment history (${history.length})`}</span>
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-2">
              {history.map((h) => (
                <li key={h.id} className="rounded-lg bg-muted/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-foreground">
                      {h.kind === "recalibrate"
                        ? (zh ? "整體重新校準" : "Full recalibration")
                        : (zh ? "自動調整" : "Auto-adjust")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{fmtWhen(h.triggered_at)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                    {(zh ? h.summary_zh : h.summary_en) || h.trigger_reason}
                  </p>
                  {h.revised_target_time && (
                    <p className="mt-1 text-[11px] text-primary font-medium">
                      {zh ? `建議目標時間：${h.revised_target_time}` : `Suggested goal time: ${h.revised_target_time}`}
                    </p>
                  )}
                  {h.status === "reverted" && (
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {zh ? "已還原" : "Reverted"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default AutoAdjustCard;
