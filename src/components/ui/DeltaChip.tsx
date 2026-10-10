import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DeltaChip — one trend indicator.
 *
 * The audit found four incompatible delta treatments: an arrow+chip
 * (TrendsCard), bare coloured text with no arrow (AnalyticsTopSummary), a
 * 10px inline suffix (HRVReadinessCard) and raw ↑/↓ glyphs
 * (TrainingLoadChart). This is the single replacement.
 */
export interface DeltaChipProps {
  /** Percent change. Sign is meaningful. */
  pct: number | null | undefined;
  /** Whether an increase is good. Default true (distance, volume). */
  higherIsBetter?: boolean;
  /** Appended after the percentage, e.g. "vs last wk". */
  suffix?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

export function DeltaChip({
  pct,
  higherIsBetter = true,
  suffix,
  size = "sm",
  className,
}: DeltaChipProps) {
  if (pct == null || !isFinite(pct)) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground",
          size === "sm" ? "px-2 py-0.5 text-caption" : "px-2.5 py-1 text-label",
          className
        )}
      >
        <Minus size={12} strokeWidth={2.5} />
        <span className="tnum">—</span>
        {suffix ? <span className="opacity-70">{suffix}</span> : null}
      </span>
    );
  }

  const flat = Math.abs(pct) < 0.5;
  const good = higherIsBetter ? pct > 0 : pct < 0;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full",
        size === "sm" ? "px-2 py-0.5 text-caption" : "px-2.5 py-1 text-label",
        flat
          ? "bg-muted text-muted-foreground"
          : good
            ? "bg-success/12 text-success"
            : "bg-destructive/12 text-destructive",
        className
      )}
    >
      <Icon size={12} strokeWidth={2.5} />
      <span className="tnum font-semibold">
        {pct > 0 ? "+" : ""}
        {Math.round(pct)}%
      </span>
      {suffix ? <span className="opacity-70">{suffix}</span> : null}
    </span>
  );
}

export default DeltaChip;
