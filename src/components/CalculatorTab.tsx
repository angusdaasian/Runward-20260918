import { useState, useCallback } from "react";
import { ChevronDown, Clock, ArrowLeftRight, RotateCcw } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { calculateRunningScore, inputDistances } from "@/lib/vdot";

interface Props {
  score: number | null;
  setScore: (s: number | null) => void;
  lang: Lang;
  onCalculated?: () => void;
}

type PaceUnit = "km" | "mi";
const MI_TO_KM = 1.609344;
const KM_TO_MI = 1 / MI_TO_KM;

const CalculatorTab = ({ score, setScore, lang, onCalculated }: Props) => {
  const [distanceIdx, setDistanceIdx] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [customDistance, setCustomDistance] = useState("0.4");
  const [timeInput, setTimeInput] = useState("2:40");
  const [paceInput, setPaceInput] = useState("");
  const [paceUnit, setPaceUnit] = useState<PaceUnit>("km");

  const distanceOptions = [
    { label: "Other", labelZh: "其他", meters: 0 },
    ...inputDistances,
  ];

  const getDistanceMeters = useCallback((): number => {
    if (distanceIdx === 0) {
      const val = parseFloat(customDistance || "0");
      return paceUnit === "mi" ? val * MI_TO_KM * 1000 : val * 1000;
    }
    return distanceOptions[distanceIdx].meters;
  }, [distanceIdx, customDistance, paceUnit, distanceOptions]);

  const parseTime = (input: string): number => {
    const parts = input.split(":").map((p) => parseInt(p || "0"));
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  };

  const formatTimeSec = (totalSeconds: number): string => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.round(totalSeconds % 60);
    if (m === 0) return `${s}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Compute pace string from time + distance
  const computePace = (): string => {
    const dist = getDistanceMeters();
    const secs = parseTime(timeInput);
    if (dist <= 0 || secs <= 0) return "";
    const unitDist = paceUnit === "mi" ? 1609.34 : 1000;
    const pacePerUnit = secs / (dist / unitDist);
    return formatTimeSec(pacePerUnit);
  };

  // When time changes, update pace display
  const handleTimeChange = (val: string) => {
    setTimeInput(val);
    // Clear manual pace so it recalculates
    setPaceInput("");
  };

  // When pace changes, update time
  const handlePaceChange = (val: string) => {
    setPaceInput(val);
    const paceSecs = parseTime(val);
    const dist = getDistanceMeters();
    if (paceSecs <= 0 || dist <= 0) return;
    const unitDist = paceUnit === "mi" ? 1609.34 : 1000;
    const totalSecs = paceSecs * (dist / unitDist);
    // Format time
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.round(totalSecs % 60);
    if (h > 0) {
      setTimeInput(`${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    } else {
      setTimeInput(`${m}:${s.toString().padStart(2, "0")}`);
    }
  };

  // Toggle unit and convert custom distance
  const toggleUnit = () => {
    const newUnit = paceUnit === "km" ? "mi" : "km";
    if (distanceIdx === 0) {
      const val = parseFloat(customDistance || "0");
      if (newUnit === "mi") {
        setCustomDistance((val * KM_TO_MI).toFixed(2));
      } else {
        setCustomDistance((val * MI_TO_KM).toFixed(2));
      }
    }
    setPaceUnit(newUnit);
    setPaceInput(""); // recalculate
  };

  const displayPace = paceInput || computePace() || "0:00";

  const handleCalculate = () => {
    const dist = getDistanceMeters();
    const secs = parseTime(timeInput);
    if (dist <= 0 || secs <= 0) return;
    const result = calculateRunningScore(dist, secs);
    const rounded = Math.round(result * 10) / 10;
    if (rounded <= 0) return;
    setScore(rounded);
    onCalculated?.();
  };

  const handleReset = () => {
    setDistanceIdx(0);
    setCustomDistance("0.4");
    setTimeInput("2:40");
    setPaceInput("");
    setPaceUnit("km");
    setScore(null);
  };


  return (
    <div className="px-5 pt-4 max-w-lg mx-auto">
      <p className="text-sm text-muted-foreground mb-4">
        {t("instruction", lang)}
      </p>

      {/* Form */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
        {/* Distance Dropdown */}
        <div className="relative">
          <label className="text-xs text-muted-foreground mb-1 block">{t("distance", lang)}</label>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3 text-foreground text-base"
          >
            <span>
              {lang === "zh"
                ? distanceOptions[distanceIdx].labelZh
                : distanceOptions[distanceIdx].label}
            </span>
            <ChevronDown size={18} className="text-muted-foreground" />
          </button>
          {showDropdown && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {distanceOptions.map((d, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setDistanceIdx(idx);
                    setShowDropdown(false);
                    setPaceInput("");
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${
                    idx === distanceIdx ? "text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  {lang === "zh" ? d.labelZh : d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Custom Distance (shown when "Other") */}
        {distanceIdx === 0 && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {t("distance", lang)}
            </label>
            <div className="flex items-center border border-border rounded-lg px-4 py-3">
              <input
                type="number"
                value={customDistance}
                onChange={(e) => {
                  setCustomDistance(e.target.value);
                  setPaceInput("");
                }}
                className="flex-1 bg-transparent text-foreground text-base focus:outline-none"
                step="0.1"
                min="0"
              />
              <button
                onClick={toggleUnit}
                className="flex items-center gap-1 text-muted-foreground text-sm ml-2 hover:text-foreground transition-colors"
              >
                <span className="font-medium">{paceUnit}</span>
                <ArrowLeftRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Time */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("time", lang)}</label>
          <div className="flex items-center border border-border rounded-lg px-4 py-3">
            <input
              type="text"
              value={timeInput}
              onChange={(e) => handleTimeChange(e.target.value)}
              placeholder="mm:ss or h:mm:ss"
              className="flex-1 bg-transparent text-foreground text-base focus:outline-none"
            />
            <Clock size={18} className="text-muted-foreground" />
          </div>
        </div>

        {/* Pace (editable) */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {lang === "zh" ? "配速" : "Pace"}
          </label>
          <div className="flex items-center border border-border rounded-lg px-4 py-3">
            <input
              type="text"
              value={displayPace}
              onChange={(e) => handlePaceChange(e.target.value)}
              placeholder="m:ss"
              className="flex-1 bg-transparent text-foreground text-base focus:outline-none"
            />
            <button
              onClick={toggleUnit}
              className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground transition-colors"
            >
              <span className="font-medium">/ {paceUnit}</span>
              <ArrowLeftRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-6 mt-6">
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

const QUOTES = [
  { en: "The miracle isn't that I finished. The miracle is that I had the courage to start.", zh: "奇蹟不是我跑完了，而是我有勇氣起跑。", author: "John Bingham" },
  { en: "Run when you can, walk if you have to, crawl if you must; just never give up.", zh: "能跑就跑，必要時走，實在不行就爬；但永遠不要放棄。", author: "Dean Karnazes" },
  { en: "It's very hard in the beginning to understand that the whole idea is not to beat the other runners. Eventually you learn that the competition is against the little voice inside you.", zh: "一開始很難理解，跑步的意義不是擊敗別人，最終你會明白，真正的對手是內心那個想放棄的聲音。", author: "George Sheehan" },
  { en: "I run because if I didn't, I'd be sluggish and glum and spend too much time on the couch.", zh: "我跑步，因為如果不跑，我會變得懶散、沮喪，整天躺在沙發上。", author: "Harvey Mackay" },
  { en: "Running is nothing more than a series of arguments between the part of your brain that wants to stop and the part that wants to keep going.", zh: "跑步不過是大腦中想停下來和想繼續跑的兩個聲音之間的爭論。", author: "Unknown" },
  { en: "There is no finish line. The journey is the destination.", zh: "沒有終點線，旅程本身就是目的地。", author: "Unknown" },
  { en: "Every morning in Africa, a gazelle wakes up. It knows it must outrun the fastest lion or it will be killed.", zh: "在非洲，每天早上一隻瞪羚醒來，牠知道必須跑得比最快的獅子快，否則就會被吃掉。", author: "African Proverb" },
  { en: "Pain is temporary. Quitting lasts forever.", zh: "痛苦是暫時的，放棄卻是永遠的。", author: "Lance Armstrong" },
];

const RunningQuote = ({ lang }: { lang: Lang }) => {
  const [idx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const q = QUOTES[idx];
  return (
    <div className="text-center space-y-2 py-4 border-t border-border">
      <p className="text-sm italic text-muted-foreground leading-relaxed">
        "{lang === "zh" ? q.zh : q.en}"
      </p>
      <p className="text-xs text-muted-foreground/70">— {q.author}</p>
    </div>
  );
};

export default CalculatorTab;
