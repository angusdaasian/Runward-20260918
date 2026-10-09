import { Lang } from "@/lib/i18n";
import { ZONE_LABELS, ZONE_CLASSES, ZONE_ORDER } from "@/lib/hrZones";
import { fmtPace, PaceZones, ZONE_KEYS, ZoneKey } from "@/lib/paceZones";
import { SurfaceCard } from "@/components/ui/SurfaceCard";

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
    <SurfaceCard>
      <div className="mb-3">
        <h3 className="font-display text-h3 font-semibold text-card-foreground">
          {title ?? (zh ? "配速區間" : "Pace Zones")}
        </h3>
        <p className="mt-0.5 text-caption text-muted-foreground">
          {subtitle ?? (zh ? `根據所有可用紀錄 · ${zones.runCount} 次跑步` : `All available history · ${zones.runCount} runs`)}
        </p>
      </div>
      <div className="space-y-2">
        {ZONE_LABELS.map((z, i) => {
          const k = z.key as ZoneKey;
          const pct = time && total > 0 ? (time[k] / total) * 100 : null;
          return (
            <div key={k} className="grid min-h-10 grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {/* Colour carried by a dot so the track is never a fake bar. */}
                  <span className={`h-2 w-2 shrink-0 rounded-[2px] ${ZONE_CLASSES[i]}`} aria-hidden />
                  <div className="truncate text-caption font-semibold text-foreground">
                    {zh ? z.labelZh : z.label}
                  </div>
                </div>
                <div className="tnum mt-0.5 text-caption leading-tight text-muted-foreground">
                  {rangeLabel(zones, k)} /km
                </div>
              </div>

              {pct != null ? (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ease-out ${ZONE_CLASSES[i]}`}
                      style={{ width: `${pct > 0 ? Math.max(pct, 2) : 0}%` }}
                    />
                  </div>
                  <div className="tnum text-right text-caption font-semibold tabular-nums text-foreground">
                    {fmtDur(time?.[k] ?? 0)}
                    <div className="text-caption font-normal text-muted-foreground">
                      {pct.toFixed(0)}%
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* No distribution data for this activity — show an empty
                      track rather than a full-width bar that encodes nothing. */}
                  <div className="h-2 rounded-full bg-muted/60" />
                  <div className="tnum text-right text-caption font-semibold leading-tight text-foreground">
                    {fmtPace(zones.pace[k])}
                    <div className="text-caption font-normal text-muted-foreground">
                      {zones.samples[k] === 0 ? (zh ? "估算 /km" : "est. /km") : "/km"}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </SurfaceCard>
  );
};

export default PaceZoneBars;
