import { useState, useCallback, useMemo, useEffect } from "react";
import { ArrowLeftRight, RotateCcw, AlertTriangle } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { calculateRunningScore, inputDistances } from "@/lib/vdot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  score: number | null;
  setScore: (s: number | null) => void;
  lang: Lang;
  onCalculated?: () => void;
}

type PaceUnit = "km" | "mi";
type InputMode = "time" | "pace";
const MI_TO_KM = 1.609344;
const KM_TO_MI = 1 / MI_TO_KM;

const WORLD_RECORDS: Record<string, number> = {
  "1500":    206,
  "1609.34": 223,
  "3000":    440,
  "5000":    755,
  "10000":   1571,
  "15000":   2404,
  "21097.5": 3451,
  "42195":   7235,
};

function getWorldRecordSeconds(meters: number): number | null {
  const key = String(meters);
  if (WORLD_RECORDS[key]) return WORLD_RECORDS[key];
  const distances = Object.keys(WORLD_RECORDS).map(Number).sort((a, b) => a - b);
  if (meters < distances[0]) {
    const wr = WORLD_RECORDS[String(distances[0])];
    const pace = wr / distances[0];
    return Math.floor(meters * pace * 0.92);
  }
  if (meters > distances[distances.length - 1]) {
    const wr = WORLD_RECORDS[String(distances[distances.length - 1])];
    const pace = wr / distances[distances.length - 1];
    return Math.floor(meters * pace * 1.05);
  }
  for (let i = 0; i < distances.length - 1; i++) {
    if (meters >= distances[i] && meters <= distances[i + 1]) {
      const ratio = (meters - distances[i]) / (distances[i + 1] - distances[i]);
      const paceA = WORLD_RECORDS[String(distances[i])] / distances[i];
      const paceB = WORLD_RECORDS[String(distances[i + 1])] / distances[i + 1];
      const pace = paceA + ratio * (paceB - paceA);
      return Math.floor(meters * pace);
    }
  }
  return null;
}

type DistanceCategory = "road" | "track" | "trail" | "custom";
const isTrail = (c: DistanceCategory) => c === "trail";

const ROAD_DISTANCES = [
  { label: "5K", labelZh: "5公里", meters: 5000 },
  { label: "10K", labelZh: "10公里", meters: 10000 },
  { label: "15K", labelZh: "15公里", meters: 15000 },
  { label: "10 Mile", labelZh: "10英里", meters: 16093.4 },
  { label: "Half Marathon", labelZh: "半馬拉松", meters: 21097.5 },
  { label: "Marathon", labelZh: "馬拉松", meters: 42195 },
];

const TRACK_DISTANCES = [
  { label: "400m", labelZh: "400米", meters: 400 },
  { label: "1500m", labelZh: "1500米", meters: 1500 },
  { label: "1 Mile", labelZh: "1英里", meters: 1609.34 },
  { label: "3K", labelZh: "3公里", meters: 3000 },
  { label: "5K", labelZh: "5公里", meters: 5000 },
  { label: "10K", labelZh: "10公里", meters: 10000 },
];


