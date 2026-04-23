import { useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Loader2, MapPin, Moon, Pencil, Sun, CloudSun } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const CITY_KEY = "weather_city";
const CACHE_KEY = "weather_cache_v2";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

interface WeatherData {
  city: string;
  temperature: number;
  code: number;
  conditionText: string;
  isDay: boolean;
  high: number;
  low: number;
  humidity: number | null;
  wind_kph: number | null;
  fetchedAt: number;
}

const codeMeta = (code: number, isDay: boolean, fallbackText: string, lang: Lang): { Icon: typeof Sun; label: string } => {
  const isZh = lang === "zh";
  if (code === 1000) return { Icon: isDay ? Sun : Moon, label: isDay ? (isZh ? "晴朗" : "Sunny") : (isZh ? "晴夜" : "Clear") };
  if (code === 1003) return { Icon: CloudSun, label: isZh ? "局部多雲" : "Partly cloudy" };
  if (code === 1006 || code === 1009) return { Icon: Cloud, label: isZh ? "多雲" : "Cloudy" };
  if (code === 1030 || code === 1135 || code === 1147) return { Icon: CloudFog, label: isZh ? "霧" : "Fog" };
  if ([1150, 1153, 1168, 1171, 1180, 1183].includes(code)) return { Icon: CloudDrizzle, label: isZh ? "毛毛雨" : "Drizzle" };
  if ([1186, 1189, 1192, 1195, 1198, 1201, 1240, 1243, 1246].includes(code)) return { Icon: CloudRain, label: isZh ? "雨" : "Rain" };
  if ([1066, 1069, 1072, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264].includes(code)) {
    return { Icon: CloudSnow, label: isZh ? "雪" : "Snow" };
  }
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return { Icon: CloudLightning, label: isZh ? "雷暴" : "Thunderstorm" };
  return { Icon: Cloud, label: fallbackText || "—" };
};

type FetchResult =
  | { kind: "ok"; data: WeatherData }
  | { kind: "no_auth" }
  | { kind: "not_found" }
  | { kind: "fetch_fail" };

async function fetchWeather(city: string): Promise<FetchResult> {
  // get-weather now requires a valid Supabase JWT.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { kind: "no_auth" };

  const { data: w, error } = await supabase.functions.invoke("get-weather", {
    body: { city },
  });

  if (error) {
    // Supabase wraps non-2xx into FunctionsHttpError. Treat 400 (invalid city) as not_found.
    const msg = (error as { message?: string })?.message ?? "";
    if (/400|invalid city|not found/i.test(msg)) return { kind: "not_found" };
    return { kind: "fetch_fail" };
  }
  if (!w || (w as { error?: string }).error) return { kind: "not_found" };

  return {
    kind: "ok",
    data: {
      city: w.city,
      temperature: w.temperature,
      code: w.conditionCode,
      conditionText: w.conditionText,
      isDay: !!w.isDay,
      high: w.high,
      low: w.low,
      humidity: w.humidity ?? null,
      wind_kph: w.wind_kph ?? null,
      fetchedAt: Date.now(),
    },
  };
}

interface WeatherWidgetProps {
  lang: Lang;
}

function useWeather(lang: Lang) {
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

  const load = async (targetCity: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWeather(targetCity);
      if (result.kind === "ok") {
        setWeather(result.data);
        localStorage.setItem(CACHE_KEY, JSON.stringify(result.data));
        return;
      }
      if (result.kind === "no_auth") {
        setError(lang === "zh" ? "請登入以查看天氣" : "Sign in to see weather");
        return;
      }
      if (result.kind === "not_found") {
        setError(lang === "zh" ? "找不到城市" : "City not found");
        return;
      }
      setError(lang === "zh" ? "載入失敗" : "Failed to load");
    } catch {
      setError(lang === "zh" ? "載入失敗" : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!weather || weather.fetchedAt + CACHE_TTL_MS < Date.now()) {
      void load(city);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCity = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    localStorage.setItem(CITY_KEY, trimmed);
    setCity(trimmed);
    void load(trimmed);
  };

  return { city, weather, loading, error, saveCity };
}

/** Inline weather panel content (no popover wrapper) — usable inside other popovers */
export const WeatherInline = ({ lang }: WeatherWidgetProps) => {
  const { city, weather, loading, error, saveCity } = useWeather(lang);
  const [editing, setEditing] = useState(false);
  const [draftCity, setDraftCity] = useState(city);

  const { Icon, label } = weather
    ? codeMeta(weather.code, weather.isDay, weather.conditionText, lang)
    : { Icon: Cloud, label: "" };

  const handleSaveCity = () => {
    saveCity(draftCity);
    setEditing(false);
  };

  return (
    <div className="p-4">
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
    </div>
  );
};

const WeatherWidget = ({ lang }: WeatherWidgetProps) => {
  const { weather, loading } = useWeather(lang);

  const { Icon } = weather
    ? codeMeta(weather.code, weather.isDay, weather.conditionText, lang)
    : { Icon: Cloud };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-90 active:bg-muted/60 transition-all duration-150"
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
      <PopoverContent align="end" className="w-64 p-0">
        <WeatherInline lang={lang} />
      </PopoverContent>
    </Popover>
  );
};

export default WeatherWidget;
