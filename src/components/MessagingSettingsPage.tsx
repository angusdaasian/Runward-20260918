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
        <p className="text-sm text-muted-foreground">
          {isZh
            ? "把 RunWard 連到 Telegram 或 WhatsApp，每天早上收到 AI 跑步建議，跑步後分享感受獲得 AI 教練回饋，或直接在聊天內與 AI 教練對話。"
            : "Connect RunWard to Telegram or WhatsApp for daily AI workout suggestions, post-run feedback chats, and direct AI coach conversations."}
        </p>

        {isPremium ? (
          <>
            <TelegramConnectCard lang={lang} />
            <WhatsAppConnectCard lang={lang} />
          </>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-rose-950/30 p-5 shadow-sm">
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-amber-300/30 blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-semibold">
                    <Crown size={12} />
                    {isZh ? "Premium 專屬" : "Premium only"}
                  </div>
                </div>
                <h2 className="text-lg font-bold text-foreground mb-1">
                  {isZh
                    ? "在 WhatsApp 與 Telegram 跟 AI 教練聊天"
                    : "Chat with your AI coach on WhatsApp & Telegram"}
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {isZh
                    ? "每天早上收到個人化訓練建議，跑步後即時 AI 分析，無需打開 App。"
                    : "Daily personalised workout suggestions, instant post-run AI analysis — without opening the app."}
                </p>
                <ul className="space-y-2 mb-4 text-sm">
                  <li className="flex items-start gap-2">
                    <Sparkles size={16} className="mt-0.5 text-amber-500 flex-shrink-0" />
                    <span>{isZh ? "每日 AI 訓練建議推送" : "Daily AI workout push notifications"}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <MessageCircle size={16} className="mt-0.5 text-emerald-500 flex-shrink-0" />
                    <span>{isZh ? "跑步後 RPE 對話與分析" : "Post-run RPE chat & analysis"}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Bot size={16} className="mt-0.5 text-sky-500 flex-shrink-0" />
                    <span>{isZh ? "隨時與 AI 教練對話" : "Talk to your AI coach anytime"}</span>
                  </li>
                </ul>
                <Button
                  onClick={() => setShowPlan(true)}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
                >
                  <Crown size={16} className="mr-1.5" />
                  {isZh ? "升級至 Premium" : "Upgrade to Premium"}
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <img
                src={teaserImg}
                alt={isZh ? "WhatsApp 與 Telegram AI 教練預覽" : "Preview of AI coach on WhatsApp and Telegram"}
                loading="lazy"
                width={1280}
                height={960}
                className="w-full h-auto block"
              />
              <div className="p-4 bg-background">
                <p className="text-xs text-center text-muted-foreground font-medium">
                  {isZh
                    ? "✨ 預覽:解鎖後即可在 WhatsApp 與 Telegram 收到 AI 教練訊息"
                    : "✨ Preview: unlock to receive AI coach messages on WhatsApp & Telegram"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <PlanComparisonDialog open={showPlan} onOpenChange={setShowPlan} lang={lang} />
    </div>
  );
};

export default MessagingSettingsPage;
