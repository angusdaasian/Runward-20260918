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
import { shareCustom, CustomShareSelections, CustomShareInput, OverlayTransform } from "@/lib/shareActivity";
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

const DEFAULT_STATS_TRANSFORM: OverlayTransform = { x: 0.5, y: 0.76, scale: 1 };
const DEFAULT_SPLITS_TRANSFORM: OverlayTransform = { x: 0.5, y: 0.34, scale: 1 };

type OverlayKey = "stats" | "splits";

const CustomShareDialog = ({ open, onOpenChange, lang, data, available, photos = [] }: Props) => {
  const isZh = lang === "zh";
  const t = (en: string, zh: string) => (isZh ? zh : en);

  const [photoId, setPhotoId] = useState<string | null>(null);
  const photoUrl = photos.find((p) => p.id === photoId)?.url || null;

  const [sel, setSel] = useState<CustomShareSelections>({
    photoOverlay: false,
    overlayTransform: DEFAULT_STATS_TRANSFORM,
    splitsTransform: DEFAULT_SPLITS_TRANSFORM,
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
  const [activeOverlay, setActiveOverlay] = useState<OverlayKey>("stats");
  const previewRef = useRef<HTMLDivElement>(null);
  const dragPointerRef = useRef<number | null>(null);

  const statsOverlay = sel.overlayTransform ?? DEFAULT_STATS_TRANSFORM;
  const splitsOverlay = sel.splitsTransform ?? DEFAULT_SPLITS_TRANSFORM;
  const splitsOnPhoto = sel.splits && (data.splits?.length ?? 0) > 0;
  const activeTransform = activeOverlay === "splits" ? splitsOverlay : statsOverlay;

  const setOverlay = (key: OverlayKey, next: Partial<OverlayTransform>) =>
    setSel((s) =>
      key === "splits"
        ? { ...s, splitsTransform: { ...(s.splitsTransform ?? DEFAULT_SPLITS_TRANSFORM), ...next } }
        : { ...s, overlayTransform: { ...(s.overlayTransform ?? DEFAULT_STATS_TRANSFORM), ...next } },
    );
  const setActive = (next: Partial<OverlayTransform>) => setOverlay(activeOverlay, next);

  const moveOverlay = (key: OverlayKey, clientX: number, clientY: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = key === "splits" ? splitsOverlay.scale : statsOverlay.scale;
    const minX = 0.36 * scale + 0.025;
    const halfY = 0.14 * scale;
    const x = Math.max(minX, Math.min(1 - minX, (clientX - rect.left) / rect.width));
    const y = Math.max(0.16 + halfY, Math.min(0.97 - halfY, (clientY - rect.top) / rect.height));
    setOverlay(key, { x, y });
  };

  const previewStats = [
    sel.stats.totalTime ? { label: t("Time", "時間"), value: formatPreviewTime(data.movingTimeSeconds) } : null,
    sel.stats.pace && data.averageSpeed > 0 ? { label: t("Pace", "配速"), value: formatPreviewPace(data.averageSpeed) } : null,
    sel.stats.avgHr && data.averageHeartrate ? { label: t("Avg HR", "平均心率"), value: `${Math.round(data.averageHeartrate)}` } : null,
    sel.stats.maxHr && data.maxHeartrate ? { label: t("Max HR", "最大心率"), value: `${Math.round(data.maxHeartrate)}` } : null,
    sel.stats.elevation && data.elevationGainMeters ? { label: t("Elev", "爬升"), value: `${Math.round(data.elevationGainMeters)} m` } : null,
    sel.stats.calories && data.calories ? { label: t("Calories", "卡路里"), value: `${Math.round(data.calories)}` } : null,
  ].filter((stat): stat is { label: string; value: string } => stat !== null).slice(0, 6);

  const previewSplits = (data.splits ?? [])
    .filter((s) => !((s.distance || 0) < 50 && (s.elapsed_time || 0) < 10))
    .slice(0, 8);

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

  const dragHandlers = (key: OverlayKey) => ({
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      setActiveOverlay(key);
      dragPointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      moveOverlay(key, event.clientX, event.clientY);
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragPointerRef.current === event.pointerId) moveOverlay(key, event.clientX, event.clientY);
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragPointerRef.current === event.pointerId) dragPointerRef.current = null;
    },
    onPointerCancel: () => {
      dragPointerRef.current = null;
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = key === "splits" ? splitsOverlay : statsOverlay;
      const step = event.shiftKey ? 0.05 : 0.02;
      if (event.key === "ArrowLeft") setOverlay(key, { x: Math.max(0.3, current.x - step) });
      else if (event.key === "ArrowRight") setOverlay(key, { x: Math.min(0.7, current.x + step) });
      else if (event.key === "ArrowUp") setOverlay(key, { y: Math.max(0.2, current.y - step) });
      else if (event.key === "ArrowDown") setOverlay(key, { y: Math.min(0.9, current.y + step) });
      else return;
      event.preventDefault();
    },
  });

  const blockClass = (key: OverlayKey) =>
    `absolute touch-none cursor-move rounded-md p-1 text-background [text-shadow:0_1px_6px_rgba(0,0,0,0.75)] ${
      activeOverlay === key ? "ring-1 ring-background/70" : "ring-0"
    }`;

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
                      "Tap a block to select it, drag to move it, and use the slider to resize. Text sits directly on the photo.",
                      "點選一個區塊即可選取，拖曳可移動，滑桿可調整大小。文字會直接疊在照片上。",
                    )}
                  </p>
                  {photoUrl && (
                    <div className="mt-3 space-y-3">
                      <div
                        ref={previewRef}
                        className="relative mx-auto aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-lg bg-muted select-none"
                      >
                        <img src={photoUrl} alt={t("Share card preview", "分享卡片預覽")} className="absolute inset-0 h-full w-full object-cover" />
                        <div className="absolute right-3 top-3 flex items-center gap-1.5 text-background [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]">
                          <span className="font-display text-xs font-bold">Runward</span>
                          <img src={appIcon} alt="" className="h-6 w-6 rounded-md" />
                        </div>

                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={t("Drag to move stats", "拖曳以移動數據")}
                          className={`${blockClass("stats")} w-[70%]`}
                          style={{
                            left: `${statsOverlay.x * 100}%`,
                            top: `${statsOverlay.y * 100}%`,
                            transform: `translate(-50%, -50%) scale(${statsOverlay.scale})`,
                          }}
                          {...dragHandlers("stats")}
                        >
                          <div className="truncate text-[10px] font-semibold opacity-90">{data.name}</div>
                          {sel.stats.distance && (
                            <div className="mt-1 flex items-baseline gap-1 font-display">
                              <span className="text-4xl font-bold leading-none">{(data.distanceMeters / 1000).toFixed(2)}</span>
                              <span className="text-sm font-semibold opacity-85">km</span>
                            </div>
                          )}
                          {previewStats.length > 0 && (
                            <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5">
                              {previewStats.map((stat) => (
                                <div key={stat.label} className="min-w-0">
                                  <div className="truncate text-[7px] font-semibold uppercase opacity-80">{stat.label}</div>
                                  <div className="truncate text-xs font-bold">{stat.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {splitsOnPhoto && previewSplits.length > 0 && (
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={t("Drag to move splits", "拖曳以移動分段")}
                            className={`${blockClass("splits")} w-[55%]`}
                            style={{
                              left: `${splitsOverlay.x * 100}%`,
                              top: `${splitsOverlay.y * 100}%`,
                              transform: `translate(-50%, -50%) scale(${splitsOverlay.scale})`,
                            }}
                            {...dragHandlers("splits")}
                          >
                            <div className="flex text-[6px] font-semibold uppercase opacity-80">
                              <span className="flex-1">{t("Split", "分段")}</span>
                              <span className="w-9 text-right">{t("Pace", "配速")}</span>
                              <span className="w-6 text-right">HR</span>
                            </div>
                            {previewSplits.map((s, i) => (
                              <div key={i} className="flex items-baseline text-[8px] font-bold">
                                <span className="flex-1">
                                  {((s.distance || 0) / 1000).toFixed((s.distance || 0) % 1000 === 0 ? 0 : 2)} km
                                </span>
                                <span className="w-9 text-right font-display">
                                  {s.average_speed > 0 ? formatPreviewPace(s.average_speed) : "--"}
                                </span>
                                <span className="w-6 text-right opacity-90">
                                  {s.average_heartrate ? Math.round(s.average_heartrate) : "--"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {splitsOnPhoto && previewSplits.length > 0 && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <Button
                            type="button"
                            variant={activeOverlay === "stats" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setActiveOverlay("stats")}
                          >
                            {t("Stats", "數據")}
                          </Button>
                          <Button
                            type="button"
                            variant={activeOverlay === "splits" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setActiveOverlay("splits")}
                          >
                            {t("Splits", "分段")}
                          </Button>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">
                            {activeOverlay === "splits" ? t("Splits size", "分段大小") : t("Stats size", "數據大小")}
                          </span>
                          <span className="tabular-nums text-muted-foreground">{Math.round(activeTransform.scale * 100)}%</span>
                        </div>
                        <Slider
                          aria-label={t("Overlay size", "疊圖大小")}
                          min={65}
                          max={115}
                          step={5}
                          value={[Math.round(activeTransform.scale * 100)]}
                          onValueChange={([value]) => setActive({ scale: value / 100 })}
                        />
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => setActive({ x: 0.5, y: 0.3 })}>
                          <AlignStartVertical /> {t("Top", "頂部")}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => setActive({ x: 0.5, y: 0.55 })}>
                          <AlignCenter /> {t("Middle", "中間")}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => setActive({ x: 0.5, y: 0.78 })}>
                          <AlignEndVertical /> {t("Bottom", "底部")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="px-2"
                          onClick={() =>
                            setActive(activeOverlay === "splits" ? DEFAULT_SPLITS_TRANSFORM : DEFAULT_STATS_TRANSFORM)
                          }
                        >
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
              disabled={!available.splits}
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
