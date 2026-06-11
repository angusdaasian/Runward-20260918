import { useMemo, useState } from "react";
import { Gauge } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Props { lang: Lang; }

const DISTANCES: Array<{ key: string; label: string; labelZh: string; km: number }> = [
  { key: "5K", label: "5K", labelZh: "5公里", km: 5 },
  { key: "10K", label: "10K", labelZh: "10公里", km: 10 },
  { key: "HM", label: "Half Marathon", labelZh: "半馬", km: 21.0975 },
  { key: "FM", label: "Marathon", labelZh: "全馬", km: 42.195 },
  { key: "custom", label: "Custom", labelZh: "自訂", km: 0 },
];

const parseHMS = (h: string, m: string, s: string): number | null => {
  const hh = parseInt(h || "0", 10);
  const mm = parseInt(m || "0", 10);
  const ss = parseInt(s || "0", 10);
  if ([hh, mm, ss].some(Number.isNaN)) return null;
  if (hh < 0 || mm < 0 || ss < 0 || mm >= 60 || ss >= 60) return null;
  const t = hh * 3600 + mm * 60 + ss;
  return t > 0 ? t : null;
};
const parseMS = (m: string, s: string): number | null => {
  const mm = parseInt(m || "0", 10);
  const ss = parseInt(s || "0", 10);
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
const fmtPace = (secPerKm: number) => {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
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
    />
  );
}

