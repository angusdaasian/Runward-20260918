import { useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Loader2, MapPin, Pencil, Sun, CloudSun } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const CITY_KEY = "weather_city";
const CACHE_KEY = "weather_cache_v1";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

interface WeatherData {
  city: string;
  temperature: number;
  code: number;
  high: number;
  low: number;
  fetchedAt: number;
}

// WMO weather interpretation codes → icon + label
const codeMeta = (code: number, lang: Lang): { Icon: typeof Sun; label: string } => {
  const isZh = lang === "zh";
  if (code === 0) return { Icon: Sun, label: isZh ? "晴朗" : "Clear" };
  if (code <= 2) return { Icon: CloudSun, label: isZh ? "局部多雲" : "Partly cloudy" };
  if (code === 3) return { Icon: Cloud, label: isZh ? "多雲" : "Cloudy" };
  if (code <= 48) return { Icon: CloudFog, label: isZh ? "霧" : "Fog" };
  if (code <= 57) return { Icon: CloudDrizzle, label: isZh ? "毛毛雨" : "Drizzle" };
  if (code <= 67) return { Icon: CloudRain, label: isZh ? "雨" : "Rain" };
  if (code <= 77) return { Icon: CloudSnow, label: isZh ? "雪" : "Snow" };
  if (code <= 82) return { Icon: CloudRain, label: isZh ? "陣雨" : "Showers" };
  if (code <= 86) return { Icon: CloudSnow, label: isZh ? "雪陣" : "Snow showers" };
  if (code <= 99) return { Icon: CloudLightning, label: isZh ? "雷暴" : "Thunderstorm" };
  return { Icon: Cloud, label: isZh ? "—" : "—" };
};

async function fetchWeather(city: string): Promise<WeatherData | null> {
  // 1. Geocode
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  );
  const geo = await geoRes.json();
  const place = geo?.results?.[0];
  if (!place) return null;

  // 2. Weather
  const wRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
  );
  const w = await wRes.json();
  if (!w?.current) return null;

  return {
    city: place.name,
    temperature: Math.round(w.current.temperature_2m),
    code: w.current.weather_code,
    high: Math.round(w.daily?.temperature_2m_max?.[0] ?? w.current.temperature_2m),
    low: Math.round(w.daily?.temperature_2m_min?.[0] ?? w.current.temperature_2m),
    fetchedAt: Date.now(),
  };
}

interface WeatherWidgetProps {
  lang: Lang;
}

const WeatherWidget = ({ lang }: WeatherWidgetProps) => {
  const [city, setCity] = useState<string>(() => localStorage.getItem(CITY_KEY) || "Hong Kong");
  const [weather, setWeather] = useState<WeatherData | null>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as WeatherData;
      if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftCity, setDraftCity] = useState(city);

  const load = async (targetCity: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWeather(targetCity);
      if (!data) {
        setError(lang === "zh" ? "找不到城市" : "City not found");
        return;
      }
      setWeather(data);
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      setError(lang === "zh" ? "載入失敗" : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Refresh on mount if cache is stale or for a different city
    if (!weather || weather.fetchedAt + CACHE_TTL_MS < Date.now()) {
      void load(city);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveCity = () => {
    const trimmed = draftCity.trim();
    if (!trimmed) return;
    localStorage.setItem(CITY_KEY, trimmed);
    setCity(trimmed);
    setEditing(false);
    void load(trimmed);
  };

  const { Icon, label } = weather ? codeMeta(weather.code, lang) : { Icon: Cloud, label: "" };

  return (
    <Popover onOpenChange={(open) => { if (!open) setEditing(false); }}>
      <PopoverTrigger asChild>
        <button
          className="relative w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          aria-label={lang === "zh" ? "天氣" : "Weather"}
        >
          {loading && !weather ? (
            <Loader2 size={18} className="text-foreground animate-spin" />
          ) : (
            <Icon size={18} className="text-foreground" />
          )}
          {weather && (
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-primary text-primary-foreground rounded-full px-1 leading-tight min-w-[16px] text-center">
              {weather.temperature}°
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-4">
        {editing ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              {lang === "zh" ? "輸入城市" : "Enter city"}
            </label>
            <Input
              value={draftCity}
              onChange={(e) => setDraftCity(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveCity(); }}
              placeholder={lang === "zh" ? "例如:香港" : "e.g. Hong Kong"}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraftCity(city); }}>
                {lang === "zh" ? "取消" : "Cancel"}
              </Button>
              <Button size="sm" onClick={handleSaveCity}>
                {lang === "zh" ? "儲存" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin size={12} />
                <span className="font-medium text-foreground">{weather?.city || city}</span>
              </div>
              <button
                onClick={() => { setDraftCity(city); setEditing(true); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={lang === "zh" ? "更改城市" : "Change city"}
              >
                <Pencil size={12} />
              </button>
            </div>

            {loading && !weather && (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <p className="text-xs text-destructive mt-3">{error}</p>
            )}

            {weather && (
              <>
                <div className="flex items-center gap-3 mt-3">
                  <Icon size={40} className="text-primary" />
                  <div>
                    <div className="text-2xl font-bold text-foreground leading-none">{weather.temperature}°C</div>
                    <div className="text-xs text-muted-foreground mt-1">{label}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                  <span>{lang === "zh" ? "高" : "H"}: <span className="text-foreground font-medium">{weather.high}°</span></span>
                  <span>{lang === "zh" ? "低" : "L"}: <span className="text-foreground font-medium">{weather.low}°</span></span>
                </div>
              </>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default WeatherWidget;
