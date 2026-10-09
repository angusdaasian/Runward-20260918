import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SectionHeader — one header treatment instead of the three-to-five that
 * coexisted (font-display uppercase caption vs font-display sm vs plain sm
 * medium vs a fourth sub-hub variant).
 *
 * Hierarchy comes from size, weight and an optional leading icon — never from
 * uppercase tracking alone, which is a no-op for 繁體中文 and therefore cannot
 * carry meaning in the Chinese UI.
 */
export interface SectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Leading icon. */
  icon?: LucideIcon;
  /** Trailing slot: a legend, filter, or action. */
  action?: ReactNode;
  /** `eyebrow` is a small uppercase label; `title` is a real heading. */
  variant?: "title" | "eyebrow";
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  action,
  variant = "title",
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-2">
        {Icon ? (
          <Icon
            size={16}
            className={cn(
              "mt-0.5 shrink-0",
              variant === "eyebrow" ? "text-muted-foreground" : "text-primary"
            )}
          />
        ) : null}
        <div className="min-w-0">
          <h2
            className={cn(
              "font-display text-foreground",
              variant === "eyebrow"
                ? "text-caption font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                : "text-h3 font-semibold"
            )}
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-caption text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default SectionHeader;
