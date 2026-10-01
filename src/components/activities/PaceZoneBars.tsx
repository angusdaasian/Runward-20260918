import { Lang } from "@/lib/i18n";
import { ZONE_LABELS } from "@/lib/hrZones";
import { fmtPace, PaceZones, ZONE_KEYS, ZoneKey } from "@/lib/paceZones";

interface Props {
  lang: Lang;
  zones: PaceZones;
  /** Seconds per zone for one activity; omit to show the zone table only. */
  time?: Record<ZoneKey, number> | null;
  title?: string;
  subtitle?: string;
}

const fmtDur = (s: number) => {
  const r = Math.round(s);
  const h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60), sec = r % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

const rangeLabel = (zones: PaceZones, k: ZoneKey) => {
  const i = ZONE_KEYS.indexOf(k);
  const fast = zones.fastBound[k];
  const slow = i > 0 ? zones.fastBound[ZONE_KEYS[i - 1]] : null;
  if (slow == null && fast != null) return `> ${fmtPace(fast)}`;
  if (fast == null && slow != null) return `< ${fmtPace(slow)}`;
  return `${fmtPace(slow!)}–${fmtPace(fast!)}`;
};

const PaceZoneBars = ({ lang, zones, time, title, subtitle }: Props) => {
  const zh = lang === "zh";
  const total = time ? ZONE_KEYS.reduce((s, k) => s + time[k], 0) : 0;
  return (
    <div className="bg-card text-card-foreground rounded-2xl p-5 shadow-sm ring-1 ring-border">
      <div className="mb-3">
        <h3 className="font-display font-bold text-sm">{title ?? (zh ? "配速區間" : "Pace Zones")}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {subtitle ?? (zh ? `根據近 90 天 ${zones.runCount} 次跑步的心率與配速` : `From your heart rate and pace over ${zones.runCount} runs in the last 90 days`)}
        </p>
      </div>
      <div className="space-y-2">
        {ZONE_LABELS.map((z) => {
          const k = z.key as ZoneKey;
          const pct = time && total > 0 ? (time[k] / total) * 100 : null;
          return (
            <div key={k} className="flex items-center gap-3">
              <div className="w-20 shrink-0">
                <div className="text-[11px] font-semibold">{zh ? z.labelZh : z.label}</div>
                <div className="text-[10px] text-muted-foreground font-mono tabular-nums">{rangeLabel(zones, k)} /km</div>
              </div>
              {pct != null ? (
                <>
                  <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, backgroundColor: z.color }} />
                  </div>
                  <div className="w-16 text-right text-[11px] font-mono font-semibold tabular-nums">
                    {fmtDur(time![k])}
                    <div className="text-[10px] text-muted-foreground font-normal">{pct.toFixed(0)}%</div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-between">
                  <div className="h-2 flex-1 mr-3 rounded-full" style={{ backgroundColor: z.color, opacity: 0.8 }} />
                  <div className="text-xs font-mono font-semibold tabular-nums">
                    {fmtPace(zones.pace[k])} /km
                    {zones.samples[k] === 0 && <span className="ml-1 text-[10px] text-muted-foreground font-normal">{zh ? "(估算)" : "(est.)"}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PaceZoneBars;
