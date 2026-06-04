import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ChevronRight, Lock, Sparkles } from "lucide-react";

interface WidgetTileProps {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
  accent?: string; // tailwind ring/bg accent class
  premiumOnly?: boolean;
  locked?: boolean; // fully masked + non-clickable
  readonly?: boolean; // non-clickable stat-only tile
  lang?: "en" | "zh";
}

/**
 * A single Suunto-style square widget tile. Click opens a detail dialog.
 */
const WidgetTile = ({ title, subtitle, icon, onClick, children, accent, premiumOnly, locked, readonly, lang }: WidgetTileProps) => {
  const nonInteractive = locked || readonly;
  return (
    <button
      type="button"
      onClick={nonInteractive ? undefined : onClick}
      disabled={nonInteractive}
      aria-disabled={nonInteractive}
      className={`block text-left w-full focus:outline-none ${nonInteractive ? "" : "focus:ring-2 focus:ring-primary/40"} rounded-2xl ${
        locked ? "cursor-not-allowed" : readonly ? "cursor-default" : ""
      }`}
    >
      <Card className={`relative p-3.5 h-full min-h-[148px] rounded-2xl border-border/60 ${
        nonInteractive ? "" : "hover:border-primary/40 active:scale-[0.98]"
      } transition-all overflow-hidden ${accent ?? ""}`}>
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0">
            <div className="font-semibold text-sm text-foreground leading-tight truncate">{title}</div>
            {subtitle && (
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</div>
            )}
          </div>
          <div className="shrink-0 ml-2">{icon}</div>
        </div>
        <div className={`text-foreground ${locked ? "blur-sm select-none pointer-events-none" : ""}`}>
          {children}
        </div>
        {!nonInteractive && (
          <ChevronRight size={14} className="absolute bottom-2 right-2 text-muted-foreground/40" />
        )}
        {premiumOnly && !locked && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-warning/15 text-warning text-[9px] font-bold uppercase tracking-wide">
            <Lock size={9} />
            Premium
          </div>
        )}
        {locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/70 backdrop-blur-sm rounded-2xl">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-warning/15 text-warning text-[10px] font-bold uppercase tracking-wide">
              <Sparkles size={10} />
              Premium
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground text-center px-3">
              {lang === "zh" ? "升級以解鎖" : "Upgrade to unlock"}
            </p>
          </div>
        )}
      </Card>
    </button>
  );
};

export default WidgetTile;
