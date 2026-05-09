import { Lang } from "@/lib/i18n";
import { ZonePct, ZONE_LABELS } from "@/lib/hrZones";
import { Pencil } from "lucide-react";

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
    <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.15)] ring-1 ring-slate-200/70">
      <div className="mb-3">
        <h3 className="font-display font-bold text-slate-900 text-sm">
          {title ?? (lang === "zh" ? "心率區間" : "Heart Rate Zones")}
        </h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-2">
        {ZONE_LABELS.map((z) => {
          const pct = zones[z.key];
          return (
            <div key={z.key} className="flex items-center gap-3">
              <div className="w-20 text-[11px] font-semibold text-slate-700 shrink-0">
                {lang === "zh" ? z.labelZh : z.label}
              </div>
              <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                    backgroundColor: z.color,
                  }}
                />
              </div>
              <div className="w-10 text-right text-[11px] font-mono font-semibold text-slate-700 tabular-nums">
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
