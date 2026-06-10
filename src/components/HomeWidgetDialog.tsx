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

const SLOTS = [1, 2, 3] as const;
type Slot = typeof SLOTS[number];

const lsKey = (slot: Slot) => (slot === 1 ? "home_widget_type" : `home_widget_type_${slot}`);

export function getProjectFunctionsBase(): string {
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || "kbghvclwhxnjeskdodeh";
  return `https://${projectId}.supabase.co/functions/v1/home-widget`;
}

const HomeWidgetDialog = ({ lang, open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeSlot, setActiveSlot] = useState<Slot>(1);
  const [selections, setSelections] = useState<Record<Slot, string>>({
    1: localStorage.getItem(lsKey(1)) || "latest_activity",
    2: localStorage.getItem(lsKey(2)) || "health",
    3: localStorage.getItem(lsKey(3)) || "program_week",
  });

  useEffect(() => {
    if (open) {
      setSelections({
        1: localStorage.getItem(lsKey(1)) || "latest_activity",
        2: localStorage.getItem(lsKey(2)) || "health",
        3: localStorage.getItem(lsKey(3)) || "program_week",
      });
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
    const widgetUrl = `${base}?user=${encodeURIComponent(user.id)}&type=${encodeURIComponent(widgetId)}&theme=${theme}&refresh=${refresh}&slot=${activeSlot}`;
    if (isDespia && isIOS) {
      try {
        // Slot 1 uses the default `widget://` scheme; slots 2/3 use numbered schemes
        const scheme = activeSlot === 1 ? "widget" : `widget${activeSlot}`;
        despia(`${scheme}://${widgetUrl}`);
      } catch (e) {
        console.error("despia widget call failed", e);
      }
    }
    localStorage.setItem(lsKey(activeSlot), widgetId);
    setSelections((prev) => ({ ...prev, [activeSlot]: widgetId }));
    toast({
      title: lang === "zh" ? `已套用到小工具 ${activeSlot}` : `Applied to Widget ${activeSlot}`,
      description: isDespia && isIOS
        ? (lang === "zh"
            ? `在主螢幕加入 Runward 小工具（位置 ${activeSlot}）以查看。`
            : `Add the Runward widget (slot ${activeSlot}) on your home screen to view it.`)
        : (lang === "zh" ? "小工具僅在 iOS App 上顯示。" : "Widgets only display in the iOS app."),
    });
  };

  const selected = selections[activeSlot];

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
              ? "可同時設定最多 3 個不同的小工具，加入到 iOS 主螢幕後便會自動更新。"
              : "Set up to 3 different widgets at once. They update automatically on your iOS home screen."}
          </DialogDescription>
        </DialogHeader>

        {/* Slot tabs */}
        <div className="grid grid-cols-3 gap-2">
          {SLOTS.map((s) => {
            const active = activeSlot === s;
            const cur = WIDGETS.find((w) => w.id === selections[s]);
            return (
              <button
                key={s}
                onClick={() => setActiveSlot(s)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {lang === "zh" ? `位置 ${s}` : `Slot ${s}`}
                </div>
                <div className="text-xs font-medium text-foreground truncate">
                  {cur ? (lang === "zh" ? cur.zh : cur.en) : "—"}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-2 pt-1">
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
            ? "提示：在 iOS 主螢幕長按空白處 → 加入小工具 → 搜尋 Runward，分別加入 Widget 1、2、3。"
            : "Tip: long-press your iOS home screen → Add Widget → search Runward, then add Widget 1, 2, and 3."}
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
