import { useMemo, useState } from "react";
import { Gauge, Activity, Timer, ListOrdered } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  calculateRunningScore, predictTime, formatTime,
  roadRaceDistances, trackRaceDistances,
} from "@/lib/vdot";

interface Props { lang: Lang; }

const MI = 1609.344;

const DISTANCES: Array<{ key: string; label: string; labelZh: string; meters: number }> = [
  { key: "400", label: "400m", labelZh: "400米", meters: 400 },
  { key: "1500", label: "1500m", labelZh: "1500米", meters: 1500 },
  { key: "1mi", label: "1 Mile", labelZh: "1英里", meters: MI },
  { key: "3K", label: "3K", labelZh: "3公里", meters: 3000 },
  { key: "5K", label: "5K", labelZh: "5公里", meters: 5000 },
  { key: "10K", label: "10K", labelZh: "10公里", meters: 10000 },
  { key: "15K", label: "15K", labelZh: "15公里", meters: 15000 },
  { key: "10mi", label: "10 Mile", labelZh: "10英里", meters: 16093.44 },
  { key: "HM", label: "Half Marathon", labelZh: "半馬拉松", meters: 21097.5 },
  { key: "FM", label: "Marathon", labelZh: "馬拉松", meters: 42195 },
  { key: "custom", label: "Custom", labelZh: "自訂", meters: 0 },
];

const WORLD_RECORDS: Record<number, number> = {
  400: 40, 1500: 206, [Math.round(MI)]: 223, 3000: 440, 5000: 755,
  10000: 1571, 15000: 2404, 21097.5: 3451, 42195: 7235,
};

function worldRecordSeconds(meters: number): number | null {
  const keys = Object.keys(WORLD_RECORDS).map(Number).sort((a, b) => a - b);
  const exact = keys.find((k) => Math.abs(k - meters) < 1);
  if (exact) return WORLD_RECORDS[exact];
  if (meters < keys[0]) return Math.floor(meters * (WORLD_RECORDS[keys[0]] / keys[0]) * 0.92);
  const last = keys[keys.length - 1];
  if (meters > last) return Math.floor(meters * (WORLD_RECORDS[last] / last) * 1.05);
  for (let i = 0; i < keys.length - 1; i++) {
    if (meters >= keys[i] && meters <= keys[i + 1]) {
      const r = (meters - keys[i]) / (keys[i + 1] - keys[i]);
      const pa = WORLD_RECORDS[keys[i]] / keys[i];
      const pb = WORLD_RECORDS[keys[i + 1]] / keys[i + 1];
      return Math.floor(meters * (pa + r * (pb - pa)));
    }
  }
  return null;
}

const parseHMS = (h: string, m: string, s: string): number | null => {
  const hh = parseInt(h || "0", 10), mm = parseInt(m || "0", 10), ss = parseInt(s || "0", 10);
  if ([hh, mm, ss].some(Number.isNaN)) return null;
  if (hh < 0 || mm < 0 || ss < 0 || mm >= 60 || ss >= 60) return null;
  const t = hh * 3600 + mm * 60 + ss;
  return t > 0 ? t : null;
};
const parseMS = (m: string, s: string): number | null => {
  const mm = parseInt(m || "0", 10), ss = parseInt(s || "0", 10);
  if ([mm, ss].some(Number.isNaN)) return null;
  if (mm < 0 || ss < 0 || ss >= 60) return null;
  const t = mm * 60 + ss;
  return t > 0 ? t : null;
};
const fmtHMS = (totalSec: number) => {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};
const fmtPace = (secPerUnit: number) => {
  const m = Math.floor(secPerUnit / 60);
  const s = Math.round(secPerUnit % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Input
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
      placeholder={placeholder}
      className="h-10 text-center font-mono"
      aria-label={placeholder}
    />
  );
}

