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

type DistanceCategory = "road" | "track" | "custom";

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

const CalculatorTab = ({ score, setScore, lang, onCalculated }: Props) => {
  const [category, setCategory] = useState<DistanceCategory>("road");
  const [selectedMeters, setSelectedMeters] = useState(42195);
  const [customDistance, setCustomDistance] = useState("10");
  const [inputMode, setInputMode] = useState<InputMode>("time");
  const [hours, setHours] = useState("3");
  const [minutes, setMinutes] = useState("45");
  const [seconds, setSeconds] = useState("0");
  const [paceMin, setPaceMin] = useState("5");
  const [paceSec, setPaceSec] = useState("20");
  const [paceUnit, setPaceUnit] = useState<PaceUnit>("km");
  const [worldRecordError, setWorldRecordError] = useState<string | null>(null);

  const distancesForCategory = category === "road" ? ROAD_DISTANCES : category === "track" ? TRACK_DISTANCES : [];

  const getDistanceMeters = useCallback((): number => {
    if (category === "custom") {
      const val = parseFloat(customDistance || "0");
      return paceUnit === "mi" ? val * MI_TO_KM * 1000 : val * 1000;
    }
    return selectedMeters;
  }, [category, customDistance, paceUnit, selectedMeters]);

  // Compute total seconds from either time or pace
  const totalSeconds = useMemo(() => {
    if (inputMode === "pace") {
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
  }, [inputMode, hours, minutes, seconds, paceMin, paceSec, paceUnit, getDistanceMeters]);

  const paceDisplay = useMemo(() => {
    const dist = getDistanceMeters();
    if (dist <= 0 || totalSeconds <= 0) return "--:--";
    const unitDist = paceUnit === "mi" ? 1609.34 : 1000;
    const pacePerUnit = totalSeconds / (dist / unitDist);
    return formatTimeSec(pacePerUnit);
  }, [getDistanceMeters, totalSeconds, paceUnit]);

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
    if (category === "custom") {
      const val = parseFloat(customDistance || "0");
      setCustomDistance(newUnit === "mi" ? (val * KM_TO_MI).toFixed(2) : (val * MI_TO_KM).toFixed(2));
    }
    setPaceUnit(newUnit);
  };

  const handleCalculate = () => {
    const dist = getDistanceMeters();
    if (dist <= 0 || totalSeconds <= 0) return;

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
    setScore(null);
    setWorldRecordError(null);
  };

  const handleDistanceSelect = (meters: number) => {
    setSelectedMeters(meters);
    setWorldRecordError(null);
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
        <p className="text-lg font-semibold text-primary">
          {paceDisplay} /{paceUnit}
        </p>
        <p className="text-sm text-muted-foreground">{distanceDisplay}</p>
      </div>

      {/* Distance Section */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground block">
          {t("distance", lang)}
        </label>

        {/* Category Tabs */}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
          {(["road", "track", "custom"] as DistanceCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                setWorldRecordError(null);
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                category === cat
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat === "road"
                ? lang === "zh" ? "公路" : "Road"
                : cat === "track"
                ? lang === "zh" ? "田徑" : "Track"
                : lang === "zh" ? "自訂" : "Custom"}
            </button>
          ))}
        </div>

        {/* Distance Grid or Custom Input */}
        {category === "custom" ? (
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

      {/* Input Mode Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            {inputMode === "time"
              ? (lang === "zh" ? "目標時間" : "Goal Time")
              : (lang === "zh" ? "目標配速" : "Goal Pace")}
          </label>
          <Select value={inputMode} onValueChange={(v) => { setInputMode(v as InputMode); setWorldRecordError(null); }}>
            <SelectTrigger className="w-[140px] h-9 text-sm bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time">{lang === "zh" ? "目標時間" : "Goal Time"}</SelectItem>
              <SelectItem value="pace">{lang === "zh" ? "目標配速" : "Goal Pace"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {inputMode === "time" ? (
          <div className="flex items-center justify-center gap-2">
            <div className="flex flex-col items-center">
              <input
                type="number"
                value={hours}
                onChange={(e) => { setHours(e.target.value); setWorldRecordError(null); }}
                min="0"
                max="99"
                className="w-16 h-14 text-center text-2xl font-display font-bold bg-card border border-border rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              />
              <span className="text-[11px] text-muted-foreground mt-1">
                {lang === "zh" ? "時" : "hr"}
              </span>
            </div>
            <span className="text-2xl font-bold text-muted-foreground pb-5">:</span>
            <div className="flex flex-col items-center">
              <input
                type="number"
                value={minutes}
                onChange={(e) => { setMinutes(e.target.value); setWorldRecordError(null); }}
                min="0"
                max="59"
                className="w-16 h-14 text-center text-2xl font-display font-bold bg-card border border-border rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              />
              <span className="text-[11px] text-muted-foreground mt-1">
                {lang === "zh" ? "分" : "min"}
              </span>
            </div>
            <span className="text-2xl font-bold text-muted-foreground pb-5">:</span>
            <div className="flex flex-col items-center">
              <input
                type="number"
                value={seconds}
                onChange={(e) => { setSeconds(e.target.value); setWorldRecordError(null); }}
                min="0"
                max="59"
                className="w-16 h-14 text-center text-2xl font-display font-bold bg-card border border-border rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              />
              <span className="text-[11px] text-muted-foreground mt-1">
                {lang === "zh" ? "秒" : "sec"}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <div className="flex flex-col items-center">
              <input
                type="number"
                value={paceMin}
                onChange={(e) => { setPaceMin(e.target.value); setWorldRecordError(null); }}
                min="0"
                max="30"
                className="w-20 h-14 text-center text-2xl font-display font-bold bg-card border border-border rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              />
              <span className="text-[11px] text-muted-foreground mt-1">
                {lang === "zh" ? "分" : "min"}
              </span>
            </div>
            <span className="text-2xl font-bold text-muted-foreground pb-5">:</span>
            <div className="flex flex-col items-center">
              <input
                type="number"
                value={paceSec}
                onChange={(e) => { setPaceSec(e.target.value); setWorldRecordError(null); }}
                min="0"
                max="59"
                className="w-20 h-14 text-center text-2xl font-display font-bold bg-card border border-border rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
              />
              <span className="text-[11px] text-muted-foreground mt-1">
                {lang === "zh" ? "秒" : "sec"}
              </span>
            </div>
            <span className="text-lg text-muted-foreground font-medium pb-5">
              /{paceUnit}
            </span>
          </div>
        )}
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
