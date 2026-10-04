import { useEffect, useState } from "react";
import { CheckCircle2, Crown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { Button } from "@/components/ui/button";
import { Lang } from "@/lib/i18n";

/** One-off in-app notice after the server imported a user's past 30 days. */
export default function StrideeBackfillNotice({ lang, onUpgrade }: { lang: Lang; onUpgrade?: () => void }) {
  const zh = lang === "zh";
  const { user } = useAuth();
  const premium = usePremium() as any;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase as any).from("stridee_connections").select("backfill_notice_pending")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data }: any) => setShow(!!data?.backfill_notice_pending));
  }, [user]);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    (supabase as any).rpc("dismiss_stridee_backfill_notice");
  };
  const isPremium = !!(premium?.isPremium ?? premium?.premium);

  return (
    <div className="relative mb-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <button onClick={dismiss} aria-label={zh ? "關閉" : "Close"} className="absolute right-2 top-2 p-2 text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
      <div className="flex gap-3 pr-6">
        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-display font-semibold text-sm">
            {zh ? "過去 30 天的活動已同步完成 🎉" : "Your past 30 days of activities are synced 🎉"}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {zh
              ? "你最近一個月的跑步紀錄已匯入，之後的新活動也會自動同步。升級 Premium 即可同步全部過往活動，完整掌握你的訓練歷程。"
              : "Your last month of runs is in, and new activities will sync automatically. Go Premium to sync all your past activities and see your full training history."}
          </p>
          {!isPremium && (
            <Button size="sm" className="mt-2 gap-1.5" onClick={() => { dismiss(); onUpgrade?.(); }}>
              <Crown className="h-3.5 w-3.5" />
              {zh ? "訂閱 Premium" : "Subscribe to Premium"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
