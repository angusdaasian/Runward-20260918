import { useEffect, useMemo, useState } from "react";
import { Lock, Sparkles, Cloud, Pencil } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActivities } from "@/hooks/use-activities";
import { usePremium } from "@/contexts/PremiumContext";
import UpgradeModal from "@/components/coach/UpgradeModal";
import { formatTime, formatPace } from "@/lib/vdot";
import {
  bestPbScore,
  effectiveVdot,
  predictRace,
  recentVdot,
  weatherSlowdown,
  type PB,
} from "@/lib/racePrediction";

interface Props {
  lang: Lang;
}

const DISTANCES: Array<{ key: "5K" | "10K" | "HM" | "M"; label: string; labelZh: string; meters: number; freeTier: boolean }> = [
  { key: "5K", label: "5K", labelZh: "5公里", meters: 5000, freeTier: true },
  { key: "10K", label: "10K", labelZh: "10公里", meters: 10000, freeTier: false },
  { key: "HM", label: "Half Marathon", labelZh: "半馬拉松", meters: 21097.5, freeTier: false },
  { key: "M", label: "Marathon", labelZh: "馬拉松", meters: 42195, freeTier: false },
];

const CITY_KEY = "race_predictor_city";

interface WeatherSnapshot {
  city: string;
  temperature: number;
  humidity: number | null;
  conditionText: string;
}

const RacePredictorCard = ({ lang }: Props) => {
  const { user } = useAuth();
  const { profile } = useActivities();
  const { isPremium } = usePremium();
  const [pbs, setPbs] = useState<PB[]>([]);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [city, setCity] = useState<string>(() => localStorage.getItem(CITY_KEY) || "Hong Kong");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [editingCity, setEditingCity] = useState(false);
  const [draftCity, setDraftCity] = useState(city);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Load PBs
  useEffect(() => {
    if (!user) return;
    supabase
      .from("personal_bests")
      .select("distance,hours,minutes,seconds")
      .eq("user_id", user.id)
      .then(({ data }) => setPbs((data ?? []) as PB[]));
  }, [user]);

  // Load weather
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setWeatherLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("get-weather", { body: { city } });
        if (!cancelled && !error && data && !(data as any).error) {
          setWeather({
            city: (data as any).city,
            temperature: (data as any).temperature,
            humidity: (data as any).humidity ?? null,
            conditionText: (data as any).conditionText ?? "",
          });
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [city]);

  const trainingScore = (profile as any)?.training_score ?? null;
  const pbScore = useMemo(() => bestPbScore(pbs), [pbs]);
  const vdot = useMemo(() => effectiveVdot(trainingScore, pbScore), [trainingScore, pbScore]);
  const slowdown = useMemo(
    () => weatherSlowdown(weather?.temperature ?? null, weather?.humidity ?? null),
    [weather]
  );

  const tt = (en: string, zh: string) => (lang === "zh" ? zh : en);

  const saveCity = () => {
    const v = draftCity.trim();
    if (!v) return;
    localStorage.setItem(CITY_KEY, v);
    setCity(v);
    setEditingCity(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            {tt("Race Predictor", "比賽預測")}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {tt("From training score + PB, weather-adjusted", "基於訓練分數與個人最佳,並考慮天氣")}
          </p>
        </div>
        {vdot !== null && (
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">VDOT</span>
            <span className="text-lg font-display font-bold text-foreground leading-none">
              {vdot.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Weather chip */}
      <div className="mb-3 flex items-center gap-2 text-xs">
        <Cloud size={14} className="text-muted-foreground" />
        {editingCity ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              value={draftCity}
              onChange={(e) => setDraftCity(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveCity(); }}
              autoFocus
              className="flex-1 bg-muted border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={tt("City name", "城市名稱")}
            />
            <button onClick={saveCity} className="text-xs text-primary font-medium px-2">
              {tt("Save", "儲存")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setDraftCity(city); setEditingCity(true); }}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>
              {weatherLoading
                ? tt("Loading…", "載入中…")
                : weather
                  ? `${weather.city} · ${weather.temperature}°C${weather.humidity != null ? ` · ${weather.humidity}%` : ""}${weather.conditionText ? ` · ${weather.conditionText}` : ""}`
                  : city}
            </span>
            <Pencil size={11} />
          </button>
        )}
      </div>

      {vdot === null ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {tt("Add a personal best or sync activities to see predictions.", "新增個人最佳或同步活動以查看預測。")}
        </p>
      ) : (
        <div className="space-y-1">
          {DISTANCES.map((d) => {
            const locked = !isPremium && !d.freeTier;
            const result = predictRace(vdot, d.meters, slowdown);
            const pacePerKm = result.adjustedTime / (d.meters / 1000);
            return (
              <div
                key={d.key}
                className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-b-0"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {lang === "zh" ? d.labelZh : d.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatPace(pacePerKm)} / km
                    {result.delta > 1 && (
                      <span className="ml-1 text-orange-500">
                        +{formatTime(result.delta)} {tt("heat", "熱")}
                      </span>
                    )}
                  </div>
                </div>
                {locked ? (
                  <button
                    onClick={() => setShowUpgrade(true)}
                    className="flex items-center gap-1.5 group"
                  >
                    <span className="text-base font-display font-semibold text-foreground blur-sm select-none">
                      {formatTime(result.adjustedTime)}
                    </span>
                    <Lock size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ) : (
                  <span className="text-base font-display font-semibold text-foreground tabular-nums">
                    {formatTime(result.adjustedTime)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isPremium && vdot !== null && (
        <button
          onClick={() => setShowUpgrade(true)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
        >
          <Sparkles size={13} />
          {tt("Unlock all distances", "解鎖所有距離")}
        </button>
      )}

      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} lang={lang} />
    </div>
  );
};

export default RacePredictorCard;