function DistanceSelect({ value, onChange, zh, customKm, setCustomKm }: {
  value: string; onChange: (v: string) => void; zh: boolean; customKm: string; setCustomKm: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{zh ? "距離" : "Distance"}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {DISTANCES.map((d) => (
            <SelectItem key={d.key} value={d.key}>{zh ? d.labelZh : d.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === "custom" && (
        <Input
          type="number" min="0" step="0.1" value={customKm}
          onChange={(e) => setCustomKm(e.target.value)}
          placeholder={zh ? "公里" : "Kilometers"}
          className="h-10"
        />
      )}
    </div>
  );
}

export default function DesktopPaceCalculator({ lang }: Props) {
  const zh = lang === "zh";
  return (
    <Tabs defaultValue="from-time" className="w-full">
      <TabsList className="grid w-full grid-cols-3 mb-5">
        <TabsTrigger value="from-time">{zh ? "計算配速" : "Find Pace"}</TabsTrigger>
        <TabsTrigger value="from-pace">{zh ? "計算時間" : "Find Time"}</TabsTrigger>
        <TabsTrigger value="splits">{zh ? "分段表" : "Splits"}</TabsTrigger>
      </TabsList>
      <TabsContent value="from-time"><FromTime zh={zh} /></TabsContent>
      <TabsContent value="from-pace"><FromPace zh={zh} /></TabsContent>
      <TabsContent value="splits"><Splits zh={zh} /></TabsContent>
    </Tabs>
  );
}

/* From time + distance → pace */
function FromTime({ zh }: { zh: boolean }) {
  const [dist, setDist] = useState("10K");
  const [customKm, setCustomKm] = useState("");
  const [h, setH] = useState(""); const [m, setM] = useState(""); const [s, setS] = useState("");
  const km = dist === "custom" ? parseFloat(customKm) || 0 : DISTANCES.find((d) => d.key === dist)!.km;
  const totalSec = parseHMS(h, m, s);
  const paceSec = totalSec && km > 0 ? totalSec / km : null;
  const milePaceSec = paceSec ? paceSec * 1.609344 : null;
  const speedKmh = totalSec && km > 0 ? (km / (totalSec / 3600)) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <DistanceSelect value={dist} onChange={setDist} zh={zh} customKm={customKm} setCustomKm={setCustomKm} />
        <div className="space-y-2">
          <Label>{zh ? "完成時間" : "Finish Time"}</Label>
          <div className="flex items-center gap-2">
            <NumInput value={h} onChange={setH} placeholder="HH" />
            <span className="text-muted-foreground">:</span>
            <NumInput value={m} onChange={setM} placeholder="MM" />
            <span className="text-muted-foreground">:</span>
            <NumInput value={s} onChange={setS} placeholder="SS" />
          </div>
        </div>
      </div>
      <ResultPanel
        rows={[
          { label: zh ? "每公里配速" : "Pace per km", value: paceSec ? `${fmtPace(paceSec)} /km` : "—" },
          { label: zh ? "每英里配速" : "Pace per mile", value: milePaceSec ? `${fmtPace(milePaceSec)} /mi` : "—" },
          { label: zh ? "平均速度" : "Average speed", value: speedKmh ? `${speedKmh.toFixed(2)} km/h` : "—" },
          { label: zh ? "距離" : "Distance", value: km > 0 ? `${km.toFixed(km < 10 ? 2 : 3)} km` : "—" },
        ]}
      />
    </div>
  );
}

/* From pace + distance → time */
function FromPace({ zh }: { zh: boolean }) {
  const [dist, setDist] = useState("HM");
  const [customKm, setCustomKm] = useState("");
  const [pm, setPm] = useState(""); const [ps, setPs] = useState("");
  const km = dist === "custom" ? parseFloat(customKm) || 0 : DISTANCES.find((d) => d.key === dist)!.km;
  const paceSec = parseMS(pm, ps);
  const totalSec = paceSec && km > 0 ? paceSec * km : null;
  const milePace = paceSec ? paceSec * 1.609344 : null;
  const speedKmh = paceSec ? 3600 / paceSec : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <DistanceSelect value={dist} onChange={setDist} zh={zh} customKm={customKm} setCustomKm={setCustomKm} />
        <div className="space-y-2">
          <Label>{zh ? "配速 (每公里)" : "Pace (per km)"}</Label>
          <div className="flex items-center gap-2 max-w-[200px]">
            <NumInput value={pm} onChange={setPm} placeholder="MM" />
            <span className="text-muted-foreground">:</span>
            <NumInput value={ps} onChange={setPs} placeholder="SS" />
          </div>
        </div>
      </div>
      <ResultPanel
        rows={[
          { label: zh ? "預計完成時間" : "Finish Time", value: totalSec ? fmtHMS(totalSec) : "—" },
          { label: zh ? "每英里配速" : "Pace per mile", value: milePace ? `${fmtPace(milePace)} /mi` : "—" },
          { label: zh ? "平均速度" : "Average speed", value: speedKmh ? `${speedKmh.toFixed(2)} km/h` : "—" },
        ]}
      />
    </div>
  );
}

/* Splits table */
function Splits({ zh }: { zh: boolean }) {
  const [dist, setDist] = useState("HM");
  const [customKm, setCustomKm] = useState("");
  const [pm, setPm] = useState("5"); const [ps, setPs] = useState("00");
  const km = dist === "custom" ? parseFloat(customKm) || 0 : DISTANCES.find((d) => d.key === dist)!.km;
  const paceSec = parseMS(pm, ps);
  const rows = useMemo(() => {
    if (!paceSec || km <= 0) return [];
    const out: { k: number; cum: string }[] = [];
    const wholeKm = Math.floor(km);
    for (let i = 1; i <= wholeKm; i++) out.push({ k: i, cum: fmtHMS(paceSec * i) });
    if (km - wholeKm > 0.01) out.push({ k: km, cum: fmtHMS(paceSec * km) });
    return out;
  }, [paceSec, km]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
      <div className="space-y-5">
        <DistanceSelect value={dist} onChange={setDist} zh={zh} customKm={customKm} setCustomKm={setCustomKm} />
        <div className="space-y-2">
          <Label>{zh ? "目標配速 (每公里)" : "Target Pace (per km)"}</Label>
          <div className="flex items-center gap-2 max-w-[200px]">
            <NumInput value={pm} onChange={setPm} placeholder="MM" />
            <span className="text-muted-foreground">:</span>
            <NumInput value={ps} onChange={setPs} placeholder="SS" />
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border overflow-hidden max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">{zh ? "公里" : "Kilometer"}</th>
              <th className="text-right px-4 py-2 font-semibold">{zh ? "累計時間" : "Elapsed"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={2} className="p-6 text-center text-muted-foreground text-xs">
                {zh ? "輸入配速以查看分段" : "Enter a pace to see splits"}
              </td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="px-4 py-2 tabular-nums">{typeof r.k === "number" && r.k % 1 !== 0 ? r.k.toFixed(2) : r.k} km</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{r.cum}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultPanel({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-5">
      <div className="flex items-center gap-2 mb-3 text-muted-foreground">
        <Gauge size={16} />
        <span className="text-xs font-semibold uppercase tracking-wider">Results</span>
      </div>
      <dl className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="text-xl font-display font-bold tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
