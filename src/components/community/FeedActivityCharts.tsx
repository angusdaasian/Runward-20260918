import { useMemo } from "react";
import type { Lang } from "@/lib/i18n";

interface TimedSample { t?: number; [k: string]: unknown }

interface Props {
  hrSamples: Array<{ t?: number; bpm?: number | null }> | null;
  distanceSamples: Array<{ t?: number; d?: number | null }> | null;
  elevationSamples: Array<{ t?: number; e?: number | null }> | null;
  lang: Lang;
}

const MAX_POINTS = 120;

/** Keep at most MAX_POINTS evenly spaced points from a series. */
function downsample<T>(arr: T[]): T[] {
  if (arr.length <= MAX_POINTS) return arr;
  const step = arr.length / MAX_POINTS;
  const out: T[] = [];
  for (let i = 0; i < MAX_POINTS; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

function toSeries(samples: TimedSample[] | null | undefined, key: string): Array<{ t: number; v: number }> {
  if (!Array.isArray(samples)) return [];
  return downsample(
    samples
      .filter((s) => typeof s?.t === "number" && typeof s?.[key] === "number")
      .map((s) => ({ t: Number(s.t), v: Number(s[key]) }))
      .sort((a, b) => a.t - b.t),
  );
}

/** Pace (sec/km) per sample, smoothed over a ~20s trailing window. */
function paceSeries(distance: Array<{ t?: number; d?: number | null }> | null): Array<{ t: number; v: number }> {
  const pts = toSeries(distance, "d");
  if (pts.length < 10) return [];
  const out: Array<{ t: number; v: number }> = [];
  for (let i = 0; i < pts.length; i++) {
    // find a sample ~20s earlier
    let j = i;
    while (j > 0 && pts[i].t - pts[j].t < 20) j--;
    const dt = pts[i].t - pts[j].t;
    const dd = pts[i].v - pts[j].v;
    if (dt < 8 || dd <= 1) continue;
    const secPerKm = dt / (dd / 1000);
    // drop walking-stops / GPS spikes
    if (secPerKm < 120 || secPerKm > 900) continue;
    out.push({ t: pts[i].t, v: secPerKm });
  }
  return downsample(out);
}

const paceText = (secPerKm: number) =>
  `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")}`;

function Chart({ series, title, unit, format, invert = false }: {
  series: Array<{ t: number; v: number }>;
  title: string;
  unit: string;
  format: (v: number) => string;
  invert?: boolean;
}) {
  const W = 320;
  const H = 80;
  const PAD = 4;
  const { path, area, min, max } = useMemo(() => {
    const values = series.map((s) => s.v);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    const x = (i: number) => PAD + (i / Math.max(1, series.length - 1)) * (W - PAD * 2);
    const rawY = (v: number) => PAD + ((v - lo) / span) * (H - PAD * 2);
    const y = (v: number) => (invert ? rawY(v) : H - rawY(v) + PAD);
    const pts = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.v).toFixed(1)}`);
    return {
      path: pts.join(" "),
      area: `${pts.join(" ")} L${x(series.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`,
      min: lo,
      max: hi,
    };
  }, [series, invert]);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {format(min)}–{format(max)} {unit}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-20 w-full text-primary" preserveAspectRatio="none" aria-hidden="true">
        <path d={area} fill="currentColor" opacity={0.15} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function FeedActivityCharts({ hrSamples, distanceSamples, elevationSamples, lang }: Props) {
  const zh = lang === "zh";
  const hr = useMemo(() => toSeries(hrSamples, "bpm"), [hrSamples]);
  const elev = useMemo(() => toSeries(elevationSamples, "e"), [elevationSamples]);
  const pace = useMemo(() => paceSeries(distanceSamples), [distanceSamples]);

  if (hr.length < 10 && elev.length < 10 && pace.length < 5) return null;

  return (
    <div className="space-y-3">
      {pace.length >= 5 && (
        <Chart
          series={pace}
          title={zh ? "配速" : "Pace"}
          unit="/km"
          format={paceText}
          invert
        />
      )}
      {hr.length >= 10 && (
        <Chart
          series={hr}
          title={zh ? "心率" : "Heart rate"}
          unit="bpm"
          format={(v) => String(Math.round(v))}
        />
      )}
      {elev.length >= 10 && (
        <Chart
          series={elev}
          title={zh ? "海拔" : "Elevation"}
          unit="m"
          format={(v) => String(Math.round(v))}
        />
      )}
    </div>
  );
}
