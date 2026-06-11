import { ArrowLeft } from "lucide-react";
import { Lang } from "@/lib/i18n";
import WhatsAppConnectCard from "@/components/WhatsAppConnectCard";

interface Props {
  lang: Lang;
  onBack: () => void;
}

const WhatsAppSettingsPage = ({ lang, onBack }: Props) => {
  const isZh = lang === "zh";
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
            {isZh ? "WhatsApp 通知" : "WhatsApp"}
          </h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          {isZh
            ? "把 RunWard 連到 WhatsApp，每天早上收到 AI 跑步建議，跑步後分享感受獲得 AI 教練回饋，或直接在 WhatsApp 內與 AI 教練對話。"
            : "Connect RunWard to WhatsApp for daily AI workout suggestions, post-run feedback chats, and direct AI coach conversations inside WhatsApp."}
        </p>
        <WhatsAppConnectCard lang={lang} />
      </div>
    </div>
  );
};

export default WhatsAppSettingsPage;