const formatTimeSec = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  if (m === 0) return `${s}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatFullTime = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const STORAGE_KEY = "runward.calculator.v2";
type PersistedState = {
  category: DistanceCategory;
  selectedMeters: number;
  customDistance: string;
  inputMode: InputMode;
  hours: string;
  minutes: string;
  seconds: string;
  paceMin: string;
  paceSec: string;
  paceUnit: PaceUnit;
  elevationGain: string;
  ephValue: string;
};
const DEFAULTS: PersistedState = {
  category: "road",
  selectedMeters: 42195,
  customDistance: "10",
  inputMode: "time",
  hours: "3",
  minutes: "45",
  seconds: "0",
  paceMin: "5",
  paceSec: "20",
  paceUnit: "km",
  elevationGain: "0",
  ephValue: "8",
};
const loadPersisted = (): PersistedState => {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
};

const CalculatorTab = ({ score, setScore, lang, onCalculated }: Props) => {
  const initial = useMemo(loadPersisted, []);
  const [category, setCategory] = useState<DistanceCategory>(initial.category);
  const [selectedMeters, setSelectedMeters] = useState(initial.selectedMeters);
  const [customDistance, setCustomDistance] = useState(initial.customDistance);
  const [inputMode, setInputMode] = useState<InputMode>(initial.inputMode);
  const [hours, setHours] = useState(initial.hours);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [seconds, setSeconds] = useState(initial.seconds);
  const [paceMin, setPaceMin] = useState(initial.paceMin);
  const [paceSec, setPaceSec] = useState(initial.paceSec);
  const [paceUnit, setPaceUnit] = useState<PaceUnit>(initial.paceUnit);
  const [elevationGain, setElevationGain] = useState(initial.elevationGain);
  const [ephValue, setEphValue] = useState(initial.ephValue);
  const [worldRecordError, setWorldRecordError] = useState<string | null>(null);

  // Persist all inputs so the calculator remembers what the user last entered.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const data: PersistedState = {
        category, selectedMeters, customDistance, inputMode,
        hours, minutes, seconds, paceMin, paceSec, paceUnit,
        elevationGain, ephValue,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore quota */ }
  }, [category, selectedMeters, customDistance, inputMode, hours, minutes, seconds, paceMin, paceSec, paceUnit, elevationGain, ephValue]);


  const distancesForCategory =
    category === "road" ? ROAD_DISTANCES :
    category === "track" ? TRACK_DISTANCES :
    category === "trail_race" ? TRAIL_RACE_DISTANCES :
    [];
  const usesCustomDistance = category === "custom" || category === "trail";
  const trail = isTrail(category);

  const getDistanceMeters = useCallback((): number => {
    if (usesCustomDistance) {
      const val = parseFloat(customDistance || "0");
      return paceUnit === "mi" ? val * MI_TO_KM * 1000 : val * 1000;
    }
    return selectedMeters;
  }, [usesCustomDistance, customDistance, paceUnit, selectedMeters]);

  const elevationMeters = useMemo(() => {
    const v = parseFloat(elevationGain || "0");
    return isFinite(v) && v > 0 ? v : 0;
  }, [elevationGain]);

  // Effort Points (ITRA): EP = distance_km + elevation_m/100
  const effortPoints = useMemo(() => {
    const distKm = getDistanceMeters() / 1000;
    return distKm + elevationMeters / 100;
  }, [getDistanceMeters, elevationMeters]);

  // Compute total seconds from either time, pace, or EPH
  const totalSeconds = useMemo(() => {
    if (inputMode === "pace") {
      if (trail) {
        const eph = parseFloat(ephValue || "0");
        if (eph <= 0 || effortPoints <= 0) return 0;
        return Math.round((effortPoints / eph) * 3600);
      }
      const pm = parseInt(paceMin || "0");
      const ps = parseInt(paceSec || "0");
      const pacePerUnit = pm * 60 + ps;
      const dist = getDistanceMeters();
      const unitDist = paceUnit === "mi" ? 1609.34 : 1000;
      return Math.round(pacePerUnit * (dist / unitDist));
    }
    const h = parseInt(hours || "0");
    const m = parseInt(minutes || "0");
    const s = parseInt(seconds || "0");
    return h * 3600 + m * 60 + s;
  }, [inputMode, trail, ephValue, effortPoints, hours, minutes, seconds, paceMin, paceSec, paceUnit, getDistanceMeters]);

  const paceDisplay = useMemo(() => {
    const dist = getDistanceMeters();
    if (dist <= 0 || totalSeconds <= 0) return "--:--";
    const unitDist = paceUnit === "mi" ? 1609.34 : 1000;
    const pacePerUnit = totalSeconds / (dist / unitDist);
    return formatTimeSec(pacePerUnit);
  }, [getDistanceMeters, totalSeconds, paceUnit]);

  const ephDisplay = useMemo(() => {
    if (totalSeconds <= 0 || effortPoints <= 0) return "--";
    const hrs = totalSeconds / 3600;
    return (effortPoints / hrs).toFixed(2);
  }, [totalSeconds, effortPoints]);

  const distanceDisplay = useMemo(() => {
    const dist = getDistanceMeters();
    if (paceUnit === "mi") return `${(dist / 1609.34).toFixed(1)} mi`;
    return `${(dist / 1000).toFixed(1)} km`;
  }, [getDistanceMeters, paceUnit]);

  const lap400Display = useMemo(() => {
    const dist = getDistanceMeters();
    if (dist <= 0 || totalSeconds <= 0 || dist === 400) return null;
    const lapSec = totalSeconds * (400 / dist);
    const m = Math.floor(lapSec / 60);
    const s = Math.round(lapSec % 60);
    const formatted = m === 0 ? `${s}s` : `${m}:${s.toString().padStart(2, "0")}`;
    return formatted;
  }, [getDistanceMeters, totalSeconds]);

  const toggleUnit = () => {
    const newUnit = paceUnit === "km" ? "mi" : "km";
    if (usesCustomDistance) {
      const val = parseFloat(customDistance || "0");
      setCustomDistance(newUnit === "mi" ? (val * KM_TO_MI).toFixed(2) : (val * MI_TO_KM).toFixed(2));
    }
    setPaceUnit(newUnit);
  };

  const handleCalculate = () => {
    const dist = getDistanceMeters();
    if (dist <= 0 || totalSeconds <= 0) return;

    if (!trail) {
      const wr = getWorldRecordSeconds(dist);
      if (wr && totalSeconds < wr) {
        const wrFormatted = formatFullTime(wr);
        setWorldRecordError(
          lang === "zh"
            ? `此時間快於世界紀錄 (${wrFormatted})，請輸入合理時間。`
            : `This time is faster than the world record (${wrFormatted}). Please enter a realistic time.`
        );
        return;
      }
    }
    setWorldRecordError(null);

    const result = calculateRunningScore(dist, totalSeconds);
    const rounded = Math.round(result * 10) / 10;
    if (rounded <= 0) return;
    setScore(rounded);
    onCalculated?.();
  };

  const handleReset = () => {
    setCategory("road");
    setSelectedMeters(42195);
    setCustomDistance("10");
    setInputMode("time");
    setHours("3");
    setMinutes("45");
    setSeconds("0");
    setPaceMin("5");
    setPaceSec("20");
    setPaceUnit("km");
    setElevationGain("0");
    setEphValue("8");
    setScore(null);
    setWorldRecordError(null);
  };

  const handleDistanceSelect = (meters: number) => {
    setSelectedMeters(meters);
    setWorldRecordError(null);
  };

  const CATEGORIES: DistanceCategory[] = ["road", "track", "trail", "trail_race", "custom"];
  const categoryLabel = (cat: DistanceCategory) => {
    if (cat === "road") return lang === "zh" ? "公路" : "Road";
    if (cat === "track") return lang === "zh" ? "田徑" : "Track";
    if (cat === "trail") return lang === "zh" ? "越野" : "Trail";
    if (cat === "trail_race") return lang === "zh" ? "越野賽" : "Trail Race";
    return lang === "zh" ? "自訂" : "Custom";
  };

  return (
    <div className="px-5 pt-4 max-w-lg mx-auto space-y-5">
      {/* Result Display */}
      <div className="bg-card rounded-2xl border border-border p-5 text-center space-y-1">
        <div className="flex items-center justify-end mb-2">
          <button
            onClick={toggleUnit}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors bg-muted/50 px-3 py-1.5 rounded-full"
          >
            {paceUnit} <ArrowLeftRight size={14} />
          </button>
        </div>
        <p className="text-4xl font-display font-bold text-foreground tracking-tight">
          {totalSeconds > 0 ? formatFullTime(totalSeconds) : "0:00"}
        </p>
        {trail ? (
          <p className="text-lg font-semibold text-primary">
            {ephDisplay} EP/hr
          </p>
        ) : (
          <p className="text-lg font-semibold text-primary">
            {paceDisplay} /{paceUnit}
          </p>
        )}
        {category === "track" && lap400Display ? (
          <p className="text-sm text-muted-foreground">
            {lang === "zh" ? `400米分段 ${lap400Display}` : `400m split ${lap400Display}`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {distanceDisplay}
            {trail && elevationMeters > 0 ? ` · ${Math.round(elevationMeters)} m ↑` : ""}
          </p>
        )}
      </div>

      {/* Distance Section */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground block">
          {t("distance", lang)}
        </label>

        {/* Category Tabs */}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                setWorldRecordError(null);
              }}
              className={`flex-1 py-2 px-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                category === cat
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {categoryLabel(cat)}
            </button>
          ))}
        </div>

        {/* Distance Grid or Custom Input */}
        {usesCustomDistance ? (
          <div className="flex items-center border border-border rounded-xl px-4 py-3 bg-card">
            <input
              type="number"
              value={customDistance}
              onChange={(e) => {
                setCustomDistance(e.target.value);
                setWorldRecordError(null);
              }}
              className="flex-1 bg-transparent text-foreground text-base focus:outline-none"
              step="0.1"
              min="0"
              placeholder={paceUnit === "mi" ? "miles" : "km"}
            />
            <span className="text-sm text-muted-foreground font-medium">{paceUnit}</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {distancesForCategory.map((d) => (
              <button
                key={d.meters}
                onClick={() => handleDistanceSelect(d.meters)}
                className={`py-3 px-2 rounded-xl text-center transition-all border ${
                  selectedMeters === d.meters
                    ? "border-primary bg-primary/5 text-primary font-semibold"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}
              >
                <span className="text-sm font-medium block">
                  {lang === "zh" ? d.labelZh : d.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {paceUnit === "mi"
                    ? `${(d.meters / 1609.34).toFixed(1)} mi`
                    : `${(d.meters / 1000).toFixed(1)} km`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Elevation gain (Trail only) */}
      {trail && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground block">
            {lang === "zh" ? "爬升 (米)" : "Elevation Gain (m)"}
          </label>
          <div className="flex items-center border border-border rounded-xl px-4 py-3 bg-card">
            <input
              type="number"
              value={elevationGain}
              onChange={(e) => setElevationGain(e.target.value)}
              className="flex-1 bg-transparent text-foreground text-base focus:outline-none"
              step="10"
              min="0"
              placeholder="0"
            />
            <span className="text-sm text-muted-foreground font-medium">m</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {lang === "zh"
              ? `EP = 距離(公里) + 爬升(米)/100 · 目前 ${effortPoints.toFixed(1)} EP`
              : `EP = distance(km) + elevation(m)/100 · current ${effortPoints.toFixed(1)} EP`}
          </p>
        </div>
      )}

      {/* Input Mode Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            {inputMode === "time"
              ? (lang === "zh" ? "目標時間" : "Goal Time")
              : trail
                ? (lang === "zh" ? "目標 EPH" : "Goal EPH")
                : (lang === "zh" ? "目標配速" : "Goal Pace")}
          </label>
          <Select value={inputMode} onValueChange={(v) => { setInputMode(v as InputMode); setWorldRecordError(null); }}>
            <SelectTrigger className="w-[140px] h-9 text-sm bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time">{lang === "zh" ? "目標時間" : "Goal Time"}</SelectItem>
              <SelectItem value="pace">
                {trail
                  ? (lang === "zh" ? "目標 EPH" : "Goal EPH")
                  : (lang === "zh" ? "目標配速" : "Goal Pace")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(() => {
          const range = (n: number) => Array.from({ length: n }, (_, i) => i.toString());
          const NumberSelect = ({
            value,
            onChange,
            options,
            width = "w-20",
          }: {
            value: string;
            onChange: (v: string) => void;
            options: string[];
            width?: string;
          }) => (
            <Select value={value} onValueChange={(v) => { onChange(v); setWorldRecordError(null); }}>
              <SelectTrigger className={`${width} h-14 text-2xl font-display font-bold bg-card border-border justify-center [&>svg]:hidden px-2`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {options.map((o) => (
                  <SelectItem key={o} value={o} className="justify-center text-base">
                    {o.padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );

          if (inputMode === "time") {
            return (
              <div className="flex items-center justify-center gap-2">
                <div className="flex flex-col items-center">
                  <NumberSelect value={hours} onChange={setHours} options={range(48)} width="w-20" />
                  <span className="text-[11px] text-muted-foreground mt-1">
                    {lang === "zh" ? "時" : "hr"}
                  </span>
                </div>
                <span className="text-2xl font-bold text-muted-foreground pb-5">:</span>
                <div className="flex flex-col items-center">
                  <NumberSelect value={minutes} onChange={setMinutes} options={range(60)} width="w-20" />
                  <span className="text-[11px] text-muted-foreground mt-1">
                    {lang === "zh" ? "分" : "min"}
                  </span>
                </div>
                <span className="text-2xl font-bold text-muted-foreground pb-5">:</span>
                <div className="flex flex-col items-center">
                  <NumberSelect value={seconds} onChange={setSeconds} options={range(60)} width="w-20" />
                  <span className="text-[11px] text-muted-foreground mt-1">
                    {lang === "zh" ? "秒" : "sec"}
                  </span>
                </div>
              </div>
            );
          }
          if (trail) {
            return (
              <div className="flex items-center justify-center gap-3">
                <input
                  type="number"
                  value={ephValue}
                  onChange={(e) => { setEphValue(e.target.value); setWorldRecordError(null); }}
                  step="0.1"
                  min="0"
                  className="w-32 h-14 text-2xl font-display font-bold bg-card border border-border rounded-md text-center focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-lg text-muted-foreground font-medium">EP/hr</span>
              </div>
            );
          }
          return (
            <div className="flex items-center justify-center gap-2">
              <div className="flex flex-col items-center">
                <NumberSelect value={paceMin} onChange={setPaceMin} options={range(31)} width="w-20" />
                <span className="text-[11px] text-muted-foreground mt-1">
                  {lang === "zh" ? "分" : "min"}
                </span>
              </div>
              <span className="text-2xl font-bold text-muted-foreground pb-5">:</span>
              <div className="flex flex-col items-center">
                <NumberSelect value={paceSec} onChange={setPaceSec} options={range(60)} width="w-20" />
                <span className="text-[11px] text-muted-foreground mt-1">
                  {lang === "zh" ? "秒" : "sec"}
                </span>
              </div>
              <span className="text-lg text-muted-foreground font-medium pb-5">
                /{paceUnit}
              </span>
            </div>
          );
        })()}
      </div>

      {/* World Record Warning */}
      {worldRecordError && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{worldRecordError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-6 pt-1">
        <button
          onClick={handleReset}
          className="flex flex-col items-center gap-1 text-muted-foreground"
        >
          <RotateCcw size={22} />
          <span className="text-[10px] uppercase tracking-wider font-medium">
            {lang === "zh" ? "重置" : "Reset"}
          </span>
        </button>

        <button
          onClick={handleCalculate}
          className="bg-primary text-primary-foreground font-display font-semibold py-3 px-12 rounded-full text-base transition-transform active:scale-[0.97]"
        >
          {t("calculate", lang)}
        </button>
      </div>
    </div>
  );
};

export default CalculatorTab;
