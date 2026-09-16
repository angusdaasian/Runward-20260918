import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  shareCustom,
  CustomShareSelections,
  CustomShareInput,
  OverlayTransform,
  PhotoChartKind,
  PHOTO_CARD_W,
  PHOTO_CHART_W,
  PHOTO_CHART_H,
  photoSplitsLayout,
  filterVisibleSplits,
  ShareSplit,
} from "@/lib/shareActivity";
import { AlignCenter, AlignStartVertical, AlignEndVertical, RotateCcw, Sparkles } from "lucide-react";
import appIcon from "@/assets/app-icon.png";

type SplitsMode = "laps" | "km" | "reps";

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
  /** Alternative split sources the user can choose between. */
  splitSets?: {
    laps?: ShareSplit[] | null;
    km?: ShareSplit[] | null;
    reps?: ShareSplit[] | null;
    lapsLabel?: string;
  };
}

const DEFAULT_STATS_TRANSFORM: OverlayTransform = { x: 0.5, y: 0.76, scale: 1 };
const DEFAULT_SPLITS_TRANSFORM: OverlayTransform = { x: 0.5, y: 0.34, scale: 1 };
const DEFAULT_CHART_TRANSFORMS: Record<PhotoChartKind, OverlayTransform> = {
  pace: { x: 0.5, y: 0.42, scale: 1 },
  hr: { x: 0.5, y: 0.55, scale: 1 },
  altitude: { x: 0.5, y: 0.68, scale: 1 },
};

type OverlayKey = "stats" | "splits" | "chart:pace" | "chart:hr" | "chart:altitude";

const chartKindOf = (key: OverlayKey): PhotoChartKind | null =>
  key.startsWith("chart:") ? (key.slice(6) as PhotoChartKind) : null;

