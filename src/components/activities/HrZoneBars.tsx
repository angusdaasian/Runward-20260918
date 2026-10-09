import { Lang } from "@/lib/i18n";
import { ZonePct } from "@/lib/hrZones";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { ZoneBars } from "@/components/ui/ZoneBars";

interface Props {
  zones: ZonePct;
  lang: Lang;
  title?: string;
  subtitle?: string;
  onEdit?: () => void;
}

const HrZoneBars = ({ zones, lang, title, subtitle, onEdit }: Props) => {
  return (
    <SurfaceCard>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-h3 font-semibold text-card-foreground">
            {title ?? (lang === "zh" ? "心率區間" : "Heart Rate Zones")}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-caption text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {onEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="h-8 shrink-0 gap-1 px-2.5 text-caption text-muted-foreground"
            aria-label={lang === "zh" ? "編輯心率" : "Edit heart rate"}
          >
            <Pencil size={11} />
            {lang === "zh" ? "編輯" : "Edit"}
          </Button>
        )}
      </div>
      <ZoneBars zones={zones} variant="hr" lang={lang} />
    </SurfaceCard>
  );
};

export default HrZoneBars;