export default function DesktopPaceLab({ lang }: Props) {
  const zh = lang === "zh";

  const [distKey, setDistKey] = useState("HM");
  const [customKm, setCustomKm] = useState("10");
  const [mode, setMode] = useState<"time" | "pace">("time");
  const [h, setH] = useState("1"); const [m, setM] = useState("50"); const [s, setS] = useState("00");
  const [pm, setPm] = useState("5"); const [ps, setPs] = useState("13");
  const [eqCategory, setEqCategory] = useState<"road" | "track">("road");

  const meters = distKey === "custom"
    ? Math.max(0, (parseFloat(customKm) || 0) * 1000)
    : DISTANCES.find((d) => d.key === distKey)!.meters;
  const km = meters / 1000;

  const totalSec = useMemo(() => {
    if (mode === "time") return parseHMS(h, m, s);
    const pace = parseMS(pm, ps);
    return pace && km > 0 ? Math.round(pace * km) : null;
  }, [mode, h, m, s, pm, ps, km]);

  const paceSec = totalSec && km > 0 ? totalSec / km : null;
  const milePaceSec = paceSec ? paceSec * (MI / 1000) : null;
  const speedKmh = totalSec && km > 0 ? km / (totalSec / 3600) : null;
  const lap400 = totalSec && meters > 0 ? totalSec * (400 / meters) : null;

  const wr = meters > 0 ? worldRecordSeconds(meters) : null;
  const tooFast = !!(totalSec && wr && totalSec < wr);

  const score = useMemo(() => {
    if (!totalSec || meters <= 0 || tooFast) return null;
    const raw = calculateRunningScore(meters, totalSec);
    if (!isFinite(raw) || raw <= 0) return null;
    return Math.round(raw * 10) / 10;
  }, [totalSec, meters, tooFast]);

  const splits = useMemo(() => {
    if (!paceSec || km <= 0) return [];
    const out: { k: number | string; cum: string }[] = [];
    const whole = Math.floor(km);
    for (let i = 1; i <= Math.min(whole, 60); i++) out.push({ k: i, cum: fmtHMS(paceSec * i) });
    if (km - whole > 0.01) out.push({ k: km.toFixed(2), cum: fmtHMS(paceSec * km) });
    return out;
  }, [paceSec, km]);

  const eqDistances = eqCategory === "road" ? roadRaceDistances : trackRaceDistances;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>{zh ? "距離" : "Distance"}</Label>
            <Select value={distKey} onValueChange={setDistKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DISTANCES.map((d) => (
                  <SelectItem key={d.key} value={d.key}>{zh ? d.labelZh : d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {distKey === "custom" && (
              <Input
                type="number" min="0" step="0.1" value={customKm}
                onChange={(e) => setCustomKm(e.target.value)}
                placeholder={zh ? "公里" : "Kilometers"}
                className="h-10"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>{zh ? "輸入方式" : "Input"}</Label>
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg max-w-xs">
              {([
                { k: "time" as const, label: zh ? "完成時間" : "Finish time" },
                { k: "pace" as const, label: zh ? "目標配速" : "Target pace" },
              ]).map((o) => (
                <button
                  key={o.k}
                  onClick={() => setMode(o.k)}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    mode === o.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "time" ? (
            <div className="space-y-2">
              <Label>{zh ? "完成時間" : "Finish Time"}</Label>
              <div className="flex items-center gap-2 max-w-[300px]">
                <NumInput value={h} onChange={setH} placeholder="HH" />
                <span className="text-muted-foreground">:</span>
                <NumInput value={m} onChange={setM} placeholder="MM" />
                <span className="text-muted-foreground">:</span>
                <NumInput value={s} onChange={setS} placeholder="SS" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{zh ? "配速 (每公里)" : "Pace (per km)"}</Label>
              <div className="flex items-center gap-2 max-w-[200px]">
                <NumInput value={pm} onChange={setPm} placeholder="MM" />
                <span className="text-muted-foreground">:</span>
                <NumInput value={ps} onChange={setPs} placeholder="SS" />
              </div>
            </div>
          )}

          {tooFast && wr && (
            <p className="text-xs text-destructive">
              {zh
                ? `此時間快於世界紀錄 (${formatTime(wr)}),請輸入合理成績。`
                : `That time is faster than the world record (${formatTime(wr)}). Enter a realistic result.`}
            </p>
          )}
        </div>

        {/* Results */}
        <div className="rounded-xl border border-border bg-muted/30 p-5">
          <div className="flex items-center gap-2 mb-4 text-muted-foreground">
            <Gauge size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {zh ? "結果" : "Results"}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-4 mb-4 pb-4 border-b border-border/50">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{zh ? "完成時間" : "Finish time"}</p>
              <p className="text-3xl font-display font-bold tabular-nums">
                {totalSec ? fmtHMS(totalSec) : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1 justify-end">
                <Activity size={12} />
                {zh ? "跑力分數" : "Running level"}
              </p>
              <p className="text-3xl font-display font-bold tabular-nums text-primary">
                {score ?? "—"}
              </p>
            </div>
          </div>

          <dl className="space-y-3">
            {[
              { label: zh ? "每公里配速" : "Pace per km", value: paceSec ? `${fmtPace(paceSec)} /km` : "—" },
              { label: zh ? "每英里配速" : "Pace per mile", value: milePaceSec ? `${fmtPace(milePaceSec)} /mi` : "—" },
              { label: zh ? "平均速度" : "Average speed", value: speedKmh ? `${speedKmh.toFixed(2)} km/h` : "—" },
              { label: zh ? "400米分段" : "400m split", value: lap400 && meters !== 400 ? fmtPace(lap400) : "—" },
              { label: zh ? "距離" : "Distance", value: km > 0 ? `${km.toFixed(km < 10 ? 2 : 3)} km` : "—" },
            ].map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
                <dt className="text-xs text-muted-foreground">{r.label}</dt>
                <dd className="text-lg font-display font-bold tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Derived tables */}
      <Tabs defaultValue="equivalent" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="equivalent" className="gap-1.5">
            <Timer className="h-3.5 w-3.5" />
            {zh ? "同等成績" : "Equivalent times"}
          </TabsTrigger>
          <TabsTrigger value="splits" className="gap-1.5">
            <ListOrdered className="h-3.5 w-3.5" />
            {zh ? "分段表" : "Splits"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equivalent" className="mt-4">
          {score ? (
            <div className="space-y-3">
              <div className="flex gap-1 bg-muted/50 p-1 rounded-lg max-w-[220px]">
                {(["road", "track"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setEqCategory(cat)}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                      eqCategory === cat ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat === "road" ? (zh ? "公路" : "Road") : (zh ? "田徑" : "Track")}
                  </button>
                ))}
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">{zh ? "賽事" : "Race"}</th>
                      <th className="text-center px-4 py-2 font-semibold">{zh ? "預計成績" : "Time"}</th>
                      <th className="text-right px-4 py-2 font-semibold">
                        {eqCategory === "track" ? (zh ? "400米分段" : "400m split") : (zh ? "配速" : "Pace")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {eqDistances.map((race) => {
                      const time = predictTime(score, race.meters);
                      const pacePerKm = time / (race.meters / 1000);
                      const lap = time * (400 / race.meters);
                      return (
                        <tr key={race.name} className="border-t border-border/60">
                          <td className="px-4 py-2">{zh ? race.nameZh : race.name}</td>
                          <td className="px-4 py-2 text-center font-mono tabular-nums">{formatTime(time)}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                            {eqCategory === "track"
                              ? (race.meters !== 400 ? fmtPace(lap) : "—")
                              : `${fmtPace(pacePerKm)} /km`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground p-6 text-center rounded-lg border border-border">
              {zh ? "輸入一次合理的成績以查看同等成績" : "Enter a realistic result to see equivalent race times"}
            </p>
          )}
        </TabsContent>

        <TabsContent value="splits" className="mt-4">
          <div className="rounded-lg border border-border overflow-hidden max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">{zh ? "公里" : "Kilometer"}</th>
                  <th className="text-right px-4 py-2 font-semibold">{zh ? "累計時間" : "Elapsed"}</th>
                </tr>
              </thead>
              <tbody>
                {splits.length === 0 ? (
                  <tr><td colSpan={2} className="p-6 text-center text-muted-foreground text-xs">
                    {zh ? "輸入配速或時間以查看分段" : "Enter a pace or time to see splits"}
                  </td></tr>
                ) : splits.map((r, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-4 py-2 tabular-nums">{r.k} km</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{r.cum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
