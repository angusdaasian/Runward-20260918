import { useEffect, useMemo, useState } from "react";
import despia from "despia-native";
import { Check, LayoutGrid } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lang } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Props {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface WidgetOption {
  id: string;
  en: string;
  zh: string;
  desc_en: string;
  desc_zh: string;
}

const WIDGETS: WidgetOption[] = [
  { id: "latest_activity", en: "Latest Activity", zh: "最近活動", desc_en: "Your most recent run", desc_zh: "你最近的一次跑步" },
  { id: "program_week", en: "This Week's Plan", zh: "本週訓練計劃", desc_en: "AI / Free / Custom program", desc_zh: "AI／免費／自訂計劃" },
  { id: "health", en: "Daily Health", zh: "每日健康", desc_en: "Steps, calories, RHR, sleep", desc_zh: "步數、卡路里、靜息心率、睡眠" },
  { id: "steps_today", en: "Steps (Today)", zh: "步數（今日）", desc_en: "Today's step count", desc_zh: "今日步數" },
  { id: "calories_today", en: "Calories (Today)", zh: "卡路里（今日）", desc_en: "Today's total calories", desc_zh: "今日總卡路里" },
  { id: "duration_week", en: "Duration (Week)", zh: "運動時數（本週）", desc_en: "Total time and distance", desc_zh: "本週總時間及距離" },
  { id: "sleep_last_night", en: "Sleep (Last Night)", zh: "睡眠（昨晚）", desc_en: "Last night's sleep duration", desc_zh: "昨晚睡眠時長" },
  { id: "sleep_score", en: "Sleep Score", zh: "睡眠分數", desc_en: "Last night's sleep score", desc_zh: "昨晚睡眠分數" },
  { id: "rhr", en: "Resting HR", zh: "靜息心率", desc_en: "Latest resting heart rate", desc_zh: "最新靜息心率" },
  { id: "hrv", en: "HRV", zh: "心率變異", desc_en: "HRV (RMSSD)", desc_zh: "心率變異（RMSSD）" },
  { id: "training_load", en: "Training Load", zh: "訓練負荷", desc_en: "Last 7 days load", desc_zh: "近 7 日訓練負荷" },
  { id: "race_predictor", en: "Race Predictor", zh: "比賽預測", desc_en: "VO₂max snapshot", desc_zh: "VO₂max 概覽" },
  { id: "hr_zones", en: "Heart Rate Zones", zh: "心率區間", desc_en: "Open app for full chart", desc_zh: "開啟 App 查看完整圖表" },
  { id: "trends", en: "Trends", zh: "趨勢", desc_en: "Open app for full chart", desc_zh: "開啟 App 查看完整圖表" },
  { id: "year_heatmap", en: "Year Heatmap", zh: "年度熱力圖", desc_en: "Open app for full view", desc_zh: "開啟 App 查看完整視圖" },
];

const LS_KEY = "home_widget_type";

export function getProjectFunctionsBase(): string {
  // VITE_SUPABASE_PROJECT_ID is auto-populated
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || "kbghvclwhxnjeskdodeh";
  return `https://${projectId}.supabase.co/functions/v1/home-widget`;
}

const HomeWidgetDialog = ({ lang, open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>(() => localStorage.getItem(LS_KEY) || "latest_activity");

  useEffect(() => {
    if (open) {
      const cur = localStorage.getItem(LS_KEY) || "latest_activity";
      setSelected(cur);
    }
  }, [open]);

  const isDark = useMemo(
    () => document.documentElement.classList.contains("dark") || localStorage.getItem("app_theme") === "dark",
    [open],
  );

  const apply = (widgetId: string) => {
    if (!user) {
      toast({
        title: lang === "zh" ? "請先登入" : "Sign in required",
        description: lang === "zh" ? "登入後才能設定主螢幕小工具" : "Sign in to set up the home screen widget",
        variant: "destructive",
      });
      return;
    }
    const ua = navigator.userAgent.toLowerCase();
    const isDespia = ua.includes("despia");
    const isIOS = ua.includes("iphone") || ua.includes("ipad");
    const base = getProjectFunctionsBase();
    const theme = isDark ? "dark" : "light";
    const refresh = 30;
    const widgetUrl = `${base}?user=${encodeURIComponent(user.id)}&type=${encodeURIComponent(widgetId)}&theme=${theme}&refresh=${refresh}`;
    if (isDespia && isIOS) {
      try {
        despia(`widget://${widgetUrl}`);
      } catch (e) {
        console.error("despia widget call failed", e);
      }
    }
    localStorage.setItem(LS_KEY, widgetId);
    setSelected(widgetId);
    toast({
      title: lang === "zh" ? "已套用小工具" : "Widget applied",
      description: isDespia && isIOS
        ? (lang === "zh" ? "請在主螢幕加入 Runward 小工具以查看。" : "Add the Runward widget on your home screen to view it.")
        : (lang === "zh" ? "小工具僅在 iOS App 上顯示。" : "Widgets only display in the iOS app."),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-primary" />
            {lang === "zh" ? "主螢幕小工具" : "Home Screen Widget"}
          </DialogTitle>
          <DialogDescription>
            {lang === "zh"
              ? "選擇一個小工具，加入到 iOS 主螢幕後便會自動更新。"
              : "Pick a widget to show on your iOS home screen. Updates automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {WIDGETS.map((w) => {
            const isSelected = selected === w.id;
            return (
              <button
                key={w.id}
                onClick={() => apply(w.id)}
                className={`w-full flex items-center justify-between text-left p-3 rounded-lg border transition-colors ${
                  isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-sm text-foreground">
                    {lang === "zh" ? w.zh : w.en}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {lang === "zh" ? w.desc_zh : w.desc_en}
                  </div>
                </div>
                {isSelected && <Check size={18} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-border">
          {lang === "zh"
            ? "提示：在 iOS 主螢幕長按空白處 → 加入小工具 → 搜尋 Runward。"
            : "Tip: long-press your iOS home screen → Add Widget → search Runward."}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {lang === "zh" ? "完成" : "Done"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HomeWidgetDialog;
