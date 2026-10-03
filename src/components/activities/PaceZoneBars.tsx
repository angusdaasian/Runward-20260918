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
  if (slow == null || fast == null) return "—";
  return `${fmtPace(slow)}–${fmtPace(fast)}`;
};

const PaceZoneBars = ({ lang, zones, time, title, subtitle }: Props) => {
  const zh = lang === "zh";
  const total = time ? ZONE_KEYS.reduce((s, k) => s + time[k], 0) : 0;
  return (
    <div className="bg-card text-card-foreground rounded-2xl p-5 shadow-sm ring-1 ring-border">
      <div className="mb-3">
        <h3 className="font-display font-bold text-sm">{title ?? (zh ? "配速區間" : "Pace Zones")}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {subtitle ?? (zh ? `根據所有可用紀錄 · ${zones.runCount} 次跑步` : `All available history · ${zones.runCount} runs`)}
        </p>
      </div>
      <div className="space-y-2">
        {ZONE_LABELS.map((z) => {
          const k = z.key as ZoneKey;
          const pct = time && total > 0 ? (time[k] / total) * 100 : null;
          return (
            <div key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 min-h-10">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold">{zh ? z.labelZh : z.label}</div>
                <div className="text-[10px] text-muted-foreground font-mono tabular-nums leading-tight">{rangeLabel(zones, k)} /km</div>
              </div>
              {pct != null ? (
                <>
                  <div className="h-4 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, backgroundColor: z.color }} />
                  </div>
                  <div className="text-right text-[11px] font-mono font-semibold tabular-nums">
                    {fmtDur(time?.[k] ?? 0)}
                    <div className="text-[10px] text-muted-foreground font-normal">{pct.toFixed(0)}%</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-4 rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-full rounded-full opacity-80" style={{ backgroundColor: z.color }} />
                  </div>
                  <div className="text-right text-[11px] font-mono font-semibold tabular-nums leading-tight">
                    {fmtPace(zones.pace[k])}
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {zones.samples[k] === 0 ? (zh ? "估算 /km" : "est. /km") : "/km"}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PaceZoneBars;
