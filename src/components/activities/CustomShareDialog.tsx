import { useRef, useState } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Lang } from "@/lib/i18n";
import { shareCustom, CustomShareSelections, CustomShareInput } from "@/lib/shareActivity";
import { AlignCenter, AlignStartVertical, AlignEndVertical, RotateCcw, Sparkles } from "lucide-react";
import appIcon from "@/assets/app-icon.png";

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
  photos?: Array<{ id: string; url: string }>;
}

const CustomShareDialog = ({ open, onOpenChange, lang, data, available, photos = [] }: Props) => {
  const isZh = lang === "zh";
  const t = (en: string, zh: string) => (isZh ? zh : en);

  const [photoId, setPhotoId] = useState<string | null>(null);
  const photoUrl = photos.find((p) => p.id === photoId)?.url || null;

  const [sel, setSel] = useState<CustomShareSelections>({
    photoOverlay: false,
    overlayTransform: { x: 0.5, y: 0.76, scale: 1 },
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
  const previewRef = useRef<HTMLDivElement>(null);
  const dragPointerRef = useRef<number | null>(null);

  const overlay = sel.overlayTransform ?? { x: 0.5, y: 0.76, scale: 1 };
  const setOverlay = (next: Partial<NonNullable<CustomShareSelections["overlayTransform"]>>) =>
    setSel((s) => ({
      ...s,
      overlayTransform: { ...(s.overlayTransform ?? { x: 0.5, y: 0.76, scale: 1 }), ...next },
    }));

  const moveOverlay = (clientX: number, clientY: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0.12, Math.min(0.88, (clientX - rect.left) / rect.width));
    const y = Math.max(0.24, Math.min(0.88, (clientY - rect.top) / rect.height));
    setOverlay({ x, y });
  };

  const previewStats = [
    sel.stats.totalTime ? { label: t("Time", "時間"), value: formatPreviewTime(data.movingTimeSeconds) } : null,
    sel.stats.pace && data.averageSpeed > 0 ? { label: t("Pace", "配速"), value: formatPreviewPace(data.averageSpeed) } : null,
    sel.stats.avgHr && data.averageHeartrate ? { label: t("Avg HR", "平均心率"), value: `${Math.round(data.averageHeartrate)}` } : null,
    sel.stats.maxHr && data.maxHeartrate ? { label: t("Max HR", "最大心率"), value: `${Math.round(data.maxHeartrate)}` } : null,
    sel.stats.elevation && data.elevationGainMeters ? { label: t("Elev", "爬升"), value: `${Math.round(data.elevationGainMeters)} m` } : null,
    sel.stats.calories && data.calories ? { label: t("Calories", "卡路里"), value: `${Math.round(data.calories)}` } : null,
  ].filter((stat): stat is { label: string; value: string } => stat !== null).slice(0, 6);

  const toggleStat = (k: keyof CustomShareSelections["stats"]) =>
    setSel((s) => ({ ...s, stats: { ...s.stats, [k]: !s.stats[k] } }));
  const toggleChart = (k: keyof CustomShareSelections["charts"]) =>
    setSel((s) => ({ ...s, charts: { ...s.charts, [k]: !s.charts[k] } }));

  const handleGenerate = async () => {
    setSubmitting(true);
    try {
      await shareCustom({ ...data, photoUrl, selections: sel });
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
          {photos.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase">
                {t("Photo background", "照片背景")}
              </div>
              <Row
                label={t("Put stats on my photo", "把數據疊在我的照片上")}
                checked={!!sel.photoOverlay}
                onChange={() =>
                  setSel((s) => {
                    const next = !s.photoOverlay;
                    if (next && !photoId) setPhotoId(photos[0].id);
                    return { ...s, photoOverlay: next };
                  })
                }
              />
              {sel.photoOverlay && (
                <>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {photos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPhotoId(p.id)}
                        className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                          photoId === p.id ? "border-primary" : "border-transparent"
                        }`}
                      >
                        <img src={p.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "Your stats and the Runward logo are laid over the photo. Splits, charts and HR zones are skipped.",
                      "數據與 Runward 標誌會疊在照片上，分段、圖表與心率區間不會顯示。",
                    )}
                  </p>
                  {photoUrl && (
                    <div className="mt-3 space-y-3">
                      <div
                        ref={previewRef}
                        className="relative mx-auto aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-lg bg-muted select-none"
                      >
                        <img src={photoUrl} alt={t("Share card preview", "分享卡片預覽")} className="absolute inset-0 h-full w-full object-cover" />
                        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-foreground/60 to-transparent" />
                        <div className="absolute right-3 top-3 flex items-center gap-1.5 text-background drop-shadow-md">
                          <span className="font-display text-xs font-bold">Runward</span>
                          <img src={appIcon} alt="" className="h-6 w-6 rounded-md" />
                        </div>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={t("Drag to move stats", "拖曳以移動數據")}
                          className="absolute left-1/2 top-1/2 w-[88%] touch-none cursor-move rounded-lg bg-foreground/55 p-3 text-background shadow-lg ring-1 ring-background/30 backdrop-blur-[2px]"
                          style={{
                            transform: `translate(-50%, -50%) translate(${(overlay.x - 0.5) * 113.64}%, ${(overlay.y - 0.5) * 142.05}%) scale(${overlay.scale})`,
                          }}
                          onPointerDown={(event) => {
                            dragPointerRef.current = event.pointerId;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            moveOverlay(event.clientX, event.clientY);
                          }}
                          onPointerMove={(event) => {
                            if (dragPointerRef.current === event.pointerId) moveOverlay(event.clientX, event.clientY);
                          }}
                          onPointerUp={(event) => {
                            if (dragPointerRef.current === event.pointerId) dragPointerRef.current = null;
                          }}
                          onPointerCancel={() => { dragPointerRef.current = null; }}
                        >
                          <div className="truncate text-[10px] font-semibold opacity-85">{data.name}</div>
                          {sel.stats.distance && (
                            <div className="mt-1 flex items-baseline gap-1 font-display">
                              <span className="text-4xl font-bold leading-none">{(data.distanceMeters / 1000).toFixed(2)}</span>
                              <span className="text-sm font-semibold opacity-80">km</span>
                            </div>
                          )}
                          {previewStats.length > 0 && (
                            <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5">
                              {previewStats.map((stat) => (
                                <div key={stat.label} className="min-w-0">
                                  <div className="truncate text-[7px] font-semibold uppercase opacity-65">{stat.label}</div>
                                  <div className="truncate text-xs font-bold">{stat.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{t("Size", "大小")}</span>
                          <span className="tabular-nums text-muted-foreground">{Math.round(overlay.scale * 100)}%</span>
                        </div>
                        <Slider
                          aria-label={t("Stats size", "數據大小")}
                          min={65}
                          max={125}
                          step={5}
                          value={[Math.round(overlay.scale * 100)]}
                          onValueChange={([value]) => setOverlay({ scale: value / 100 })}
                        />
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => setOverlay({ x: 0.5, y: 0.3 })}>
                          <AlignStartVertical /> {t("Top", "頂部")}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => setOverlay({ x: 0.5, y: 0.55 })}>
                          <AlignCenter /> {t("Middle", "中間")}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => setOverlay({ x: 0.5, y: 0.78 })}>
                          <AlignEndVertical /> {t("Bottom", "底部")}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="px-2" onClick={() => setOverlay({ x: 0.5, y: 0.76, scale: 1 })}>
                          <RotateCcw /> {t("Reset", "重設")}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

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
              disabled={!available.splits || !!sel.photoOverlay}
            />
            <Row
              label={t("HR zones chart", "心率區間")}
              checked={sel.hrZones}
              onChange={() => setSel((s) => ({ ...s, hrZones: !s.hrZones }))}
              disabled={!available.hrZones || !!sel.photoOverlay}
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
              disabled={!available.chartPace || !!sel.photoOverlay}
            />
            <Row
              label={t("Heart rate chart", "心率圖")}
              checked={sel.charts.hr}
              onChange={() => toggleChart("hr")}
              disabled={!available.chartHr || !!sel.photoOverlay}
            />
            <Row
              label={t("Elevation chart", "海拔圖")}
              checked={sel.charts.altitude}
              onChange={() => toggleChart("altitude")}
              disabled={!available.chartAlt || !!sel.photoOverlay}
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

function formatPreviewTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatPreviewPace(speed: number) {
  const seconds = 1000 / speed;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
