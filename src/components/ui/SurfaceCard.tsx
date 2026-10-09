import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * SurfaceCard — the single card shell.
 *
 * Replaces the seven hand-rolled "card" recipes that coexisted (border-only,
 * ring-only, border/40, bespoke shadow-[...], gradient, plain). Every card in
 * the app should resolve to one of these variants so a change propagates.
 */
export type SurfaceVariant = "surface" | "flat" | "stat" | "plain";

const VARIANTS: Record<SurfaceVariant, string> = {
  /** Default raised card on the page background. */
  surface: "bg-card border border-border shadow-card",
  /** Same surface without elevation — for nesting inside another card. */
  flat: "bg-card border border-border",
  /** Recessed metric cell (label + number), no elevation. */
  stat: "bg-surface-2 border border-border/60",
  /** No chrome at all — for grid wrappers that strip child styling. */
  plain: "bg-transparent",
};

export interface SurfaceCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  /** Adds hover affordance for tappable cards. */
  interactive?: boolean;
  /** Removes default padding when the card manages its own layout. */
  bare?: boolean;
}

const SurfaceCard = forwardRef<HTMLDivElement, SurfaceCardProps>(
  ({ className, variant = "surface", interactive, bare, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl",
        VARIANTS[variant],
        !bare && "p-4",
        interactive &&
          "transition-colors transition-shadow hover:border-primary/40 hover:shadow-raised active:scale-[0.995]",
        className
      )}
      {...props}
    />
  )
);
SurfaceCard.displayName = "SurfaceCard";

export { SurfaceCard };
export default SurfaceCard;
