import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ChevronRight, Lock } from "lucide-react";

interface WidgetTileProps {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
  accent?: string; // tailwind ring/bg accent class
  premiumOnly?: boolean;
  lang?: "en" | "zh";
}

/**
 * A single Suunto-style square widget tile. Click opens a detail dialog.
 */
const WidgetTile = ({ title, subtitle, icon, onClick, children, accent, premiumOnly, lang }: WidgetTileProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block text-left w-full focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-2xl"
    >
      <Card className={`relative p-3.5 h-full min-h-[148px] rounded-2xl border-border/60 hover:border-primary/40 active:scale-[0.98] transition-all ${accent ?? ""}`}>
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0">
            <div className="font-semibold text-sm text-foreground leading-tight truncate">{title}</div>
            {subtitle && (
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</div>
            )}
          </div>
          <div className="shrink-0 ml-2">{icon}</div>
        </div>
        <div className="text-foreground">{children}</div>
        <ChevronRight size={14} className="absolute bottom-2 right-2 text-muted-foreground/40" />
        {premiumOnly && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-warning/15 text-warning text-[9px] font-bold uppercase tracking-wide">
            <Lock size={9} />
            {lang === "zh" ? "Premium" : "Premium"}
          </div>
        )}
      </Card>
    </button>
  );
};

export default WidgetTile;
