import { useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { predictTime, formatTime, roadRaceDistances, trackRaceDistances } from "@/lib/vdot";

interface Props {
  score: number | null;
  lang: Lang;
}

const EquivalentTab = ({ score, lang }: Props) => {
  
  const [inputScore, setInputScore] = useState(score?.toString() || "");
  const activeScore = score ?? (inputScore ? parseFloat(inputScore) : null);
  const [category, setCategory] = useState<"road" | "track">("road");

  const getPace = (timeSeconds: number, meters: number): string => {
    const pacePerKm = timeSeconds / (meters / 1000);
    const m = Math.floor(pacePerKm / 60);
    const s = Math.round(pacePerKm % 60);
    return `${m}:${s.toString().padStart(2, "0")} / km`;
  };

  const getLap400 = (timeSeconds: number, meters: number): string => {
    const lapSec = timeSeconds * (400 / meters);
    const m = Math.floor(lapSec / 60);
    const s = Math.round(lapSec % 60);
    if (m === 0) return `${s}s`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const distances = category === "road" ? roadRaceDistances : trackRaceDistances;

  return (
    <div className="px-5 pt-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <h1 className="font-display text-3xl font-bold text-foreground">
          {t("equivalent", lang)}
        </h1>
        {activeScore && (
          <div className="w-14 h-14 rounded-full bg-score-bg border border-border flex flex-col items-center justify-center">
            <span className="text-[8px] font-bold text-score-label uppercase leading-none">
              {lang === "zh" ? "分數" : "SCORE"}
            </span>
            <span className="text-lg font-display font-bold text-score-text leading-tight">
              {activeScore}
            </span>
            <span className="text-[7px] text-muted-foreground leading-none">
              {lang === "zh" ? "點擊編輯" : "Tap to Edit"}
            </span>
          </div>
        )}
      </div>

      {!score && !activeScore && (
        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">
            {t("enterScore", lang)}
          </label>
          <input
            type="number"
            value={inputScore}
            onChange={(e) => setInputScore(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-3 text-base bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g. 45"
          />
        </div>
      )}

      {!score && inputScore && (
        <div className="mb-4">
          <input
            type="number"
            value={inputScore}
            onChange={(e) => setInputScore(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-3 text-base bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      {activeScore && (
        <div>
          {/* Road / Track toggle */}
          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg mb-3">
            {(["road", "track"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  category === cat
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat === "road"
                  ? lang === "zh" ? "公路" : "Road"
                  : lang === "zh" ? "田徑" : "Track"}
              </button>
            ))}
          </div>

          {/* Table header */}
          <div className="grid grid-cols-3 gap-2 pb-2 border-b border-border mb-1">
            <span className="text-sm font-semibold text-foreground">
              {lang === "zh" ? "賽事" : "Race"}
            </span>
            <span className="text-sm font-semibold text-foreground text-center">
              {t("time", lang)}
            </span>
            <span className="text-sm font-semibold text-foreground text-right">
              {category === "track"
                ? (lang === "zh" ? "400米分段" : "400m Split")
                : (lang === "zh" ? "配速" : "Pace")}
            </span>
          </div>

          {distances.map((race) => {
            const time = predictTime(activeScore, race.meters);
            const isTrack = category === "track";
            const showLap = isTrack && race.meters !== 400;
            return (
              <div key={race.name} className="grid grid-cols-3 gap-2 py-3 border-b border-border/50">
                <span className="text-sm text-foreground">
                  {lang === "zh" ? race.nameZh : race.name}
                </span>
                <span className="text-sm text-foreground text-center font-medium">
                  {formatTime(time)}
                </span>
                <span className="text-sm text-muted-foreground text-right">
                  {isTrack
                    ? (showLap ? getLap400(time, race.meters) : "—")
                    : getPace(time, race.meters)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!activeScore && (
        <div className="text-center text-muted-foreground text-sm mt-12">
          {t("enterRaceResult", lang)}
        </div>
      )}

      
    </div>
  );
};

export default EquivalentTab;
