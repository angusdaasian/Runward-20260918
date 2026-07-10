import { ArrowLeft, Crown, Sparkles, MessageCircle, Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import TelegramConnectCard from "@/components/TelegramConnectCard";
import WhatsAppConnectCard from "@/components/WhatsAppConnectCard";
import { usePremium } from "@/contexts/PremiumContext";
import PlanComparisonDialog from "@/components/PlanComparisonDialog";
import { Button } from "@/components/ui/button";
import teaserImg from "@/assets/messaging-premium-teaser.jpg";

interface Props {
  lang: Lang;
  onBack: () => void;
}

const MessagingSettingsPage = ({ lang, onBack }: Props) => {
  const isZh = lang === "zh";
  const { isPremium } = usePremium();
  const [showPlan, setShowPlan] = useState(false);

  useEffect(() => {
    const checkAndReload = () => {
      const ts = sessionStorage.getItem("rw_messaging_connect");
      if (ts) {
        const elapsed = Date.now() - parseInt(ts, 10);
        if (elapsed < 5 * 60 * 1000) {
          sessionStorage.removeItem("rw_messaging_connect");
          window.location.reload();
        } else {
          sessionStorage.removeItem("rw_messaging_connect");
        }
      }
    };
    window.addEventListener("focus", checkAndReload);
    window.addEventListener("pageshow", checkAndReload);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkAndReload();
    });
    checkAndReload();
    return () => {
      window.removeEventListener("focus", checkAndReload);
      window.removeEventListener("pageshow", checkAndReload);
    };
  }, []);

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="p-1 -ml-1 rounded-md hover:bg-accent"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-semibold text-foreground">
            {isZh ? "通訊應用程式 (試行)" : "Messaging Apps (BETA)"}
          </h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <div className="rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 p-3">
          <p className="text-xs text-amber-900 dark:text-amber-200 font-medium">
            {isZh
              ? "🎉 7 天 Beta 免費體驗：所有用戶可於 2026 年 7 月 17 日前免費連結 WhatsApp / Telegram。之後只限 Premium 用戶。"
              : "🎉 7-day Beta: everyone can connect WhatsApp / Telegram free until Jul 17, 2026. After that it will be Premium-only."}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {isZh
            ? "把 RunWard 連到 Telegram 或 WhatsApp，每天早上收到 AI 跑步建議，跑步後分享感受獲得 AI 教練回饋，或直接在聊天內與 AI 教練對話。"
            : "Connect RunWard to Telegram or WhatsApp for daily AI workout suggestions, post-run feedback chats, and direct AI coach conversations."}
        </p>

        <TelegramConnectCard lang={lang} />
        <WhatsAppConnectCard lang={lang} />

        {!isPremium && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-semibold">
                <Crown size={12} />
                {isZh ? "Beta 後需 Premium" : "Premium after beta"}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {isZh
                ? "Beta 結束後將自動中斷免費用戶的連結。升級 Premium 即可永久使用。"
                : "Free users will be auto-disconnected after the beta ends. Upgrade to Premium to keep it forever."}
            </p>
            <Button
              onClick={() => setShowPlan(true)}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
            >
              <Crown size={16} className="mr-1.5" />
              {isZh ? "升級至 Premium" : "Upgrade to Premium"}
            </Button>
          </div>
        )}
      </div>

      <PlanComparisonDialog open={showPlan} onOpenChange={setShowPlan} lang={lang} />
    </div>
  );
};

export default MessagingSettingsPage;
