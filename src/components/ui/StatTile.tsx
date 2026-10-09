import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SurfaceCard } from "./SurfaceCard";
import { DeltaChip } from "./DeltaChip";

/**
 * StatTile — the single metric tile.
 *
 * Eight near-identical implementations existed (AnalyticsTopSummary's
 * `KpiCell`, DashboardTraining's `KPICard`, HealthStatsCard's `Stat`,
 * HRVReadinessCard's `Stat`, WidgetTilePreview's `Big`, DashboardOverview,
 * DashboardActivityDetail, MonthlyStatsCard) at three different value sizes.
 * The Kinetic hero tier is the `hero` size.
 */
export type StatTone =
  | "default"
  | "primary"
  | "muted"
  | "hr"
  | "load"
  | "elevation"
  | "cadence"
  | "pace"
  | "success"
  | "warning";

const TONES: Record<StatTone, string> = {
  default: "text-foreground",
  primary: "text-primary",
  muted: "text-muted-foreground",
  hr: "text-hr",
  load: "text-load",
  elevation: "text-elevation",
  cadence: "text-cadence",
  pace: "text-pace",
  success: "text-success",
  warning: "text-warning",
};

const SIZES = {
  hero: "text-num-hero",
  lg: "text-num-lg",
  md: "text-num-md",
  sm: "text-num-sm",
} as const;

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** Secondary line under the number. */
  sub?: ReactNode;
  size?: keyof typeof SIZES;
  tone?: StatTone;
  icon?: LucideIcon;
  /** Trend vs the previous period; renders a DeltaChip. */
  trend?: { pct: number | null | undefined; higherIsBetter?: boolean };
  variant?: "surface" | "flat" | "stat";
  className?: string;
  valueClassName?: string;
}

export function StatTile({
  label,
  value,
  unit,
  sub,
  size = "md",
  tone = "default",
  icon: Icon,
  trend,
  variant = "stat",
  className,
  valueClassName,
}: StatTileProps) {
  return (
    <SurfaceCard variant={variant} className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-caption font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </span>
        {Icon ? <Icon size={14} className="shrink-0 text-muted-foreground" /> : null}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            "tnum font-display font-bold leading-none",
            SIZES[size],
            TONES[tone],
            valueClassName
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-label font-medium text-muted-foreground">{unit}</span>
        ) : null}
      </div>

      {sub || trend ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {trend ? (
            <DeltaChip pct={trend.pct} higherIsBetter={trend.higherIsBetter} />
          ) : null}
          {sub ? (
            <span className="text-caption text-muted-foreground">{sub}</span>
          ) : null}
        </div>
      ) : null}
    </SurfaceCard>
  );
}

export default StatTile;
