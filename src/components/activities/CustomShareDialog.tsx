import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Lang } from "@/lib/i18n";
import { shareCustom, CustomShareSelections, CustomShareInput } from "@/lib/shareActivity";
import { Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  data: Omit<CustomShareInput, "selections">;
  available: {
    route: boolean;
    splits: boolean;
    hrZones: boolean;
    pace: boolean;
    avgHr: boolean;
    maxHr: boolean;
    elevation: boolean;
    calories: boolean;
    chartPace: boolean;
    chartHr: boolean;
    chartAlt: boolean;
  };
}

const CustomShareDialog = ({ open, onOpenChange, lang, data, available }: Props) => {
  const isZh = lang === "zh";
  const t = (en: string, zh: string) => (isZh ? zh : en);

  const [sel, setSel] = useState<CustomShareSelections>({
    route: available.route,
    splits: available.splits,
    hrZones: available.hrZones,
    stats: {
      distance: true,
      totalTime: true,
      pace: available.pace,
      avgHr: available.avgHr,
      maxHr: false,
      elevation: available.elevation,
      calories: available.calories,
    },
    charts: {
      pace: false,
      hr: false,
      altitude: false,
    },
  });

  const [submitting, setSubmitting] = useState(false);

  const toggleStat = (k: keyof CustomShareSelections["stats"]) =>
    setSel((s) => ({ ...s, stats: { ...s.stats, [k]: !s.stats[k] } }));
  const toggleChart = (k: keyof CustomShareSelections["charts"]) =>
    setSel((s) => ({ ...s, charts: { ...s.charts, [k]: !s.charts[k] } }));

  const handleGenerate = async () => {
    setSubmitting(true);
    try {
      await shareCustom({ ...data, selections: sel });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const Row = ({
    label,
    checked,
    onChange,
    disabled,
  }: {
    label: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
  }) => (
    <label
      className={`flex items-center gap-2 text-sm py-1.5 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <Checkbox checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <span>{label}</span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            {t("Custom share card", "自訂分享卡片")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Pick what to include in your share image.",
              "選擇要包含在分享圖中的內容。",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase">
              {t("Sections", "區塊")}
            </div>
            <Row
              label={t("Route map", "路線圖")}
              checked={sel.route}
              onChange={() => setSel((s) => ({ ...s, route: !s.route }))}
              disabled={!available.route}
            />
            <Row
              label={t("Splits", "分段")}
              checked={sel.splits}
              onChange={() => setSel((s) => ({ ...s, splits: !s.splits }))}
              disabled={!available.splits}
            />
            <Row
              label={t("HR zones chart", "心率區間")}
              checked={sel.hrZones}
              onChange={() => setSel((s) => ({ ...s, hrZones: !s.hrZones }))}
              disabled={!available.hrZones}
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase">
              {t("Basic stats", "基本數據")}
            </div>
            <Row
              label={t("Distance", "距離")}
              checked={sel.stats.distance}
              onChange={() => toggleStat("distance")}
            />
            <Row
              label={t("Total time", "總時間")}
              checked={sel.stats.totalTime}
              onChange={() => toggleStat("totalTime")}
            />
            <Row
              label={t("Pace", "配速")}
              checked={sel.stats.pace}
              onChange={() => toggleStat("pace")}
              disabled={!available.pace}
            />
            <Row
              label={t("Average HR", "平均心率")}
              checked={sel.stats.avgHr}
              onChange={() => toggleStat("avgHr")}
              disabled={!available.avgHr}
            />
            <Row
              label={t("Max HR", "最大心率")}
              checked={sel.stats.maxHr}
              onChange={() => toggleStat("maxHr")}
              disabled={!available.maxHr}
            />
            <Row
              label={t("Elevation", "爬升")}
              checked={sel.stats.elevation}
              onChange={() => toggleStat("elevation")}
              disabled={!available.elevation}
            />
            <Row
              label={t("Calories", "卡路里")}
              checked={sel.stats.calories}
              onChange={() => toggleStat("calories")}
              disabled={!available.calories}
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase">
              {t("Charts", "圖表")}
            </div>
            <Row
              label={t("Pace chart", "配速圖")}
              checked={sel.charts.pace}
              onChange={() => toggleChart("pace")}
              disabled={!available.chartPace}
            />
            <Row
              label={t("Heart rate chart", "心率圖")}
              checked={sel.charts.hr}
              onChange={() => toggleChart("hr")}
              disabled={!available.chartHr}
            />
            <Row
              label={t("Elevation chart", "海拔圖")}
              checked={sel.charts.altitude}
              onChange={() => toggleChart("altitude")}
              disabled={!available.chartAlt}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("Cancel", "取消")}
          </Button>
          <Button onClick={handleGenerate} disabled={submitting}>
            {submitting ? t("Generating...", "生成中...") : t("Generate", "生成")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomShareDialog;
