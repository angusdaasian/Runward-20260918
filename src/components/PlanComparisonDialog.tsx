import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X, Crown, Sparkles } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { usePremium } from "@/contexts/PremiumContext";
import { useDespiaPurchases } from "@/hooks/use-despia-purchases";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
}

const PlanComparisonDialog = ({ open, onOpenChange, lang }: Props) => {
  const { isPremium } = usePremium();
  const { launchPaywall } = useDespiaPurchases();
  const tx = (en: string, zh: string) => (lang === "zh" ? zh : en);

  const features: { label: string; free: boolean | string; premium: boolean | string }[] = [
    // Both ticks first
    { label: tx("Activity tracking & sync", "活動追蹤與同步"), free: true, premium: true },
    { label: tx("Community & leaderboards", "社群與排行榜"), free: true, premium: true },
    { label: tx("HRV insights", "HRV 洞察"), free: true, premium: true },
    { label: tx("Training load charts", "訓練負荷圖表"), free: true, premium: true },
    // Free X, Premium tick
    { label: tx("AI Running Coach (24/7 chat)", "AI 跑步教練（全天候）"), free: false, premium: true },
    { label: tx("AI activity analysis", "AI 活動分析"), free: false, premium: true },
    { label: tx("Activity sharing", "活動分享"), free: tx("Basic", "基本"), premium: tx("All functions", "全部功能") },
    { label: tx("AI activity share posters", "AI 活動分享海報"), free: false, premium: true },
    { label: tx("Weekly plan reviews", "每週計劃回顧"), free: false, premium: true },
    { label: tx("Export .fit files", "匯出 .fit 檔案"), free: tx("Per activity", "單個活動"), premium: tx("Bulk export", "批量匯出") },
    // Text on both sides
    { label: tx("Training plans", "訓練計劃"), free: tx("Basic", "基本"), premium: tx("Personalized AI", "AI 個人化") },
    { label: tx("Race predictor", "比賽預測"), free: tx("5K only", "僅 5K"), premium: tx("All distances", "全距離") },
    { label: tx("Posture analysis", "跑姿分析"), free: tx("1 / day", "每日 1 次"), premium: tx("Unlimited", "無限") },
  ];

  const renderCell = (val: boolean | string) => {
    if (val === true) return <Check size={16} className="text-success mx-auto" />;
    if (val === false) return <X size={16} className="text-muted-foreground/50 mx-auto" />;
    return <span className="text-[11px] text-foreground">{val}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-1">
            <Crown className="text-primary-foreground" size={24} />
          </div>
          <DialogTitle className="text-center text-xl">{tx("Free vs Premium", "免費版 vs Premium")}</DialogTitle>
          <DialogDescription className="text-center">
            {tx("See what you unlock with Premium", "看看升級 Premium 可解鎖什麼")}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_70px_70px] bg-accent/50 px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            <span>{tx("Feature", "功能")}</span>
            <span className="text-center">{tx("Free", "免費")}</span>
            <span className="text-center flex items-center justify-center gap-1">
              <Sparkles size={10} className="text-warning" />
              Premium
            </span>
          </div>
          {features.map((f, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_70px_70px] items-center px-3 py-2.5 text-xs ${
                i % 2 === 0 ? "bg-background" : "bg-accent/20"
              }`}
            >
              <span className="text-foreground pr-2">{f.label}</span>
              <div className="text-center">{renderCell(f.free)}</div>
              <div className="text-center">{renderCell(f.premium)}</div>
            </div>
          ))}
        </div>

        {!isPremium && (
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              onOpenChange(false);
              launchPaywall("default", lang === "zh" ? "zh_Hant" : "en");
            }}
          >
            <Crown size={16} className="mr-2" />
            {tx("Upgrade to Premium", "升級至 Premium")}
          </Button>
        )}
        {isPremium && (
          <div className="text-center text-sm text-success font-medium">
            {tx("You're on Premium — enjoy everything!", "您已是 Premium 用戶 — 盡情享受！")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PlanComparisonDialog;
