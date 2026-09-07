import { useCallback, useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { notifyPlanChanged } from "@/lib/planEvents";
import { Loader2, Wand2, Undo2, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface Props {
  lang: Lang;
  planId: string;
  autoAdjustEnabled: boolean;
}

// Mobile WebViews (iOS "Load failed" / Chrome "Failed to fetch") occasionally drop a
// request at the network layer. These are safe to retry once — PostgREST PATCHes are idempotent.
const isNetworkError = (msg: string) =>
  /load failed|failed to fetch|network ?error|networkrequest failed|fetch failed/i.test(msg);

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 700): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (retries > 0 && isNetworkError(e?.message ?? "")) {
      await new Promise((r) => setTimeout(r, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
    throw e;
  }
}

// Adjustments never revise the runner's goal time, so drop any finishing-time talk that
// older summaries (generated before that rule) still carry.
const stripTimeTalk = (text: string | null | undefined): string => {
  if (!text) return "";
  const bad = /(target|goal|finish(ing)?|predicted|realistic)\s*(race\s*)?time|\b\d{1,2}:\d{2}(:\d{2})?\b|目標時間|完賽時間|預計時間|預測時間|成績目標/i;
  return text
    .split(/(?<=[.!?。！？])\s*/)
    .filter((s) => s.trim() && !bad.test(s))
    .join(" ")
    .trim();
};

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
  const [clearingHistory, setClearingHistory] = useState(false);

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

  const clearHistory = async () => {
    setClearingHistory(true);
    const { error } = await supabase
      .from("plan_auto_adjustments")
      .delete()
      .eq("plan_id", planId);
    setClearingHistory(false);
    if (error) {
      toast({
        title: zh ? "無法清除記錄" : "Could not clear history",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setHistory([]);
    setShowHistory(false);
    toast({ title: zh ? "已清除調整記錄" : "Adjustment history cleared" });
  };

  const toggle = async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    // supabase-js returns fetch failures as a resolved { error } instead of throwing,
    // so throw network errors ourselves to make them retryable.
    const doUpdate = async () => {
      const { error } = await supabase
        .from("training_plans")
        .update({ auto_adjust_enabled: next })
        .eq("id", planId);
      if (error && isNetworkError(error.message)) throw error;
      return error;
    };
    let error: any = null;
    try {
      error = await withRetry(doUpdate);
    } catch (e: any) {
      error = e;
    }
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
      const { data, error } = await withRetry(() =>
        supabase.functions.invoke("plan-auto-adjust", {
          body: { action, plan_id: planId },
        })
      );
      if (error) throw error;
      const status = (data as any)?.status;
      const summary = stripTimeTalk(zh ? (data as any)?.summary_zh : (data as any)?.summary_en);
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
            <div className="mt-2">
              <ul className="space-y-2">
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
                    {stripTimeTalk(zh ? h.summary_zh : h.summary_en) || h.trigger_reason}
                  </p>
                  {h.status === "reverted" && (
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {zh ? "已還原" : "Reverted"}
                    </p>
                  )}
                  </li>
                ))}
              </ul>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-8 w-full justify-start text-xs text-destructive hover:text-destructive"
                    disabled={clearingHistory || running !== null}
                  >
                    {clearingHistory ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Trash2 size={14} className="mr-2" />}
                    {zh ? "清除調整記錄" : "Clear adjustment history"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{zh ? "清除所有調整記錄？" : "Clear all adjustment history?"}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {zh
                        ? "這只會清除記錄，不會改變目前的訓練計劃。清除後將無法還原上一次調整。"
                        : "This only clears the history; your current training plan will not change. You will no longer be able to undo the last adjustment."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{zh ? "取消" : "Cancel"}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void clearHistory()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {zh ? "清除" : "Clear"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutoAdjustCard;
