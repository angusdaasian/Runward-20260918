import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Brain, Activity, Clock } from "lucide-react";
import { useDespiaPurchases } from "@/hooks/use-despia-purchases";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: "en" | "zh";
}

const UpgradeModal = ({ open, onOpenChange, lang }: Props) => {
  const { launchPaywall } = useDespiaPurchases();

  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);

  const features = [
    { icon: Brain, label: t("Remembers your goals & preferences", "記住你的目標與偏好") },
    { icon: Activity, label: t("Analyzes your runs in real time", "即時分析你的跑步資料") },
    { icon: Clock, label: t("24/7 personalized advice", "全天候個人化建議") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-2">
            <Sparkles className="text-primary-foreground" size={28} />
          </div>
          <DialogTitle className="text-center text-xl">
            {t("Unlock AI Running Coach", "解鎖 AI 跑步教練")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t(
              "Get personalized coaching that learns from every run.",
              "獲得從每次跑步中學習的個人化教練。",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <f.icon className="text-primary" size={16} />
              </div>
              <span className="text-foreground">{f.label}</span>
            </div>
          ))}
        </div>
        <Button
          className="w-full"
          size="lg"
          onClick={() => {
            onOpenChange(false);
            launchPaywall("default", lang === "zh" ? "zh_Hant" : "en");
          }}
        >
          {t("Upgrade to Premium", "升級至 Premium")}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;
