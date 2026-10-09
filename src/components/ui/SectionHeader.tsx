import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * SectionHeader — one header treatment instead of the three-to-five that
 * coexisted (font-display uppercase caption vs font-display sm vs plain sm
 * medium vs a fourth sub-hub variant).
 */
export interface SectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned slot: a button, filter, or "see all" link. */
  action?: ReactNode;
  /** `eyebrow` is the small uppercase label; `title` is a real heading. */
  variant?: "title" | "eyebrow";
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  variant = "title",
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
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
          <p className="mt-1 text-label text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default SectionHeader;