const CustomShareDialog = ({ open, onOpenChange, lang, data, available, photos = [], splitSets }: Props) => {
  const isZh = lang === "zh";
  const t = (en: string, zh: string) => (isZh ? zh : en);

  const [photoId, setPhotoId] = useState<string | null>(null);
  const photoUrl = photos.find((p) => p.id === photoId)?.url || null;

  const splitOptions = useMemo(() => {
    const opts: Array<{ mode: SplitsMode; label: string; splits: ShareSplit[] }> = [];
    if (splitSets?.laps?.length) {
      opts.push({
        mode: "laps",
        label: splitSets.lapsLabel || t("Watch laps", "手錶分段"),
        splits: splitSets.laps,
      });
    }
    if (splitSets?.km?.length) {
      opts.push({ mode: "km", label: t("1 km splits", "每 1 公里"), splits: splitSets.km });
    }
    if (splitSets?.reps?.length) {
      opts.push({ mode: "reps", label: t("Intervals", "智能分段"), splits: splitSets.reps });
    }
    return opts;
  }, [splitSets, isZh]);

  const [splitsMode, setSplitsMode] = useState<SplitsMode>("laps");
  const activeSplits = useMemo(() => {
    const chosen = splitOptions.find((o) => o.mode === splitsMode) || splitOptions[0];
    return chosen?.splits ?? data.splits ?? [];
  }, [splitOptions, splitsMode, data.splits]);

  const [sel, setSel] = useState<CustomShareSelections>({
    photoOverlay: false,
    overlayTransform: DEFAULT_STATS_TRANSFORM,
    splitsTransform: DEFAULT_SPLITS_TRANSFORM,
    chartTransforms: { ...DEFAULT_CHART_TRANSFORMS },
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
  const [previewW, setPreviewW] = useState(300);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    setPreviewW(el.clientWidth);
    const ro = new ResizeObserver(() => setPreviewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, photoUrl, sel.photoOverlay]);

  /** preview px per canvas px — keeps the preview a true WYSIWYG of the export. */
  const f = previewW / PHOTO_CARD_W;

  const statsOverlay = sel.overlayTransform ?? DEFAULT_STATS_TRANSFORM;
  const splitsOverlay = sel.splitsTransform ?? DEFAULT_SPLITS_TRANSFORM;
  const chartTransform = (kind: PhotoChartKind) =>
    sel.chartTransforms?.[kind] ?? DEFAULT_CHART_TRANSFORMS[kind];

  const previewSplits = useMemo(() => filterVisibleSplits(activeSplits), [activeSplits]);
  const splitsOnPhoto = sel.splits && previewSplits.length > 0;
  const splitsLayout = photoSplitsLayout(previewSplits.length);

  const chartSeries = useMemo(() => {
    const rows = data.chartData || [];
    const pick = (get: (d: typeof rows[number]) => number | undefined) =>
      rows.map(get).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v !== 0);
    return {
      pace: pick((d) => d.pace),
      hr: pick((d) => d.heartrate),
      altitude: rows
        .map((d) => d.altitude)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
    };
  }, [data.chartData]);

  const chartsOnPhoto = ([
    { kind: "pace", label: t("PACE", "配速"), values: chartSeries.pace, invert: true },
    { kind: "hr", label: t("HEART RATE", "心率"), values: chartSeries.hr, invert: false },
    { kind: "altitude", label: t("ELEVATION", "海拔"), values: chartSeries.altitude, invert: false },
  ] as Array<{ kind: PhotoChartKind; label: string; values: number[]; invert: boolean }>).filter(
    (c) => sel.charts[c.kind] && c.values.length >= 2,
  );

  const overlayKeys: OverlayKey[] = [
    "stats",
    ...(splitsOnPhoto ? (["splits"] as OverlayKey[]) : []),
    ...chartsOnPhoto.map((c) => `chart:${c.kind}` as OverlayKey),
  ];

  useEffect(() => {
    if (!overlayKeys.includes(activeOverlay)) setActiveOverlay("stats");
  }, [overlayKeys.join(","), activeOverlay]);

  const transformOf = (key: OverlayKey): OverlayTransform => {
    const kind = chartKindOf(key);
    if (kind) return chartTransform(kind);
    return key === "splits" ? splitsOverlay : statsOverlay;
  };
  const defaultOf = (key: OverlayKey): OverlayTransform => {
    const kind = chartKindOf(key);
    if (kind) return DEFAULT_CHART_TRANSFORMS[kind];
    return key === "splits" ? DEFAULT_SPLITS_TRANSFORM : DEFAULT_STATS_TRANSFORM;
  };
  const activeTransform = transformOf(activeOverlay);

  const setOverlay = (key: OverlayKey, next: Partial<OverlayTransform>) =>
    setSel((s) => {
      const kind = chartKindOf(key);
      if (kind) {
        const prev = s.chartTransforms?.[kind] ?? DEFAULT_CHART_TRANSFORMS[kind];
        return { ...s, chartTransforms: { ...s.chartTransforms, [kind]: { ...prev, ...next } } };
      }
      if (key === "splits") {
        return { ...s, splitsTransform: { ...(s.splitsTransform ?? DEFAULT_SPLITS_TRANSFORM), ...next } };
      }
      return { ...s, overlayTransform: { ...(s.overlayTransform ?? DEFAULT_STATS_TRANSFORM), ...next } };
    });
  const setActive = (next: Partial<OverlayTransform>) => setOverlay(activeOverlay, next);

  /** Half size of an overlay as a fraction of the card, used for clamping. */
  const halfFractions = (key: OverlayKey) => {
    const tf = transformOf(key);
    const scale = Math.max(0.65, Math.min(1.15, tf.scale));
    if (chartKindOf(key)) {
      return { hx: ((PHOTO_CHART_W * scale) / PHOTO_CARD_W) / 2, hy: ((PHOTO_CHART_H * scale) / 1350) / 2 };
    }
    if (key === "splits") {
      const s = scale * splitsLayout.fit;
      return {
        hx: ((splitsLayout.blockW * s) / PHOTO_CARD_W) / 2,
        hy: ((splitsLayout.blockH * s) / 1350) / 2,
      };
    }
    return { hx: 0.36 * scale, hy: 0.14 * scale };
  };

  const moveOverlay = (key: OverlayKey, clientX: number, clientY: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { hx, hy } = halfFractions(key);
    const minX = Math.min(0.5, hx + 0.025);
    const minY = Math.min(0.5, 0.14 + hy);
    const maxY = Math.max(0.5, 0.98 - hy);
    const x = Math.max(minX, Math.min(1 - minX, (clientX - rect.left) / rect.width));
    const y = Math.max(minY, Math.min(maxY, (clientY - rect.top) / rect.height));
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

  const toggleStat = (k: keyof CustomShareSelections["stats"]) =>
    setSel((s) => ({ ...s, stats: { ...s.stats, [k]: !s.stats[k] } }));
  const toggleChart = (k: keyof CustomShareSelections["charts"]) =>
    setSel((s) => ({ ...s, charts: { ...s.charts, [k]: !s.charts[k] } }));

  const handleGenerate = async () => {
    setSubmitting(true);
    try {
      await shareCustom({ ...data, splits: activeSplits, photoUrl, selections: sel });
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
      const current = transformOf(key);
      const step = event.shiftKey ? 0.05 : 0.02;
      if (event.key === "ArrowLeft") setOverlay(key, { x: Math.max(0.1, current.x - step) });
      else if (event.key === "ArrowRight") setOverlay(key, { x: Math.min(0.9, current.x + step) });
      else if (event.key === "ArrowUp") setOverlay(key, { y: Math.max(0.14, current.y - step) });
      else if (event.key === "ArrowDown") setOverlay(key, { y: Math.min(0.96, current.y + step) });
      else return;
      event.preventDefault();
    },
  });

  const blockClass = (key: OverlayKey) =>
    `absolute touch-none cursor-move rounded-md text-background [text-shadow:0_1px_6px_rgba(0,0,0,0.75)] ${
      activeOverlay === key ? "ring-1 ring-background/70" : "ring-0"
    }`;

  const overlayLabel = (key: OverlayKey) => {
    const kind = chartKindOf(key);
    if (kind === "pace") return t("Pace chart", "配速圖");
    if (kind === "hr") return t("HR chart", "心率圖");
    if (kind === "altitude") return t("Elev chart", "海拔圖");
    return key === "splits" ? t("Splits", "分段") : t("Stats", "數據");
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
                      "Tap a block to select it, drag to move it, and use the slider to resize. Long split lists shrink automatically to fit.",
                      "點選一個區塊即可選取，拖曳可移動，滑桿可調整大小。分段太長時會自動縮小以完整顯示。",
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
                          className={`${blockClass("stats")} w-[70%] p-1`}
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

                        {splitsOnPhoto && (
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={t("Drag to move splits", "拖曳以移動分段")}
                            className={blockClass("splits")}
                            style={{
                              left: `${splitsOverlay.x * 100}%`,
                              top: `${splitsOverlay.y * 100}%`,
                              width: splitsLayout.blockW,
                              height: splitsLayout.blockH,
                              transform: `translate(-50%, -50%) scale(${f * splitsLayout.fit * splitsOverlay.scale})`,
                            }}
                            {...dragHandlers("splits")}
                          >
                            <div
                              className="flex font-semibold uppercase opacity-75"
                              style={{ fontSize: 22, lineHeight: `${splitsLayout.headH}px` }}
                            >
                              <span className="flex-1">{t("Split", "分段")}</span>
                              <span style={{ width: 120, textAlign: "right" }}>{t("Pace", "配速")}</span>
                              <span style={{ width: 100, textAlign: "right" }}>HR</span>
                            </div>
                            {previewSplits.map((s, i) => (
                              <div
                                key={i}
                                className="flex items-baseline font-bold"
                                style={{ fontSize: 32, height: splitsLayout.rowH, lineHeight: `${splitsLayout.rowH}px` }}
                              >
                                <span className="flex-1">
                                  {((s.distance || 0) / 1000).toFixed((s.distance || 0) % 1000 === 0 ? 0 : 2)} km
                                </span>
                                <span className="font-display" style={{ width: 120, textAlign: "right" }}>
                                  {s.average_speed > 0 ? formatPreviewPace(s.average_speed) : "--"}
                                </span>
                                <span className="opacity-90" style={{ width: 100, textAlign: "right" }}>
                                  {s.average_heartrate ? Math.round(s.average_heartrate) : "--"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {chartsOnPhoto.map((c) => {
                          const tf = chartTransform(c.kind);
                          const min = Math.min(...c.values);
                          const max = Math.max(...c.values);
                          const span = Math.max(max - min, 1e-6);
                          const plotY = 46;
                          const plotH = PHOTO_CHART_H - plotY - 10;
                          const pts = c.values
                            .map((v, i) => {
                              const x = (i / (c.values.length - 1)) * PHOTO_CHART_W;
                              const norm = (v - min) / span;
                              const y = plotY + (c.invert ? norm : 1 - norm) * plotH;
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            })
                            .join(" ");
                          return (
                            <div
                              key={c.kind}
                              role="button"
                              tabIndex={0}
                              aria-label={t("Drag to move chart", "拖曳以移動圖表")}
                              className={blockClass(`chart:${c.kind}` as OverlayKey)}
                              style={{
                                left: `${tf.x * 100}%`,
                                top: `${tf.y * 100}%`,
                                width: PHOTO_CHART_W,
                                height: PHOTO_CHART_H,
                                transform: `translate(-50%, -50%) scale(${f * tf.scale})`,
                              }}
                              {...dragHandlers(`chart:${c.kind}` as OverlayKey)}
                            >
                              <div className="font-semibold uppercase opacity-80" style={{ fontSize: 24, lineHeight: "34px" }}>
                                {c.label}
                              </div>
                              <svg
                                width={PHOTO_CHART_W}
                                height={PHOTO_CHART_H}
                                viewBox={`0 0 ${PHOTO_CHART_W} ${PHOTO_CHART_H}`}
                                className="absolute inset-0"
                              >
                                <polygon
                                  points={`0,${plotY + plotH} ${pts} ${PHOTO_CHART_W},${plotY + plotH}`}
                                  fill="rgba(255,255,255,0.18)"
                                />
                                <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={5} strokeLinejoin="round" />
                              </svg>
                            </div>
                          );
                        })}
                      </div>

                      {overlayKeys.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                          {overlayKeys.map((key) => (
                            <Button
                              key={key}
                              type="button"
                              variant={activeOverlay === key ? "default" : "outline"}
                              size="sm"
                              onClick={() => setActiveOverlay(key)}
                            >
                              {overlayLabel(key)}
                            </Button>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">
                            {overlayLabel(activeOverlay)} · {t("size", "大小")}
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
                          onClick={() => setActive(defaultOf(activeOverlay))}
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
            {sel.splits && splitOptions.length > 1 && (
              <div className="ml-6 mb-1 flex flex-wrap gap-1.5">
                {splitOptions.map((o) => (
                  <Button
                    key={o.mode}
                    type="button"
                    size="sm"
                    variant={splitsMode === o.mode ? "default" : "outline"}
                    onClick={() => setSplitsMode(o.mode)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            )}
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

function formatPreviewTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatPreviewPace(speedMps: number) {
  if (!speedMps || speedMps <= 0) return "--";
  const secPerKm = 1000 / speedMps;
  const minutes = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
