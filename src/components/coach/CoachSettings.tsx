import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2, Sparkles, Brain } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CoachPreferences } from "@/hooks/use-ai-coach";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefs: CoachPreferences | null;
  insights: Array<{ insight_key: string; insight_value: string }>;
  onSave: (patch: Partial<CoachPreferences>) => Promise<boolean>;
  onResetMemory: () => Promise<void>;
  lang: "en" | "zh";
}

const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];

const CoachSettings = ({ open, onOpenChange, prefs, insights, onSave, onResetMemory, lang }: Props) => {
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const [local, setLocal] = useState<Partial<CoachPreferences>>({});
  const [saving, setSaving] = useState(false);
  const days = lang === "zh" ? DAYS_ZH : DAYS_EN;

  useEffect(() => {
    if (open) setLocal(prefs || {});
  }, [open, prefs]);

  const toggleDay = (i: number) => {
    const key = DAYS_EN[i];
    const cur = (local.training_days as string[]) || [];
    const next = cur.includes(key) ? cur.filter((d) => d !== key) : [...cur, key];
    setLocal({ ...local, training_days: next });
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("Coach Settings", "教練設定")}</SheetTitle>
          <SheetDescription>
            {t("Personalize how your AI coach trains you.", "個人化你的 AI 教練。")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Units */}
          <div className="flex items-center justify-between">
            <Label htmlFor="units">{t("Use miles (instead of km)", "使用英里 (預設公里)")}</Label>
            <Switch
              id="units"
              checked={local.preferred_units === "miles"}
              onCheckedChange={(v) =>
                setLocal({ ...local, preferred_units: v ? "miles" : "kilometers" })
              }
            />
          </div>

          {/* Goal */}
          <div className="space-y-2">
            <Label>{t("Training goal", "訓練目標")}</Label>
            <Select
              value={local.training_goal || ""}
              onValueChange={(v) => setLocal({ ...local, training_goal: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("Select goal", "選擇目標")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5K">5K</SelectItem>
                <SelectItem value="10K">10K</SelectItem>
                <SelectItem value="Half Marathon">{t("Half Marathon", "半馬")}</SelectItem>
                <SelectItem value="Marathon">{t("Marathon", "全馬")}</SelectItem>
                <SelectItem value="Ultra">{t("Ultra", "超馬")}</SelectItem>
                <SelectItem value="General Fitness">{t("General Fitness", "一般健身")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Race date */}
          <div className="space-y-2">
            <Label>{t("Target race date (optional)", "目標比賽日期 (選填)")}</Label>
            <Input
              type="date"
              value={local.target_race_date || ""}
              onChange={(e) =>
                setLocal({ ...local, target_race_date: e.target.value || null })
              }
            />
          </div>

          {/* Experience */}
          <div className="space-y-2">
            <Label>{t("Experience level", "經驗程度")}</Label>
            <Select
              value={local.experience_level || ""}
              onValueChange={(v) => setLocal({ ...local, experience_level: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("Select level", "選擇程度")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Beginner">{t("Beginner", "初學者")}</SelectItem>
                <SelectItem value="Intermediate">{t("Intermediate", "中階")}</SelectItem>
                <SelectItem value="Advanced">{t("Advanced", "進階")}</SelectItem>
                <SelectItem value="Elite">{t("Elite", "菁英")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Training days */}
          <div className="space-y-2">
            <Label>{t("Available training days", "可訓練日")}</Label>
            <div className="flex gap-1.5 flex-wrap">
              {days.map((d, i) => {
                const active = ((local.training_days as string[]) || []).includes(DAYS_EN[i]);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`h-9 w-10 rounded-md border text-xs font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Intensity */}
          <div className="space-y-2">
            <Label>{t("Training intensity", "訓練強度")}</Label>
            <Select
              value={local.training_intensity || ""}
              onValueChange={(v) => setLocal({ ...local, training_intensity: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("Select intensity", "選擇強度")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Easy">{t("Easy", "輕鬆")}</SelectItem>
                <SelectItem value="Moderate">{t("Moderate", "適中")}</SelectItem>
                <SelectItem value="Aggressive">{t("Aggressive", "積極")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Injuries */}
          <div className="space-y-2">
            <Label>{t("Known injuries / concerns", "已知傷患 / 顧慮")}</Label>
            <Textarea
              rows={3}
              placeholder={t("e.g. recurring knee pain", "例如：膝蓋反覆疼痛")}
              value={local.injuries_concerns || ""}
              onChange={(e) => setLocal({ ...local, injuries_concerns: e.target.value })}
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? t("Saving...", "儲存中...") : t("Save preferences", "儲存設定")}
          </Button>

          {/* What coach knows */}
          <div className="space-y-2 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles size={14} className="text-primary" />
              {t("What coach knows", "教練了解什麼")}
            </div>
            {insights.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("Nothing learned yet — start chatting!", "尚未學到內容，開始聊天吧！")}
              </p>
            ) : (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {insights.slice(0, 10).map((i) => (
                  <li key={i.insight_key} className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>
                      <span className="text-foreground font-medium">
                        {i.insight_key.replace(/_/g, " ")}:
                      </span>{" "}
                      {i.insight_value}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Reset */}
          <Button
            variant="outline"
            onClick={async () => {
              if (
                confirm(
                  t(
                    "Reset AI memory? This clears chat history and learned insights, but keeps preferences.",
                    "重置 AI 記憶？這會清除聊天記錄與學到的內容，但保留偏好設定。",
                  ),
                )
              ) {
                await onResetMemory();
                onOpenChange(false);
              }
            }}
            className="w-full"
          >
            <Trash2 size={14} className="mr-2" />
            {t("Reset AI memory", "重置 AI 記憶")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CoachSettings;
