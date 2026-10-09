import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ZONE_LABELS, ZONE_CLASSES, type ZonePct } from "@/lib/hrZones";

/**
 * ZoneBars — one zone chart.
 *
 * Four renderings of the same ZONE_LABELS existed (HrZoneBars, the
 * dark-mode-broken HrZonesWeekCard, PaceZoneBars, plus a micro version in
 * WidgetTilePreview) across three different card shells and two value
 * formats. This is the single replacement, driven by the --zone-N tokens.
 */
export interface ZoneBarsProps {
  zones: ZonePct | null | undefined;
  /** Which metric the zones describe; affects the empty-state copy. */
  variant?: "hr" | "pace";
  lang?: "en" | "zh";
  /** Denser rows for widget/card previews. */
  dense?: boolean;
  /** Override the right-hand value, e.g. duration in zone instead of %. */
  valueFor?: (key: keyof ZonePct, pct: number) => ReactNode;
  className?: string;
}

export function ZoneBars({
  zones,
  variant = "hr",
  lang = "en",
  dense,
  valueFor,
  className,
}: ZoneBarsProps) {
  if (!zones) {
    return (
      <p className={cn("text-label text-muted-foreground", className)}>
        {variant === "hr"
          ? lang === "zh"
            ? "此活動沒有心率資料"
            : "No heart-rate data for this activity"
          : lang === "zh"
            ? "此活動沒有配速區間資料"
            : "No pace-zone data for this activity"}
      </p>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {ZONE_LABELS.map((z, i) => {
        const pct = zones[z.key] ?? 0;
        const clamped = Math.max(0, Math.min(100, pct));
        // Keep a sliver visible for small non-zero shares.
        const width = clamped > 0 ? Math.max(clamped, 2) : 0;
        return (
          <div key={z.key} className="flex items-center gap-2.5">
            <span
              className={cn(
                "shrink-0 truncate text-caption text-muted-foreground",
                dense ? "w-14" : "w-[5.5rem]"
              )}
            >
              {lang === "zh" ? z.labelZh : z.label}
            </span>
            <div
              className={cn(
                "min-w-0 flex-1 overflow-hidden rounded-full bg-muted",
                dense ? "h-1.5" : "h-2"
              )}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500 ease-out",
                  ZONE_CLASSES[i]
                )}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="tnum w-11 shrink-0 text-right text-caption font-semibold text-foreground">
              {valueFor ? valueFor(z.key, pct) : `${Math.round(pct)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default ZoneBars;
