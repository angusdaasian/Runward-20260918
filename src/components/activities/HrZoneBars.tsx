import { Lang } from "@/lib/i18n";
import { ZonePct, ZONE_LABELS } from "@/lib/hrZones";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  zones: ZonePct;
  lang: Lang;
  title?: string;
  subtitle?: string;
  onEdit?: () => void;
}

const HrZoneBars = ({ zones, lang, title, subtitle, onEdit }: Props) => {
  const fmtMin = (totalPct: number, totalSeconds?: number) => {
    if (!totalSeconds) return `${totalPct.toFixed(0)}%`;
    const sec = Math.round((totalPct / 100) * totalSeconds);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="bg-card text-card-foreground rounded-2xl p-5 shadow-sm ring-1 ring-border">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display font-bold text-sm">
            {title ?? (lang === "zh" ? "心率區間" : "Heart Rate Zones")}
          </h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {onEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="shrink-0 h-8 px-2.5 gap-1 text-[11px] text-muted-foreground"
            aria-label={lang === "zh" ? "編輯心率" : "Edit heart rate"}
          >
            <Pencil size={11} />
            {lang === "zh" ? "編輯" : "Edit"}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {ZONE_LABELS.map((z) => {
          const pct = zones[z.key];
          return (
            <div key={z.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 min-h-7">
              <div className="text-[11px] font-semibold text-foreground">
                {lang === "zh" ? z.labelZh : z.label}
              </div>
              <div className="h-4 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                    backgroundColor: z.color,
                  }}
                />
              </div>
              <div className="text-right text-[11px] font-mono font-semibold text-foreground tabular-nums">
                {pct.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HrZoneBars;
