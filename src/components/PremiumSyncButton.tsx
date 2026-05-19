import { useState } from "react";
import { Download, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePremium } from "@/contexts/PremiumContext";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
}

export default function PremiumSyncButton({ lang }: Props) {
  const { isPremium, isTrial } = usePremium();
  const [loading, setLoading] = useState(false);
  const locked = !isPremium || isTrial;

  const handleClick = async () => {
    if (locked) {
      toast.error(
        isTrial
          ? lang === "zh"
            ? "歷史同步僅限付費會員，試用期不支援。"
            : "Historical sync is for paid members only — not available during trial."
          : lang === "zh"
          ? "需要 Premium 訂閱"
          : "Premium subscription required",
      );
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("premium-terra-sync");
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      const results = (data as any)?.results ?? [];
      const total = results.reduce((s: number, r: any) => s + (r.upserted ?? 0), 0);
      toast.success(
        lang === "zh"
          ? `已同步 ${total} 個活動（自 2026-01-01）`
          : `Synced ${total} activities since 2026-01-01`,
      );
    } catch (e: any) {
      console.error("[premium-terra-sync]", e);
      toast.error(
        lang === "zh"
          ? `同步失敗：${e?.message ?? "未知錯誤"}`
          : `Sync failed: ${e?.message ?? "unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`w-full mb-5 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
        locked
          ? "border-border bg-muted/40 text-muted-foreground hover:bg-muted/60"
          : "border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 text-primary hover:from-primary/25 hover:to-primary/10"
      } disabled:opacity-60`}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : locked ? (
        <Lock size={16} />
      ) : (
        <Download size={16} />
      )}
      <span>
        {locked
          ? lang === "zh"
            ? "Premium 歷史同步（已鎖定）"
            : "Premium Historical Sync (Locked)"
          : lang === "zh"
          ? "同步 2026 以來的所有活動"
          : "Sync all activities since 2026"}
      </span>
    </button>
  );
}
